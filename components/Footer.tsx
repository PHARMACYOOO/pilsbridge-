import Link from "next/link";
import { Mark } from "./Logo";

const columns = [
  {
    title: "Patients",
    links: [
      { href: "/order", label: "Order medicine" },
      { href: "/scan", label: "Snap a prescription" },
      { href: "/track", label: "Track an order" },
    ],
  },
  {
    title: "Partners",
    links: [
      { href: "/pharmacies", label: "Pharmacies" },
      { href: "/hospitals", label: "Hospitals & clinics" },
      { href: "/logistics", label: "Logistics partners" },
      { href: "/signin?as=partner", label: "Partner sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/trust", label: "Trust & compliance" },
      { href: "/trust#privacy", label: "Privacy" },
      { href: "/trust#report", label: "Report a concern" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-line-soft bg-coal">
      <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.3fr_2fr]">
          <div>
            <div className="flex items-center gap-2.5 text-gold">
              <Mark />
              <span className="font-display text-[26px] leading-none text-bone">Pilbridge</span>
            </div>
            <p className="mt-5 max-w-[34ch] font-display text-[22px] italic leading-snug text-stone">
              The right medicine, from the right shelf, to the right door.
            </p>
            <p className="mt-6 font-mono text-[11px] leading-relaxed text-mute">
              Lagos, Nigeria
              <br />
              partners@pilbridge.ng
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns.map((c) => (
              <div key={c.title}>
                <p className="eyebrow text-mute">{c.title}</p>
                <ul className="mt-5 space-y-3">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[14px] text-stone transition-colors hover:text-gold-soft">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 border-t border-line-soft pt-8">
          <p className="max-w-[92ch] text-[12.5px] leading-relaxed text-mute">
            Pilbridge is a technology and logistics-coordination platform. Prescription-only medicines are supplied
            exclusively by PCN-licensed partner pharmacies following review by a registered pharmacist. Controlled
            medicines are not offered on this platform. Product information is provided for identification only and is
            not medical advice — always follow the guidance of your doctor or pharmacist.
          </p>
          <div className="mt-6 flex flex-col justify-between gap-3 font-mono text-[11px] text-mute sm:flex-row">
            <span>
              © {new Date().getFullYear()} Pilbridge. All rights reserved. ·{" "}
              <a href="/?intro" className="text-stone hover:text-gold-soft">Replay intro</a>
            </span>
            <span>Technology coordinates. Licensed professionals decide.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
