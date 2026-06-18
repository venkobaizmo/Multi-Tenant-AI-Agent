import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { requireTenantAccess } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const agent = await prisma.agent.create({
    data: {
      tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      systemPrompt: parsed.data.systemPrompt,
      status: "DRAFT",
    },
  });

  return NextResponse.json(agent, { status: 201 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agents = await prisma.agent.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(agents);
}
