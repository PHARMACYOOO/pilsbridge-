import Link from "next/link";

export function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M5.5 27 L16 4.5 L26.5 27"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="miter"
      />
      <circle cx="16" cy="18.6" r="2.4" fill="currentColor" />
      <path d="M2.5 27 H29.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 text-gold" aria-label="Pilbridge home">
      <Mark />
      <span className="font-display text-[26px] leading-none tracking-[-0.01em] text-bone">
        Pilbridge
      </span>
    </Link>
  );
}
