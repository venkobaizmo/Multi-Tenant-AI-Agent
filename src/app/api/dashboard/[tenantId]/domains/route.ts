import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain } = await req.json();

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const cleaned = domain.replace(/^https?:\/\//, "").split("/")[0];

  const record = await prisma.whitelistedDomain.create({
    data: { tenantId, domain: cleaned },
  });

  return NextResponse.json(record, { status: 201 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domains = await prisma.whitelistedDomain.findMany({ where: { tenantId } });
  return NextResponse.json(domains);
}
