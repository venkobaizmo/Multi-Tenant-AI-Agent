import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth";
import { OAuthProviderType } from "@prisma/client";

const upsertSchema = z.object({
  provider: z.nativeEnum(OAuthProviderType),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  enabled: z.boolean().default(false),
  scopes: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(["SUPERADMIN"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configs = await prisma.oAuthProviderConfig.findMany({
    orderBy: { provider: "asc" },
  });

  // Mask client secrets in the response
  return NextResponse.json(
    configs.map((c) => ({
      ...c,
      clientSecret: c.clientSecret ? `${c.clientSecret.slice(0, 6)}${"*".repeat(20)}` : "",
    }))
  );
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(["SUPERADMIN"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const config = await prisma.oAuthProviderConfig.upsert({
    where: { provider: parsed.data.provider },
    create: parsed.data,
    update: {
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      enabled: parsed.data.enabled,
      scopes: parsed.data.scopes,
    },
  });

  return NextResponse.json({
    ...config,
    clientSecret: `${config.clientSecret.slice(0, 6)}${"*".repeat(20)}`,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole(["SUPERADMIN"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { provider, enabled } = await req.json();

  const config = await prisma.oAuthProviderConfig.update({
    where: { provider: provider as OAuthProviderType },
    data: { enabled },
  });

  return NextResponse.json({ id: config.id, provider: config.provider, enabled: config.enabled });
}
