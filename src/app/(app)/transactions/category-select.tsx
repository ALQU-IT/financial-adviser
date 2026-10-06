"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, EyeOff } from "lucide-react";
import { setCategory, setIgnored } from "./actions";

const IGNORE = "__ignore";

/**
 * Category pill (tinted with the category colour) that is also a select.
 * Its last option, "Ignore", leaves the merchant out of every total — for
 * money moved between your own accounts such as paying the card bill.
 */
export function CategorySelect({
  txId,
  value,
  ignored = false,
  categories,
}: {
  txId: number;
  value: number | null;
  ignored?: boolean;
  categories: { id: number; name: string; color: string }[];
}) {
  const [pending, startTransition] = useTransition();
  // Controlled, because a change here also applies to every other row of the
  // same merchant. An uncontrolled select (defaultValue) is only synced by
  // React on mount, so those rows would keep showing their old value after
  // the server had already updated them.
  const current = ignored ? IGNORE : value == null ? "" : String(value);
  const [selected, setSelected] = useState(current);
  useEffect(() => {
    setSelected(current);
  }, [current]);

  const isIgnored = selected === IGNORE;
  const color = isIgnored
    ? undefined
    : categories.find((c) => String(c.id) === selected)?.color;

  return (
    <span className="relative inline-flex max-w-full">
      {isIgnored && (
        <EyeOff
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subdued"
        />
      )}
      <select
        value={selected}
        disabled={pending}
        aria-label="Category"
        title={isIgnored ? "Ignored — not counted in any total" : undefined}
        onChange={(e) => {
          const next = e.target.value;
          setSelected(next);
          startTransition(async () => {
            // setCategory also un-ignores, so any category (or
            // Uncategorized) means "count this merchant again".
            if (next === IGNORE) await setIgnored(txId, true);
            else await setCategory(txId, next === "" ? null : Number(next));
          });
        }}
        style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
        className={`max-w-48 cursor-pointer appearance-none truncate rounded-full border py-1 pr-7 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${
          isIgnored
            ? "border-input bg-container-inset pl-7 text-subdued"
            : color
              ? "tint pl-2.5"
              : "border-dashed border-input bg-container pl-2.5 text-secondary"
        }`}
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option disabled>──────────</option>
        <option value={IGNORE}>
          {isIgnored ? "Ignored" : "Ignore — don't count"}
        </option>
      </select>
      <ChevronDown
        aria-hidden
        className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 bg-transparent! ${
          color ? "tint" : "text-secondary"
        }`}
        style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
      />
    </span>
  );
}
