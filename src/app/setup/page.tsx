import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { hasAnyUser } from "@/lib/auth";
import { SetupForm } from "./setup-form";

// Reads the user table on every request — must never be prerendered.
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (hasAnyUser()) redirect("/login");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-inverse text-on-inverse">
        <Wallet className="h-6 w-6" />
      </span>
      <div className="w-full max-w-sm rounded-xl bg-container p-8 shadow-border-xs">
        <h1 className="text-xl font-medium">Welcome</h1>
        <p className="mt-1 text-sm text-secondary">
          First run — create the admin account for this server.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
