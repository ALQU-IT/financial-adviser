import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getPendingLogin, relyingParty, twoFactorStatus } from "@/lib/twofactor";
import { VerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login");
  const status = twoFactorStatus(pending.userId);
  const rp = await relyingParty();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-inverse text-on-inverse">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <div className="w-full max-w-sm rounded-xl bg-container p-8 shadow-border-xs">
        <h1 className="text-xl font-medium">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-secondary">
          {status.keys > 0 && status.totp
            ? "Use your security key, or enter the code from your authenticator app."
            : status.keys > 0
              ? "Use your security key to finish signing in."
              : "Enter the 6-digit code from your authenticator app."}
        </p>
        <VerifyForm
          hasTotp={status.totp}
          hasKeys={status.keys > 0}
          keysUsable={rp.usable}
        />
      </div>
    </main>
  );
}
