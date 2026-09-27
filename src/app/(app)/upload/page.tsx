import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { UploadWizard } from "./upload-wizard";
import { deleteStatement } from "./actions";
import { formatCents } from "@/lib/money";
import { PageHeader, Section } from "../ui";

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
      // The outer column must be qualified literally: an interpolated column
      // renders unqualified here and would resolve to t's own "id".
      txCount: sql<number>`(SELECT COUNT(*) FROM transactions t WHERE t.statement_id = statements.id)`,
      total: sql<number>`(SELECT COALESCE(SUM(t.amount_cents), 0) FROM transactions t WHERE t.statement_id = statements.id AND t.amount_cents < 0)`,
    })
    .from(schema.statements)
    .where(eq(schema.statements.userId, user.id))
    .orderBy(desc(schema.statements.uploadedAt))
    .all();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import a statement"
        subtitle="Export your credit card statement as CSV and upload it here. You can adjust which columns contain the date, description and amount."
      />
      <UploadWizard
        currency={process.env.CURRENCY || "EUR"}
        savedMappings={mappings.map((m) => ({
          name: m.name,
          mapping: JSON.parse(m.mapping),
        }))}
      />
      {past.length > 0 && (
        <Section title="Imported statements" flush>
          <div className="overflow-x-auto px-1 pb-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-container-inset text-left text-xs font-medium uppercase text-secondary [&>th:first-child]:rounded-l-xl [&>th:last-child]:rounded-r-xl">
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
                  <tr key={s.id} className="border-t border-divider first:border-t-0">
                    <td className="px-4 py-3 font-medium">{s.provider}</td>
                    <td className="px-4 py-3 text-secondary">{s.filename}</td>
                    <td className="px-4 py-3 text-secondary">
                      {s.uploadedAt.toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.txCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCents(-s.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteStatement}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-destructive hover:underline"
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
          <p className="px-4 py-3 text-xs text-secondary">
            Deleting a statement removes all of its transactions — useful if an
            import went wrong.
          </p>
        </Section>
      )}
    </div>
  );
}
