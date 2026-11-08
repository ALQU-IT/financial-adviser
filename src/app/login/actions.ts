"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  hasAnyUser,
  verifyPassword,
} from "@/lib/auth";
import { hasSecondFactor, startPendingLogin } from "@/lib/twofactor";
import {
  clientKey,
  loginFailuresByClient,
  secondFactorFailuresByUser,
  withHashSlot,
} from "@/lib/throttle";

const TOO_MANY = "Too many failed sign-ins. Wait 15 minutes and try again.";
const BUSY = "The server is busy. Try again in a moment.";

export async function login(
  formData: FormData
): Promise<{ error: string } | void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Please fill in both fields." };

  const client = await clientKey();
  if (loginFailuresByClient.blocked(client)) return { error: TOO_MANY };

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .all()[0];
  // Verify against a dummy hash when the user doesn't exist so response
  // timing doesn't reveal which usernames are valid.
  const hash =
    user?.passwordHash ??
    "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpTQIystVZKzYcOZYnQe8mVWq1Oy2";
  const ok = await withHashSlot(() => verifyPassword(password, hash));
  if (ok === null) return { error: BUSY };
  if (!user || !ok) {
    loginFailuresByClient.fail(client);
    return { error: "Wrong username or password." };
  }
  loginFailuresByClient.reset(client);

  // Optional 2FA: only users who turned it on get the second step.
  if (hasSecondFactor(user.id)) {
    if (secondFactorFailuresByUser.blocked(String(user.id)))
      return { error: TOO_MANY };
    await startPendingLogin(user.id);
    redirect("/login/verify");
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const SETUP_DONE = "Setup has already been completed.";

export async function setupAdmin(
  formData: FormData
): Promise<{ error: string } | void> {
  if (hasAnyUser()) return { error: SETUP_DONE };

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!username || username.length < 3)
    return { error: "Username must be at least 3 characters." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  // Hash first, then check-and-insert in one synchronous transaction, so two
  // concurrent first-run submissions cannot both create an admin.
  const passwordHash = await hashPassword(password);
  const userId = db.transaction((tx) => {
    if (tx.select({ id: schema.users.id }).from(schema.users).limit(1).all().length)
      return null;
    const res = tx
      .insert(schema.users)
      .values({ username, passwordHash, role: "admin", createdAt: new Date() })
      .run();
    return Number(res.lastInsertRowid);
  });
  if (userId === null) return { error: SETUP_DONE };
  await createSession(userId);
  redirect("/");
}
