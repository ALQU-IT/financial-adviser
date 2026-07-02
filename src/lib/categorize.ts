import "server-only";
import { eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Normalize a merchant string for rule matching and grouping. */
export function normalizeMerchant(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[ÄÖÜ]/g, (c) => ({ Ä: "AE", Ö: "OE", Ü: "UE" })[c] as string)
    .replace(/ß/g, "SS")
    .replace(/\s+/g, " ")
    .trim();
}

export type Rule = { pattern: string; categoryId: number; source: string };

/** Load rules visible to a user: their own rules first, then seed rules. */
export function loadRules(userId: number): Rule[] {
  const rows = db
    .select({
      pattern: schema.rules.pattern,
      categoryId: schema.rules.categoryId,
      source: schema.rules.source,
      userId: schema.rules.userId,
    })
    .from(schema.rules)
    .where(or(eq(schema.rules.userId, userId), isNull(schema.rules.userId)))
    .all();
  // User rules take precedence; among equals, longer patterns win.
  return rows.sort((a, b) => {
    if (a.source !== b.source) return a.source === "user" ? -1 : 1;
    return b.pattern.length - a.pattern.length;
  });
}

export function categorize(
  merchantNorm: string,
  rules: Rule[]
): number | null {
  for (const rule of rules) {
    if (merchantNorm.includes(rule.pattern)) return rule.categoryId;
  }
  return null;
}
