import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, KeyRound } from "lucide-react";
import { OAuthProvidersClient } from "./OAuthProvidersClient";

export default async function OAuthProvidersPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    redirect("/login");
  }

  const configs = await prisma.oAuthProviderConfig.findMany({
    orderBy: { provider: "asc" },
  });

  const maskedConfigs = configs.map((c) => ({
    ...c,
    clientSecret: c.clientSecret ? `${c.clientSecret.slice(0, 6)}${"*".repeat(20)}` : "",
  }));

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Admin
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
            <KeyRound className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">OAuth / Social Login</h1>
            <p className="text-sm text-muted-foreground">
              Configure and enable social login providers for all users
            </p>
          </div>
        </div>

        <OAuthProvidersClient initialConfigs={maskedConfigs} />
      </div>
    </div>
  );
}
