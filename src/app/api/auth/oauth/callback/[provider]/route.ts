import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

interface GitHubUserInfo {
  id: number;
  login: string;
  name: string | null;
  avatar_url?: string;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

const TOKEN_URLS: Record<string, string> = {
  GOOGLE: "https://oauth2.googleapis.com/token",
  GITHUB: "https://github.com/login/oauth/access_token",
  MICROSOFT: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  SLACK: "https://slack.com/api/openid.connect.token",
};

const USERINFO_URLS: Record<string, string> = {
  GOOGLE: "https://www.googleapis.com/oauth2/v3/userinfo",
  GITHUB: "https://api.github.com/user",
  MICROSOFT: "https://graph.microsoft.com/v1.0/me",
  SLACK: "https://slack.com/api/openid.connect.userInfo",
};

async function exchangeCode(
  provider: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<TokenResponse> {
  const tokenUrl = TOKEN_URLS[provider];

  const body =
    provider === "GITHUB"
      ? new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code })
      : new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  return res.json();
}

async function getUserInfo(
  provider: string,
  accessToken: string
): Promise<{ id: string; email: string; name: string; avatarUrl?: string }> {
  if (provider === "GITHUB") {
    const [userRes, emailsRes] = await Promise.all([
      fetch(USERINFO_URLS.GITHUB, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }),
      fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }),
    ]);
    const user = (await userRes.json()) as GitHubUserInfo;
    const emails = (await emailsRes.json()) as GitHubEmail[];
    const primaryEmail =
      emails.find((e) => e.primary && e.verified)?.email ?? user.email ?? "";
    return {
      id: String(user.id),
      email: primaryEmail,
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url,
    };
  }

  const res = await fetch(USERINFO_URLS[provider], {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = (await res.json()) as GoogleUserInfo;
  return {
    id: user.sub,
    email: user.email,
    name: user.name,
    avatarUrl: user.picture,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerKey = provider.toUpperCase();

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
  }

  const storedState = req.cookies.get("oauth_state")?.value;
  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }

  const config = await prisma.oAuthProviderConfig.findUnique({
    where: { provider: providerKey as "GOOGLE" | "GITHUB" | "MICROSOFT" | "SLACK" },
  });

  if (!config || !config.enabled) {
    return NextResponse.redirect(new URL("/login?error=provider_disabled", req.url));
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/oauth/callback/${provider}`;

  let tokenData: TokenResponse;
  try {
    tokenData = await exchangeCode(
      providerKey,
      code,
      config.clientId,
      config.clientSecret,
      callbackUrl
    );
  } catch {
    return NextResponse.redirect(new URL("/login?error=token_exchange_failed", req.url));
  }

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/login?error=no_access_token", req.url));
  }

  let userInfo: { id: string; email: string; name: string; avatarUrl?: string };
  try {
    userInfo = await getUserInfo(providerKey, tokenData.access_token);
  } catch {
    return NextResponse.redirect(new URL("/login?error=userinfo_failed", req.url));
  }

  if (!userInfo.email) {
    return NextResponse.redirect(new URL("/login?error=no_email", req.url));
  }

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email: userInfo.email.toLowerCase() } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userInfo.email.toLowerCase(),
        name: userInfo.name,
        passwordHash: "",
        role: "TENANT_MEMBER",
        emailVerified: new Date(),
        image: userInfo.avatarUrl,
      },
    });
  } else if (!user.image && userInfo.avatarUrl) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { image: userInfo.avatarUrl, emailVerified: new Date() },
    });
  }

  // Upsert OAuth account link
  await prisma.oAuthAccount.upsert({
    where: { provider_providerAccountId: { provider: providerKey, providerAccountId: userInfo.id } },
    create: {
      userId: user.id,
      provider: providerKey,
      providerAccountId: userInfo.id,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null,
    },
    update: {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? undefined,
      expiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : undefined,
    },
  });

  const sessionToken = await createSession(user.id);

  const redirectTo = user.tenantId
    ? `/dashboard/${user.tenantId}`
    : user.role === "SUPERADMIN"
    ? "/admin"
    : "/onboarding";

  const response = NextResponse.redirect(new URL(redirectTo, req.url));
  setSessionCookie(sessionToken, response);
  response.cookies.delete("oauth_state");

  return response;
}
