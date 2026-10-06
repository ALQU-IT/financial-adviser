import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import {
  currentMonthKey,
  formatMonth,
  formatMonthShort,
  todayISO,
} from "@/lib/dates";
import { periodQuery, resolvePeriod } from "@/lib/period";
import { TrendingDown, TrendingUp } from "lucide-react";
import { SpendingDonut, TrendBars } from "./charts";
import { Card, MerchantAvatar, PageHeader, Section } from "./ui";
import { PeriodPicker } from "./period-picker";

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
      <div>
        <PageHeader
          title={`Welcome, ${user.username}`}
          subtitle="Let's see where your money goes."
        />
        <Card className="p-10 text-center">
          <h2 className="text-base font-medium">No transactions yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-secondary">
            Import your first credit card statement (CSV) and you&apos;ll see
            where your money goes — by category, merchant and month.
          </p>
          <Link href="/upload" className="btn-primary mt-4">
            Import a statement
          </Link>
        </Card>
      </div>
    );
  }

  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const period = resolvePeriod(params, months, years);

  // Every figure below goes through this, so ignored transactions (card
  // payments and the like) never count anywhere on the dashboard.
  const inRange = (start: string, endEx: string) =>
    and(
      eq(schema.transactions.userId, user.id),
      gte(schema.transactions.date, start),
      lt(schema.transactions.date, endEx),
      eq(schema.transactions.ignored, false)
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
      id: schema.categories.id,
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
  const trendRows = db
    .select({
      bucket: bucketExpr,
      spend: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.amountCents} < 0 THEN -${schema.transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(schema.transactions)
    .where(inRange(period.trendStart, period.endEx))
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

  // Average per month (or per day for short day-lookbacks). Counted from the
  // first month that has data through the current one, so months before the
  // user's first import don't drag the average down, while a month that
  // genuinely had no spending still counts (skipping it would overstate it).
  let avg: { cents: number; unit: string } | null = null;
  if (period.lookbackUnit === "d" && period.lookbackN) {
    avg = { cents: Math.round(totals.spend / period.lookbackN), unit: "day" };
  } else if (period.mode !== "month") {
    const begun = period.trendKeys.filter((k) => k <= today);
    const firstWithData = begun.findIndex((k) => (spendByBucket.get(k) ?? 0) > 0);
    const elapsed = firstWithData === -1 ? 0 : begun.length - firstWithData;
    if (elapsed > 0)
      avg = { cents: Math.round(totals.spend / elapsed), unit: "month" };
  }

  // Keep the selected period when jumping to the transactions list.
  const txHref = (extra?: string) =>
    `/transactions?${periodQuery(period)}${extra ? `&${extra}` : ""}`;

  const currency = process.env.CURRENCY || "EUR";
  const outflowTotal = byCategory.reduce((sum, c) => sum + c.spend, 0);
  const deltaUp = delta != null && delta > 0;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.username}`}
        subtitle={<>Here&apos;s where your money went in {period.label}.</>}
      >
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
      </PageHeader>

      <div className="space-y-6">
        {/* Stat tiles */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-secondary">Spent in {period.label}</p>
            <p className="mt-1 text-2xl font-medium tabular-nums lg:text-3xl">
              {formatCents(totals.spend)}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm">
              {delta != null && (
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    deltaUp ? "text-destructive" : "text-success"
                  }`}
                >
                  {deltaUp ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {Math.abs(delta).toFixed(0)}%
                </span>
              )}
              {delta != null && (
                <span className="text-secondary">vs {period.prevLabel}</span>
              )}
              {avg != null && (
                <span className="text-secondary">
                  {delta != null && "· "}Ø {formatCents(avg.cents)}/{avg.unit}
                </span>
              )}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-secondary">Refunds &amp; credits</p>
            <p className="mt-1 text-2xl font-medium tabular-nums text-success lg:text-3xl">
              {formatCents(totals.income)}
            </p>
            <p className="mt-1 text-sm text-secondary">
              {totals.count} transactions
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-secondary">Needs review</p>
            <p className="mt-1 text-2xl font-medium tabular-nums lg:text-3xl">
              {uncategorized.count}
            </p>
            <p className="mt-1 text-sm text-secondary">
              uncategorized ·{" "}
              <Link
                href={txHref("cat=none")}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                categorize now
              </Link>
            </p>
          </Card>
        </div>

        <Section
          title="Spending by category"
          aside={
            <span className="hidden text-xs text-secondary sm:inline">
              Click a category to see its transactions
            </span>
          }
        >
          {byCategory.length === 0 ? (
            <p className="py-6 text-center text-sm text-secondary">
              No expenses in this period.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <div className="w-full md:w-1/3">
                <SpendingDonut
                  currency={currency}
                  data={byCategory.map((c) => ({
                    name: c.name,
                    color: c.color,
                    spend: c.spend / 100,
                    href: txHref(`cat=${c.id ?? "none"}`),
                  }))}
                />
              </div>
              <div className="w-full space-y-1 overflow-x-auto rounded-xl bg-container-inset p-1 md:w-2/3">
                <div className="flex items-center px-4 py-2 text-xs font-medium uppercase text-secondary">
                  <p>
                    Categories
                    <span className="mx-1 text-subdued">·</span>
                    {byCategory.length}
                  </p>
                  <div className="ml-auto flex items-center gap-6 text-right">
                    <p className="w-24 sm:w-32">Value</p>
                    <p className="w-14">Weight</p>
                  </div>
                </div>
                <div className="rounded-lg bg-container shadow-border-xs">
                  {byCategory.map((c, i) => {
                    const weight = outflowTotal > 0 ? (c.spend / outflowTotal) * 100 : 0;
                    return (
                      <Link
                        key={c.id ?? "none"}
                        href={txHref(`cat=${c.id ?? "none"}`)}
                        data-category={c.name}
                        className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-container-hover ${
                          i > 0 ? "border-t border-divider" : ""
                        } ${i === 0 ? "rounded-t-lg" : ""} ${
                          i === byCategory.length - 1 ? "rounded-b-lg" : ""
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="min-w-0 truncate font-medium">{c.name}</span>
                        <div className="ml-auto flex items-center gap-6 text-right">
                          <span className="w-24 tabular-nums sm:w-32">
                            {formatCents(c.spend)}
                          </span>
                          <span className="flex w-14 items-center justify-end gap-2 tabular-nums text-secondary">
                            {weight.toFixed(0)}%
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title={period.granularity === "day" ? "Daily spend" : "Monthly spend"}
            aside={
              <span className="text-xs text-secondary">
                {period.mode === "month"
                  ? "Last 6 months"
                  : period.label.charAt(0).toUpperCase() + period.label.slice(1)}
              </span>
            }
          >
            <TrendBars currency={currency} data={trend} />
          </Section>

          <Section title="Top merchants" flush>
            <div className="px-1 pb-1">
              <div className="rounded-xl bg-container-inset p-1">
                <div className="flex items-center px-4 py-2 text-xs font-medium uppercase text-secondary">
                  <p>Merchant</p>
                  <p className="ml-auto">Spent</p>
                </div>
                <div className="rounded-lg bg-container shadow-border-xs">
                  {topMerchants.map((m, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                        i > 0 ? "border-t border-divider" : ""
                      }`}
                    >
                      <MerchantAvatar name={m.merchant} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium" title={m.merchant}>
                          {m.merchant}
                        </p>
                        <p className="text-xs text-secondary">
                          {m.count}×{" "}
                          {period.mode === "month" ? "this month" : `in ${period.label}`}
                        </p>
                      </div>
                      {/* Spend magnitude, matching the "Spent in …" tile. */}
                      <span className="ml-auto font-medium tabular-nums">
                        {formatCents(m.spend)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
