import { requireUser } from "@/lib/auth";
import { relyingParty, twoFactorStatus, userCredentials } from "@/lib/twofactor";
import { PageHeader } from "../../ui";
import { SecuritySettings } from "./security-settings";

export default async function SecurityPage() {
  const user = await requireUser();
  const status = twoFactorStatus(user.id);
  const rp = await relyingParty();
  const keys = userCredentials(user.id).map((k) => ({
    id: k.id,
    name: k.name,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Security"
        subtitle="Two-factor authentication is optional. Once on, signing in needs your password plus a code or a security key."
      />
      <SecuritySettings
        status={status}
        keys={keys}
        rp={{ usable: rp.usable, rpID: rp.rpID }}
      />
    </div>
  );
}
