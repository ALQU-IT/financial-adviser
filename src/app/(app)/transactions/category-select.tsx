"use client";

import { useTransition } from "react";
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
  return (
    <select
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
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
