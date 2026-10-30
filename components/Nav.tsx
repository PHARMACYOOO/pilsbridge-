"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, UserRound, X } from "lucide-react";
import Logo from "./Logo";
import { contactLine, displayName, initials, isStaff, useAuth } from "@/lib/auth";

const links = [
  { href: "/order", label: "Order medicine" },
  { href: "/scan", label: "Snap prescription" },
  { href: "/pharmacies", label: "Pharmacies" },
  { href: "/hospitals", label: "Hospitals" },
  { href: "/logistics", label: "Logistics" },
  { href: "/trust", label: "Trust & compliance" },
];

function AccountMenu() {
  const { user, signOut } = useAuth();
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

  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2 text-[14px] text-stone transition-colors hover:text-bone">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/50 font-mono text-[10.5px] text-gold">
          {initials(user)}
        </span>
        {user.firstName ?? "Account"}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+14px)] w-[260px] border border-line bg-coal shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
          <div className="border-b border-line px-4 py-3.5">
            <p className="text-[14px] text-bone">{displayName(user)}</p>
            <p className="font-mono text-[11px] text-mute">{contactLine(user)}</p>
          </div>
          <ul className="py-1.5 text-[13.5px]">
            {(user.role === "RIDER"
              ? [["/rider", "Rider jobs"]]
              : user.role === "PLATFORM_ADMIN"
              ? [["/admin", "Admin"]]
              : isStaff(user)
              ? [
                  ["/portal", `${user.pharmacy?.name ?? "Pharmacy"} portal`],
                  ["/order", "Order medicine"],
                ]
              : [
                  ["/track", "My orders"],
                  ["/scan", "Snap a prescription"],
                  ["/order", "Order medicine"],
                ]
            ).map(([href, label]) => (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} className="block px-4 py-2 text-stone hover:bg-char hover:text-bone">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              signOut();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-[13.5px] text-stone hover:bg-char hover:text-alert"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.6} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  // Return to this page after signing in (except from the home and sign-in pages themselves).
  const signInHref = pathname === "/" || pathname.startsWith("/signin") ? "/signin" : `/signin?next=${encodeURIComponent(pathname)}`;
  const { user, ready, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-line-soft bg-coal">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-2 sm:px-8">
          <p className="truncate font-mono text-[10.5px] tracking-[0.06em] text-stone">
            Prescription medicines are dispensed only by PCN-licensed partner pharmacies after pharmacist review.
          </p>
          <div className="hidden shrink-0 items-center gap-5 font-mono text-[10.5px] tracking-[0.06em] sm:flex">
            <Link href="/track" className="text-stone hover:text-bone">Track an order</Link>
            <Link href="/signin?as=partner" className="text-gold hover:text-gold-soft">Partner portal →</Link>
          </div>
        </div>
      </div>

      <nav className="border-b border-line-soft bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-4 sm:px-8">
          <Logo />

          <ul className="hidden items-center gap-7 lg:flex">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`relative text-[14px] transition-colors ${active ? "text-gold-soft" : "text-stone hover:text-bone"}`}
                  >
                    {l.label}
                    {active && <span className="absolute -bottom-[25px] left-0 h-px w-full bg-gold" />}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden items-center gap-5 lg:flex">
            <div className="flex justify-end">
              {!ready ? null : user ? (
                <AccountMenu />
              ) : (
                <span className="flex items-center gap-4 whitespace-nowrap">
                  <Link
                    href={signInHref}
                    className={`text-[14px] transition-colors ${pathname === "/signin" ? "text-gold-soft" : "text-stone hover:text-bone"}`}
                  >
                    Sign in
                  </Link>
                  <Link
                    href={`${signInHref}${signInHref.includes("?") ? "&" : "?"}mode=signup`}
                    className="hidden rounded-[3px] border border-line px-3.5 py-2 text-[13.5px] text-bone transition-colors hover:border-gold hover:text-gold-soft xl:inline-block"
                  >
                    Create account
                  </Link>
                </span>
              )}
            </div>
            <Link
              href="/order"
              className="rounded-[3px] bg-gold px-4 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-gold-soft"
            >
              Start an order
            </Link>
          </div>

          <div className="-mr-2 flex items-center gap-1 lg:hidden">
            <Link
              href={signInHref}
              aria-label={user ? "Your account" : "Sign in"}
              className="flex h-9 w-9 items-center justify-center text-bone"
            >
              {ready && user ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/50 font-mono text-[10.5px] text-gold">
                  {initials(user)}
                </span>
              ) : (
                <UserRound className="h-5 w-5" strokeWidth={1.6} />
              )}
            </Link>
            <button
              className="p-2 text-bone"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-line-soft bg-ink lg:hidden">
            <div className="mx-auto max-w-[1240px] px-4 pt-4 sm:px-8">
              {ready && user ? (
                <div className="flex items-center justify-between border border-line px-4 py-3">
                  <div>
                    <p className="text-[14px] text-bone">{displayName(user)}</p>
                    <p className="font-mono text-[11px] text-mute">{contactLine(user)}</p>
                  </div>
                  <button onClick={signOut} className="text-[13px] text-stone hover:text-alert">Sign out</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link href={signInHref} className="rounded-[3px] border border-line py-3 text-center text-[14px] text-bone">Sign in</Link>
                  <Link href={`${signInHref}${signInHref.includes("?") ? "&" : "?"}mode=signup`} className="rounded-[3px] bg-gold py-3 text-center text-[14px] font-medium text-ink">Create account</Link>
                </div>
              )}
            </div>
            <ul className="mx-auto max-w-[1240px] px-4 py-2 sm:px-8">
              {[...links, { href: "/track", label: "Track an order" }, { href: "/signin?as=partner", label: "Partner portal" }].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`flex items-center justify-between border-b border-line-soft py-4 text-[15px] ${pathname === l.href ? "text-gold-soft" : "text-bone"}`}
                  >
                    {l.label}
                    <span className="font-mono text-[11px] text-mute">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </header>
  );
}
