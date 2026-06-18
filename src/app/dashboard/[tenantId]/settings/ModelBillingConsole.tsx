"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star } from "lucide-react";
import { TenantLLMConfig, LLMProvider } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface ModelBillingConsoleProps {
  tenantId: string;
  initialConfigs: TenantLLMConfig[];
}

const PROVIDER_MODELS: Record<string, string[]> = {
  OPENAI: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  ANTHROPIC: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  DEEPSEEK: ["deepseek-chat", "deepseek-reasoner"],
  GROQ: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  GOOGLE: ["gemini-2.0-flash", "gemini-1.5-pro"],
  MISTRAL: ["mistral-large-latest", "mistral-small-latest"],
};

export function ModelBillingConsole({ tenantId, initialConfigs }: ModelBillingConsoleProps) {
  const router = useRouter();
  const [configs, setConfigs] = useState(initialConfigs);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newConfig, setNewConfig] = useState({
    provider: "ANTHROPIC" as LLMProvider,
    modelName: "claude-sonnet-4-6",
    apiKeyRef: "",
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 4096,
    isDefault: false,
    fallbackOrder: 0,
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/${tenantId}/llm-configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        const created = await res.json();
        setConfigs([...configs, created]);
        setAdding(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/dashboard/${tenantId}/llm-configs/${id}`, { method: "DELETE" });
    setConfigs(configs.filter((c) => c.id !== id));
    router.refresh();
  };

  const handleSetDefault = async (id: string) => {
    await fetch(`/api/dashboard/${tenantId}/llm-configs/${id}/default`, { method: "POST" });
    setConfigs(configs.map((c) => ({ ...c, isDefault: c.id === id })));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Model Configurations</CardTitle>
          <CardDescription>
            Add LLM providers with fallback ordering. The default model handles all agent requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No model configurations added yet. Add one below.
            </p>
          ) : (
            configs.map((config) => (
              <div
                key={config.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{config.modelName}</p>
                      {config.isDefault && (
                        <Badge variant="default" className="gap-1">
                          <Star className="h-3 w-3" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {config.provider} &mdash; Temp: {config.temperature} &mdash; Max tokens:{" "}
                      {config.maxTokens}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Key: {config.apiKeyRef.slice(0, 8)}
                      {"*".repeat(12)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!config.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(config.id)}
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDelete(config.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}

          {adding ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={newConfig.provider}
                    onValueChange={(v) =>
                      setNewConfig({
                        ...newConfig,
                        provider: v as LLMProvider,
                        modelName: PROVIDER_MODELS[v]?.[0] ?? "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(PROVIDER_MODELS).map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={newConfig.modelName}
                    onValueChange={(v) => setNewConfig({ ...newConfig, modelName: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(PROVIDER_MODELS[newConfig.provider] ?? []).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={newConfig.apiKeyRef}
                  onChange={(e) => setNewConfig({ ...newConfig, apiKeyRef: e.target.value })}
                  placeholder="sk-..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Temperature ({newConfig.temperature})</Label>
                  <Input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={newConfig.temperature}
                    onChange={(e) =>
                      setNewConfig({ ...newConfig, temperature: parseFloat(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Top-P ({newConfig.topP})</Label>
                  <Input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={newConfig.topP}
                    onChange={(e) =>
                      setNewConfig({ ...newConfig, topP: parseFloat(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={newConfig.maxTokens}
                    onChange={(e) =>
                      setNewConfig({ ...newConfig, maxTokens: parseInt(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={newConfig.isDefault}
                  onCheckedChange={(v) => setNewConfig({ ...newConfig, isDefault: v })}
                />
                <Label>Set as default model</Label>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? "Adding..." : "Add Configuration"}
                </Button>
                <Button variant="outline" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add Model Configuration
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
