"use client";

import { useEffect, useState, useTransition } from "react";
import { setCategory } from "./actions";

export function CategorySelect({
  txId,
  value,
  categories,
}: {
  txId: number;
  value: number | null;
  categories: { id: number; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  // Controlled, because setting one row's category also recategorizes every
  // other uncategorized row of the same merchant. An uncontrolled select
  // (defaultValue) is only synced by React on mount, so those rows kept
  // displaying "Uncategorized" after the server had already updated them.
  const [selected, setSelected] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setSelected(value == null ? "" : String(value));
  }, [value]);

  return (
    <select
      value={selected}
      disabled={pending}
      onChange={(e) => {
        setSelected(e.target.value);
        const v = e.target.value === "" ? null : Number(e.target.value);
        startTransition(async () => {
          await setCategory(txId, v);
        });
      }}
      className={`w-full max-w-48 rounded-lg border px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none ${
        value == null
          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
      } disabled:opacity-50`}
    >
      <option value="">Uncategorized</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
