import Stripe from "stripe";
import prisma from "@/lib/db/prisma";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-05-28.basil",
  typescript: true,
});

const TOKEN_COST_PER_MILLION = 200; // $2.00 per 1M tokens in cents
const TOOL_CALL_COST_CENTS = 1; // $0.01 per tool call

export interface UsageSummary {
  promptTokens: bigint;
  completionTokens: bigint;
  toolInvocations: number;
  totalCostCents: number;
}

export async function reportUsageToStripe(
  tenantId: string,
  usage: UsageSummary,
  sessionId: string
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      stripeSubscriptionId: true,
      stripeCustomerId: true,
      billingPlan: true,
      billingCycleStart: true,
    },
  });

  if (!tenant?.stripeSubscriptionId || tenant.billingPlan === "FREE") {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        monthlyTokenUsed: {
          increment: usage.promptTokens + usage.completionTokens,
        },
        monthlyToolCallUsed: { increment: usage.toolInvocations },
      },
    });
    return;
  }

  const totalTokens = Number(usage.promptTokens) + Number(usage.completionTokens);
  const totalCostCents =
    Math.ceil((totalTokens / 1_000_000) * TOKEN_COST_PER_MILLION) +
    usage.toolInvocations * TOOL_CALL_COST_CENTS;

  const subscription = await stripe.subscriptions.retrieve(
    tenant.stripeSubscriptionId,
    { expand: ["items"] }
  );

  const subscriptionItemId = subscription.items.data[0]?.id;
  if (!subscriptionItemId) {
    throw new Error(`No subscription item found for tenant ${tenantId}`);
  }

  let stripeUsageRecordId: string | undefined;

  try {
    const usageRecord = await stripe.subscriptionItems.createUsageRecord(
      subscriptionItemId,
      {
        quantity: totalTokens,
        timestamp: Math.floor(Date.now() / 1000),
        action: "increment",
      }
    );
    stripeUsageRecordId = usageRecord.id;
  } catch (err) {
    console.error("[Stripe] Failed to report usage:", err);
  }

  const now = new Date();
  const periodStart = new Date(tenant.billingCycleStart);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.$transaction([
    prisma.usageRecord.create({
      data: {
        tenantId,
        stripeUsageRecordId,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        toolInvocations: usage.toolInvocations,
        totalCostCents,
        reportedToStripe: !!stripeUsageRecordId,
        reportedAt: stripeUsageRecordId ? now : null,
      },
    }),
    prisma.tenant.update({
      where: { id: tenantId },
      data: {
        monthlyTokenUsed: {
          increment: usage.promptTokens + usage.completionTokens,
        },
        monthlyToolCallUsed: { increment: usage.toolInvocations },
      },
    }),
  ]);
}

export async function getUnbilledBalance(tenantId: string): Promise<{
  tokenBalance: number;
  toolCallBalance: number;
  estimatedCostCents: number;
}> {
  const records = await prisma.usageRecord.findMany({
    where: { tenantId, reportedToStripe: false },
  });

  const tokenBalance = records.reduce(
    (sum, r) => sum + Number(r.promptTokens) + Number(r.completionTokens),
    0
  );
  const toolCallBalance = records.reduce((sum, r) => sum + r.toolInvocations, 0);
  const estimatedCostCents = records.reduce((sum, r) => sum + r.totalCostCents, 0);

  return { tokenBalance, toolCallBalance, estimatedCostCents };
}

export async function createOrRetrieveStripeCustomer(
  tenantId: string,
  email: string,
  name: string
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true },
  });

  if (tenant?.stripeCustomerId) {
    return tenant.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { tenantId },
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}
