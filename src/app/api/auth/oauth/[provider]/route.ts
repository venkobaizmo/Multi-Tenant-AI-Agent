import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

const OAUTH_CONFIGS: Record<string, { authUrl: string; scopes: string[] }> = {
  GOOGLE: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: ["openid", "email", "profile"],
  },
  GITHUB: {
    authUrl: "https://github.com/login/oauth/authorize",
    scopes: ["read:user", "user:email"],
  },
  MICROSOFT: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    scopes: ["openid", "email", "profile"],
  },
  SLACK: {
    authUrl: "https://slack.com/openid/connect/authorize",
    scopes: ["openid", "email", "profile"],
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerKey = provider.toUpperCase();

  const config = await prisma.oAuthProviderConfig.findUnique({
    where: { provider: providerKey as "GOOGLE" | "GITHUB" | "MICROSOFT" | "SLACK" },
  });

  if (!config || !config.enabled) {
    return NextResponse.redirect(new URL("/login?error=provider_disabled", req.url));
  }

  const oauthConfig = OAUTH_CONFIGS[providerKey];
  if (!oauthConfig) {
    return NextResponse.redirect(new URL("/login?error=unknown_provider", req.url));
  }

  const state = crypto.randomUUID();
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/oauth/callback/${provider}`;

  const params2 = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: (config.scopes.length > 0 ? config.scopes : oauthConfig.scopes).join(" "),
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const response = NextResponse.redirect(`${oauthConfig.authUrl}?${params2.toString()}`);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
