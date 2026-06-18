import { notFound } from "next/navigation";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTokens } from "@/lib/utils";
import {
  Bot, MessageSquare, Wrench, TrendingUp, Zap, Shield, Clock,
} from "lucide-react";

export default async function DashboardOverviewPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  await getSession();

  const [tenant, agentCount, toolCount, sessionCount, recentSessions] =
    await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          billingPlan: true,
          monthlyTokenUsed: true,
          monthlyTokenQuota: true,
          monthlyToolCallUsed: true,
          monthlyToolCallQuota: true,
          billingCycleStart: true,
        },
      }),
      prisma.agent.count({ where: { tenantId, status: "PUBLISHED" } }),
      prisma.toolRegistry.count({ where: { tenantId, isActive: true } }),
      prisma.agentSession.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.agentSession.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { agent: { select: { name: true } } },
      }),
    ]);

  if (!tenant) notFound();

  const tokenUsagePercent = Math.min(
    100,
    (Number(tenant.monthlyTokenUsed) / Number(tenant.monthlyTokenQuota)) * 100
  );

  const stats = [
    {
      label: "Published Agents",
      value: agentCount,
      icon: Bot,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Active Tools",
      value: toolCount,
      icon: Wrench,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Sessions (30d)",
      value: sessionCount,
      icon: MessageSquare,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Tokens Used",
      value: formatTokens(Number(tenant.monthlyTokenUsed)),
      icon: Zap,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">
          {tenant.name} &mdash; {tenant.billingPlan} plan
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold">{s.value}</p>
                </div>
                <div className={`rounded-xl p-3 ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Token Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Monthly Token Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>{formatTokens(Number(tenant.monthlyTokenUsed))} used</span>
            <span className="text-muted-foreground">
              {formatTokens(Number(tenant.monthlyTokenQuota))} quota
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all ${
                tokenUsagePercent > 90
                  ? "bg-destructive"
                  : tokenUsagePercent > 70
                  ? "bg-amber-500"
                  : "bg-primary"
              }`}
              style={{ width: `${tokenUsagePercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {tokenUsagePercent.toFixed(1)}% of monthly quota consumed
          </p>
        </CardContent>
      </Card>

      {/* Compliance Indicators */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ComplianceBadges tenantId={tenantId} />
        </CardContent>
      </Card>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <div className="space-y-3">
              {recentSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{s.agent.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatTokens(
                        Number(s.totalPromptTokens) +
                          Number(s.totalCompletionTokens)
                      )}{" "}
                      tokens
                    </span>
                    <Badge
                      variant={
                        s.status === "COMPLETED"
                          ? "success"
                          : s.status === "FAILED"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function ComplianceBadges({ tenantId }: { tenantId: string }) {
  const profile = await prisma.complianceProfile.findUnique({
    where: { tenantId },
    select: { hipaaEnabled: true, gdprEnabled: true, pciEnabled: true },
  });

  if (!profile) {
    return <p className="text-sm text-muted-foreground">No compliance profile configured.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={profile.hipaaEnabled ? "success" : "outline"}>
        HIPAA {profile.hipaaEnabled ? "Active" : "Off"}
      </Badge>
      <Badge variant={profile.gdprEnabled ? "success" : "outline"}>
        GDPR {profile.gdprEnabled ? "Active" : "Off"}
      </Badge>
      <Badge variant={profile.pciEnabled ? "success" : "outline"}>
        PCI-DSS {profile.pciEnabled ? "Active" : "Off"}
      </Badge>
    </div>
  );
}
