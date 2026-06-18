import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; configId: string }> }
) {
  const { tenantId, configId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.tenantLLMConfig.deleteMany({ where: { id: configId, tenantId } });

  return NextResponse.json({ success: true });
}
