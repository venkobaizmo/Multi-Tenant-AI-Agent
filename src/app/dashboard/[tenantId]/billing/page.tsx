import prisma from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTokens, formatCents } from "@/lib/utils";
import { CreditCard, TrendingUp, Zap, Wrench } from "lucide-react";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const [tenant, usageRecords] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        billingPlan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        monthlyTokenUsed: true,
        monthlyTokenQuota: true,
        monthlyToolCallUsed: true,
        monthlyToolCallQuota: true,
        billingCycleStart: true,
      },
    }),
    prisma.usageRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  if (!tenant) return null;

  const unbilledRecords = usageRecords.filter((r) => !r.reportedToStripe);
  const unbilledCost = unbilledRecords.reduce((s, r) => s + r.totalCostCents, 0);
  const unbilledTokens = unbilledRecords.reduce(
    (s, r) => s + Number(r.promptTokens) + Number(r.completionTokens),
    0
  );
  const unbilledTools = unbilledRecords.reduce((s, r) => s + r.toolInvocations, 0);

  const planInfo = {
    FREE: { label: "Free", color: "secondary" as const, price: "$0/mo" },
    STARTER: { label: "Starter", color: "default" as const, price: "$29/mo" },
    PROFESSIONAL: { label: "Professional", color: "default" as const, price: "$99/mo" },
    ENTERPRISE: { label: "Enterprise", color: "default" as const, price: "Custom" },
  };

  const plan = planInfo[tenant.billingPlan];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Usage</h1>
        <p className="text-muted-foreground">Monitor usage and manage your subscription</p>
      </div>

      {/* Plan Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-primary/10 p-3">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{plan.label}</p>
                <Badge variant={plan.color}>{plan.price}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-amber-100 p-3">
              <Zap className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tokens (this cycle)</p>
              <p className="text-xl font-bold">
                {formatTokens(Number(tenant.monthlyTokenUsed))}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}/ {formatTokens(Number(tenant.monthlyTokenQuota))}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-blue-100 p-3">
              <Wrench className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tool Calls (this cycle)</p>
              <p className="text-xl font-bold">
                {tenant.monthlyToolCallUsed.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}/ {tenant.monthlyToolCallQuota.toLocaleString()}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unbilled Balance */}
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-800">
            <TrendingUp className="h-4 w-4" />
            Accrued (Unbilled) Balance
          </CardTitle>
          <CardDescription className="text-amber-700">
            Usage recorded but not yet reported to Stripe
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-amber-700">Tokens</p>
              <p className="text-lg font-bold text-amber-900">{formatTokens(unbilledTokens)}</p>
            </div>
            <div>
              <p className="text-xs text-amber-700">Tool Calls</p>
              <p className="text-lg font-bold text-amber-900">{unbilledTools}</p>
            </div>
            <div>
              <p className="text-xs text-amber-700">Estimated Cost</p>
              <p className="text-lg font-bold text-amber-900">{formatCents(unbilledCost)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage History */}
      <Card>
        <CardHeader>
          <CardTitle>Usage History</CardTitle>
        </CardHeader>
        <CardContent>
          {usageRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 font-medium text-muted-foreground">Tokens</th>
                    <th className="pb-2 font-medium text-muted-foreground">Tools</th>
                    <th className="pb-2 font-medium text-muted-foreground">Cost</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usageRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {formatTokens(Number(r.promptTokens) + Number(r.completionTokens))}
                      </td>
                      <td className="py-3">{r.toolInvocations}</td>
                      <td className="py-3">{formatCents(r.totalCostCents)}</td>
                      <td className="py-3">
                        <Badge variant={r.reportedToStripe ? "success" : "warning"}>
                          {r.reportedToStripe ? "Reported" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
