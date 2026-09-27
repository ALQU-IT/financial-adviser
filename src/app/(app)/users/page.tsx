import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteUser } from "./actions";
import { NewUserForm } from "./new-user-form";
import { MerchantAvatar, PageHeader, Section } from "../ui";

export default async function UsersPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const users = db.select().from(schema.users).orderBy(schema.users.id).all();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Users"
        subtitle="Each user has their own statements, transactions and rules."
      />
      <Section title={`Members · ${users.length}`} flush>
        <div className="px-1 pb-1">
          <div className="rounded-lg bg-container-inset p-1">
            <div className="rounded-lg bg-container shadow-border-xs">
              {users.map((u, i) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${
                    i > 0 ? "border-t border-divider" : ""
                  }`}
                >
                  <MerchantAvatar name={u.username} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {u.username}
                      {u.id === user.id && (
                        <span className="ml-1.5 text-xs font-normal text-secondary">(you)</span>
                      )}
                    </p>
                    <p className="text-xs capitalize text-secondary">{u.role}</p>
                  </div>
                  {u.id !== user.id && (
                    <form action={deleteUser} className="ml-auto">
                      <input type="hidden" name="id" value={u.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Delete (incl. their data)
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
      <Section title="Add a user">
        <NewUserForm />
      </Section>
    </div>
  );
}
