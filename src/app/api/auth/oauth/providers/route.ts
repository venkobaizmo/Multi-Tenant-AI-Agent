import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  const configs = await prisma.oAuthProviderConfig.findMany({
    where: { enabled: true },
    select: { provider: true, enabled: true },
    orderBy: { provider: "asc" },
  });
  return NextResponse.json(configs);
}
