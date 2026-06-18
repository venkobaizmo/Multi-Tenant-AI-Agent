import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";
import { ToolExecutionType } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z_][a-z0-9_]*$/, "Tool name must be snake_case"),
  description: z.string().min(1),
  executionType: z.nativeEnum(ToolExecutionType),
  jsonSchema: z.record(z.unknown()),
  webhookUrl: z.string().url().optional().or(z.literal("")),
  webhookHeaders: z.record(z.string()).optional(),
  executionCode: z.string().optional(),
  timeoutMs: z.number().min(1000).max(60000).default(10000),
});

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

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const tool = await prisma.toolRegistry.create({
    data: { tenantId, ...parsed.data },
  });

  return NextResponse.json(tool, { status: 201 });
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

  const tools = await prisma.toolRegistry.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(tools);
}
