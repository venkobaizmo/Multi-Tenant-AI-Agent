import { NextRequest, NextResponse } from "next/server";
import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import prisma from "@/lib/db/prisma";
import { scrubText } from "@/lib/compliance/piiScrubber";
import { reportUsageToStripe } from "@/lib/billing/stripe";
import { routeToolCall, buildTenantTools } from "@/agent/tools/dynamicRouter";
import { requireTenantAccess } from "@/lib/auth";
import { LLMProvider } from "@prisma/client";
import { z } from "zod";

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    )
    .min(1),
  sessionId: z.string().optional(),
  agentId: z.string(),
  stream: z.boolean().default(false),
});

function resolveModel(
  provider: LLMProvider,
  modelName: string,
  apiKey: string
) {
  switch (provider) {
    case LLMProvider.OPENAI:
      return createOpenAI({ apiKey })(modelName);
    case LLMProvider.ANTHROPIC:
      return createAnthropic({ apiKey })(modelName);
    case LLMProvider.DEEPSEEK:
      return createOpenAI({
        apiKey,
        baseURL: "https://api.deepseek.com/v1",
      })(modelName);
    case LLMProvider.GROQ:
      return createOpenAI({
        apiKey,
        baseURL: "https://api.groq.com/openai/v1",
      })(modelName);
    default:
      return createOpenAI({ apiKey })(modelName);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  try {
    await requireTenantAccess(tenantId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { messages, agentId, sessionId, stream } = parsed.data;

  const [tenant, agent, llmConfig] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId, isActive: true },
      select: {
        id: true,
        monthlyTokenUsed: true,
        monthlyTokenQuota: true,
        billingPlan: true,
        stripeSubscriptionId: true,
        billingCycleStart: true,
      },
    }),
    prisma.agent.findFirst({
      where: { id: agentId, tenantId, status: "PUBLISHED" },
    }),
    prisma.tenantLLMConfig.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
      orderBy: { fallbackOrder: "asc" },
    }),
  ]);

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found or inactive" }, { status: 404 });
  }

  if (!agent) {
    return NextResponse.json({ error: "Agent not found or not published" }, { status: 404 });
  }

  if (!llmConfig) {
    return NextResponse.json(
      { error: "No active LLM configuration found for this tenant" },
      { status: 503 }
    );
  }

  // Quota enforcement
  if (tenant.monthlyTokenUsed >= tenant.monthlyTokenQuota) {
    return NextResponse.json(
      { error: "Monthly token quota exceeded. Upgrade your plan." },
      { status: 429 }
    );
  }

  // Resolve or create the agent session
  let currentSessionId = sessionId;
  if (!currentSessionId) {
    const session = await prisma.agentSession.create({
      data: {
        tenantId,
        agentId,
        status: "ACTIVE",
      },
    });
    currentSessionId = session.id;
  }

  // Pre-flight PII scrubbing on user messages
  const lastUserMsg = messages[messages.length - 1];
  const { scrubbed: scrubbedUserContent } = await scrubText(
    lastUserMsg.content,
    tenantId
  );

  await prisma.eventLog.create({
    data: {
      tenantId,
      sessionId: currentSessionId,
      eventType: "USER_MESSAGE",
      scrubbedContent: scrubbedUserContent,
      rawContent: null, // HIPAA: never store raw
    },
  });

  const sanitizedMessages = messages.map((m, i) =>
    i === messages.length - 1 && m.role === "user"
      ? { ...m, content: scrubbedUserContent }
      : m
  );

  const model = resolveModel(llmConfig.provider, llmConfig.modelName, llmConfig.apiKeyRef);
  const tenantTools = await buildTenantTools(tenantId);

  const toolExecutors: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  > = {};

  for (const toolName of Object.keys(tenantTools)) {
    toolExecutors[toolName] = async (args) => {
      const result = await routeToolCall({
        tenantId,
        toolName,
        args,
        sessionId: currentSessionId!,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    };
  }

  const aiTools = Object.fromEntries(
    Object.entries(tenantTools).map(([name, def]) => [
      name,
      {
        description: def.description,
        parameters: def.parameters,
        execute: toolExecutors[name],
      },
    ])
  );

  const commonParams = {
    model,
    system: agent.systemPrompt,
    messages: sanitizedMessages,
    temperature: llmConfig.temperature,
    topP: llmConfig.topP,
    maxTokens: llmConfig.maxTokens,
    maxSteps: agent.maxSteps,
    tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
  };

  if (stream) {
    const result = streamText({
      ...commonParams,
      onFinish: async ({ usage, steps }) => {
        const toolCallCount = steps.reduce(
          (acc, s) => acc + (s.toolCalls?.length ?? 0),
          0
        );
        await finalizeSession(
          currentSessionId!,
          tenantId,
          BigInt(usage.promptTokens),
          BigInt(usage.completionTokens),
          toolCallCount
        );
      },
    });

    return result.toDataStreamResponse({
      headers: { "X-Session-Id": currentSessionId! },
    });
  }

  const result = await generateText({ ...commonParams });

  const toolCallCount = result.steps.reduce(
    (acc, s) => acc + (s.toolCalls?.length ?? 0),
    0
  );

  await finalizeSession(
    currentSessionId,
    tenantId,
    BigInt(result.usage.promptTokens),
    BigInt(result.usage.completionTokens),
    toolCallCount
  );

  return NextResponse.json({
    sessionId: currentSessionId,
    response: result.text,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    },
    steps: result.steps.length,
  });
}

async function finalizeSession(
  sessionId: string,
  tenantId: string,
  promptTokens: bigint,
  completionTokens: bigint,
  toolCalls: number
) {
  await Promise.all([
    prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        totalPromptTokens: { increment: promptTokens },
        totalCompletionTokens: { increment: completionTokens },
        totalToolCalls: { increment: toolCalls },
        status: "COMPLETED",
        completedAt: new Date(),
      },
    }),
    reportUsageToStripe(tenantId, {
      promptTokens,
      completionTokens,
      toolInvocations: toolCalls,
      totalCostCents: 0,
    }, sessionId).catch(console.error),
  ]);
}
