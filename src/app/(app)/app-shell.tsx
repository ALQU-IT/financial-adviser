"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChartPie,
  CreditCard,
  LogOut,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { logout } from "../login/actions";

type NavItem = { name: string; href: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { name: "Home", href: "/", icon: ChartPie },
  { name: "Transactions", href: "/transactions", icon: CreditCard },
  { name: "Import", href: "/upload", icon: Upload },
];
const ADMIN_NAV: NavItem = { name: "Users", href: "/users", icon: Users };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-xl bg-inverse text-on-inverse ${className}`}
    >
      <Wallet className="h-5 w-5" strokeWidth={2} />
    </span>
  );
}

/** Icon tile + label; the indicator bar sits left on desktop, on top on mobile. */
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group relative block space-y-1 rounded-lg pb-1 outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex grow flex-col items-center gap-1 lg:flex-row">
        <div
          className={`h-1 w-4 rounded-b-sm lg:h-4 lg:w-1 lg:rounded-b-none lg:rounded-r-sm ${
            active ? "bg-nav-indicator" : ""
          }`}
        />
        <div
          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg ${
            active
              ? "bg-container text-primary shadow-border-xs"
              : "text-secondary group-hover:bg-surface-hover"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 2} />
        </div>
      </div>
      <p
        className={`text-center text-[11px] font-medium lg:pl-2 ${
          active ? "text-primary" : "text-secondary"
        }`}
      >
        {item.name}
      </p>
    </Link>
  );
}

function UserMenu({
  username,
  role,
  placement,
}: {
  username: string;
  role: string;
  placement: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-container-inset text-sm font-medium uppercase text-primary shadow-border-xs hover:bg-container-inset-hover"
      >
        {username.slice(0, 1)}
      </button>
      {open && (
        <div
          className={`absolute z-30 w-56 rounded-xl bg-container p-1 shadow-border-xs shadow-lg ${
            placement === "top" ? "bottom-0 left-full ml-3" : "right-0 top-full mt-2"
          }`}
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-container-inset text-sm font-medium uppercase">
              {username.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{username}</p>
              <p className="text-xs capitalize text-secondary">{role}</p>
            </div>
          </div>
          <div className="my-1 border-t border-divider" />
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-primary hover:bg-container-inset"
            >
              <LogOut className="h-4 w-4 text-secondary" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  username,
  role,
  children,
}: {
  username: string;
  role: "admin" | "user";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = role === "admin" ? [...NAV, ADMIN_NAV] : NAV;
  const current = items.find((i) => isActive(pathname, i.href)) ?? items[0];

  return (
    <div className="flex h-dvh flex-col bg-surface lg:flex-row">
      {/* Mobile top bar */}
      <nav className="relative flex items-center justify-between border-b border-divider px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:hidden">
        <p className="text-sm font-medium text-primary">{current.name}</p>
        <Link href="/" className="absolute left-1/2 -translate-x-1/2" aria-label="Home">
          <Logo />
        </Link>
        <UserMenu username={username} role={role} placement="bottom" />
      </nav>

      {/* Desktop icon rail */}
      <div className="hidden shrink-0 border-r border-divider lg:block">
        <nav className="flex h-full w-[84px] flex-col py-4">
          <Link href="/" className="mb-3 block pl-2" aria-label="Home">
            <Logo className="mx-auto" />
          </Link>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={item === current} />
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-auto pl-2">
            <UserMenu username={username} role={role} placement="top" />
          </div>
        </nav>
      </div>

      <main
        id="main"
        className="w-full grow overflow-y-auto px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-10 lg:pb-0"
      >
        {/* Desktop breadcrumb bar */}
        <div className="sticky top-0 z-10 -mx-3 mb-6 hidden items-center gap-2 border-b border-divider bg-surface px-3 py-4 text-sm lg:-mx-10 lg:flex lg:px-10">
          <Link href="/" className="text-secondary hover:text-primary">
            Financial Adviser
          </Link>
          <span className="text-subdued">/</span>
          <span className="font-medium text-primary">{current.name}</span>
        </div>
        <div className="mx-auto max-w-7xl pt-4 lg:pt-0">{children}</div>
        <div className="h-6 lg:h-12" />
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-divider bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {items.map((item) => (
          <NavLink key={item.href} item={item} active={item === current} />
        ))}
      </nav>
    </div>
  );
}
