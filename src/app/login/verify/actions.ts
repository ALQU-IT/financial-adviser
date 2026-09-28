"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth";
import {
  b64url,
  checkTotp,
  endPendingLogin,
  failPendingAttempt,
  getPendingLogin,
  relyingParty,
  setPendingChallenge,
  useRecoveryCode,
  userCredentials,
} from "@/lib/twofactor";

const EXPIRED = "This sign-in expired. Please enter your password again.";

/*
 * Voiding a pending login deletes its cookie, which makes Next re-render the
 * verify page — and that page redirects to /login before any returned error
 * could show. So end these cases with a redirect that carries the reason.
 */
async function voidAndExplain(
  pending: Awaited<ReturnType<typeof getPendingLogin>>,
  reason: "too-many" | "expired"
): Promise<never> {
  await endPendingLogin(pending);
  redirect(`/login?reason=${reason}`);
}

async function finish(userId: number, pending: Awaited<ReturnType<typeof getPendingLogin>>) {
  await endPendingLogin(pending);
  await createSession(userId);
  redirect("/");
}

/** Second step with a 6-digit authenticator code or a recovery code. */
export async function verifyCode(
  formData: FormData
): Promise<{ error: string; expired?: boolean } | void> {
  const pending = await getPendingLogin();
  if (!pending) return voidAndExplain(null, "expired");
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter a code." };

  const user = db
    .select({
      totpSecret: schema.users.totpSecret,
      totpEnabled: schema.users.totpEnabled,
      totpLastStep: schema.users.totpLastStep,
    })
    .from(schema.users)
    .where(eq(schema.users.id, pending.userId))
    .all()[0];

  if (user?.totpEnabled && user.totpSecret && /^\d[\d\s]{5,6}$/.test(code)) {
    const step = checkTotp(user.totpSecret, code, user.totpLastStep);
    if (step != null) {
      db.update(schema.users)
        .set({ totpLastStep: step })
        .where(eq(schema.users.id, pending.userId))
        .run();
      await finish(pending.userId, pending);
    }
  } else if (useRecoveryCode(pending.userId, code)) {
    await finish(pending.userId, pending);
  }

  const left = failPendingAttempt(pending);
  if (left === 0) return voidAndExplain(pending, "too-many");
  return {
    error: `That code didn't work. ${left} attempt${left === 1 ? "" : "s"} left.`,
  };
}

/** Options for signing in with a registered security key or passkey. */
export async function keyLoginOptions(): Promise<
  | { ok: true; options: PublicKeyCredentialRequestOptionsJSON }
  | { ok: false; error: string; expired?: boolean }
> {
  const pending = await getPendingLogin();
  if (!pending) return { ok: false, error: EXPIRED, expired: true };
  const rp = await relyingParty();
  if (!rp.usable)
    return {
      ok: false,
      error: "Security keys need the app's hostname, not an IP address.",
    };
  const creds = userCredentials(pending.userId);
  if (creds.length === 0) return { ok: false, error: "No security key is registered." };
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: "preferred",
  });
  setPendingChallenge(pending, options.challenge);
  return { ok: true, options };
}

export async function keyLoginVerify(
  response: AuthenticationResponseJSON
): Promise<{ error: string; expired?: boolean } | void> {
  const pending = await getPendingLogin();
  if (!pending) return voidAndExplain(null, "expired");
  const challenge = pending.challenge;
  setPendingChallenge(pending, ""); // single use
  const cred = userCredentials(pending.userId).find((c) => c.id === response?.id);
  if (!challenge || !cred) {
    failPendingAttempt(pending);
    return { error: "This security key isn't registered for your account." };
  }
  const rp = await relyingParty();
  let verified = false;
  let newCounter = cred.counter;
  try {
    const res = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: cred.id,
        publicKey: b64url.decode(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports,
      },
    });
    verified = res.verified;
    newCounter = res.authenticationInfo.newCounter;
  } catch {
    verified = false;
  }
  if (!verified) {
    const left = failPendingAttempt(pending);
    if (left === 0) return voidAndExplain(pending, "too-many");
    return { error: "The security key could not be verified." };
  }
  db.update(schema.webauthnCredentials)
    .set({ counter: newCounter, lastUsedAt: new Date() })
    .where(eq(schema.webauthnCredentials.id, cred.id))
    .run();
  await finish(pending.userId, pending);
}

export async function cancelVerify() {
  await endPendingLogin(await getPendingLogin());
  redirect("/login");
}
