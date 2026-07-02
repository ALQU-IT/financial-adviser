"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Single-hue marks from one blue ramp: identity comes from axis labels, the
// darker step only emphasizes the selected month.
const BAR = "#2a78d6";
const BAR_EMPHASIS = "#1c5cab";
const GRID = "#e1e0d9";
const MUTED = "#898781";

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function EuroTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-slate-600">{euro.format(Number(payload[0].value))}</p>
    </div>
  );
}

export function CategoryBars({
  data,
}: {
  data: { name: string; color: string; spend: number }[];
}) {
  if (data.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">No expenses this month.</p>;
  }
  const height = Math.max(160, data.length * 36 + 20);
  return (
    <div style={{ height }} className="mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 64, bottom: 0, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#52514e", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={<EuroTooltip />}
          />
          <Bar dataKey="spend" barSize={16} radius={[0, 4, 4, 0]} fill={BAR}>
            <LabelList
              dataKey="spend"
              position="right"
              formatter={(v) => euro.format(Number(v))}
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
}: {
  data: { month: string; label: string; spend: number; current: boolean }[];
}) {
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
            axisLine={{ stroke: "#c3c2b7" }}
            tick={{ fill: MUTED, fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickFormatter={(v: number) => euro.format(v)}
            width={70}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={<EuroTooltip />}
          />
          <Bar dataKey="spend" barSize={28} radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.current ? BAR_EMPHASIS : BAR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
