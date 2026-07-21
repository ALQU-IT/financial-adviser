export type DateFormat = "DMY" | "MDY" | "YMD";

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  DMY: "Day.Month.Year (31.01.2026, 31/01/2026)",
  MDY: "Month/Day/Year (01/31/2026)",
  YMD: "Year-Month-Day (2026-01-31)",
};

/** Parse a date cell into ISO YYYY-MM-DD, or null if invalid. */
export function parseDateISO(raw: string, format: DateFormat): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const parts = s.split(/[^\d]+/).filter(Boolean);
  if (parts.length < 3) return null;

  let year: number, month: number, day: number;
  if (format === "YMD") {
    [year, month, day] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  } else if (format === "MDY") {
    [month, day, year] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  } else {
    [day, month, year] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  }
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** Guess the date format from sample values. */
export function guessDateFormat(samples: string[]): DateFormat {
  let dmy = 0;
  let mdy = 0;
  let ymd = 0;
  for (const raw of samples) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const parts = s.split(/[^\d]+/).filter(Boolean);
    if (parts.length < 3) continue;
    if (parts[0].length === 4) {
      ymd++;
      continue;
    }
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    // German statements use dots; a first part > 12 must be the day.
    if (s.includes(".") || a > 12) dmy++;
    else if (b > 12) mdy++;
    else dmy++; // ambiguous — default to European order
  }
  if (ymd >= dmy && ymd >= mdy) return ymd > 0 ? "YMD" : "DMY";
  return mdy > dmy ? "MDY" : "DMY";
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Shift a YYYY-MM month key by a number of months. */
export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Shift an ISO date (YYYY-MM-DD) by a number of days. */
export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Short month label for dense 12-bar charts, e.g. "Jan 26". */
export function formatMonthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
