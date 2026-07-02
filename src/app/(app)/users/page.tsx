import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteUser } from "./actions";
import { NewUserForm } from "./new-user-form";

export default async function UsersPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const users = db.select().from(schema.users).orderBy(schema.users.id).all();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each user has their own statements, transactions and rules.
        </p>
      </div>
      <div className="rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3 text-slate-500">{u.role}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== user.id && (
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete (incl. their data)
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Add a user</h2>
        <NewUserForm />
      </div>
    </div>
  );
}
