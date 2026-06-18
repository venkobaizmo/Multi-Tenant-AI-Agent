import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Suspense fallback={<div className="text-white">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
