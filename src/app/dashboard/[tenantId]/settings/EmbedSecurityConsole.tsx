"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Copy, Check, Globe, Code2 } from "lucide-react";
import { WhitelistedDomain } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generateEmbedScript } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  embedToken: string;
  allowedOrigins: string[];
}

interface EmbedSecurityConsoleProps {
  tenantId: string;
  initialDomains: WhitelistedDomain[];
  agents: Agent[];
}

export function EmbedSecurityConsole({
  tenantId,
  initialDomains,
  agents,
}: EmbedSecurityConsoleProps) {
  const router = useRouter();
  const [domains, setDomains] = useState(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const addDomain = async () => {
    const domain = newDomain.trim().replace(/^https?:\/\//, "");
    if (!domain || domains.find((d) => d.domain === domain)) return;

    const res = await fetch(`/api/dashboard/${tenantId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    if (res.ok) {
      const created = await res.json();
      setDomains([...domains, created]);
      setNewDomain("");
      router.refresh();
    }
  };

  const removeDomain = async (id: string) => {
    await fetch(`/api/dashboard/${tenantId}/domains/${id}`, { method: "DELETE" });
    setDomains(domains.filter((d) => d.id !== id));
    router.refresh();
  };

  const copySnippet = (agentId: string, embedToken: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const snippet = generateEmbedScript(agentId, embedToken, baseUrl);
    navigator.clipboard.writeText(snippet);
    setCopied(agentId);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Domain Whitelist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Whitelisted Domains
          </CardTitle>
          <CardDescription>
            Only requests from these origins can embed your agents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
            />
            <Button onClick={addDomain} size="icon" variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {domains.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No domains whitelisted. All widget requests will be rejected.
              </p>
            ) : (
              domains.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-mono">{d.domain}</span>
                  </div>
                  <button
                    onClick={() => removeDomain(d.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>Security note:</strong> Requests from origins not in this list return 403
            Forbidden. Use exact domain names without protocol (e.g. <code>example.com</code>).
          </div>
        </CardContent>
      </Card>

      {/* Embed Snippets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Agent Embed Snippets
          </CardTitle>
          <CardDescription>
            Copy the script tag to embed any published agent on your site
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Publish an agent first to get embed snippets.
            </p>
          ) : (
            agents.map((agent) => {
              const baseUrl =
                typeof window !== "undefined"
                  ? window.location.origin
                  : "https://your-domain.com";
              const snippet = generateEmbedScript(agent.id, agent.embedToken, baseUrl);
              return (
                <div key={agent.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{agent.name}</p>
                      <Badge variant="success">Published</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copySnippet(agent.id, agent.embedToken)}
                    >
                      {copied === agent.id ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copied === agent.id ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <pre className="max-h-24 overflow-auto rounded-md bg-muted p-2 text-xs font-mono leading-relaxed">
                    {snippet}
                  </pre>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
