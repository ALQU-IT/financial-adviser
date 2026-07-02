import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-base font-semibold text-slate-900">
            💶 Financial Adviser
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <Link href="/" className="hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/transactions" className="hover:text-slate-900">
              Transactions
            </Link>
            <Link href="/upload" className="hover:text-slate-900">
              Upload
            </Link>
            {user.role === "admin" && (
              <Link href="/users" className="hover:text-slate-900">
                Users
              </Link>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-500">{user.username}</span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
