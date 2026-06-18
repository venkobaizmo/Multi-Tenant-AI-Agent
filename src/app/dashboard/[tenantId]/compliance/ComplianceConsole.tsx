"use client";

import { useState } from "react";
import { Shield, Plus, X, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceProfile, EventLog, MaskingStrategy } from "@prisma/client";

interface ComplianceConsoleProps {
  tenantId: string;
  initialProfile: ComplianceProfile | null;
  recentScans: EventLog[];
}

const SAMPLE_TEXT =
  "Patient John Smith (SSN: 123-45-6789, DOB: 04/15/1980) was seen on 2024-01-15. " +
  "Contact: john.smith@example.com, Phone: 555-123-4567. " +
  "Credit card on file: 4111111111111111.";

export function ComplianceConsole({
  tenantId,
  initialProfile,
  recentScans,
}: ComplianceConsoleProps) {
  const [profile, setProfile] = useState({
    hipaaEnabled: initialProfile?.hipaaEnabled ?? false,
    gdprEnabled: initialProfile?.gdprEnabled ?? false,
    pciEnabled: initialProfile?.pciEnabled ?? false,
    maskingStrategy: (initialProfile?.maskingStrategy ?? "ANONYMIZE") as MaskingStrategy,
    customBlocklist: (initialProfile?.customBlocklist ?? []) as string[],
    retentionDays: initialProfile?.retentionDays ?? 90,
  });

  const [newBlockword, setNewBlockword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState("");

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/dashboard/${tenantId}/compliance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    const res = await fetch(`/api/dashboard/${tenantId}/compliance/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: SAMPLE_TEXT }),
    });
    const data = await res.json();
    setPreview(data.scrubbed ?? "");
  };

  const addBlockword = () => {
    const word = newBlockword.trim();
    if (word && !profile.customBlocklist.includes(word)) {
      setProfile({ ...profile, customBlocklist: [...profile.customBlocklist, word] });
      setNewBlockword("");
    }
  };

  const removeBlockword = (word: string) => {
    setProfile({
      ...profile,
      customBlocklist: profile.customBlocklist.filter((w) => w !== word),
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Compliance Presets
          </CardTitle>
          <CardDescription>
            Activate regulatory frameworks to automatically scrub relevant PII patterns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ComplianceToggle
            label="HIPAA"
            description="Masks SSNs, NPIs, MRNs, dates of birth, and medical record identifiers"
            checked={profile.hipaaEnabled}
            onCheckedChange={(v) => setProfile({ ...profile, hipaaEnabled: v })}
            badge="Healthcare"
          />
          <ComplianceToggle
            label="GDPR"
            description="Anonymizes emails, IPs, phone numbers, and all personally identifiable information"
            checked={profile.gdprEnabled}
            onCheckedChange={(v) => setProfile({ ...profile, gdprEnabled: v })}
            badge="EU"
          />
          <ComplianceToggle
            label="PCI-DSS"
            description="Redacts payment card numbers, IBANs, and financial account identifiers"
            checked={profile.pciEnabled}
            onCheckedChange={(v) => setProfile({ ...profile, pciEnabled: v })}
            badge="Payments"
          />

          <div className="space-y-2">
            <Label>Masking Strategy</Label>
            <Select
              value={profile.maskingStrategy}
              onValueChange={(v) =>
                setProfile({ ...profile, maskingStrategy: v as MaskingStrategy })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ANONYMIZE">[LABEL] — e.g. [EMAIL]</SelectItem>
                <SelectItem value="REDACT">[REDACTED:LABEL] — explicit redaction</SelectItem>
                <SelectItem value="TOKENIZE">[TOKEN_LABEL_0001] — reversible tokens</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data Retention (days)</Label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={profile.retentionDays}
              onChange={(e) =>
                setProfile({ ...profile, retentionDays: parseInt(e.target.value) || 90 })
              }
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saved ? "Saved!" : saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Custom Blocklist */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Custom Blocklist</CardTitle>
            <CardDescription>
              Add words or phrases to always scrub from messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. internal-project-codename"
                value={newBlockword}
                onChange={(e) => setNewBlockword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addBlockword()}
              />
              <Button onClick={addBlockword} size="icon" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.customBlocklist.map((word) => (
                <Badge key={word} variant="secondary" className="gap-1">
                  {word}
                  <button onClick={() => removeBlockword(word)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {profile.customBlocklist.length === 0 && (
                <p className="text-xs text-muted-foreground">No blocked words added yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Masking Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Live Masking Preview
            </CardTitle>
            <CardDescription>See how your current rules transform sample data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">BEFORE</p>
              <div className="rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground">
                {SAMPLE_TEXT}
              </div>
            </div>
            <Button onClick={handlePreview} variant="outline" size="sm" className="w-full">
              Run Preview
            </Button>
            {preview && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-600">AFTER</p>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">
                  {preview}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Audit Log */}
        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compliance scans recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {new Date(scan.createdAt).toLocaleString()}
                    </span>
                    <Badge variant="outline">{scan.eventType}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ComplianceToggle({
  label,
  description,
  checked,
  onCheckedChange,
  badge,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  badge: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{label}</p>
          <Badge variant="outline" className="text-xs">
            {badge}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
