import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { db, schema } from "@/lib/db";

/*
 * Optional two-factor authentication. A user who has turned on an
 * authenticator app (TOTP) or registered a security key / passkey (WebAuthn)
 * must present one of them after the password; everyone else signs in with
 * the password alone. Recovery codes are the fallback for both.
 */

const ISSUER = "Financial Adviser";
const PENDING_COOKIE = "fa_pending";
const PENDING_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

// ---------------------------------------------------------------- status

export type TwoFactorStatus = {
  totp: boolean;
  keys: number;
  recoveryLeft: number;
};

export function twoFactorStatus(userId: number): TwoFactorStatus {
  const user = db
    .select({ totpEnabled: schema.users.totpEnabled })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .all()[0];
  const keys = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.webauthnCredentials)
    .where(eq(schema.webauthnCredentials.userId, userId))
    .all()[0].n;
  const recoveryLeft = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.recoveryCodes)
    .where(
      and(
        eq(schema.recoveryCodes.userId, userId),
        isNull(schema.recoveryCodes.usedAt)
      )
    )
    .all()[0].n;
  return { totp: !!user?.totpEnabled, keys, recoveryLeft };
}

export function hasSecondFactor(userId: number): boolean {
  const s = twoFactorStatus(userId);
  return s.totp || s.keys > 0;
}

/** Drop recovery codes once no second factor is left — they'd guard nothing. */
export function cleanupIfNoFactors(userId: number) {
  if (!hasSecondFactor(userId)) {
    db.delete(schema.recoveryCodes)
      .where(eq(schema.recoveryCodes.userId, userId))
      .run();
  }
}

export function resetTwoFactor(userId: number) {
  db.update(schema.users)
    .set({ totpSecret: null, totpEnabled: false, totpLastStep: null })
    .where(eq(schema.users.id, userId))
    .run();
  db.delete(schema.webauthnCredentials)
    .where(eq(schema.webauthnCredentials.userId, userId))
    .run();
  db.delete(schema.recoveryCodes)
    .where(eq(schema.recoveryCodes.userId, userId))
    .run();
  db.delete(schema.pendingLogins)
    .where(eq(schema.pendingLogins.userId, userId))
    .run();
}

// ---------------------------------------------------------------- TOTP

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secretBase32: string, username: string): string {
  return new TOTP({
    issuer: ISSUER,
    label: username,
    secret: Secret.fromBase32(secretBase32),
  }).toString();
}

/**
 * Check a 6-digit code (±1 step of clock drift). Returns the matched time
 * step, or null. Steps at or before `lastStep` are rejected so an observed
 * code cannot be replayed.
 */
export function checkTotp(
  secretBase32: string,
  code: string,
  lastStep: number | null
): number | null {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32) });
  const delta = totp.validate({ token, window: 1 });
  if (delta == null) return null;
  const step = totp.counter() + delta;
  if (lastStep != null && step <= lastStep) return null;
  return step;
}

// ---------------------------------------------------------------- recovery codes

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
// No 0/O/1/I/L — codes get read off paper.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Replace the user's recovery codes; returns the new ones (shown once). */
export function generateRecoveryCodes(userId: number): string[] {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const bytes = crypto.randomBytes(10);
    const raw = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)).run();
  db.insert(schema.recoveryCodes)
    .values(codes.map((c) => ({ userId, codeHash: sha256(normalizeRecoveryCode(c)) })))
    .run();
  return codes;
}

/** Consume a recovery code; true if it was valid and unused. */
export function useRecoveryCode(userId: number, code: string): boolean {
  const norm = normalizeRecoveryCode(code);
  if (norm.length !== 10) return false;
  const res = db
    .update(schema.recoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.recoveryCodes.userId, userId),
        eq(schema.recoveryCodes.codeHash, sha256(norm)),
        isNull(schema.recoveryCodes.usedAt)
      )
    )
    .run();
  return res.changes > 0;
}

// ---------------------------------------------------------------- pending login

