"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import {
  detectDecimalSeparator,
  formatCents,
  parseAmountToCents,
  type DecimalSep,
} from "@/lib/money";
import {
  DATE_FORMAT_LABELS,
  guessDateFormat,
  parseDateISO,
  type DateFormat,
} from "@/lib/dates";
import { importTransactions, type ImportRow } from "./actions";

type Mapping = {
  dateCol: number;
  merchantCol: number;
  amountCol: number;
  dateFormat: DateFormat;
  expensesArePositive: boolean;
  decimalSep?: DecimalSep;
};

type SavedMapping = { name: string; mapping: Mapping };

export function UploadWizard({
  savedMappings,
  currency,
}: {
  savedMappings: SavedMapping[];
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filename, setFilename] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [provider, setProvider] = useState("");
  const [dateCol, setDateCol] = useState(0);
  const [merchantCol, setMerchantCol] = useState(1);
  const [amountCol, setAmountCol] = useState(2);
  const [dateFormat, setDateFormat] = useState<DateFormat>("DMY");
  const [expensesArePositive, setExpensesArePositive] = useState(true);
  const [numFormat, setNumFormat] = useState<"auto" | DecimalSep>("auto");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    categorized: number;
    skipped: number;
  } | null>(null);

  const columnCount = grid[0]?.length ?? 0;
  const dataRows = useMemo(
    () => (hasHeader ? grid.slice(1) : grid),
    [grid, hasHeader]
  );
  const headers = useMemo(() => {
    if (hasHeader && grid[0]) return grid[0];
    return Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
  }, [grid, hasHeader, columnCount]);

  function autoDetect(rows: string[][], header: string[] | null) {
    const sample = rows.slice(0, 25);
    const cols = rows[0]?.length ?? 0;
    let bestDate = -1;
    let bestDateHits = 0;
    let bestAmount = -1;
    let bestAmountHits = 0;
    const fmt = (col: number) =>
      guessDateFormat(sample.map((r) => r[col] ?? ""));
    for (let c = 0; c < cols; c++) {
      const dateHits = sample.filter(
        (r) => parseDateISO(r[c] ?? "", fmt(c)) != null
      ).length;
      if (dateHits > bestDateHits) {
        bestDateHits = dateHits;
        bestDate = c;
      }
      const amountHits = sample.filter((r) => {
        const cents = parseAmountToCents(r[c] ?? "");
        return cents != null && parseDateISO(r[c] ?? "", "DMY") == null;
      }).length;
      const headerName = header?.[c]?.toLowerCase() ?? "";
      const headerBoost = /betrag|amount|umsatz|value|summe/.test(headerName)
        ? 5
        : 0;
      if (amountHits + headerBoost > bestAmountHits) {
        bestAmountHits = amountHits + headerBoost;
        bestAmount = c;
      }
    }
    // Merchant: prefer columns whose header sounds like a description, then
    // long human-looking text. Penalize ID-like columns (mostly digits, no
    // spaces) so e.g. "TransactionId" never wins over "MerchantName".
    const descHeader =
      /merchant|beschreibung|description|details|verwendungszweck|buchungstext|text|name|empf/;
    let bestMerchant = -1;
    let bestScore = -Infinity;
    for (let c = 0; c < cols; c++) {
      if (c === bestDate || c === bestAmount) continue;
      const values = sample.map((r) => r[c] ?? "");
      const joined = values.join("");
      if (!joined) continue;
      const avg = joined.length / (sample.length || 1);
      const digitRatio = joined.replace(/[^0-9]/g, "").length / joined.length;
      const spacedShare =
        values.filter((v) => v.trim().includes(" ")).length /
        (sample.length || 1);
      let score = avg * (0.3 + spacedShare) * (1 - digitRatio);
      const headerName = header?.[c]?.toLowerCase() ?? "";
      if (descHeader.test(headerName)) score += 1000;
      if (score > bestScore) {
        bestScore = score;
        bestMerchant = c;
      }
    }
    if (bestDate >= 0) {
      setDateCol(bestDate);
      setDateFormat(fmt(bestDate));
    }
    if (bestAmount >= 0) {
      setAmountCol(bestAmount);
      // Guess sign convention: mostly positive values → charges are positive.
      const cents = sample
        .map((r) => parseAmountToCents(r[bestAmount] ?? ""))
        .filter((v): v is number => v != null && v !== 0);
      const positives = cents.filter((v) => v > 0).length;
      setExpensesArePositive(positives >= cents.length / 2);
    }
    if (bestMerchant >= 0) setMerchantCol(bestMerchant);
  }

  function onFile(file: File) {
    setError(null);
    setResult(null);
    setNumFormat("auto");
    setFilename(file.name);
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const rows = (res.data as string[][]).filter((r) => r.length > 1);
        if (rows.length === 0) {
          setError("Could not find any rows in this file.");
          return;
        }
        // Header heuristic: no cell in row 0 parses as an amount or date.
        const first = rows[0];
        const headerLikely = first.every(
          (cell) =>
            parseDateISO(cell, "DMY") == null &&
            (parseAmountToCents(cell) == null || /[a-z]/i.test(cell))
        );
        setHasHeader(headerLikely);
        setGrid(rows);
        autoDetect(headerLikely ? rows.slice(1) : rows, headerLikely ? first : null);
      },
      error: () => setError("Failed to parse this file as CSV."),
    });
  }

  function applyPreset(preset: SavedMapping) {
    setProvider(preset.name);
    setDateCol(preset.mapping.dateCol);
    setMerchantCol(preset.mapping.merchantCol);
    setAmountCol(preset.mapping.amountCol);
    setDateFormat(preset.mapping.dateFormat);
    setExpensesArePositive(preset.mapping.expensesArePositive);
    setNumFormat(preset.mapping.decimalSep ?? "auto");
  }

  const detectedSep = useMemo(
    () =>
      detectDecimalSeparator(
        dataRows.slice(0, 50).map((r) => r[amountCol] ?? "")
      ),
    [dataRows, amountCol]
  );
  const decimalSep: DecimalSep = numFormat === "auto" ? detectedSep : numFormat;

  const normalized = useMemo(() => {
    const rows: ImportRow[] = [];
    let skipped = 0;
    for (const r of dataRows) {
      const date = parseDateISO(r[dateCol] ?? "", dateFormat);
      const cents = parseAmountToCents(r[amountCol] ?? "", decimalSep);
      const merchant = (r[merchantCol] ?? "").trim();
      if (date == null || cents == null) {
        skipped++;
        continue;
      }
      rows.push({
        date,
        merchant: merchant || "(no description)",
        amountCents: expensesArePositive ? -cents : cents,
      });
    }
    return { rows, skipped };
  }, [dataRows, dateCol, merchantCol, amountCol, dateFormat, expensesArePositive, decimalSep]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await importTransactions({
        provider,
        filename,
        rows: normalized.rows,
        saveMapping: provider.trim()
          ? { dateCol, merchantCol, amountCol, dateFormat, expensesArePositive, decimalSep }
          : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({
        imported: res.imported,
        categorized: res.categorized,
        skipped: normalized.skipped,
      });
      setGrid([]);
      setFilename("");
      router.refresh();
    });
  }

  const selectCls =
    "mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 p-6 shadow-sm">
      {result && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Imported <strong>{result.imported}</strong> transactions,{" "}
          <strong>{result.categorized}</strong> categorized automatically
          {result.skipped > 0 && <> ({result.skipped} unreadable rows skipped)</>}
          . View them on the <a href="/" className="underline">dashboard</a>.
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="mt-1 block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-950 dark:file:text-indigo-300 dark:hover:file:bg-indigo-900"
        />
      </label>

      {grid.length > 0 && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Provider name
              </span>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. Visa / DKB / Amex"
                className={selectCls}
                list="provider-presets"
              />
              <datalist id="provider-presets">
                {savedMappings.map((m) => (
                  <option key={m.name} value={m.name} />
                ))}
              </datalist>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Saves these column settings for next time.
              </span>
            </label>
            {savedMappings.length > 0 && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Apply saved preset
                </span>
                <select
                  className={selectCls}
                  defaultValue=""
                  onChange={(e) => {
                    const preset = savedMappings.find(
                      (m) => m.name === e.target.value
                    );
                    if (preset) applyPreset(preset);
                  }}
                >
                  <option value="">— choose —</option>
                  {savedMappings.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                First row is a header
              </span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Date column
              </span>
              <select
                className={selectCls}
                value={dateCol}
                onChange={(e) => setDateCol(Number(e.target.value))}
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Date format
              </span>
              <select
                className={selectCls}
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              >
                {Object.entries(DATE_FORMAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Description column
              </span>
              <select
                className={selectCls}
                value={merchantCol}
                onChange={(e) => setMerchantCol(Number(e.target.value))}
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Amount column
              </span>
              <select
                className={selectCls}
                value={amountCol}
                onChange={(e) => setAmountCol(Number(e.target.value))}
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Number format
            </span>
            <select
              className={selectCls}
              value={numFormat}
              onChange={(e) =>
                setNumFormat(e.target.value as "auto" | DecimalSep)
              }
            >
              <option value="auto">
                Auto — detected: {detectedSep === "," ? "1.234,56" : "1'234.56 / 10.000"}
              </option>
              <option value=",">Comma decimal — 1.234,56 (German)</option>
              <option value=".">Dot decimal — 1&apos;234.56 / 10.000 (Swiss/English)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sign convention
            </span>
            <select
              className={selectCls}
              value={expensesArePositive ? "pos" : "neg"}
              onChange={(e) => setExpensesArePositive(e.target.value === "pos")}
            >
              <option value="pos">
                Charges are positive numbers (typical credit card)
              </option>
              <option value="neg">
                Charges are negative numbers (bank account style)
              </option>
            </select>
          </label>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Preview ({normalized.rows.length} rows ready
              {normalized.skipped > 0 && `, ${normalized.skipped} skipped`})
            </h3>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {normalized.rows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                      <td className="px-3 py-2">{row.merchant}</td>
                      <td
                        className={`px-3 py-2 text-right whitespace-nowrap ${
                          row.amountCents < 0
                            ? "text-slate-900 dark:text-slate-100"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {formatCents(row.amountCents, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Expenses should show as negative amounts. If they look positive,
              switch the sign convention above.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            onClick={submit}
            disabled={pending || normalized.rows.length === 0}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending
              ? "Importing…"
              : `Import ${normalized.rows.length} transactions`}
          </button>
        </div>
      )}
      {error && grid.length === 0 && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
