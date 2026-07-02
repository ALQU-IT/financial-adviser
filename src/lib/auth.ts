import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const SESSION_COOKIE = "fa_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // Opportunistically clear expired sessions.
  db.delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()))
    .run();
  db.insert(schema.sessions).values({ token, userId, expiresAt }).run();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
    cookieStore.delete(SESSION_COOKIE);
  }
}

export type SessionUser = {
  id: number;
  username: string;
  role: "admin" | "user";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.token, token))
    .all();
  const row = rows[0];
  if (!row || row.expiresAt < new Date()) return null;
  return { id: row.id, username: row.username, role: row.role };
}

/** For protected pages/actions: returns the user or redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function hasAnyUser(): boolean {
  return db.select({ id: schema.users.id }).from(schema.users).limit(1).all()
    .length > 0;
}
