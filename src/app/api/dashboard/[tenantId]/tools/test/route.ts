import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth";
import { executeInSandbox } from "@/lib/sandbox/sandboxExecutor";
import { ToolExecutionType } from "@prisma/client";

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

  const { executionType, executionCode, args } = await req.json();

  if (
    executionType !== ToolExecutionType.SANDBOX_NODE &&
    executionType !== ToolExecutionType.SANDBOX_PYTHON
  ) {
    return NextResponse.json({ error: "Only sandbox runtimes can be tested here" }, { status: 400 });
  }

  const result = await executeInSandbox({
    code: executionCode,
    runtime: executionType,
    tenantContext: { id: tenantId },
    args: args ?? {},
    timeoutMs: 10000,
  });

  return NextResponse.json(result);
}
