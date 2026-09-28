import Link from "next/link";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { PeriodPicker } from "../period-picker";
import { X } from "lucide-react";
import { CategorySelect } from "./category-select";
import { Card, MerchantAvatar, PageHeader } from "../ui";

const MAX_ROWS = 500;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    m?: string;
    y?: string;
    p?: string;
    back?: string;
    cat?: string; // category id, or "none" for uncategorized
  }>;
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
      <div>
        <PageHeader title="Transactions" />
        <Card className="p-10 text-center">
          <p className="text-sm text-secondary">No transactions yet.</p>
          <Link href="/upload" className="btn-primary mt-4">
            Import your first statement
          </Link>
        </Card>
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

  // Optional category filter (from clicking a bar on the dashboard). An
  // unknown id is ignored rather than showing an empty list.
  const catFilter: { id: number | null; name: string } | null =
    params.cat === "none"
      ? { id: null, name: "Uncategorized" }
      : (categories.find((c) => String(c.id) === params.cat) ?? null);

  const rangeWhere = and(
    eq(schema.transactions.userId, user.id),
    gte(schema.transactions.date, period.start),
    lt(schema.transactions.date, period.endEx),
    catFilter == null
      ? undefined
      : catFilter.id == null
        ? isNull(schema.transactions.categoryId)
        : eq(schema.transactions.categoryId, catFilter.id)
  );
  const catQuery = catFilter ? `cat=${catFilter.id ?? "none"}` : undefined;

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

  // Group by day, newest first (rows already arrive in that order).
  const days: { date: string; net: number; rows: typeof txs }[] = [];
  for (const tx of txs) {
    const last = days[days.length - 1];
    if (last?.date === tx.date) {
      last.rows.push(tx);
      last.net += tx.amountCents;
    } else {
      days.push({ date: tx.date, net: tx.amountCents, rows: [tx] });
    }
  }
  const colorById = new Map(categories.map((c) => [c.id, c.color]));

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={
          <>
            {period.label.charAt(0).toUpperCase() + period.label.slice(1)} ·{" "}
            {summary.count} transactions ·{" "}
            {formatCents(summary.spend)} spent
          </>
        }
      >
        <PeriodPicker
          basePath="/transactions"
          extraQuery={catQuery}
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
      </PageHeader>

      <Card className="px-3 py-4 lg:p-4">
        {catFilter && (
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-container-inset py-1 pl-3 pr-1 text-sm">
              <span className="text-secondary">Category:</span>
              <span className="font-medium">{catFilter.name}</span>
              <Link
                href={`/transactions?${periodQuery(period)}`}
                aria-label="Show all categories"
                title="Show all categories"
                className="flex h-5 w-5 items-center justify-center rounded-full text-secondary hover:bg-container-inset-hover hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </Link>
            </span>
          </div>
        )}

        {txs.length === 0 ? (
          <p className="py-10 text-center text-sm text-secondary">
            No transactions in this period.
          </p>
        ) : (
          <>
            <div className="mb-4 hidden grid-cols-12 items-center rounded-xl bg-container-inset px-5 py-3 text-xs font-medium uppercase text-secondary md:grid">
              <p className="col-span-6">Transaction</p>
              <p className="col-span-4">Category</p>
              <p className="col-span-2 text-right">Amount</p>
            </div>
            <div className="space-y-4">
              {days.map((day) => (
                <div key={day.date} className="rounded-xl bg-container-inset p-1">
                  <div className="flex items-center justify-between px-4 py-2 text-xs font-medium uppercase text-secondary">
                    <p>
                      {formatDay(day.date)}
                      <span className="mx-1 text-subdued">·</span>
                      {day.rows.length}
                    </p>
                    <p className="tabular-nums">{formatCents(day.net)}</p>
                  </div>
                  <div className="rounded-lg bg-container shadow-border-xs">
                    {day.rows.map((tx, i) => (
                      <div
                        key={tx.id}
                        data-tx-row
                        // One grid, two arrangements: on phones the category
                        // drops under the name (row 2); from md up it is its
                        // own column. A single select either way.
                        className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-3 text-sm md:grid-cols-12 lg:p-4 ${
                          i > 0 ? "border-t border-divider" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3 md:col-span-6 lg:gap-4">
                          <MerchantAvatar
                            name={tx.merchant}
                            color={
                              tx.categoryId != null
                                ? colorById.get(tx.categoryId)
                                : undefined
                            }
                          />
                          <p className="truncate font-medium" title={tx.merchant}>
                            {tx.merchant}
                          </p>
                        </div>
                        <div className="row-start-2 pl-12 md:col-span-4 md:row-start-auto md:pl-0 lg:pl-0">
                          <CategorySelect
                            txId={tx.id}
                            value={tx.categoryId}
                            categories={categories}
                          />
                        </div>
                        <p
                          className={`col-start-2 row-start-1 text-right font-medium tabular-nums md:col-span-2 md:col-start-auto md:row-start-auto ${
                            tx.amountCents > 0 ? "text-success" : "text-primary"
                          }`}
                        >
                          {tx.amountCents > 0 ? "+" : ""}
                          {formatCents(tx.amountCents)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {summary.count > MAX_ROWS && (
        <p className="mt-3 text-xs text-warning">
          Showing the {MAX_ROWS} most recent of {summary.count} transactions —
          narrow the period to see the rest.
        </p>
      )}
      <p className="mt-3 text-xs text-secondary">
        Changing a category applies it to every transaction from the same
        merchant, including future imports.
      </p>
    </div>
  );
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
