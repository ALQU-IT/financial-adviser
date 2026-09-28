"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { setCategory } from "./actions";

/** Category pill (tinted with the category colour) that is also a select. */
export function CategorySelect({
  txId,
  value,
  categories,
}: {
  txId: number;
  value: number | null;
  categories: { id: number; name: string; color: string }[];
}) {
  const [pending, startTransition] = useTransition();
  // Controlled, because setting one row's category also recategorizes every
  // other row of the same merchant. An uncontrolled select
  // (defaultValue) is only synced by React on mount, so those rows kept
  // displaying "Uncategorized" after the server had already updated them.
  const [selected, setSelected] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setSelected(value == null ? "" : String(value));
  }, [value]);

  const color = categories.find((c) => String(c.id) === selected)?.color;

  return (
    <span className="relative inline-flex max-w-full">
      <select
        value={selected}
        disabled={pending}
        aria-label="Category"
        onChange={(e) => {
          setSelected(e.target.value);
          const v = e.target.value === "" ? null : Number(e.target.value);
          startTransition(async () => {
            await setCategory(txId, v);
          });
        }}
        style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
        className={`max-w-48 cursor-pointer appearance-none truncate rounded-full border py-1 pl-2.5 pr-7 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${
          color ? "tint" : "border-dashed border-input bg-container text-secondary"
        }`}
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
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
