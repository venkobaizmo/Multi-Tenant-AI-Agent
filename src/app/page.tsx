import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Shield, Bot, CreditCard, Code2, Globe } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="h-4 w-4" />
          </div>
          <span className="text-xl font-bold text-white">AgentOS</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" className="text-slate-300 hover:text-white">
              Sign in
            </Button>
          </Link>
          <Link href="/register">
            <Button>Get Started Free</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="mx-auto max-w-4xl px-8 py-24 text-center">
        <Badge variant="secondary" className="mb-6">
          Multi-Tenant Agent-as-a-Service Platform
        </Badge>
        <h1 className="mb-6 text-5xl font-bold leading-tight text-white">
          Deploy AI Agents with{" "}
          <span className="text-primary">Enterprise-Grade</span> Security
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-400">
          Build, deploy, and monetize custom AI agents with runtime-configurable tools,
          HIPAA/GDPR compliance, metered billing, and embeddable widgets — all without
          touching a single line of infrastructure code.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="px-8">
              Start Building Free
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="border-slate-600 px-8 text-slate-300 hover:text-white">
              Sign In
            </Button>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="mx-auto max-w-6xl px-8 py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Bot,
              title: "Runtime Agent Configuration",
              desc: "Define agents, prompts, and LLM configs in your database — no redeploys needed.",
              color: "text-violet-400",
            },
            {
              icon: Shield,
              title: "HIPAA & GDPR Compliance",
              desc: "Built-in PII scrubbing with NER patterns, custom blocklists, and audit logs.",
              color: "text-emerald-400",
            },
            {
              icon: Code2,
              title: "Isolated Sandbox Execution",
              desc: "Run tenant code in ephemeral MicroVMs with network isolation and timeout controls.",
              color: "text-blue-400",
            },
            {
              icon: CreditCard,
              title: "Stripe Metered Billing",
              desc: "Automatic per-token and per-tool-call billing via Stripe Usage Records API.",
              color: "text-amber-400",
            },
            {
              icon: Globe,
              title: "Secure Widget Embedding",
              desc: "Cryptographically verified CORS with per-agent domain whitelists.",
              color: "text-pink-400",
            },
            {
              icon: Zap,
              title: "Multi-Model Fallback",
              desc: "Route across OpenAI, Anthropic, DeepSeek, Groq with automatic fallback ordering.",
              color: "text-cyan-400",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 backdrop-blur"
            >
              <feature.icon className={`mb-3 h-6 w-6 ${feature.color}`} />
              <h3 className="mb-2 font-semibold text-white">{feature.title}</h3>
              <p className="text-sm text-slate-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
        &copy; 2024 AgentOS &mdash; Enterprise Multi-Tenant AI Agent Platform
      </footer>
    </div>
  );
}
