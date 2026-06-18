import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

const WIDGET_PATH_PREFIX = "/api/widget/chat";

export async function handleWidgetCors(
  req: NextRequest
): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith(WIDGET_PATH_PREFIX)) {
    return null;
  }

  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  const agentId = req.nextUrl.searchParams.get("agentId");

  if (!agentId) {
    return new NextResponse(
      JSON.stringify({ error: "Missing agentId parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const originHostname = extractHostname(origin);

  // Preflight — OPTIONS
  if (req.method === "OPTIONS") {
    const allowedOrigin = await resolveAllowedOrigin(agentId, originHostname);
    if (!allowedOrigin) {
      return new NextResponse(null, { status: 403 });
    }
    return new NextResponse(null, {
      status: 204,
      headers: buildCorsHeaders(allowedOrigin),
    });
  }

  const allowedOrigin = await resolveAllowedOrigin(agentId, originHostname);
  if (!allowedOrigin) {
    return new NextResponse(
      JSON.stringify({
        error: "Forbidden: origin not whitelisted for this agent",
        origin: originHostname,
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return null; // Passes — let the route handler run; headers added in route
}

async function resolveAllowedOrigin(
  agentId: string,
  incomingHostname: string
): Promise<string | null> {
  if (!incomingHostname) return null;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      tenant: { include: { whitelistedDomains: true } },
    },
  });

  if (!agent || agent.status !== "PUBLISHED") return null;

  // Check agent-level allowedOrigins first
  const allAllowed = [
    ...agent.allowedOrigins,
    ...agent.tenant.whitelistedDomains.map((d) => d.domain),
  ].map((d) => normalizeHost(d));

  const isAllowed =
    allAllowed.includes(normalizeHost(incomingHostname)) ||
    allAllowed.includes("*");

  return isAllowed ? incomingHostname : null;
}

function buildCorsHeaders(allowedOrigin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Agent-Token",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "false",
    Vary: "Origin",
  };
}

export function applyCorsHeaders(
  response: NextResponse,
  allowedOrigin: string
): NextResponse {
  const headers = buildCorsHeaders(allowedOrigin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

function extractHostname(originOrReferer: string): string {
  try {
    const url = new URL(
      originOrReferer.startsWith("http")
        ? originOrReferer
        : `https://${originOrReferer}`
    );
    return url.hostname;
  } catch {
    return originOrReferer;
  }
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./, "").toLowerCase().trim();
}
