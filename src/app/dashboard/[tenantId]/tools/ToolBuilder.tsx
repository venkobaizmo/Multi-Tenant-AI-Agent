"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Save, Trash2, Code2, Globe, Zap } from "lucide-react";
import { ToolRegistry, ToolExecutionType } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ToolBuilderProps {
  tenantId: string;
  existingTools: ToolRegistry[];
}

const EXECUTION_TYPE_ICONS = {
  REST_WEBHOOK: Globe,
  SANDBOX_NODE: Code2,
  SANDBOX_PYTHON: Zap,
  BUILTIN: Zap,
};

const DEFAULT_NODE_CODE = `// args object is available as input
// Set __result to return a value
const { query } = args;
__result = { message: \`Processed: \${query}\` };`;

const DEFAULT_PYTHON_CODE = `# args dict is available as input
# Set _result to return a value
query = args.get('query', '')
_result = {"message": f"Processed: {query}"}`;

const DEFAULT_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The input query to process",
      },
    },
    required: ["query"],
  },
  null,
  2
);

export function ToolBuilder({ tenantId, existingTools }: ToolBuilderProps) {
  const router = useRouter();
  const [selectedTool, setSelectedTool] = useState<ToolRegistry | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<string>("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    executionType: "SANDBOX_NODE" as ToolExecutionType,
    jsonSchema: DEFAULT_SCHEMA,
    webhookUrl: "",
    executionCode: DEFAULT_NODE_CODE,
    timeoutMs: 10000,
  });

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      executionType: "SANDBOX_NODE",
      jsonSchema: DEFAULT_SCHEMA,
      webhookUrl: "",
      executionCode: DEFAULT_NODE_CODE,
      timeoutMs: 10000,
    });
    setSelectedTool(null);
    setCreating(false);
    setTestOutput("");
  };

  const loadTool = (tool: ToolRegistry) => {
    setSelectedTool(tool);
    setCreating(false);
    setForm({
      name: tool.name,
      description: tool.description,
      executionType: tool.executionType,
      jsonSchema: JSON.stringify(tool.jsonSchema, null, 2),
      webhookUrl: tool.webhookUrl ?? "",
      executionCode: tool.executionCode ?? "",
      timeoutMs: tool.timeoutMs,
    });
    setTestOutput("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = selectedTool ? "PUT" : "POST";
      const url = selectedTool
        ? `/api/dashboard/${tenantId}/tools/${selectedTool.id}`
        : `/api/dashboard/${tenantId}/tools`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          jsonSchema: JSON.parse(form.jsonSchema),
        }),
      });

      if (res.ok) {
        router.refresh();
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestOutput("");
    try {
      const res = await fetch(`/api/dashboard/${tenantId}/tools/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionType: form.executionType,
          executionCode: form.executionCode,
          args: { query: "test input" },
        }),
      });
      const data = await res.json();
      setTestOutput(JSON.stringify(data, null, 2));
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (toolId: string) => {
    await fetch(`/api/dashboard/${tenantId}/tools/${toolId}`, { method: "DELETE" });
    router.refresh();
    resetForm();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Tool List */}
      <div className="space-y-3">
        <Button
          onClick={() => {
            resetForm();
            setCreating(true);
          }}
          className="w-full"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          New Tool
        </Button>

        {existingTools.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground">
            No tools yet
          </div>
        ) : (
          existingTools.map((tool) => {
            const Icon = EXECUTION_TYPE_ICONS[tool.executionType] ?? Zap;
            return (
              <button
                key={tool.id}
                onClick={() => loadTool(tool)}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                  selectedTool?.id === tool.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tool.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{tool.description}</p>
                  <Badge variant={tool.isActive ? "success" : "secondary"} className="mt-1 text-xs">
                    {tool.executionType}
                  </Badge>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Editor */}
      {(creating || selectedTool) && (
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedTool ? `Editing: ${selectedTool.name}` : "Create New Tool"}
              </CardTitle>
              <CardDescription>
                Configure how this tool executes when invoked by an agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tool Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="get_weather"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Runtime</Label>
                  <Select
                    value={form.executionType}
                    onValueChange={(v) => {
                      const t = v as ToolExecutionType;
                      setForm({
                        ...form,
                        executionType: t,
                        executionCode:
                          t === "SANDBOX_PYTHON" ? DEFAULT_PYTHON_CODE : DEFAULT_NODE_CODE,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SANDBOX_NODE">Node.js Sandbox</SelectItem>
                      <SelectItem value="SANDBOX_PYTHON">Python Sandbox</SelectItem>
                      <SelectItem value="REST_WEBHOOK">REST Webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Get current weather for a location"
                />
              </div>

              <Tabs defaultValue="code">
                <TabsList>
                  <TabsTrigger value="code">
                    {form.executionType === "REST_WEBHOOK" ? "Webhook URL" : "Code"}
                  </TabsTrigger>
                  <TabsTrigger value="schema">JSON Schema</TabsTrigger>
                  {testOutput && <TabsTrigger value="output">Test Output</TabsTrigger>}
                </TabsList>

                <TabsContent value="code" className="space-y-2">
                  {form.executionType === "REST_WEBHOOK" ? (
                    <Input
                      value={form.webhookUrl}
                      onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                      placeholder="https://api.example.com/webhook"
                    />
                  ) : (
                    <Textarea
                      value={form.executionCode}
                      onChange={(e) => setForm({ ...form, executionCode: e.target.value })}
                      rows={14}
                      className="font-mono text-xs"
                    />
                  )}
                </TabsContent>

                <TabsContent value="schema">
                  <Textarea
                    value={form.jsonSchema}
                    onChange={(e) => setForm({ ...form, jsonSchema: e.target.value })}
                    rows={14}
                    className="font-mono text-xs"
                  />
                </TabsContent>

                {testOutput && (
                  <TabsContent value="output">
                    <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                      {testOutput}
                    </pre>
                  </TabsContent>
                )}
              </Tabs>

              <div className="flex justify-between gap-2">
                <div className="flex gap-2">
                  {selectedTool && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(selectedTool.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  {form.executionType !== "REST_WEBHOOK" && (
                    <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                      <Play className="h-4 w-4" />
                      {testing ? "Running..." : "Test"}
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save Tool"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
