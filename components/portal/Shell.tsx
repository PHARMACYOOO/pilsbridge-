"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  LogOut,
  ArrowRightLeft,
  Bell,
  Boxes,
  Check,
  ClipboardList,
  FileCheck,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import PhoneSignIn from "@/components/PhoneSignIn";
import { SESSION_EXPIRED_KEY } from "@/lib/api";
import { displayName, initials, isStaff, useAuth } from "@/lib/auth";
import { PortalProvider, usePortal } from "./store";

function useNav() {
  const { orders, prescriptions, transfers } = usePortal();
  return [
    { href: "/portal", icon: LayoutGrid, label: "Overview" },
    { href: "/portal/orders", icon: ClipboardList, label: "Orders", count: orders.filter((o) => ["pharmacist_review", "accepted", "preparing", "ready"].includes(o.status)).length },
    { href: "/portal/prescriptions", icon: FileCheck, label: "Prescriptions", count: prescriptions.filter((r) => r.status === "pending").length },
    { href: "/portal/inventory", icon: Boxes, label: "Inventory" },
    { href: "/portal/transfers", icon: ArrowRightLeft, label: "Transfers", count: transfers.filter((t) => (t.direction === "OUTGOING" ? ["DRAFT", "ACCEPTED"] : ["OFFERED", "IN_TRANSIT"]).includes(t.status)).length },
    { href: "/portal/deliveries", icon: Truck, label: "Deliveries" },
    { href: "/portal/settlements", icon: Wallet, label: "Settlements" },
    { href: "/portal/compliance", icon: ShieldCheck, label: "Compliance" },
  ];
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useNav();
  const { user, signOut } = useAuth();
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <p className="eyebrow px-3 pb-3 text-[10px] text-mute">Pharmacy</p>
        <ul className="space-y-0.5">
          {nav.map(({ href, icon: Icon, label, count }) => {
            const active = href === "/portal" ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 border-l-2 px-3 py-2.5 text-[13.5px] transition-colors ${
                    active ? "border-gold bg-gold-wash text-gold-soft" : "border-transparent text-stone hover:bg-char hover:text-bone"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.6} />
                  <span className="flex-1">{label}</span>
                  {!!count && <span className="font-mono text-[10.5px] text-gold">{count}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <a
        href="/?intro"
        className="mx-3 mb-3 flex items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-[13.5px] text-stone transition-colors hover:bg-char hover:text-gold-soft"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
        Back to website
      </a>
      <button
        onClick={signOut}
        className="mx-3 mb-3 flex items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-left text-[13.5px] text-stone transition-colors hover:bg-char hover:text-alert"
      >
        <LogOut className="h-4 w-4" strokeWidth={1.6} />
        Sign out
      </button>
      <Link
        href="/portal/settings"
        onClick={onNavigate}
        className={`flex items-center gap-3 border-t border-line-soft p-4 transition-colors hover:bg-char ${pathname === "/portal/settings" ? "bg-gold-wash" : ""}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 font-mono text-[11px] text-gold">{user ? initials(user) : ""}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-bone">{user ? `${user.role === "PHARMACIST" ? "Pharm. " : ""}${displayName(user)}` : ""}</span>
          <span className="block truncate text-[11.5px] text-mute">{user?.role === "PHARMACIST" ? "Pharmacist" : "Pharmacy staff"}</span>
        </span>
        <Settings className="h-4 w-4 text-mute" strokeWidth={1.6} aria-label="Settings" />
      </Link>
    </>
  );
}

/** "14:05" today, "Yesterday", or "12 Oct". */
function noticeTime(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return days === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Notifications() {
  const { unread, notifications, markAllRead } = usePortal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
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
        onClick={() => setOpen((v) => !v)}
        className={`relative border p-2.5 transition-colors ${open ? "border-gold text-gold-soft" : "border-line text-stone hover:border-stone hover:text-bone"}`}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" strokeWidth={1.6} />
        {unread && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold" />}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[340px] max-w-[calc(100vw-32px)] border border-line bg-coal shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] text-bone">Notifications</p>
            <button onClick={markAllRead} disabled={!unread} className="flex items-center gap-1 font-mono text-[10.5px] text-gold hover:text-gold-soft disabled:text-mute">
              <Check className="h-3 w-3" /> Mark all read
            </button>
          </div>
          {notifications.length === 0 && <p className="px-4 py-6 text-[13px] text-mute">Nothing needs your attention.</p>}
          <ul className="max-h-[420px] divide-y divide-line-soft overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3.5 hover:bg-char">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.unread ? "bg-gold" : "bg-line"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-bone">{n.title}</span>
                    <span className="block truncate text-[12px] text-mute">{n.body}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-mute">{noticeTime(n.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts } = usePortal();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : undefined}
          className={`flex max-w-[420px] items-center gap-2.5 border bg-coal px-4 py-3 text-[13px] text-bone shadow-[0_20px_40px_-15px_rgba(0,0,0,0.9)] ${t.tone === "error" ? "border-alert/60" : "border-gold/40"}`}
        >
          {t.tone === "error" ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-alert" /> : <Check className="h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={2.25} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const { loadError, refresh } = usePortal();
  const licence = user?.pharmacy?.licenceExpiresAt
    ? new Date(user.pharmacy.licenceExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="flex min-h-screen bg-ink">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-line-soft bg-coal lg:flex">
        <div className="flex h-[68px] items-center border-b border-line-soft px-5">
          <Logo href="/portal" />
        </div>
        <SideNav />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} aria-label="Close menu" />
          <aside className="relative flex h-full w-[264px] flex-col border-r border-line bg-coal">
            <div className="flex h-[68px] items-center justify-between border-b border-line-soft px-5">
              <Logo href="/portal" />
              <button onClick={() => setDrawer(false)} className="p-1 text-stone hover:text-bone" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SideNav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-4 border-b border-line-soft bg-ink/90 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setDrawer(true)} className="-ml-1 p-1.5 text-bone lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[15px] text-bone">{user?.pharmacy?.name ?? "Pharmacy"}</p>
              <p className="hidden truncate font-mono text-[10.5px] text-mute sm:block">
                {user?.pharmacy?.area}
                {user?.pharmacy?.status === "VERIFIED" && " · Verified"}
                {licence && ` · Licence valid to ${licence}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) router.push(`/portal/inventory?q=${encodeURIComponent(q.trim())}`);
              }}
              className="hidden items-center gap-2 border border-line px-3 focus-within:border-gold md:flex"
              role="search"
            >
              <Search className="h-3.5 w-3.5 text-mute" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search stock, batches…"
                aria-label="Search stock and batches"
                className="h-9 w-56 bg-transparent text-[13px] text-bone placeholder:text-mute focus:outline-none"
              />
            </form>
            <Notifications />
            <Link href="/portal/settings" className="border border-line p-2.5 text-stone transition-colors hover:border-stone hover:text-bone" aria-label="Settings">
              <Settings className="h-4 w-4" strokeWidth={1.6} />
            </Link>
            <a
              href="/?intro"
              className="flex items-center gap-2 border border-line p-2.5 text-[13px] text-stone transition-colors hover:border-gold hover:text-gold-soft sm:px-3.5"
              aria-label="Back to website"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
              <span className="hidden sm:inline">Back to website</span>
            </a>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-8">
          {loadError && (
            <div className="mb-6 flex flex-wrap items-center gap-3 border-l-2 border-alert bg-alert/10 px-4 py-3 text-[13.5px] text-bone">
              <AlertCircle className="h-4 w-4 shrink-0 text-alert" />
              <span className="flex-1">{loadError}</span>
              <button onClick={refresh} className="text-gold hover:text-gold-soft">Try again</button>
            </div>
          )}
          {children}
        </main>
      </div>
      <Toasts />
    </div>
  );
}

/** Only pharmacy staff get past this point; everyone else signs in with their registered number. */
function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready, signOut } = useAuth();
  if (!ready) return <div className="min-h-screen bg-ink" />;
  if (user && isStaff(user)) return <>{children}</>;

  return (
    <div className="grain flex min-h-screen items-center justify-center bg-ink px-4 py-16">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="border border-line bg-coal p-6 sm:p-8">
          <p className="eyebrow text-gold">Partner portal</p>
          <h1 className="mt-3 font-display text-[30px] leading-none text-ivory">Sign in to your pharmacy</h1>
          {user ? (
            <div className="mt-6 space-y-4">
              <p className="flex items-start gap-2 border-l-2 border-warn bg-warn/10 px-3.5 py-2.5 text-[13px] text-bone">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                You&apos;re signed in as a patient. The portal needs the number registered to your pharmacy.
              </p>
              <button onClick={signOut} className="text-[13.5px] text-gold hover:text-gold-soft">Sign in with another number</button>
            </div>
          ) : (
            <>
              {(() => {
                try {
                  return sessionStorage.getItem(SESSION_EXPIRED_KEY);
                } catch {
                  return null;
                }
              })() && (
                <p className="mt-4 flex items-start gap-2 border-l-2 border-warn bg-warn/10 px-3.5 py-2.5 text-[13px] text-bone">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  Your session expired — please sign in again.
                </p>
              )}
              <p className="mb-6 mt-3 text-[13.5px] text-stone">Use the mobile number registered to your pharmacy account.</p>
              <PhoneSignIn intent="signin" skipProfile notFoundMessage="This number isn’t registered to a pharmacy account." />
            </>
          )}
        </div>
        <p className="mt-6 text-center">
          <a href="/?intro" className="inline-flex items-center gap-1.5 text-[13px] text-stone hover:text-gold-soft">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to website
          </a>
        </p>
      </div>
    </div>
  );
}

export default function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <Gate>
      <PortalProvider>
        <Frame>{children}</Frame>
      </PortalProvider>
    </Gate>
  );
}
