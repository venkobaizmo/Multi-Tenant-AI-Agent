import prisma from "@/lib/db/prisma";
import { ComplianceConsole } from "./ComplianceConsole";

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const profile = await prisma.complianceProfile.findUnique({
    where: { tenantId },
  });

  const recentScans = await prisma.eventLog.findMany({
    where: { tenantId, eventType: "COMPLIANCE_SCAN" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compliance & Privacy</h1>
        <p className="text-muted-foreground">
          Configure data protection rules and PII masking policies
        </p>
      </div>
      <ComplianceConsole
        tenantId={tenantId}
        initialProfile={profile}
        recentScans={recentScans}
      />
    </div>
  );
}
