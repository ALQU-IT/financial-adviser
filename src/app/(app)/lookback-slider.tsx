"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LIMITS = {
  d: { min: 7, max: 120, default: 30, label: "days" },
  m: { min: 1, max: 24, default: 6, label: "months" },
} as const;

export function LookbackSlider({
  active,
  unit: initialUnit,
  value: initialValue,
}: {
  active: boolean;
  unit: "d" | "m";
  value: number;
}) {
  const router = useRouter();
  const [unit, setUnit] = useState<"d" | "m">(initialUnit);
  const [value, setValue] = useState(initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function apply(u: "d" | "m", v: number) {
    router.replace(`/?back=${v}${u}`, { scroll: false });
  }

  function onSlide(v: number) {
    setValue(v);
    clearTimeout(timer.current);
    // Debounce so dragging doesn't fire a request per pixel.
    timer.current = setTimeout(() => apply(unit, v), 250);
  }

  function onUnit(u: "d" | "m") {
    if (u === unit) return;
    setUnit(u);
    const v = LIMITS[u].default;
    setValue(v);
    apply(u, v);
  }

  const limits = LIMITS[unit];

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 shadow-sm ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      <span className="text-sm font-medium whitespace-nowrap">
        Look back: {value} {limits.label}
      </span>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={(e) => onSlide(Number(e.target.value))}
        className={`h-2 w-48 cursor-pointer sm:w-64 ${
          active ? "accent-white" : "accent-indigo-600"
        }`}
        aria-label={`Look back this many ${limits.label}`}
      />
      <div className="flex overflow-hidden rounded-lg border border-current/30 text-xs">
        {(["d", "m"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onUnit(u)}
            className={`px-2.5 py-1 font-medium ${
              unit === u
                ? active
                  ? "bg-white/25"
                  : "bg-indigo-600 text-white"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            {u === "d" ? "Days" : "Months"}
          </button>
        ))}
      </div>
    </div>
  );
}
