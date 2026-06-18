import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";
import { ToolExecutionType } from "@prisma/client";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; toolId: string }> }
) {
  const { tenantId, toolId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const tool = await prisma.toolRegistry.updateMany({
    where: { id: toolId, tenantId },
    data: {
      name: body.name,
      description: body.description,
      executionType: body.executionType as ToolExecutionType,
      jsonSchema: body.jsonSchema,
      webhookUrl: body.webhookUrl || null,
      executionCode: body.executionCode || null,
      timeoutMs: body.timeoutMs,
    },
  });

  return NextResponse.json(tool);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; toolId: string }> }
) {
  const { tenantId, toolId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.toolRegistry.deleteMany({ where: { id: toolId, tenantId } });

  return NextResponse.json({ success: true });
}
