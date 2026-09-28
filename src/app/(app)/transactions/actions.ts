"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * Set the category of a transaction and of every other transaction of the
 * same merchant, and store a user rule so future imports follow it too.
 * Applies to already-categorized rows as well: a merchant's transactions
 * should never end up split across categories because some of them were
 * auto-categorized earlier.
 */
export async function setCategory(
  txId: number,
  categoryId: number | null
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!Number.isInteger(txId)) return { ok: false };

  const tx = db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.id, txId),
        eq(schema.transactions.userId, user.id)
      )
    )
    .all()[0];
  if (!tx) return { ok: false };

  if (categoryId != null) {
    const category = db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.id, categoryId))
      .all()[0];
    if (!category) return { ok: false };
  }

  // Replace any existing user rule for this merchant.
  db.delete(schema.rules)
    .where(
      and(
        eq(schema.rules.userId, user.id),
        eq(schema.rules.pattern, tx.merchantNorm)
      )
    )
    .run();
  if (categoryId != null) {
    db.insert(schema.rules)
      .values({
        pattern: tx.merchantNorm,
        categoryId,
        source: "user",
        userId: user.id,
      })
      .run();
  }

  // This row and every other one of the merchant, whatever their category.
  db.update(schema.transactions)
    .set({ categoryId })
    .where(
      and(
        eq(schema.transactions.userId, user.id),
        eq(schema.transactions.merchantNorm, tx.merchantNorm)
      )
    )
    .run();

  revalidatePath("/");
  revalidatePath("/transactions");
  return { ok: true };
}
