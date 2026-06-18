# AgentOS — Multi-Tenant AI Agent Platform

Enterprise-grade, multi-tenant Agent-as-a-Service platform built with Next.js 15, Prisma v7, Tailwind CSS v4, and the Vercel AI SDK.

## Architecture

```
src/
├── agent/tools/dynamicRouter.ts      # Runtime tool dispatch (webhooks + sandboxes)
├── app/
│   ├── (auth)/login|register/        # Authentication pages
│   ├── admin/                        # Super admin console
│   ├── api/
│   │   ├── auth/                     # Login, register, logout
│   │   ├── dashboard/[tenantId]/     # Tenant management APIs
│   │   ├── v1/[tenantId]/chat/       # Authenticated agent chat
│   │   └── widget/chat/              # Embeddable widget endpoint
│   └── dashboard/[tenantId]/         # Tenant dashboard pages
│       ├── agents/                   # Agent management + embed console
│       ├── billing/                  # Stripe usage & billing
│       ├── compliance/               # HIPAA/GDPR/PCI guardrails
│       ├── settings/                 # Models & CORS whitelist
│       └── tools/                    # Dynamic code tool builder
├── lib/
│   ├── auth.ts                       # JWT sessions + RBAC
│   ├── billing/stripe.ts             # Stripe metered billing
│   ├── compliance/piiScrubber.ts     # Regex + NER PII masking
│   ├── db/prisma.ts                  # Prisma v7 with pg adapter
│   └── sandbox/sandboxExecutor.ts   # Vercel Sandbox MicroVM runner
└── middleware/widgetCors.ts          # DB-backed CORS verification
```

## Super Admin Login

| Field    | Value                    |
|----------|--------------------------|
| Email    | `superadmin@agentos.io`  |
| Password | `SuperAdmin@2024!`       |
| URL      | `/login` → `/admin`      |

## Demo Tenant Login

| Field    | Value                    |
|----------|--------------------------|
| Email    | `admin@acme-corp.com`    |
| Password | `Demo@Admin2024!`        |
| URL      | `/login` → `/dashboard/{tenantId}` |

## Vercel Deployment

### 1. Create a PostgreSQL Database
Use Vercel Postgres, Neon, Supabase, or Railway. Get the connection string.

### 2. Set Environment Variables in Vercel Dashboard

```
DATABASE_URL=postgresql://...
JWT_SECRET=your-min-32-char-secret
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

### 3. Deploy

```bash
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard with these build settings:
- **Build Command:** `npx prisma generate && npm run build`
- **Output Directory:** `.next`

### 4. Run Database Migration

After deployment, run migrations:
```bash
npx prisma db push
npx prisma db seed
```

## Local Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to DB (development)
npx prisma db push

# Seed with superadmin + demo data
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Features

- **Runtime Configuration** — Agents, prompts, LLM configs, and tools defined in the database
- **PII Scrubbing** — Pre-flight and post-flight compliance scanning (HIPAA, GDPR, PCI)
- **Sandbox Execution** — Node.js and Python tool execution in isolated MicroVMs
- **Stripe Billing** — Per-token and per-tool-call metered billing via Usage Records API
- **CORS Security** — Database-backed domain whitelisting for embedded widgets
- **Multi-Model** — OpenAI, Anthropic, DeepSeek, Groq with configurable fallback ordering
- **Audit Logging** — OpenTelemetry-compatible event log with scrubbed content
- **Role-Based Access** — SUPERADMIN, TENANT_ADMIN, TENANT_MEMBER, VIEWER roles
