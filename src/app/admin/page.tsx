import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTokens } from "@/lib/utils";
import { Building2, Users, Bot, CreditCard, Shield } from "lucide-react";

export default async function SuperAdminPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    redirect("/login");
  }

  const [tenantCount, userCount, agentCount, recentTenants] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.agent.count({ where: { status: "PUBLISHED" } }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        _count: { select: { users: true, agents: true, agentSessions: true } },
        complianceProfile: { select: { hipaaEnabled: true, gdprEnabled: true } },
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Super Admin Console</h1>
            <p className="text-muted-foreground">Platform-wide management and oversight</p>
          </div>
          <Badge variant="destructive" className="text-sm">
            <Shield className="mr-1 h-3 w-3" />
            SUPERADMIN
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Total Tenants", value: tenantCount, icon: Building2, color: "text-violet-600", bg: "bg-violet-50" },
            { label: "Total Users", value: userCount, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Published Agents", value: agentCount, icon: Bot, color: "text-emerald-600", bg: "bg-emerald-50" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl p-3 ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tenant Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">Organization</th>
                    <th className="pb-3 font-medium text-muted-foreground">Plan</th>
                    <th className="pb-3 font-medium text-muted-foreground">Users</th>
                    <th className="pb-3 font-medium text-muted-foreground">Agents</th>
                    <th className="pb-3 font-medium text-muted-foreground">Sessions</th>
                    <th className="pb-3 font-medium text-muted-foreground">Compliance</th>
                    <th className="pb-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentTenants.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3">
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.slug}</p>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant={t.billingPlan === "ENTERPRISE" ? "default" : "secondary"}>
                          {t.billingPlan}
                        </Badge>
                      </td>
                      <td className="py-3">{t._count.users}</td>
                      <td className="py-3">{t._count.agents}</td>
                      <td className="py-3">{t._count.agentSessions}</td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          {t.complianceProfile?.hipaaEnabled && (
                            <Badge variant="outline" className="text-xs">HIPAA</Badge>
                          )}
                          {t.complianceProfile?.gdprEnabled && (
                            <Badge variant="outline" className="text-xs">GDPR</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <Link href={`/dashboard/${t.id}`}>
                          <Button variant="outline" size="sm">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
