import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; configId: string }> }
) {
  const { tenantId, configId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.$transaction([
    prisma.tenantLLMConfig.updateMany({
      where: { tenantId },
      data: { isDefault: false },
    }),
    prisma.tenantLLMConfig.updateMany({
      where: { id: configId, tenantId },
      data: { isDefault: true },
    }),
  ]);

  return NextResponse.json({ success: true });
}
