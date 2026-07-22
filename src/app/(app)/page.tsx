import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import {
  addDays,
  addMonths,
  currentMonthKey,
  formatMonth,
  formatMonthShort,
  todayISO,
} from "@/lib/dates";
import { CategoryBars, TrendBars } from "./charts";
import { PeriodPicker } from "./period-picker";

type Period = {
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

function resolvePeriod(
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; y?: string; p?: string; back?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const months = db
    .select({
      month: sql<string>`substr(${schema.transactions.date}, 1, 7)`.as("month"),
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, user.id))
    .groupBy(sql`month`)
    .orderBy(desc(sql`month`))
    .all()
    .map((r) => r.month);

  if (months.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 p-10 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Welcome to Financial Adviser</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
          Upload your first credit card statement (CSV) and you&apos;ll see
          where your money goes — by category, merchant and month.
        </p>
        <Link
          href="/upload"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Upload a statement
        </Link>
      </div>
    );
  }

  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const period = resolvePeriod(params, months, years);

  const inRange = (start: string, endEx: string) =>
    and(
      eq(schema.transactions.userId, user.id),
      gte(schema.transactions.date, start),
      lt(schema.transactions.date, endEx)
    );

  const totals = db
    .select({
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} > 0 THEN ${schema.transactions.amountCents} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.transactions)
    .where(inRange(period.start, period.endEx))
    .all()[0];

  const prevTotals = db
    .select({
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(schema.transactions)
    .where(inRange(period.prevStart, period.prevEndEx))
    .all()[0];

  const byCategory = db
    .select({
      name: sql<string>`COALESCE(${schema.categories.name}, 'Uncategorized')`,
      color: sql<string>`COALESCE(${schema.categories.color}, '#b0aea6')`,
      spend: sql<number>`SUM(-${schema.transactions.amountCents})`,
    })
    .from(schema.transactions)
    .leftJoin(
      schema.categories,
      eq(schema.transactions.categoryId, schema.categories.id)
    )
    .where(
      and(inRange(period.start, period.endEx), lt(schema.transactions.amountCents, 0))
    )
    .groupBy(schema.categories.id)
    .orderBy(desc(sql`SUM(-${schema.transactions.amountCents})`))
    .all();

  const topMerchants = db
    .select({
      merchant: sql<string>`MIN(${schema.transactions.merchant})`,
      spend: sql<number>`SUM(-${schema.transactions.amountCents})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.transactions)
    .where(
      and(inRange(period.start, period.endEx), lt(schema.transactions.amountCents, 0))
    )
    .groupBy(schema.transactions.merchantNorm)
    .orderBy(desc(sql`SUM(-${schema.transactions.amountCents})`))
    .limit(period.mode === "month" ? 6 : 10)
    .all();

  const bucketExpr =
    period.granularity === "day"
      ? sql<string>`${schema.transactions.date}`.as("bucket")
      : sql<string>`substr(${schema.transactions.date}, 1, 7)`.as("bucket");
  const trendStart =
    period.granularity === "day"
      ? period.trendKeys[0]
      : `${period.trendKeys[0]}-01`;
  const trendRows = db
    .select({
      bucket: bucketExpr,
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(schema.transactions)
    .where(inRange(trendStart, period.endEx))
    .groupBy(sql`bucket`)
    .all();
  const spendByBucket = new Map(trendRows.map((r) => [r.bucket, r.spend]));
  const today = currentMonthKey();
  const todayDate = todayISO();
  const trend = period.trendKeys.map((key) => ({
    month: key,
    label:
      period.granularity === "day"
        ? `${key.slice(8, 10)}.${key.slice(5, 7)}.`
        : period.mode === "month"
          ? formatMonth(key)
          : formatMonthShort(key),
    spend: (spendByBucket.get(key) ?? 0) / 100,
    current:
      period.granularity === "day"
        ? key === todayDate
        : period.mode === "month"
          ? key === period.month
          : key === today,
  }));

  const uncategorized = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.transactions)
    .where(
      and(
        inRange(period.start, period.endEx),
        sql`${schema.transactions.categoryId} IS NULL`,
        lt(schema.transactions.amountCents, 0)
      )
    )
    .all()[0];

  const delta =
    prevTotals.spend > 0
      ? ((totals.spend - prevTotals.spend) / prevTotals.spend) * 100
      : null;

  // Average per month (or per day for short day-lookbacks), over buckets
  // that have already begun within the period.
  let avg: { cents: number; unit: string } | null = null;
  if (period.lookbackUnit === "d" && period.lookbackN) {
    avg = { cents: Math.round(totals.spend / period.lookbackN), unit: "day" };
  } else if (period.mode !== "month") {
    const elapsed = period.trendKeys.filter(
      (k) => k <= today && (spendByBucket.get(k) ?? 0) > 0
    ).length;
    if (elapsed > 0)
      avg = { cents: Math.round(totals.spend / elapsed), unit: "month" };
  }

  const currency = process.env.CURRENCY || "EUR";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Showing {period.label}
          </p>
        </div>
        <PeriodPicker
          months={months.slice(0, 36).map((m) => ({
            key: m,
            label: formatMonth(m),
          }))}
          years={years}
          mode={period.mode}
          month={period.month}
          year={period.mode === "year" ? period.label : undefined}
          back={
            period.lookbackN != null
              ? `${period.lookbackN}${period.lookbackUnit}`
              : undefined
          }
        />
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Spent in {period.label}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {formatCents(totals.spend)}
          </p>
          <p className="mt-1 text-sm">
            {delta != null && (
              <span
                className={
                  delta > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-700 dark:text-emerald-400"
                }
              >
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs{" "}
                {period.prevLabel}
              </span>
            )}
            {avg != null && (
              <span className="text-slate-500 dark:text-slate-400">
                {delta != null && " · "}Ø {formatCents(avg.cents)}/{avg.unit}
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Refunds &amp; credits
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {formatCents(totals.income)}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {totals.count} transactions
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Needs review
          </p>
          <p className="mt-1 text-2xl font-semibold">{uncategorized.count}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            uncategorized —{" "}
            <Link
              href={
                period.mode === "month"
                  ? `/transactions?m=${period.month}`
                  : "/transactions"
              }
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              categorize now
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Spending by category
          </h2>
          <CategoryBars
            currency={currency}
            data={byCategory.map((c) => ({
              name: c.name,
              color: c.color,
              spend: c.spend / 100,
            }))}
          />
        </section>

        <section className="rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {period.granularity === "day" ? "Daily spend" : "Monthly spend"}
            {period.mode === "month" ? " (last 6 months)" : ` (${period.label})`}
          </h2>
          <TrendBars currency={currency} data={trend} />
        </section>
      </div>

      <section className="rounded-xl bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Top merchants
        </h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {topMerchants.map((m, i) => (
              <tr
                key={i}
                className="border-b border-slate-100 dark:border-slate-800 last:border-0"
              >
                <td className="max-w-md truncate py-2 pr-4" title={m.merchant}>
                  {m.merchant}
                </td>
                <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">
                  {m.count}×{" "}
                  {period.mode === "month" ? "this month" : `in ${period.label}`}
                </td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {formatCents(-m.spend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
