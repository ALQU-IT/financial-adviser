import { redirect } from "next/navigation";
import { getSessionUser, hasAnyUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

// Reads the user table on every request — must never be prerendered.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!hasAnyUser()) redirect("/setup");
  if (await getSessionUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Financial Adviser</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to see your spending dashboard.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
