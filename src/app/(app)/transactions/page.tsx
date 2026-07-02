import Link from "next/link";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { CategorySelect } from "./category-select";

export default async function TransactionsPage({
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

  const month = params.m && months.includes(params.m) ? params.m : months[0];

  const categories = db
    .select()
    .from(schema.categories)
    .orderBy(schema.categories.name)
    .all();

  const txs = month
    ? db
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.userId, user.id),
            like(schema.transactions.date, `${month}%`)
          )
        )
        .orderBy(desc(schema.transactions.date), desc(schema.transactions.id))
        .all()
    : [];

  if (months.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-slate-600">No transactions yet.</p>
        <Link
          href="/upload"
          className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Upload your first statement
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Transactions</h1>
        <nav className="flex flex-wrap gap-2">
          {months.slice(0, 12).map((m) => (
            <Link
              key={m}
              href={`/transactions?m=${m}`}
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

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx) => (
              <tr key={tx.id} className="border-b border-slate-100">
                <td className="px-4 py-2 whitespace-nowrap text-slate-500">
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
                    tx.amountCents < 0 ? "text-slate-900" : "text-emerald-700"
                  }`}
                >
                  {formatCents(tx.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Changing a category also applies it to future imports from the same
        merchant.
      </p>
    </div>
  );
}
