import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db/prisma";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("agent_session")?.value;

  if (token) {
    await prisma.authSession.deleteMany({ where: { token } }).catch(() => {});
  }

  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", clearSessionCookie());

  return response;
}