export async function startPendingLogin(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PENDING_MINUTES * 60 * 1000);
  db.delete(schema.pendingLogins)
    .where(lt(schema.pendingLogins.expiresAt, new Date()))
    .run();
  db.insert(schema.pendingLogins).values({ token, userId, expiresAt }).run();
  (await cookies()).set(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    expires: expiresAt,
    path: "/",
  });
}

export type PendingLogin = {
  token: string;
  userId: number;
  attempts: number;
  challenge: string | null;
};

export async function getPendingLogin(): Promise<PendingLogin | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .select()
    .from(schema.pendingLogins)
    .where(eq(schema.pendingLogins.token, token))
    .all()[0];
  if (!row || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) return null;
  return {
    token: row.token,
    userId: row.userId,
    attempts: row.attempts,
    challenge: row.challenge,
  };
}

/** Count a failed attempt; returns attempts left (0 = pending login voided). */
export function failPendingAttempt(p: PendingLogin): number {
  const attempts = p.attempts + 1;
  db.update(schema.pendingLogins)
    .set({ attempts })
    .where(eq(schema.pendingLogins.token, p.token))
    .run();
  return Math.max(0, MAX_ATTEMPTS - attempts);
}

export function setPendingChallenge(p: PendingLogin, challenge: string) {
  db.update(schema.pendingLogins)
    .set({ challenge })
    .where(eq(schema.pendingLogins.token, p.token))
    .run();
}

export async function endPendingLogin(p: PendingLogin | null) {
  if (p) {
    db.delete(schema.pendingLogins)
      .where(eq(schema.pendingLogins.token, p.token))
      .run();
  }
  (await cookies()).delete(PENDING_COOKIE);
}

// ---------------------------------------------------------------- WebAuthn

export type RelyingParty = {
  rpID: string;
  origin: string;
  // Browsers refuse WebAuthn on an IP address; the UI explains instead.
  usable: boolean;
};

/**
 * Relying party for the current request. The app sits behind Caddy, which
 * keeps the browser's Host and sets X-Forwarded-Proto, so this is the name
 * in the address bar. WEBAUTHN_RP_ID / APP_ORIGIN override it.
 */
export async function relyingParty(): Promise<RelyingParty> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  const origin = process.env.APP_ORIGIN?.replace(/\/$/, "") ?? `${proto}://${host}`;
  const rpID = process.env.WEBAUTHN_RP_ID ?? new URL(origin).hostname;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(rpID) || rpID.includes(":");
  // Every IP (127.0.0.1 included) is an invalid RP ID; "localhost" is fine.
  return { rpID, origin, usable: !isIp };
}

export function saveChallenge(key: string, challenge: string) {
  const expiresAt = new Date(Date.now() + PENDING_MINUTES * 60 * 1000);
  db.delete(schema.authChallenges)
    .where(lt(schema.authChallenges.expiresAt, new Date()))
    .run();
  db.insert(schema.authChallenges)
    .values({ key, challenge, expiresAt })
    .onConflictDoUpdate({
      target: schema.authChallenges.key,
      set: { challenge, expiresAt },
    })
    .run();
}

/** Read and delete a challenge (single use). */
export function takeChallenge(key: string): string | null {
  const row = db
    .select()
    .from(schema.authChallenges)
    .where(eq(schema.authChallenges.key, key))
    .all()[0];
  db.delete(schema.authChallenges).where(eq(schema.authChallenges.key, key)).run();
  if (!row || row.expiresAt < new Date()) return null;
  return row.challenge;
}

export function userCredentials(userId: number) {
  return db
    .select()
    .from(schema.webauthnCredentials)
    .where(eq(schema.webauthnCredentials.userId, userId))
    .all()
    .map((c) => ({
      ...c,
      transports: c.transports ? (JSON.parse(c.transports) as string[]) : undefined,
    }));
}

export const b64url = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url"),
  decode: (s: string) => new Uint8Array(Buffer.from(s, "base64url")),
};
