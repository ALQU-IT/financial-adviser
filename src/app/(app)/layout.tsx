import { requireUser } from "@/lib/auth";
import { AppShell } from "./app-shell";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  return (
    <AppShell username={user.username} role={user.role}>
      {children}
    </AppShell>
  );
}
