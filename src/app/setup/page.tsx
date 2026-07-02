import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth";
import { SetupForm } from "./setup-form";

// Reads the user table on every request — must never be prerendered.
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (hasAnyUser()) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Welcome 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          First run — create the admin account for this server.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
