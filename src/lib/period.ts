import {
  addDays,
  addMonths,
  currentMonthKey,
  formatMonth,
  todayISO,
} from "@/lib/dates";

export type Period = {
  mode: "month" | "year" | "last12" | "lookback";
  label: string; // "June 2026" / "2025" / "the last 45 days"
  start: string; // inclusive ISO date
  endEx: string; // exclusive ISO date
  prevStart: string;
  prevEndEx: string;
  prevLabel: string;
  granularity: "month" | "day"; // trend bucket size
  trendKeys: string[]; // month keys or ISO dates shown in the trend chart
  month?: string; // set in month mode
  lookbackUnit?: "d" | "m";
  lookbackN?: number;
};

export function resolvePeriod(
  params: { m?: string; y?: string; p?: string; back?: string },
  months: string[],
  years: string[]
): Period {
  const today = currentMonthKey();
  const backMatch = /^(\d+)([dm])$/.exec(params.back ?? "");
  if (backMatch) {
    const unit = backMatch[2] as "d" | "m";
    if (unit === "m") {
      const n = Math.min(24, Math.max(1, Number(backMatch[1])));
      const startKey = addMonths(today, -(n - 1));
      return {
        mode: "lookback",
        label: `the last ${n} month${n === 1 ? "" : "s"}`,
        start: `${startKey}-01`,
        endEx: `${addMonths(today, 1)}-01`,
        prevStart: `${addMonths(startKey, -n)}-01`,
        prevEndEx: `${startKey}-01`,
        prevLabel: `the ${n} month${n === 1 ? "" : "s"} before`,
        granularity: "month",
        trendKeys: Array.from({ length: n }, (_, i) => addMonths(startKey, i)),
        lookbackUnit: "m",
        lookbackN: n,
      };
    }
    const n = Math.min(120, Math.max(7, Number(backMatch[1])));
    const end = todayISO();
    const start = addDays(end, -(n - 1));
    const daily = n <= 62;
    return {
      mode: "lookback",
      label: `the last ${n} days`,
      start,
      endEx: addDays(end, 1),
      prevStart: addDays(start, -n),
      prevEndEx: start,
      prevLabel: `the ${n} days before`,
      granularity: daily ? "day" : "month",
      trendKeys: daily
        ? Array.from({ length: n }, (_, i) => addDays(start, i))
        : (() => {
            const first = start.slice(0, 7);
            const keys: string[] = [];
            for (let k = first; k <= today; k = addMonths(k, 1)) keys.push(k);
            return keys;
          })(),
      lookbackUnit: "d",
      lookbackN: n,
    };
  }
  if (params.p === "last12") {
    const startKey = addMonths(today, -11);
    const trendKeys = Array.from({ length: 12 }, (_, i) =>
      addMonths(startKey, i)
    );
    return {
      mode: "last12",
      label: "the last 12 months",
      start: `${startKey}-01`,
      endEx: `${addMonths(today, 1)}-01`,
      prevStart: `${addMonths(today, -23)}-01`,
      prevEndEx: `${startKey}-01`,
      prevLabel: "the previous 12 months",
      granularity: "month",
      trendKeys,
    };
  }
  if (params.y && years.includes(params.y)) {
    const y = Number(params.y);
    return {
      mode: "year",
      label: params.y,
      start: `${y}-01-01`,
      endEx: `${y + 1}-01-01`,
      prevStart: `${y - 1}-01-01`,
      prevEndEx: `${y}-01-01`,
      prevLabel: String(y - 1),
      granularity: "month",
      trendKeys: Array.from(
        { length: 12 },
        (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`
      ),
    };
  }
  const month = params.m && months.includes(params.m) ? params.m : months[0];
  const startKey = addMonths(month, -5);
  return {
    mode: "month",
    label: formatMonth(month),
    start: `${month}-01`,
    endEx: `${addMonths(month, 1)}-01`,
    prevStart: `${addMonths(month, -1)}-01`,
    prevEndEx: `${month}-01`,
    prevLabel: formatMonth(addMonths(month, -1)),
    granularity: "month",
    trendKeys: Array.from({ length: 6 }, (_, i) => addMonths(startKey, i)),
    month,
  };
}
