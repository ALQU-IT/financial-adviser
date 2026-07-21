import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import {
  addMonths,
  currentMonthKey,
  formatMonth,
  formatMonthShort,
} from "@/lib/dates";
import { CategoryBars, TrendBars } from "./charts";

type Period = {
  mode: "month" | "year" | "last12";
  label: string; // "June 2026" / "2025" / "the last 12 months"
  start: string; // inclusive ISO date
  endEx: string; // exclusive ISO date
  prevStart: string;
  prevEndEx: string;
  prevLabel: string;
  trendKeys: string[]; // month keys shown in the trend chart
  month?: string; // set in month mode
};

function resolvePeriod(
  params: { m?: string; y?: string; p?: string },
  months: string[],
  years: string[]
): Period {
  const today = currentMonthKey();
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
    trendKeys: Array.from({ length: 6 }, (_, i) => addMonths(startKey, i)),
    month,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; y?: string; p?: string }>;
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

  const trendRows = db
    .select({
      month: sql<string>`substr(${schema.transactions.date}, 1, 7)`.as("month"),
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(schema.transactions)
    .where(inRange(`${period.trendKeys[0]}-01`, period.endEx))
    .groupBy(sql`month`)
    .all();
  const spendByMonth = new Map(trendRows.map((r) => [r.month, r.spend]));
  const today = currentMonthKey();
  const trend = period.trendKeys.map((key) => ({
    month: key,
    label:
      period.mode === "month" ? formatMonth(key) : formatMonthShort(key),
    spend: (spendByMonth.get(key) ?? 0) / 100,
    current: period.mode === "month" ? key === period.month : key === today,
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

  // Monthly average over months that have already begun within the period.
  const elapsedMonths = period.trendKeys.filter(
    (k) => k <= today && (spendByMonth.get(k) ?? 0) > 0
  ).length;
  const monthlyAvg =
    period.mode !== "month" && elapsedMonths > 0
      ? Math.round(totals.spend / elapsedMonths)
      : null;

  const currency = process.env.CURRENCY || "EUR";

  const pill = (href: string, active: boolean, label: string) => (
    <Link
      key={href}
      href={href}
      className={`rounded-full px-3 py-1 text-sm ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <nav className="flex flex-wrap justify-end gap-2">
          {pill("/?p=last12", period.mode === "last12", "Last 12 months")}
          {years.map((y) =>
            pill(`/?y=${y}`, period.mode === "year" && period.label === y, y)
          )}
        </nav>
      </div>
      <nav className="flex flex-wrap gap-2">
        {months.slice(0, 12).map((m) =>
          pill(
            `/?m=${m}`,
            period.mode === "month" && period.month === m,
            formatMonth(m)
          )
        )}
      </nav>

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
            {monthlyAvg != null && (
              <span className="text-slate-500 dark:text-slate-400">
                {delta != null && " · "}Ø {formatCents(monthlyAvg)}/month
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
            Monthly spend
            {period.mode === "month"
              ? " (last 6 months)"
              : period.mode === "year"
                ? ` (${period.label})`
                : " (last 12 months)"}
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
