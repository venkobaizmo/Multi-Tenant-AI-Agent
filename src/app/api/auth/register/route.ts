import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  organizationName: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { name, email, password, organizationName, slug } = parsed.data;

  const [existingUser, existingTenant] = await Promise.all([
    prisma.user.findUnique({ where: { email: email.toLowerCase() } }),
    prisma.tenant.findUnique({ where: { slug } }),
  ]);

  if (existingUser) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  if (existingTenant) {
    return NextResponse.json({ error: "Organization slug already taken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: organizationName,
        slug,
        billingPlan: "FREE",
      },
    });

    await tx.complianceProfile.create({
      data: { tenantId: tenant.id },
    });

    const user = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: "TENANT_ADMIN",
        tenantId: tenant.id,
      },
    });

    return { tenant, user };
  });

  const token = await createSession(result.user.id);

  const response = NextResponse.json(
    {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        tenantId: result.user.tenantId,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
      redirectTo: `/dashboard/${result.tenant.id}`,
    },
    { status: 201 }
  );

  setSessionCookie(token, response);

  return response;
}
