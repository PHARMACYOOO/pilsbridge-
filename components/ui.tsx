import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type Variant = "gold" | "outline" | "ghost" | "dark";

const variants: Record<Variant, string> = {
  gold: "bg-gold text-ink hover:bg-gold-soft",
  outline: "border border-line text-bone hover:border-gold hover:text-gold-soft",
  ghost: "text-bone hover:text-gold-soft",
  dark: "bg-ink text-ivory hover:bg-graphite",
};

export function ButtonLink({
  href,
  children,
  variant = "gold",
  arrow = false,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-[3px] px-5 py-3 text-[14px] font-medium tracking-[0.01em] transition-colors duration-200 ${variants[variant]} ${className}`}
    >
      {children}
      {arrow && <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />}
    </Link>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow text-gold ${className}`}>{children}</p>;
}

export function SectionLabel({ index, children, tone = "dark" }: { index: string; children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <div className={`flex items-center gap-4 eyebrow ${tone === "dark" ? "text-stone" : "text-mute"}`}>
      <span className={tone === "dark" ? "text-gold" : "text-gold-deep"}>{index}</span>
      <span className={`h-px w-10 ${tone === "dark" ? "bg-line" : "bg-parchment"}`} />
      <span>{children}</span>
    </div>
  );
}

export type BadgeTone = "otc" | "pom" | "cold" | "device" | "ok" | "warn" | "alert" | "neutral";

const badgeTones: Record<BadgeTone, string> = {
  otc: "border-ok/40 text-ok",
  pom: "border-gold/50 text-gold-soft",
  cold: "border-cold/45 text-cold",
  device: "border-line text-stone",
  ok: "border-ok/40 text-ok",
  warn: "border-warn/50 text-warn",
  alert: "border-alert/50 text-alert",
  neutral: "border-line text-stone",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border px-1.5 py-[3px] font-mono text-[10px] uppercase leading-none tracking-[0.08em] ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="grain relative overflow-hidden border-b border-line-soft">
      <div className="rule-grid absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative mx-auto max-w-[1240px] px-4 pb-16 pt-16 sm:px-8 md:pb-24 md:pt-24">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-6 max-w-[16ch] font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ivory sm:text-6xl md:text-[78px]">
          {title}
        </h1>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-stone">{lede}</p>
        {children && <div className="mt-9 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  );
}

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-[1240px] px-4 sm:px-8 ${className}`}>{children}</div>;
}
