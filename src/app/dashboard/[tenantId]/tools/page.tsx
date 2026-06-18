import prisma from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { ToolBuilder } from "./ToolBuilder";

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const tools = await prisma.toolRegistry.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tool Registry</h1>
        <p className="text-muted-foreground">
          Define webhooks, Node.js, and Python tools available to your agents
        </p>
      </div>

      <ToolBuilder tenantId={tenantId} existingTools={tools} />
    </div>
  );
}
