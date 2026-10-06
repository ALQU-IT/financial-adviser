import "server-only";
import { eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { AUTO_IGNORE_PATTERNS } from "@/lib/db/seed";

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

/** The user's per-merchant ignore choices (pattern → ignore?). */
export function loadIgnoreRules(userId: number): Map<string, boolean> {
  const rows = db
    .select({ pattern: schema.ignoreRules.pattern, ignored: schema.ignoreRules.ignored })
    .from(schema.ignoreRules)
    .where(eq(schema.ignoreRules.userId, userId))
    .all();
  return new Map(rows.map((r) => [r.pattern, r.ignored]));
}

/**
 * Whether a transaction should be left out of totals: the user's own choice
 * for this merchant wins; otherwise the built-in card-payment patterns.
 */
export function shouldIgnore(
  merchantNorm: string,
  userRules: Map<string, boolean>
): boolean {
  const own = userRules.get(merchantNorm);
  if (own != null) return own;
  return AUTO_IGNORE_PATTERNS.some((p) => merchantNorm.includes(p));
}
