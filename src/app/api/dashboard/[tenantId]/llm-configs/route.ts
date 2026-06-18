import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";
import { LLMProvider } from "@prisma/client";

const createSchema = z.object({
  provider: z.nativeEnum(LLMProvider),
  modelName: z.string().min(1),
  apiKeyRef: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).default(1.0),
  maxTokens: z.number().min(256).max(128000).default(4096),
  isDefault: z.boolean().default(false),
  fallbackOrder: z.number().int().min(0).default(0),
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

  if (parsed.data.isDefault) {
    await prisma.tenantLLMConfig.updateMany({
      where: { tenantId },
      data: { isDefault: false },
    });
  }

  const config = await prisma.tenantLLMConfig.create({
    data: { tenantId, ...parsed.data },
  });

  return NextResponse.json(config, { status: 201 });
}
