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

export async function login(
  formData: FormData
): Promise<{ error: string } | void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Please fill in both fields." };

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
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) return { error: "Wrong username or password." };

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function setupAdmin(
  formData: FormData
): Promise<{ error: string } | void> {
  if (hasAnyUser()) return { error: "Setup has already been completed." };

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!username || username.length < 3)
    return { error: "Username must be at least 3 characters." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const res = db
    .insert(schema.users)
    .values({
      username,
      passwordHash: await hashPassword(password),
      role: "admin",
      createdAt: new Date(),
    })
    .run();
  await createSession(Number(res.lastInsertRowid));
  redirect("/");
}
