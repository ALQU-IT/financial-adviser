"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Text,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Single-hue marks from one blue ramp: identity comes from axis labels, the
// emphasis step only marks the selected month. Values live in globals.css as
// CSS variables so the charts follow the light/dark scheme.
const BAR = "var(--chart-bar)";
const BAR_EMPHASIS = "var(--chart-bar-emphasis)";
const GRID = "var(--chart-grid)";
const MUTED = "var(--chart-muted)";

function makeFormatter(currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
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
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900 dark:text-slate-100">{label}</p>
      <p className="text-slate-600 dark:text-slate-300">{fmt.format(Number(payload[0].value))}</p>
    </div>
  );
}

export function CategoryBars({
  data,
  currency,
}: {
  data: { name: string; color: string; spend: number; href: string }[];
  currency: string;
}) {
  const router = useRouter();
  const fmt = makeFormatter(currency);
  if (data.length === 0) {
    return <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No expenses in this period.</p>;
  }
  // Resolve rows by category name: Recharts' index arguments differ between
  // axis ticks and the chart surface, and a wrong index opens the wrong
  // category. Names are unique (one row per category).
  const open = (name: unknown) => {
    const row = data.find((d) => d.name === name);
    if (row) router.push(row.href);
  };
  const height = Math.max(160, data.length * 36 + 20);
  return (
    <div style={{ height }} className="mt-2 [&_.recharts-surface]:cursor-pointer">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 64, bottom: 0, left: 8 }}
          // Clicking anywhere on a row (bar, label or empty track) opens
          // that category's transactions.
          onClick={(state) => {
            if (state?.activeLabel != null) open(state.activeLabel);
          }}
        >
          <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={(props: {
              x: number | string;
              y: number | string;
              payload: { value: string };
            }) => (
              // Labels sit outside the plot area, where the chart's own
              // onClick doesn't reach — so they navigate themselves.
              // Recharts' Text keeps the default wrapping of long names
              // ("Subscriptions & Media").
              <Text
                x={props.x}
                y={props.y}
                width={140}
                textAnchor="end"
                verticalAnchor="middle"
                fill="var(--chart-ink)"
                fontSize={12}
                className="recharts-cartesian-axis-tick-value"
                style={{ cursor: "pointer" }}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  open(props.payload.value);
                }}
              >
                {props.payload.value}
              </Text>
            )}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in srgb, var(--chart-muted) 12%, transparent)" }}
            content={<ChartTooltip fmt={fmt} />}
          />
          <Bar
            dataKey="spend"
            barSize={16}
            radius={[0, 4, 4, 0]}
            fill={BAR}
            // The chart-level onClick only knows the row once the tooltip is
            // active, i.e. after a hover — a tap on a phone has none. The bar
            // itself always knows its own row.
            onClick={(entry: { payload?: { name?: string } }) =>
              open(entry?.payload?.name)
            }
          >
            <LabelList
              dataKey="spend"
              position="right"
              formatter={(v) => fmt.format(Number(v))}
              style={{ fill: MUTED, fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
    <div className="mt-2 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 16, right: 8, bottom: 0, left: 8 }}
        >
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
            cursor={{ fill: "color-mix(in srgb, var(--chart-muted) 12%, transparent)" }}
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
