import { Check, Clock } from "lucide-react";

const checks = [
  { label: "NAFDAC registration on file", done: true },
  { label: "Batch AMX-2309-114 traced to distributor", done: true },
  { label: "Packaging intact · photo verified", done: true },
  { label: "Transfer permitted for product class", done: true },
  { label: "Pharmacist sign-off", done: false },
];

export default function MatchTicket() {
  return (
    <div className="relative w-full max-w-[460px]">
      {/* offset plate behind ticket */}
      <div className="absolute -right-3 -top-3 h-full w-full border border-gold/25" aria-hidden />
      <div className="relative border border-line bg-coal shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <span className="font-mono text-[11px] tracking-[0.08em] text-stone">REDISTRIBUTION MATCH · RM-20418</span>
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-warn">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-warn" />
            REVIEW
          </span>
        </div>

        <div className="px-5 pb-5 pt-5">
          <p className="font-display text-[26px] leading-tight text-ivory">Amoxicillin 500 mg capsules</p>
          <p className="mt-1 font-mono text-[11px] text-mute">Generic · 10 × 10 blister · Prescription-only</p>

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
            <div className="border border-line-soft bg-char p-3">
              <p className="eyebrow text-[9.5px] text-mute">From</p>
              <p className="mt-1.5 text-[13.5px] text-bone">Oakfield Pharmacy</p>
              <p className="text-[12px] text-stone">Ikeja GRA</p>
              <dl className="mt-3 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between gap-2"><dt className="text-mute">Surplus</dt><dd className="text-bone">140</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-mute">Sells</dt><dd className="text-bone">12/mo</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-mute">Expires</dt><dd className="text-warn">Mar 2027</dd></div>
              </dl>
            </div>

            <div className="flex flex-col items-center justify-center">
              <svg width="34" height="60" viewBox="0 0 34 60" aria-hidden>
                <path d="M2 30 H32" stroke="var(--color-gold)" strokeWidth="1.25" className="dash-flow" />
                <path d="M26 25 L32 30 L26 35" fill="none" stroke="var(--color-gold)" strokeWidth="1.25" />
              </svg>
              <span className="font-mono text-[10px] text-mute">24.6 km</span>
            </div>

            <div className="border border-gold/30 bg-gold-wash p-3">
              <p className="eyebrow text-[9.5px] text-gold">To</p>
              <p className="mt-1.5 text-[13.5px] text-bone">Harbour Clinic</p>
              <p className="text-[12px] text-stone">Lekki Phase 1</p>
              <dl className="mt-3 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between gap-2"><dt className="text-mute">Needs</dt><dd className="text-bone">60</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-mute">Uses</dt><dd className="text-bone">45/mo</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-mute">Stock</dt><dd className="text-alert">4 days</dd></div>
              </dl>
            </div>
          </div>

          <ul className="mt-5 space-y-2 border-t border-line-soft pt-4">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2.5 text-[12.5px]">
                {c.done ? (
                  <Check className="h-3.5 w-3.5 text-ok" strokeWidth={2.25} />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-warn" strokeWidth={2} />
                )}
                <span className={c.done ? "text-stone" : "text-bone"}>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-line bg-char px-5 py-3.5">
          <span className="font-mono text-[10.5px] text-mute">Ambient ≤ 25 °C · est. 1 h 10 m</span>
          <span className="font-mono text-[10.5px] text-gold">Awaiting Pharm. A. Okafor</span>
        </div>
      </div>
    </div>
  );
}
