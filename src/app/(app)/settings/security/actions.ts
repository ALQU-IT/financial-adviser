"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db, schema } from "@/lib/db";
import { requireUser, verifyPassword } from "@/lib/auth";
import {
  b64url,
  checkTotp,
  cleanupIfNoFactors,
  generateRecoveryCodes,
  hasSecondFactor,
  newTotpSecret,
  relyingParty,
  saveChallenge,
  takeChallenge,
  totpUri,
  twoFactorStatus,
  userCredentials,
} from "@/lib/twofactor";

type Result = { ok: true; recoveryCodes?: string[] } | { ok: false; error: string };

/** Turning things off needs the password again, not just a live session. */
async function confirmPassword(userId: number, password: string): Promise<boolean> {
  const row = db
    .select({ hash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .all()[0];
  return !!row && (await verifyPassword(password, row.hash));
}

/** First factor added → hand out recovery codes (shown once). */
function codesIfFirstFactor(userId: number): string[] | undefined {
  return twoFactorStatus(userId).recoveryLeft === 0
    ? generateRecoveryCodes(userId)
    : undefined;
}

function done() {
  revalidatePath("/settings/security");
}

// ---------------------------------------------------------------- TOTP

export async function beginTotp(): Promise<
  { ok: true; secret: string; qr: string } | { ok: false; error: string }
> {
  const user = await requireUser();
  if (twoFactorStatus(user.id).totp)
    return { ok: false, error: "The authenticator app is already set up." };
  const secret = newTotpSecret();
  db.update(schema.users)
    .set({ totpSecret: secret, totpEnabled: false })
    .where(eq(schema.users.id, user.id))
    .run();
  const qr = await QRCode.toDataURL(totpUri(secret, user.username), {
    margin: 1,
    width: 200,
  });
  return { ok: true, secret, qr };
}

export async function confirmTotp(code: string): Promise<Result> {
  const user = await requireUser();
  const row = db
    .select({ secret: schema.users.totpSecret, enabled: schema.users.totpEnabled })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .all()[0];
  if (!row?.secret || row.enabled)
    return { ok: false, error: "Start the setup again." };
  const step = checkTotp(row.secret, String(code), null);
  if (step == null)
    return {
      ok: false,
      error: "That code didn't match. Check the time on your phone and try the next code.",
    };
  db.update(schema.users)
    .set({ totpEnabled: true, totpLastStep: step })
    .where(eq(schema.users.id, user.id))
    .run();
  const recoveryCodes = codesIfFirstFactor(user.id);
  done();
  return { ok: true, recoveryCodes };
}

export async function disableTotp(password: string): Promise<Result> {
  const user = await requireUser();
  if (!(await confirmPassword(user.id, String(password))))
    return { ok: false, error: "Wrong password." };
  db.update(schema.users)
    .set({ totpSecret: null, totpEnabled: false, totpLastStep: null })
    .where(eq(schema.users.id, user.id))
    .run();
  cleanupIfNoFactors(user.id);
  done();
  return { ok: true };
}

// ---------------------------------------------------------------- security keys

export async function beginKeyRegistration(): Promise<
  | { ok: true; options: PublicKeyCredentialCreationOptionsJSON }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const rp = await relyingParty();
  if (!rp.usable)
    return {
      ok: false,
      error: "Security keys need the app's hostname, not an IP address.",
    };
  const options = await generateRegistrationOptions({
    rpName: "Financial Adviser",
    rpID: rp.rpID,
    userName: user.username,
    // Stable per user, and not the username itself: an authenticator then
    // replaces its old passkey for this account instead of piling up.
    userID: new Uint8Array(
      crypto.createHash("sha256").update(`financial-adviser:${user.id}`).digest().subarray(0, 16)
    ),
    attestationType: "none",
    excludeCredentials: userCredentials(user.id).map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  saveChallenge(`reg:${user.id}`, options.challenge);
  return { ok: true, options };
}

export async function finishKeyRegistration(
  name: string,
  response: RegistrationResponseJSON
): Promise<Result> {
  const user = await requireUser();
  const challenge = takeChallenge(`reg:${user.id}`);
  if (!challenge) return { ok: false, error: "This took too long. Please try again." };
  const rp = await relyingParty();
  let info;
  try {
    const res = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
    });
    if (!res.verified) return { ok: false, error: "The security key could not be verified." };
    info = res.registrationInfo;
  } catch (e) {
    return {
      ok: false,
      error: `The security key could not be verified${e instanceof Error ? `: ${e.message}` : "."}`,
    };
  }
  const cred = info.credential;
  db.insert(schema.webauthnCredentials)
    .values({
      id: cred.id,
      userId: user.id,
      publicKey: b64url.encode(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports ? JSON.stringify(cred.transports) : null,
      name: String(name ?? "").trim().slice(0, 60) || "Security key",
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .run();
  const recoveryCodes = codesIfFirstFactor(user.id);
  done();
  return { ok: true, recoveryCodes };
}

export async function removeKey(id: string, password: string): Promise<Result> {
  const user = await requireUser();
  if (!(await confirmPassword(user.id, String(password))))
    return { ok: false, error: "Wrong password." };
  db.delete(schema.webauthnCredentials)
    .where(
      and(
        eq(schema.webauthnCredentials.id, String(id)),
        eq(schema.webauthnCredentials.userId, user.id)
      )
    )
    .run();
  cleanupIfNoFactors(user.id);
  done();
  return { ok: true };
}

// ---------------------------------------------------------------- recovery codes

export async function regenerateRecoveryCodes(password: string): Promise<Result> {
  const user = await requireUser();
  if (!hasSecondFactor(user.id))
    return { ok: false, error: "Turn on two-factor authentication first." };
  if (!(await confirmPassword(user.id, String(password))))
    return { ok: false, error: "Wrong password." };
  const recoveryCodes = generateRecoveryCodes(user.id);
  done();
  return { ok: true, recoveryCodes };
}
