import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import prisma from "@/lib/db/prisma";
import { UserRole } from "@prisma/client";

const JWT_SECRET_RAW = process.env.JWT_SECRET ?? "agentos-jwt-secret-enterprise-platform-2024-secure";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
const COOKIE_NAME = "agent_session";
const SESSION_TTL_DAYS = 7;

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("agent-platform")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: "agent-platform" });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, tenantId: true },
  });

  if (!user) throw new Error("User not found");

  const payload: SessionPayload = {
    userId,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };

  const token = await signToken(payload);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  await prisma.authSession.create({ data: { userId, token, expiresAt } });

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const dbSession = await prisma.authSession.findUnique({ where: { token } });
  if (!dbSession || dbSession.expiresAt < new Date()) return null;

  return payload;
}

export function setSessionCookie(token: string, response: Response): void {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`;
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!allowedRoles.includes(session.role)) throw new Error("Forbidden");
  return session;
}

export async function requireTenantAccess(tenantId: string): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role === UserRole.SUPERADMIN) return session;
  if (session.tenantId !== tenantId) throw new Error("Forbidden: no access to this tenant");
  return session;
}
