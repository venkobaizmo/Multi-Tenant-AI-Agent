"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, XCircle, Settings } from "lucide-react";

interface ProviderConfig {
  id?: string;
  provider: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  scopes: string[];
}

const PROVIDER_INFO: Record<string, { label: string; color: string; docsUrl: string; defaultScopes: string[] }> = {
  GOOGLE: {
    label: "Google",
    color: "bg-red-50 text-red-700 border-red-200",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    defaultScopes: ["openid", "email", "profile"],
  },
  GITHUB: {
    label: "GitHub",
    color: "bg-gray-50 text-gray-700 border-gray-200",
    docsUrl: "https://github.com/settings/developers",
    defaultScopes: ["read:user", "user:email"],
  },
  MICROSOFT: {
    label: "Microsoft",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    docsUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    defaultScopes: ["openid", "email", "profile"],
  },
  SLACK: {
    label: "Slack",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    docsUrl: "https://api.slack.com/apps",
    defaultScopes: ["openid", "email", "profile"],
  },
};

const ALL_PROVIDERS = ["GOOGLE", "GITHUB", "MICROSOFT", "SLACK"];

interface Props {
  initialConfigs: ProviderConfig[];
}

export function OAuthProvidersClient({ initialConfigs }: Props) {
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>(() => {
    const map: Record<string, ProviderConfig> = {};
    for (const provider of ALL_PROVIDERS) {
      const existing = initialConfigs.find((c) => c.provider === provider);
      map[provider] = existing ?? {
        provider,
        clientId: "",
        clientSecret: "",
        enabled: false,
        scopes: PROVIDER_INFO[provider].defaultScopes,
      };
    }
    return map;
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, { clientId: string; clientSecret: string; scopes: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const startEdit = (provider: string) => {
    const cfg = configs[provider];
    setFormState((prev) => ({
      ...prev,
      [provider]: {
        clientId: cfg.clientId,
        clientSecret: "",
        scopes: cfg.scopes.join(", "),
      },
    }));
    setEditing(provider);
  };

  const cancelEdit = (provider: string) => {
    if (editing === provider) setEditing(null);
  };

  const saveProvider = async (provider: string) => {
    const f = formState[provider];
    if (!f) return;
    setSaving(provider);
    try {
      const res = await fetch("/api/admin/oauth-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          clientId: f.clientId,
          clientSecret: f.clientSecret || configs[provider].clientSecret,
          enabled: configs[provider].enabled,
          scopes: f.scopes.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setConfigs((prev) => ({ ...prev, [provider]: { ...prev[provider], ...updated, clientSecret: updated.clientSecret } }));
      setEditing(null);
      showMessage("success", `${PROVIDER_INFO[provider].label} configuration saved.`);
    } catch {
      showMessage("error", "Failed to save configuration.");
    } finally {
      setSaving(null);
    }
  };

  const toggleProvider = async (provider: string) => {
    const cfg = configs[provider];
    if (!cfg.clientId && !cfg.enabled) {
      showMessage("error", "Configure client ID and secret before enabling.");
      return;
    }
    setToggling(provider);
    try {
      const res = await fetch("/api/admin/oauth-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled: !cfg.enabled }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      const updated = await res.json();
      setConfigs((prev) => ({ ...prev, [provider]: { ...prev[provider], enabled: updated.enabled } }));
      showMessage("success", `${PROVIDER_INFO[provider].label} ${updated.enabled ? "enabled" : "disabled"}.`);
    } catch {
      showMessage("error", "Failed to update status.");
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      {ALL_PROVIDERS.map((provider) => {
        const cfg = configs[provider];
        const info = PROVIDER_INFO[provider];
        const isEditing = editing === provider;
        const f = formState[provider] ?? { clientId: "", clientSecret: "", scopes: "" };
        const isConfigured = !!cfg.clientId;

        return (
          <Card key={provider}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`${info.color} font-semibold`}>
                    {info.label}
                  </Badge>
                  {isConfigured ? (
                    <span className="flex items-center gap-1 text-sm text-emerald-600">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Configured
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <XCircle className="h-3.5 w-3.5" />
                      Not configured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (isEditing ? cancelEdit(provider) : startEdit(provider))}
                  >
                    <Settings className="mr-1 h-3.5 w-3.5" />
                    {isEditing ? "Cancel" : "Configure"}
                  </Button>
                  <Button
                    size="sm"
                    variant={cfg.enabled ? "destructive" : "default"}
                    disabled={toggling === provider}
                    onClick={() => toggleProvider(provider)}
                  >
                    {toggling === provider ? "..." : cfg.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
              {cfg.enabled && (
                <Badge className="mt-2 w-fit bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  Active — users can sign in with {info.label}
                </Badge>
              )}
            </CardHeader>

            {isEditing && (
              <CardContent className="border-t pt-4">
                <CardDescription className="mb-4">
                  Create OAuth credentials at{" "}
                  <a href={info.docsUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    {info.docsUrl}
                  </a>
                  . Set the callback URL to:{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    {typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com"}
                    /api/auth/oauth/callback/{provider.toLowerCase()}
                  </code>
                </CardDescription>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input
                      value={f.clientId}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, [provider]: { ...f, clientId: e.target.value } }))
                      }
                      placeholder="your-client-id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Secret</Label>
                    <Input
                      type="password"
                      value={f.clientSecret}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, [provider]: { ...f, clientSecret: e.target.value } }))
                      }
                      placeholder={isConfigured ? "Leave blank to keep existing secret" : "your-client-secret"}
                    />
                    {isConfigured && (
                      <p className="text-xs text-muted-foreground">
                        Current: <code>{cfg.clientSecret}</code>
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Scopes (comma-separated)</Label>
                    <Input
                      value={f.scopes}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, [provider]: { ...f, scopes: e.target.value } }))
                      }
                      placeholder={info.defaultScopes.join(", ")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Default: {info.defaultScopes.join(", ")}
                    </p>
                  </div>
                  <Button
                    onClick={() => saveProvider(provider)}
                    disabled={saving === provider || !f.clientId || (!f.clientSecret && !isConfigured)}
                  >
                    {saving === provider ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
