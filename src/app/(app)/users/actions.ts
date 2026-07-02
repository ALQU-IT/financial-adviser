"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { hashPassword, requireUser } from "@/lib/auth";

export async function createUser(
  formData: FormData
): Promise<{ error: string } | void> {
  const admin = await requireUser();
  if (admin.role !== "admin") return { error: "Not allowed." };

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || username.length < 3)
    return { error: "Username must be at least 3 characters." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const exists = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .all()[0];
  if (exists) return { error: "This username is taken." };

  db.insert(schema.users)
    .values({
      username,
      passwordHash: await hashPassword(password),
      role: "user",
      createdAt: new Date(),
    })
    .run();
  revalidatePath("/users");
}

export async function deleteUser(formData: FormData) {
  const admin = await requireUser();
  if (admin.role !== "admin") return;
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id === admin.id) return;
  db.delete(schema.users).where(eq(schema.users.id, id)).run();
  revalidatePath("/users");
}
