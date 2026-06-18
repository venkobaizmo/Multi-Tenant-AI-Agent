import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";
import { MaskingStrategy } from "@prisma/client";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const profile = await prisma.complianceProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
      hipaaEnabled: body.hipaaEnabled ?? false,
      gdprEnabled: body.gdprEnabled ?? false,
      pciEnabled: body.pciEnabled ?? false,
      maskingStrategy: (body.maskingStrategy as MaskingStrategy) ?? "ANONYMIZE",
      customBlocklist: body.customBlocklist ?? [],
      retentionDays: body.retentionDays ?? 90,
    },
    update: {
      hipaaEnabled: body.hipaaEnabled,
      gdprEnabled: body.gdprEnabled,
      pciEnabled: body.pciEnabled,
      maskingStrategy: body.maskingStrategy as MaskingStrategy,
      customBlocklist: body.customBlocklist,
      retentionDays: body.retentionDays,
    },
  });

  return NextResponse.json(profile);
}
