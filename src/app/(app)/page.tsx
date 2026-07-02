import Link from "next/link";
import { and, desc, eq, gt, like, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { CategoryBars, TrendBars } from "./charts";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
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
      <div className="rounded-xl bg-white p-10 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Welcome to Financial Adviser</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
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

  const month = params.m && months.includes(params.m) ? params.m : months[0];
  const monthIdx = months.indexOf(month);
  const prevMonth = months[monthIdx + 1];

  const spendWhere = (m: string) =>
    and(
      eq(schema.transactions.userId, user.id),
      like(schema.transactions.date, `${m}%`)
    );

  const totals = db
    .select({
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} > 0 THEN ${schema.transactions.amountCents} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.transactions)
    .where(spendWhere(month))
    .all()[0];

  const prevTotals = prevMonth
    ? db
        .select({
          spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
        })
        .from(schema.transactions)
        .where(spendWhere(prevMonth))
        .all()[0]
    : null;

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
    .where(and(spendWhere(month), lt(schema.transactions.amountCents, 0)))
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
    .where(and(spendWhere(month), lt(schema.transactions.amountCents, 0)))
    .groupBy(schema.transactions.merchantNorm)
    .orderBy(desc(sql`SUM(-${schema.transactions.amountCents})`))
    .limit(6)
    .all();

  const trend = db
    .select({
      month: sql<string>`substr(${schema.transactions.date}, 1, 7)`.as("month"),
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, user.id))
    .groupBy(sql`month`)
    .orderBy(desc(sql`month`))
    .limit(6)
    .all()
    .reverse();

  const uncategorized = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.transactions)
    .where(
      and(
        spendWhere(month),
        sql`${schema.transactions.categoryId} IS NULL`,
        lt(schema.transactions.amountCents, 0)
      )
    )
    .all()[0];

  const delta =
    prevTotals && prevTotals.spend > 0
      ? ((totals.spend - prevTotals.spend) / prevTotals.spend) * 100
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <nav className="flex flex-wrap gap-2">
          {months.slice(0, 12).map((m) => (
            <Link
              key={m}
              href={`/?m=${m}`}
              className={`rounded-full px-3 py-1 text-sm ${
                m === month
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
              }`}
            >
              {formatMonth(m)}
            </Link>
          ))}
        </nav>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Spent in {formatMonth(month)}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {formatCents(totals.spend)}
          </p>
          {delta != null && (
            <p
              className={`mt-1 text-sm ${
                delta > 0 ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs{" "}
              {formatMonth(prevMonth!)}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Refunds &amp; credits
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatCents(totals.income)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {totals.count} transactions
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Needs review
          </p>
          <p className="mt-1 text-2xl font-semibold">{uncategorized.count}</p>
          <p className="mt-1 text-sm text-slate-500">
            uncategorized —{" "}
            <Link
              href={`/transactions?m=${month}`}
              className="text-indigo-600 hover:underline"
            >
              categorize now
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">
            Spending by category
          </h2>
          <CategoryBars
            data={byCategory.map((c) => ({
              name: c.name,
              color: c.color,
              spend: c.spend / 100,
            }))}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">
            Monthly spend (last {trend.length} months)
          </h2>
          <TrendBars
            data={trend.map((t) => ({
              month: t.month,
              label: formatMonth(t.month),
              spend: t.spend / 100,
              current: t.month === month,
            }))}
          />
        </section>
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Top merchants</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {topMerchants.map((m, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="max-w-md truncate py-2 pr-4" title={m.merchant}>
                  {m.merchant}
                </td>
                <td className="py-2 pr-4 text-slate-500">
                  {m.count}× this month
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
