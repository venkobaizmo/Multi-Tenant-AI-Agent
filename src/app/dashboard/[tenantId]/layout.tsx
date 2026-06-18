import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { Sidebar } from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/login?from=/dashboard/${tenantId}`);
  }

  if (session.role !== "SUPERADMIN" && session.tenantId !== tenantId) {
    redirect("/login");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId, isActive: true },
    select: { id: true, name: true, billingPlan: true },
  });

  if (!tenant) notFound();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        tenantId={tenant.id}
        tenantName={tenant.name}
        tenantPlan={tenant.billingPlan}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
