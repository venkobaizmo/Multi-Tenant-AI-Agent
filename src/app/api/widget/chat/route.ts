import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import prisma from "@/lib/db/prisma";
import { scrubText } from "@/lib/compliance/piiScrubber";
import { applyCorsHeaders } from "@/middleware/widgetCors";
import { routeToolCall, buildTenantTools } from "@/agent/tools/dynamicRouter";
import { reportUsageToStripe } from "@/lib/billing/stripe";
import { LLMProvider } from "@prisma/client";
import { z } from "zod";

const widgetChatSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().optional(),
});

function resolveModel(provider: LLMProvider, modelName: string, apiKey: string) {
  switch (provider) {
    case LLMProvider.ANTHROPIC:
      return createAnthropic({ apiKey })(modelName);
    case LLMProvider.DEEPSEEK:
      return createOpenAI({ apiKey, baseURL: "https://api.deepseek.com/v1" })(modelName);
    default:
      return createOpenAI({ apiKey })(modelName);
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Agent-Token");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  const agentId = req.nextUrl.searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
  }

  // Verify origin against whitelist
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      tenant: {
        include: { whitelistedDomains: true, llmConfigs: true },
      },
    },
  });

  if (!agent || agent.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Agent not found or not published" }, { status: 404 });
  }

  const incomingHostname = extractHostname(origin);
  const allAllowed = [
    ...agent.allowedOrigins,
    ...agent.tenant.whitelistedDomains.map((d) => d.domain),
  ].map((d) => normalizeHost(d));

  const isAllowed =
    allAllowed.includes(normalizeHost(incomingHostname)) ||
    allAllowed.includes("*") ||
    process.env.NODE_ENV === "development";

  if (!isAllowed) {
    return NextResponse.json(
      { error: "Forbidden: origin not whitelisted", origin: incomingHostname },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = widgetChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const { message, sessionId } = parsed.data;

  const llmConfig = agent.tenant.llmConfigs.find((c) => c.isDefault && c.isActive)
    ?? agent.tenant.llmConfigs.find((c) => c.isActive);

  if (!llmConfig) {
    return NextResponse.json({ error: "No LLM config found" }, { status: 503 });
  }

  const { scrubbed: scrubbedMessage } = await scrubText(message, agent.tenantId);

  let currentSessionId = sessionId;
  if (!currentSessionId) {
    const session = await prisma.agentSession.create({
      data: { tenantId: agent.tenantId, agentId, status: "ACTIVE" },
    });
    currentSessionId = session.id;
  }

  await prisma.eventLog.create({
    data: {
      tenantId: agent.tenantId,
      sessionId: currentSessionId,
      eventType: "USER_MESSAGE",
      scrubbedContent: scrubbedMessage,
      rawContent: null,
    },
  });

  const model = resolveModel(llmConfig.provider, llmConfig.modelName, llmConfig.apiKeyRef);
  const tenantTools = await buildTenantTools(agent.tenantId);

  const aiTools = Object.fromEntries(
    Object.entries(tenantTools).map(([name, def]) => [
      name,
      {
        description: def.description,
        parameters: def.parameters,
        execute: async (args: Record<string, unknown>) => {
          const result = await routeToolCall({
            tenantId: agent.tenantId,
            toolName: name,
            args,
            sessionId: currentSessionId!,
          });
          if (!result.success) throw new Error(result.error);
          return result.data;
        },
      },
    ])
  );

  const result = streamText({
    model,
    system: agent.systemPrompt,
    messages: [{ role: "user", content: scrubbedMessage }],
    temperature: llmConfig.temperature,
    maxTokens: llmConfig.maxTokens,
    maxSteps: agent.maxSteps,
    tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
    onFinish: async ({ usage, steps }) => {
      const toolCallCount = steps.reduce(
        (acc, s) => acc + (s.toolCalls?.length ?? 0),
        0
      );
      await Promise.all([
        prisma.agentSession.update({
          where: { id: currentSessionId! },
          data: {
            totalPromptTokens: { increment: BigInt(usage.promptTokens) },
            totalCompletionTokens: { increment: BigInt(usage.completionTokens) },
            totalToolCalls: { increment: toolCallCount },
            status: "COMPLETED",
            completedAt: new Date(),
          },
        }),
        reportUsageToStripe(agent.tenantId, {
          promptTokens: BigInt(usage.promptTokens),
          completionTokens: BigInt(usage.completionTokens),
          toolInvocations: toolCallCount,
          totalCostCents: 0,
        }, currentSessionId!).catch(console.error),
      ]);
    },
  });

  const response = result.toDataStreamResponse({
    headers: { "X-Session-Id": currentSessionId! },
  });

  return applyCorsHeaders(response as NextResponse, origin || "*");
}

function extractHostname(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./, "").toLowerCase().trim();
}
