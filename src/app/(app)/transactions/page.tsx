import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { resolvePeriod } from "@/lib/period";
import { PeriodPicker } from "../period-picker";
import { CategorySelect } from "./category-select";

const MAX_ROWS = 500;

export default async function TransactionsPage({
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
      <div className="rounded-xl bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
        <p className="text-slate-600 dark:text-slate-300">No transactions yet.</p>
        <Link
          href="/upload"
          className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Upload your first statement
        </Link>
      </div>
    );
  }

  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const period = resolvePeriod(params, months, years);

  const categories = db
    .select()
    .from(schema.categories)
    .orderBy(schema.categories.name)
    .all();

  const rangeWhere = and(
    eq(schema.transactions.userId, user.id),
    gte(schema.transactions.date, period.start),
    lt(schema.transactions.date, period.endEx)
  );

  const summary = db
    .select({
      count: sql<number>`COUNT(*)`,
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(schema.transactions)
    .where(rangeWhere)
    .all()[0];

  const txs = db
    .select()
    .from(schema.transactions)
    .where(rangeWhere)
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.id))
    .limit(MAX_ROWS)
    .all();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Transactions</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Showing {period.label} — {summary.count} transactions,{" "}
            {formatCents(summary.spend)} spent
          </p>
        </div>
        <PeriodPicker
          basePath="/transactions"
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

      <div className="overflow-x-auto rounded-xl bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx) => (
              <tr key={tx.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                  {tx.date}
                </td>
                <td className="max-w-md truncate px-4 py-2" title={tx.merchant}>
                  {tx.merchant}
                </td>
                <td className="px-4 py-2">
                  <CategorySelect
                    txId={tx.id}
                    value={tx.categoryId}
                    categories={categories}
                  />
                </td>
                <td
                  className={`px-4 py-2 text-right whitespace-nowrap font-medium ${
                    tx.amountCents < 0 ? "text-slate-900 dark:text-slate-100" : "text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {formatCents(tx.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.count > MAX_ROWS && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Showing the {MAX_ROWS} most recent of {summary.count} transactions —
          narrow the period to see the rest.
        </p>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Changing a category also applies it to future imports from the same
        merchant.
      </p>
    </div>
  );
}
