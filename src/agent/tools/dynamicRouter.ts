import { z } from "zod";
import prisma from "@/lib/db/prisma";
import { executeInSandbox } from "@/lib/sandbox/sandboxExecutor";
import { scrubText } from "@/lib/compliance/piiScrubber";
import { ToolExecutionType } from "@prisma/client";

export interface ToolCallRequest {
  tenantId: string;
  toolName: string;
  args: Record<string, unknown>;
  sessionId: string;
}

export interface ToolCallResult {
  success: boolean;
  data: unknown;
  durationMs: number;
  tokensUsed?: number;
  error?: string;
}

const webhookResponseSchema = z.object({
  result: z.unknown().optional(),
  data: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
});

async function dispatchWebhook(
  webhookUrl: string,
  webhookHeaders: Record<string, string>,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...webhookHeaders,
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Webhook returned HTTP ${response.status}: ${response.statusText}`);
    }

    const raw = await response.json();
    const parsed = webhookResponseSchema.safeParse(raw);

    if (parsed.success) {
      return parsed.data.result ?? parsed.data.data ?? parsed.data.output ?? raw;
    }
    return raw;
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateArgsAgainstSchema(
  args: Record<string, unknown>,
  jsonSchema: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const properties = (jsonSchema.properties as Record<string, { type: string }>) ?? {};
  const required = (jsonSchema.required as string[]) ?? [];
  const errors: string[] = [];

  for (const field of required) {
    if (!(field in args)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const propSchema = properties[key];
    if (propSchema && propSchema.type) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== propSchema.type) {
        errors.push(
          `Field "${key}" expected type "${propSchema.type}" but got "${actualType}"`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function routeToolCall(
  request: ToolCallRequest
): Promise<ToolCallResult> {
  const start = Date.now();

  const tool = await prisma.toolRegistry.findFirst({
    where: {
      tenantId: request.tenantId,
      name: request.toolName,
      isActive: true,
    },
    include: {
      tenant: true,
    },
  });

  if (!tool) {
    return {
      success: false,
      data: null,
      durationMs: Date.now() - start,
      error: `Tool "${request.toolName}" not found or inactive for tenant ${request.tenantId}`,
    };
  }

  const jsonSchema = tool.jsonSchema as Record<string, unknown>;
  const validation = validateArgsAgainstSchema(request.args, jsonSchema);
  if (!validation.valid) {
    return {
      success: false,
      data: null,
      durationMs: Date.now() - start,
      error: `Schema validation failed: ${validation.errors.join("; ")}`,
    };
  }

  let rawOutput: unknown;

  try {
    if (tool.executionType === ToolExecutionType.REST_WEBHOOK) {
      if (!tool.webhookUrl) {
        throw new Error("Webhook URL not configured for this tool");
      }
      const headers = (tool.webhookHeaders as Record<string, string>) ?? {};
      rawOutput = await dispatchWebhook(
        tool.webhookUrl,
        headers,
        request.args,
        tool.timeoutMs
      );
    } else if (
      tool.executionType === ToolExecutionType.SANDBOX_NODE ||
      tool.executionType === ToolExecutionType.SANDBOX_PYTHON
    ) {
      if (!tool.executionCode) {
        throw new Error("Execution code not configured for this sandbox tool");
      }

      const tenantContext: Record<string, string> = {
        id: tool.tenant.id,
        slug: tool.tenant.slug,
        plan: tool.tenant.billingPlan,
      };

      const result = await executeInSandbox({
        code: tool.executionCode,
        runtime: tool.executionType as ToolExecutionType,
        tenantContext,
        args: request.args,
        timeoutMs: tool.timeoutMs,
      });

      if (!result.success) {
        throw new Error(`Sandbox execution failed: ${result.stderr}`);
      }

      rawOutput = result.output;
    } else {
      throw new Error(`Unknown execution type: ${tool.executionType}`);
    }

    // Scrub PII from tool output before returning to the LLM
    const outputStr =
      typeof rawOutput === "string"
        ? rawOutput
        : JSON.stringify(rawOutput ?? "");

    const { scrubbed } = await scrubText(outputStr, request.tenantId);

    await prisma.eventLog.create({
      data: {
        tenantId: request.tenantId,
        sessionId: request.sessionId,
        eventType: "TOOL_RESULT",
        toolName: request.toolName,
        scrubbedContent: scrubbed,
        durationMs: Date.now() - start,
        metadata: { executionType: tool.executionType },
      },
    });

    return {
      success: true,
      data: scrubbed,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await prisma.eventLog.create({
      data: {
        tenantId: request.tenantId,
        sessionId: request.sessionId,
        eventType: "ERROR",
        toolName: request.toolName,
        metadata: { error: errorMessage },
        durationMs: Date.now() - start,
      },
    });

    return {
      success: false,
      data: null,
      durationMs: Date.now() - start,
      error: errorMessage,
    };
  }
}

// Build dynamic tool definitions from the tenant's tool registry for use with the AI SDK
export async function buildTenantTools(tenantId: string) {
  const tools = await prisma.toolRegistry.findMany({
    where: { tenantId, isActive: true },
  });

  return tools.reduce(
    (acc, tool) => {
      const schema = tool.jsonSchema as Record<string, unknown>;
      const properties = (schema.properties as Record<string, { type: string; description: string }>) ?? {};
      const required = (schema.required as string[]) ?? [];

      const zodShape: Record<string, z.ZodTypeAny> = {};
      for (const [key, prop] of Object.entries(properties)) {
        let zodType: z.ZodTypeAny;
        switch (prop.type) {
          case "number":
            zodType = z.number();
            break;
          case "boolean":
            zodType = z.boolean();
            break;
          case "array":
            zodType = z.array(z.unknown());
            break;
          case "object":
            zodType = z.record(z.unknown());
            break;
          default:
            zodType = z.string();
        }
        if (prop.description) zodType = zodType.describe(prop.description);
        if (!required.includes(key)) zodType = zodType.optional() as z.ZodTypeAny;
        zodShape[key] = zodType;
      }

      acc[tool.name] = {
        description: tool.description,
        parameters: z.object(zodShape),
      };

      return acc;
    },
    {} as Record<string, { description: string; parameters: z.ZodObject<z.ZodRawShape> }>
  );
}
