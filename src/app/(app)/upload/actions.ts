"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { categorize, loadRules, normalizeMerchant } from "@/lib/categorize";

export type ImportRow = {
  date: string; // ISO YYYY-MM-DD
  merchant: string;
  amountCents: number;
};

export type ImportPayload = {
  provider: string;
  filename: string;
  rows: ImportRow[];
  saveMapping?: {
    dateCol: number;
    merchantCol: number;
    amountCol: number;
    dateFormat: string;
    expensesArePositive: boolean;
  };
};

const MAX_ROWS = 10000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function importTransactions(payload: ImportPayload): Promise<
  | { ok: true; statementId: number; imported: number; categorized: number }
  | { ok: false; error: string }
> {
  const user = await requireUser();

  const provider = String(payload.provider ?? "").trim() || "Unknown provider";
  const filename = String(payload.filename ?? "").trim() || "statement.csv";
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length === 0) return { ok: false, error: "No valid rows to import." };
  if (rows.length > MAX_ROWS)
    return { ok: false, error: `Too many rows (max ${MAX_ROWS}).` };

  for (const row of rows) {
    if (
      !ISO_DATE.test(String(row.date)) ||
      typeof row.merchant !== "string" ||
      !Number.isInteger(row.amountCents)
    ) {
      return { ok: false, error: "Import contains malformed rows." };
    }
  }

  const rules = loadRules(user.id);
  let categorized = 0;

  const statementRes = db
    .insert(schema.statements)
    .values({
      userId: user.id,
      provider,
      filename: filename.slice(0, 200),
      uploadedAt: new Date(),
    })
    .run();
  const statementId = Number(statementRes.lastInsertRowid);

  const values = rows.map((row) => {
    const merchant = row.merchant.trim().slice(0, 300) || "(no description)";
    const merchantNorm = normalizeMerchant(merchant);
    const categoryId = categorize(merchantNorm, rules);
    if (categoryId != null) categorized++;
    return {
      statementId,
      userId: user.id,
      date: row.date,
      merchant,
      merchantNorm,
      amountCents: row.amountCents,
      categoryId,
    };
  });
  // Chunked inserts to stay under SQLite's bound-parameter limit.
  for (let i = 0; i < values.length; i += 200) {
    db.insert(schema.transactions).values(values.slice(i, i + 200)).run();
  }

  if (payload.saveMapping) {
    const existing = db
      .select({ id: schema.providerMappings.id })
      .from(schema.providerMappings)
      .where(
        and(
          eq(schema.providerMappings.userId, user.id),
          eq(schema.providerMappings.name, provider)
        )
      )
      .all()[0];
    const mappingJson = JSON.stringify(payload.saveMapping);
    if (existing) {
      db.update(schema.providerMappings)
        .set({ mapping: mappingJson })
        .where(eq(schema.providerMappings.id, existing.id))
        .run();
    } else {
      db.insert(schema.providerMappings)
        .values({
          userId: user.id,
          name: provider,
          mapping: mappingJson,
          createdAt: new Date(),
        })
        .run();
    }
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  return { ok: true, statementId, imported: values.length, categorized };
}

export async function deleteStatement(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  db.delete(schema.statements)
    .where(
      and(eq(schema.statements.id, id), eq(schema.statements.userId, user.id))
    )
    .run();
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/upload");
}
