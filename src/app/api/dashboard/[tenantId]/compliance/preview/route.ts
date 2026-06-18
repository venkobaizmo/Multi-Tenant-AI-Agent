import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth";
import { scrubText } from "@/lib/compliance/piiScrubber";

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

  const { text } = await req.json();
  const result = await scrubText(text ?? "", tenantId);

  return NextResponse.json({
    original: result.original,
    scrubbed: result.scrubbed,
    detectionCount: result.detections.length,
    detections: result.detections.map((d) => ({
      type: d.type,
      replacement: d.replacement,
    })),
  });
}
