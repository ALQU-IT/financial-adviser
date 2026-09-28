import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getSessionUser, hasAnyUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

// Reads the user table on every request — must never be prerendered.
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  "too-many": "Too many wrong codes. For your security, please enter your password again.",
  expired: "Your sign-in timed out. Please enter your password again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const notice = NOTICES[(await searchParams).reason ?? ""];
  if (!hasAnyUser()) redirect("/setup");
  if (await getSessionUser()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-inverse text-on-inverse">
        <Wallet className="h-6 w-6" />
      </span>
      <div className="w-full max-w-sm rounded-xl bg-container p-8 shadow-border-xs">
        <h1 className="text-xl font-medium">Financial Adviser</h1>
        <p className="mt-1 text-sm text-secondary">
          Sign in to see your spending dashboard.
        </p>
        {notice && (
          <p className="mt-4 rounded-lg bg-warning-bg p-3 text-sm text-warning" role="status">
            {notice}
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
