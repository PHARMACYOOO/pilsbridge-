"use client";

import Link from "next/link";
import { useEffect } from "react";
import { X } from "lucide-react";

export function PortalHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow text-gold">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[38px] leading-none text-ivory sm:text-[40px]">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-line bg-coal ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-[15px] text-bone">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-mono text-[11px] text-gold hover:text-gold-soft">
      {children}
    </Link>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-line">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] transition-colors ${
              value === o.value ? "border-gold text-gold-soft" : "border-transparent text-stone hover:text-bone"
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className="font-mono text-[10.5px] text-mute">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "outline",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "gold" | "outline" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    gold: "bg-gold text-ink hover:bg-gold-soft",
    outline: "border border-line text-bone hover:border-gold hover:text-gold-soft",
    danger: "border border-alert/40 text-alert hover:border-alert hover:bg-alert/10",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[3px] px-4 py-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-line bg-coal">
        <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-line px-6">
          <p className="font-mono text-[12px] tracking-[0.08em] text-stone">{title}</p>
          <button onClick={onClose} className="p-1 text-stone hover:text-bone" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export const th = "px-5 py-3 font-normal";
export const thead = "font-mono text-[10px] uppercase tracking-[0.08em] text-mute";
