import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { UploadWizard } from "./upload-wizard";
import { deleteStatement } from "./actions";
import { formatCents } from "@/lib/money";

export default async function UploadPage() {
  const user = await requireUser();

  const mappings = db
    .select({
      name: schema.providerMappings.name,
      mapping: schema.providerMappings.mapping,
    })
    .from(schema.providerMappings)
    .where(eq(schema.providerMappings.userId, user.id))
    .all();

  const past = db
    .select({
      id: schema.statements.id,
      provider: schema.statements.provider,
      filename: schema.statements.filename,
      uploadedAt: schema.statements.uploadedAt,
      txCount: sql<number>`(SELECT COUNT(*) FROM transactions t WHERE t.statement_id = ${schema.statements.id})`,
      total: sql<number>`(SELECT COALESCE(SUM(t.amount_cents), 0) FROM transactions t WHERE t.statement_id = ${schema.statements.id} AND t.amount_cents < 0)`,
    })
    .from(schema.statements)
    .where(eq(schema.statements.userId, user.id))
    .orderBy(desc(schema.statements.uploadedAt))
    .all();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Upload a statement</h1>
        <p className="mt-1 text-sm text-slate-500">
          Export your credit card statement as CSV and upload it here. You can
          adjust which columns contain the date, description and amount.
        </p>
      </div>
      <UploadWizard
        savedMappings={mappings.map((m) => ({
          name: m.name,
          mapping: JSON.parse(m.mapping),
        }))}
      />
      {past.length > 0 && (
        <section>
          <h2 className="text-base font-semibold">Imported statements</h2>
          <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Spend</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {past.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">{s.provider}</td>
                    <td className="px-4 py-3 text-slate-500">{s.filename}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {s.uploadedAt.toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right">{s.txCount}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCents(-s.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteStatement}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Deleting a statement removes all of its transactions — useful if an
            import went wrong.
          </p>
        </section>
      )}
    </div>
  );
}
