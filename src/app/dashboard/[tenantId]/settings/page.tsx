import prisma from "@/lib/db/prisma";
import { ModelBillingConsole } from "./ModelBillingConsole";
import { EmbedSecurityConsole } from "./EmbedSecurityConsole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const [tenant, llmConfigs, agents] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { whitelistedDomains: true },
    }),
    prisma.tenantLLMConfig.findMany({
      where: { tenantId },
      orderBy: { fallbackOrder: "asc" },
    }),
    prisma.agent.findMany({
      where: { tenantId, status: "PUBLISHED" },
      select: { id: true, name: true, embedToken: true, allowedOrigins: true },
    }),
  ]);

  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure AI models, embed security, and workspace preferences
        </p>
      </div>

      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">Models & Billing Router</TabsTrigger>
          <TabsTrigger value="embed">Embed & Security</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="mt-6">
          <ModelBillingConsole tenantId={tenantId} initialConfigs={llmConfigs} />
        </TabsContent>

        <TabsContent value="embed" className="mt-6">
          <EmbedSecurityConsole
            tenantId={tenantId}
            initialDomains={tenant.whitelistedDomains}
            agents={agents}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
