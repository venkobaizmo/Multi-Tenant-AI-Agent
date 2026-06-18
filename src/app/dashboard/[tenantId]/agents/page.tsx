import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Plus, Code2, Globe } from "lucide-react";
import { generateEmbedScript } from "@/lib/utils";
import { AgentCreateDialog } from "./AgentCreateDialog";

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const agents = await prisma.agent.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { sessions: true } },
    },
  });

  const statusColors: Record<string, "success" | "secondary" | "outline"> = {
    PUBLISHED: "success",
    DRAFT: "secondary",
    ARCHIVED: "outline",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground">
            Configure and deploy AI agents for your workspace
          </p>
        </div>
        <AgentCreateDialog tenantId={tenantId} />
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-12 text-center">
          <Bot className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No agents yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first agent to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{agent.name}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {agent.description ?? "No description"}
                    </CardDescription>
                  </div>
                  <Badge variant={statusColors[agent.status]}>{agent.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Bot className="h-3 w-3" />
                    v{agent.version}
                  </span>
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {agent._count.sessions} sessions
                  </span>
                </div>

                {agent.status === "PUBLISHED" && (
                  <EmbedSnippet agentId={agent.id} embedToken={agent.embedToken} />
                )}

                <div className="flex gap-2 pt-1">
                  <Link href={`/dashboard/${tenantId}/agents/${agent.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      Edit
                    </Button>
                  </Link>
                  <Link
                    href={`/dashboard/${tenantId}/agents/${agent.id}/embed`}
                    className="flex-1"
                  >
                    <Button size="sm" className="w-full">
                      <Code2 className="h-3 w-3" />
                      Embed
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmbedSnippet({
  agentId,
  embedToken,
}: {
  agentId: string;
  embedToken: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-domain.com";
  const snippet = generateEmbedScript(agentId, embedToken, baseUrl);

  return (
    <div className="rounded-md bg-muted p-2">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Embed snippet</p>
      <pre className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-foreground">
        {snippet.slice(0, 60)}...
      </pre>
    </div>
  );
}
