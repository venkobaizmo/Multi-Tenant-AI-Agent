import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Super Admin User
  const superAdminPassword = await bcrypt.hash("SuperAdmin@2024!", 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@agentos.io" },
    update: {},
    create: {
      email: "superadmin@agentos.io",
      name: "Super Admin",
      passwordHash: superAdminPassword,
      role: "SUPERADMIN",
    },
  });

  console.log("✓ Super admin created:", superAdmin.email);

  // Demo Tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: "acme-corp" },
    update: {},
    create: {
      name: "Acme Corporation",
      slug: "acme-corp",
      billingPlan: "PROFESSIONAL",
      monthlyTokenQuota: 5_000_000n,
      monthlyToolCallQuota: 10_000,
    },
  });

  console.log("✓ Demo tenant created:", demoTenant.slug);

  // Demo Admin for the tenant
  const demoAdminPassword = await bcrypt.hash("Demo@Admin2024!", 12);

  const demoAdmin = await prisma.user.upsert({
    where: { email: "admin@acme-corp.com" },
    update: {},
    create: {
      email: "admin@acme-corp.com",
      name: "Acme Admin",
      passwordHash: demoAdminPassword,
      role: "TENANT_ADMIN",
      tenantId: demoTenant.id,
    },
  });

  console.log("✓ Demo tenant admin created:", demoAdmin.email);

  // Compliance Profile for demo tenant
  await prisma.complianceProfile.upsert({
    where: { tenantId: demoTenant.id },
    update: {},
    create: {
      tenantId: demoTenant.id,
      gdprEnabled: true,
      hipaaEnabled: false,
      pciEnabled: false,
      maskingStrategy: "ANONYMIZE",
    },
  });

  console.log("✓ Compliance profile created");

  // Whitelisted Domain
  await prisma.whitelistedDomain.upsert({
    where: { tenantId_domain: { tenantId: demoTenant.id, domain: "localhost" } },
    update: {},
    create: { tenantId: demoTenant.id, domain: "localhost" },
  });

  // Demo Agent
  const demoAgent = await prisma.agent.upsert({
    where: { embedToken: "demo-agent-embed-token-acme-corp" },
    update: {},
    create: {
      tenantId: demoTenant.id,
      name: "Customer Support Assistant",
      description: "Handles tier-1 customer support inquiries for Acme Corp",
      systemPrompt:
        "You are a professional customer support assistant for Acme Corporation. " +
        "Be helpful, concise, and always maintain a professional tone. " +
        "If you cannot resolve an issue, escalate to a human agent.",
      status: "PUBLISHED",
      embedToken: "demo-agent-embed-token-acme-corp",
      allowedOrigins: ["localhost", "acme-corp.com"],
      maxSteps: 8,
    },
  });

  console.log("✓ Demo agent created:", demoAgent.name);

  // Demo Tool
  await prisma.toolRegistry.upsert({
    where: { tenantId_name: { tenantId: demoTenant.id, name: "get_order_status" } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      name: "get_order_status",
      description: "Retrieve the current status of a customer order by order ID",
      executionType: "SANDBOX_NODE",
      jsonSchema: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The unique order identifier (e.g. ORD-12345)",
          },
        },
        required: ["orderId"],
      },
      executionCode: `
const { orderId } = args;
// Simulated order lookup
const statuses = ['Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
const status = statuses[Math.floor(Math.random() * statuses.length)];
__result = {
  orderId,
  status,
  estimatedDelivery: '2024-12-25',
  carrier: 'FedEx',
  trackingNumber: 'FX' + Math.random().toString(36).slice(2, 10).toUpperCase()
};
`.trim(),
    },
  });

  console.log("✓ Demo tool created: get_order_status");

  console.log("\n=================================================");
  console.log("SUPER ADMIN LOGIN:");
  console.log("  Email:    superadmin@agentos.io");
  console.log("  Password: SuperAdmin@2024!");
  console.log("\nDEMO TENANT ADMIN LOGIN:");
  console.log("  Email:    admin@acme-corp.com");
  console.log("  Password: Demo@Admin2024!");
  console.log("  Dashboard: /dashboard/" + demoTenant.id);
  console.log("=================================================\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
