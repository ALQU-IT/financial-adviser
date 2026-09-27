"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Monochrome marks as in Sure: gray bars, the selected bucket in full ink.
// Values live in globals.css as CSS variables so charts follow light/dark.
const BAR = "var(--chart-bar)";
const BAR_EMPHASIS = "var(--chart-bar-emphasis)";
const GRID = "var(--chart-grid)";
const MUTED = "var(--chart-muted)";

function makeFormatter(currency: string, fractionDigits = 0) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string;
  fmt: Intl.NumberFormat;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-container px-3 py-2 text-xs shadow-border-xs shadow-md">
      <p className="font-medium text-primary">{label}</p>
      <p className="text-secondary">{fmt.format(Number(payload[0].value))}</p>
    </div>
  );
}

export type DonutSlice = {
  name: string;
  color: string;
  spend: number;
  href: string;
};

/**
 * Outflows donut: total in the middle; hovering a slice swaps in that
 * category's amount and share. Clicking a slice opens its transactions.
 */
export function SpendingDonut({
  data,
  currency,
}: {
  data: DonutSlice[];
  currency: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);
  const fmt = makeFormatter(currency, 2);
  const total = data.reduce((s, d) => s + d.spend, 0);
  const active = hover != null ? data[hover] : null;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="spend"
            nameKey="name"
            innerRadius="78%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 1.5 : 0}
            cornerRadius={3}
            stroke="none"
            isAnimationActive={false}
            onMouseEnter={(_, i) => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={(entry: { payload?: { href?: string } }) => {
              const href = entry?.payload?.href;
              if (href) router.push(href);
            }}
            className="cursor-pointer outline-none"
          >
            {data.map((d, i) => (
              <Cell
                key={d.name}
                fill={d.color}
                fillOpacity={hover == null || hover === i ? 0.95 : 0.35}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="mb-1 max-w-[70%] truncate text-sm text-secondary">
          {active ? active.name : "Total outflows"}
        </p>
        <p className="text-2xl font-medium tabular-nums text-primary">
          {fmt.format(active ? active.spend : total)}
        </p>
        {active && total > 0 && (
          <p className="mt-1 text-sm text-secondary">
            {((active.spend / total) * 100).toFixed(1)}%
          </p>
        )}
      </div>
    </div>
  );
}

export function TrendBars({
  data,
  currency,
}: {
  data: { month: string; label: string; spend: number; current: boolean }[];
  currency: string;
}) {
  const fmt = makeFormatter(currency);
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tick={{ fill: MUTED, fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickFormatter={(v: number) => fmt.format(v)}
            width={70}
          />
          <Tooltip
            cursor={{ fill: "var(--container-inset)" }}
            content={<ChartTooltip fmt={fmt} />}
          />
          <Bar dataKey="spend" maxBarSize={28} radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.current ? BAR_EMPHASIS : BAR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
