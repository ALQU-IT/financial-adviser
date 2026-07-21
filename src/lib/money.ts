export type DecimalSep = "," | ".";

/**
 * Column-level guess of the decimal separator from sample amount cells.
 * Looks at the whole column because a single cell like "10.000" is ambiguous:
 * German grouping says 10000, Swiss 3-decimal exports mean 10.000.
 */
export function detectDecimalSeparator(samples: string[]): DecimalSep {
  let comma = 0;
  let dot = 0;
  let ambiguous = 0; // dot followed by exactly 3 digits, no comma in the cell
  for (const raw of samples) {
    const s = String(raw ?? "").replace(/[^\d.,']/g, "");
    if (!s) continue;
    if (s.includes("'")) dot++; // Swiss grouping (1'234.56) implies dot decimal
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma === -1 && lastDot === -1) continue;
    if (lastComma > lastDot) {
      const after = s.length - lastComma - 1;
      if (after >= 1 && after <= 2) comma++;
      else dot++; // ",000" tail reads as grouping → decimal must be the dot
    } else {
      const after = s.length - lastDot - 1;
      if (after >= 1 && after <= 2) dot++;
      else if (after === 3 && lastComma === -1) ambiguous++;
      else if (lastComma !== -1) comma++;
    }
  }
  if (comma !== dot) return comma > dot ? "," : ".";
  // Only "x.000"-style cells seen: card statements are rarely all clean
  // multiples of 1000, so read the dot as a decimal separator.
  if (comma === 0 && dot === 0 && ambiguous > 0) return ".";
  return ","; // European default
}

/**
 * Parse an amount string from a CSV into integer cents.
 * With `decimalSep` given (from detection or the user's choice in the import
 * wizard), that separator is authoritative and the other one plus apostrophes
 * and spaces are treated as grouping. Without it, falls back to a per-cell
 * heuristic (used during column auto-detection).
 * Returns null if the string is not a number.
 */
export function parseAmountToCents(
  raw: string,
  decimalSep?: DecimalSep
): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Strip currency symbols/codes, apostrophes and whitespace.
  s = s.replace(/[^\d.,+-]/g, "");
  if (!s) return null;
  if (s.startsWith("-")) negative = true;
  if (s.endsWith("-")) negative = true; // e.g. "12,30-" (some German banks)
  s = s.replace(/[+-]/g, "");
  if (!s) return null;

  let intPart: string;
  let fracPart: string;
  if (decimalSep) {
    const grouping = decimalSep === "," ? "." : ",";
    s = s.split(grouping).join("");
    const idx = s.lastIndexOf(decimalSep);
    if (idx === -1) {
      intPart = s;
      fracPart = "";
    } else {
      intPart = s.slice(0, idx).split(decimalSep).join("");
      fracPart = s.slice(idx + 1);
      if (fracPart.length > 3) {
        // More than 3 digits after the separator: grouping after all.
        intPart += fracPart;
        fracPart = "";
      }
    }
  } else if (s.lastIndexOf(",") === -1 && s.lastIndexOf(".") === -1) {
    intPart = s;
    fracPart = "";
  } else {
    // Heuristic: the rightmost separator is the decimal separator if it has
    // 1-2 digits after it; otherwise everything is thousands grouping.
    const sepIndex = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    const after = s.slice(sepIndex + 1);
    if (after.length >= 1 && after.length <= 2) {
      intPart = s.slice(0, sepIndex);
      fracPart = after;
    } else {
      intPart = s;
      fracPart = "";
    }
    intPart = intPart.replace(/[.,]/g, "");
  }

  if (intPart === "" && fracPart === "") return null;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;

  let cents = (parseInt(intPart || "0", 10) || 0) * 100;
  if (fracPart) {
    // Scale 1-3 fractional digits to cents ("5"→50, "05"→5, "005"→1).
    const frac = parseInt(fracPart, 10) || 0;
    cents += Math.round(frac / Math.pow(10, fracPart.length - 2));
  }
  return negative ? -cents : cents;
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Format cents in the configured display currency. Server-side the default
 * comes from the CURRENCY env var (runtime, not build time); client
 * components must pass the currency down as a prop.
 */
export function formatCents(cents: number, currency?: string): string {
  const cur = currency || process.env.CURRENCY || "EUR";
  let f = formatters.get(cur);
  if (!f) {
    f = new Intl.NumberFormat("de-DE", { style: "currency", currency: cur });
    formatters.set(cur, f);
  }
  return f.format(cents / 100);
}
