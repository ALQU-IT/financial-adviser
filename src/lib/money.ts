/**
 * Parse an amount string from a CSV into integer cents.
 * Handles German ("1.234,56", "-12,30 €") and English ("1,234.56", "$-12.30")
 * formats, parentheses negatives, and currency symbols/codes.
 * Returns null if the string is not a number.
 */
export function parseAmountToCents(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Strip currency symbols/codes and whitespace; keep digits, separators, signs.
  s = s.replace(/[^\d.,+-]/g, "");
  if (!s) return null;
  if (s.startsWith("-")) negative = true;
  if (s.endsWith("-")) negative = true; // e.g. "12,30-" (some German banks)
  s = s.replace(/[+-]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let intPart: string;
  let fracPart: string;
  if (lastComma === -1 && lastDot === -1) {
    intPart = s;
    fracPart = "";
  } else {
    // The rightmost separator is the decimal separator if it has 1-2 digits
    // after it; otherwise everything is thousands grouping (e.g. "1.234").
    const sepIndex = Math.max(lastComma, lastDot);
    const after = s.slice(sepIndex + 1);
    if (after.length >= 1 && after.length <= 2) {
      intPart = s.slice(0, sepIndex);
      fracPart = after;
    } else {
      intPart = s;
      fracPart = "";
    }
  }

  intPart = intPart.replace(/[.,]/g, "");
  if (intPart === "" && fracPart === "") return null;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;

  const cents =
    (parseInt(intPart || "0", 10) || 0) * 100 +
    (parseInt((fracPart || "0").padEnd(2, "0").slice(0, 2), 10) || 0);
  return negative ? -cents : cents;
}

const eurFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: process.env.NEXT_PUBLIC_CURRENCY || "EUR",
});

export function formatCents(cents: number): string {
  return eurFormatter.format(cents / 100);
}
