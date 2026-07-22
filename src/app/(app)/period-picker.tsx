"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LookbackSlider } from "./lookback-slider";

const RANGE_PRESETS: { value: string; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "24m", label: "Last 24 months" },
];

export function PeriodPicker({
  months,
  years,
  mode,
  month,
  year,
  back,
}: {
  months: { key: string; label: string }[];
  years: string[];
  mode: "month" | "year" | "last12" | "lookback";
  month?: string;
  year?: string;
  back?: string; // e.g. "45d" when a lookback is active
}) {
  const router = useRouter();

  const monthValue = mode === "month" ? (month ?? "") : "";
  const yearValue = mode === "year" ? (year ?? "") : "";
  const isPreset = back != null && RANGE_PRESETS.some((p) => p.value === back);
  const rangeValue =
    mode === "lookback" ? (isPreset ? back! : "custom") : mode === "last12" ? "12m" : "";
  const [showSlider, setShowSlider] = useState(rangeValue === "custom");

  const backMatch = /^(\d+)([dm])$/.exec(back ?? "");
  const sliderUnit = (backMatch?.[2] as "d" | "m" | undefined) ?? "m";
  const sliderValue = backMatch ? Number(backMatch[1]) : 6;

  const selectCls =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  const activeCls = "border-indigo-500 ring-1 ring-indigo-500";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <select
          aria-label="Select month"
          className={`${selectCls} ${monthValue ? activeCls : ""}`}
          value={monthValue}
          onChange={(e) => {
            if (e.target.value) {
              setShowSlider(false);
              router.push(`/?m=${e.target.value}`, { scroll: false });
            }
          }}
        >
          <option value="">Month…</option>
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Select year"
          className={`${selectCls} ${yearValue ? activeCls : ""}`}
          value={yearValue}
          onChange={(e) => {
            if (e.target.value) {
              setShowSlider(false);
              router.push(`/?y=${e.target.value}`, { scroll: false });
            }
          }}
        >
          <option value="">Year…</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          aria-label="Select time range"
          className={`${selectCls} ${rangeValue ? activeCls : ""}`}
          value={showSlider ? "custom" : rangeValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "custom") {
              setShowSlider(true);
            } else if (v) {
              setShowSlider(false);
              router.push(`/?back=${v}`, { scroll: false });
            }
          }}
        >
          <option value="">Time range…</option>
          {RANGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </div>
      {showSlider && (
        <LookbackSlider
          active={mode === "lookback"}
          unit={sliderUnit}
          value={sliderValue}
        />
      )}
    </div>
  );
}
