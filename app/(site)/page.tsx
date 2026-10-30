import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Camera,
  EyeOff,
  FileCheck,
  Layers,
  ThermometerSnowflake,
} from "lucide-react";
import Intro from "@/components/Intro";
import MatchTicket from "@/components/MatchTicket";
import { ButtonLink, Container, Eyebrow, SectionLabel } from "@/components/ui";

const tracks = [
  {
    label: "For patients",
    title: "Prescriptions, delivered with a pharmacist in the loop.",
    steps: [
      "Search by brand or generic name",
      "Upload your prescription if one is required",
      "A licensed pharmacist reviews and confirms",
      "Pay by card, transfer or USSD",
      "A vetted rider delivers a sealed parcel",
    ],
    href: "/order",
    cta: "Order medicine",
  },
  {
    label: "Between facilities",
    title: "Surplus on one shelf becomes supply on another.",
    steps: [
      "Pharmacies list eligible slow-moving stock",
      "The network spots matching demand nearby",
      "Eligibility and batch checks run automatically",
      "An authorised pharmacist approves the transfer",
      "Logistics partner moves it with chain of custody",
    ],
    href: "/pharmacies",
    cta: "For pharmacies",
  },
  {
    label: "For hospitals",
    title: "Procurement that sees the whole city's inventory.",
    steps: [
      "Raise a procurement or emergency request",
      "Receive quotations from verified sources",
      "Route approval through your own roles",
      "Issue the purchase order in one place",
      "Track delivery to your store, batch by batch",
    ],
    href: "/hospitals",
    cta: "For hospitals",
  },
];

const chain = [
  { name: "Manufacturer", note: "Registered product" },
  { name: "Distributor", note: "Licensed wholesale" },
  { name: "Pharmacy / Hospital", note: "Licensed premises" },
  { name: "Pilbridge", note: "Visibility & matching", core: true },
  { name: "Pharmacist", note: "Professional decision" },
  { name: "Logistics partner", note: "Custody & delivery" },
  { name: "Patient / Facility", note: "Confirmed receipt" },
];

const safeguards = [
  {
    icon: BadgeCheck,
    title: "Licences, re-checked",
    body: "Every partner pharmacy, superintendent pharmacist and facility is verified at onboarding and again before each licence lapses. Lapsed means paused.",
  },
  {
    icon: FileCheck,
    title: "Prescriptions reviewed by people",
    body: "Prescription-only orders are held until a registered pharmacist verifies the prescription. Software flags; pharmacists decide.",
  },
  {
    icon: Layers,
    title: "Batch-level traceability",
    body: "Each unit is tied to a batch, an expiry date and a custody trail — from the distributor's invoice to the patient's door.",
  },
  {
    icon: CalendarClock,
    title: "First expiry, first out",
    body: "Inventory is picked FEFO, not FIFO. Near-expiry stock surfaces early enough to redistribute, never late enough to dispense expired.",
  },
  {
    icon: ThermometerSnowflake,
    title: "Cold chain, logged",
    body: "Temperature-sensitive products travel only with equipped partners. An excursion quarantines the shipment pending quality assessment.",
  },
  {
    icon: EyeOff,
    title: "Riders see a parcel, not a patient",
    body: "Delivery staff receive a sealed parcel reference and an address — never a diagnosis, prescription or product list.",
  },
];

const audiences = [
  { href: "/pharmacies", who: "Pharmacies", line: "Recover value from slow-moving stock and take delivery orders without building a dispatch team." },
  { href: "/hospitals", who: "Hospitals & clinics", line: "Fill urgent gaps from verified nearby inventory, with approvals that match your organisation." },
  { href: "/logistics", who: "Logistics partners", line: "Steady, well-specified pharmaceutical jobs — including cold-chain routes for equipped fleets." },
  { href: "/order", who: "Patients & families", line: "Medicine from a licensed pharmacy near you, reviewed by a pharmacist, at your door." },
];

export default function Home() {
  return (
    <>
      <Intro />

      {/* ——— Hero ——— */}
      <section className="grain relative overflow-hidden border-b border-line-soft">
        <div className="rule-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black_20%,transparent_75%)]" />
        <Container className="relative grid items-center gap-14 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pb-28">
          <div>
            <Eyebrow>Pharmaceutical redistribution &amp; delivery · Lagos</Eyebrow>
            <h1 className="mt-7 font-display text-[50px] leading-[0.98] tracking-[-0.02em] text-ivory sm:text-[72px] lg:text-[88px]">
              The right medicine.
              <br />
              The right shelf.
              <br />
              <em className="text-gold">The right door.</em>
            </h1>
            <p className="mt-8 max-w-[52ch] text-[17px] leading-relaxed text-stone">
              Pilbridge connects licensed pharmacies, hospitals and distributors on one inventory network —
              redistributing stock before it expires, and delivering prescriptions to patients through vetted
              logistics partners.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <ButtonLink href="/order" arrow>Order medicine</ButtonLink>
              <ButtonLink href="/pharmacies" variant="outline">Join the pharmacy network</ButtonLink>
            </div>
            <Link href="/scan" className="mt-5 inline-flex items-center gap-2 text-[14px] text-stone hover:text-gold-soft">
              <Camera className="h-4 w-4 text-gold" strokeWidth={1.75} />
              Have a paper prescription? Snap it for an instant total
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
            <dl className="mt-14 grid max-w-[560px] grid-cols-3 border-t border-line-soft pt-6">
              {[
                ["Pharmacist", "reviews every Rx"],
                ["Batch-level", "traceability"],
                ["Cold-chain", "monitored routes"],
              ].map(([a, b]) => (
                <div key={a} className="pr-4">
                  <dt className="font-display text-[22px] leading-none text-bone">{a}</dt>
                  <dd className="mt-1.5 text-[12.5px] text-mute">{b}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex justify-center lg:justify-end">
            <MatchTicket />
          </div>
        </Container>
      </section>

      {/* ——— Principle ——— */}
      <section className="bg-ivory text-ink">
        <Container className="grid gap-8 py-16 md:grid-cols-[220px_1fr] md:py-20">
          <p className="eyebrow pt-3 text-gold-deep">Operating principle</p>
          <blockquote className="font-display text-[32px] leading-[1.15] tracking-[-0.01em] sm:text-[44px]">
            Technology coordinates the pharmaceutical supply chain.{" "}
            <span className="italic text-gold-deep">Licensed professionals remain responsible</span> for every
            regulated decision.
          </blockquote>
        </Container>
      </section>

      {/* ——— Problem ——— */}
      <section className="border-b border-line-soft">
        <Container className="py-24 md:py-32">
          <SectionLabel index="01">The imbalance</SectionLabel>
          <div className="mt-10 grid gap-14 lg:grid-cols-[1.1fr_1fr]">
            <h2 className="font-display text-[40px] leading-[1.05] tracking-[-0.015em] text-ivory sm:text-[54px]">
              Medicine expires on one shelf while a patient waits across town.
            </h2>
            <div className="space-y-10">
              {[
                ["Stranded stock", "Pharmacies over-buy to meet minimum orders. Slow movers sit until they're written off — a direct loss to the business and the health system."],
                ["Invisible demand", "A hospital two districts away is short of the same product, but there is no shared view of who holds what, in which batch, expiring when."],
                ["An informal last mile", "Medicine often moves by ad-hoc dispatch — no custody record, no temperature control, and too much patient information in the wrong hands."],
              ].map(([t, b], i) => (
                <div key={t} className="grid grid-cols-[40px_1fr] gap-4">
                  <span className="font-mono text-[12px] text-gold">0{i + 1}</span>
                  <div>
                    <h3 className="text-[18px] font-medium text-bone">{t}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-stone">{b}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ——— How it works ——— */}
      <section className="border-b border-line-soft bg-coal">
        <Container className="py-24 md:py-32">
          <SectionLabel index="02">How it works</SectionLabel>
          <h2 className="mt-10 max-w-[22ch] font-display text-[40px] leading-[1.05] tracking-[-0.015em] text-ivory sm:text-[54px]">
            One network, three ways medicine moves.
          </h2>

          <div className="mt-16 grid border-t border-line md:grid-cols-3">
            {tracks.map((t, i) => (
              <div
                key={t.label}
                className={`flex flex-col pt-8 md:px-8 md:pb-2 ${i > 0 ? "border-t border-line md:border-l md:border-t-0" : "md:pl-0"} ${i === 2 ? "md:pr-0" : ""} pb-12`}
              >
                <p className="eyebrow text-gold">{t.label}</p>
                <h3 className="mt-4 font-display text-[26px] leading-tight text-ivory">{t.title}</h3>
                <ol className="mt-7 flex-1 space-y-3.5">
                  {t.steps.map((s, n) => (
                    <li key={s} className="grid grid-cols-[28px_1fr] text-[14.5px] text-stone">
                      <span className="pt-[3px] font-mono text-[11px] text-mute">{String(n + 1).padStart(2, "0")}</span>
                      {s}
                    </li>
                  ))}
                </ol>
                <Link href={t.href} className="mt-8 inline-flex items-center gap-1.5 text-[14px] text-gold hover:text-gold-soft">
                  {t.cta} <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ——— Chain ——— */}
      <section className="border-b border-line-soft">
        <Container className="py-24 md:py-32">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
            <div>
              <SectionLabel index="03">Where we sit</SectionLabel>
              <h2 className="mt-10 font-display text-[40px] leading-[1.05] tracking-[-0.015em] text-ivory sm:text-[54px]">
                Infrastructure, not another drug store.
              </h2>
            </div>
            <p className="max-w-[56ch] text-[16px] leading-relaxed text-stone">
              Pilbridge doesn&apos;t replace the licensed entities in the supply chain — it connects them. Pharmacies
              dispense. Distributors supply. Logistics partners carry. We provide the inventory visibility, matching,
              payments and audit trail that let them work as one system.
            </p>
          </div>

          <ol className="mt-16 grid grid-cols-2 gap-px bg-line-soft sm:grid-cols-4 lg:grid-cols-7">
            {chain.map((c, i) => (
              <li
                key={c.name}
                className={`relative flex min-h-[150px] flex-col justify-between p-5 ${c.core ? "bg-gold text-ink" : "bg-ink"}`}
              >
                <span className={`font-mono text-[11px] ${c.core ? "text-ink/60" : "text-mute"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className={`font-display text-[21px] leading-tight ${c.core ? "text-ink" : "text-bone"}`}>{c.name}</p>
                  <p className={`mt-1 text-[12px] ${c.core ? "text-ink/70" : "text-mute"}`}>{c.note}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 font-mono text-[11px] text-mute">
            Every hand-off is recorded: who held the product, which batch, at what temperature, and when.
          </p>
        </Container>
      </section>

      {/* ——— Safeguards ——— */}
      <section className="bg-ivory text-ink">
        <Container className="py-24 md:py-32">
          <SectionLabel index="04" tone="light">Safeguards</SectionLabel>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
            <h2 className="font-display text-[40px] leading-[1.05] tracking-[-0.015em] sm:text-[54px]">
              Built the way a pharmacist would build it.
            </h2>
            <p className="max-w-[54ch] text-[16px] leading-relaxed text-[#4d483f]">
              Medicine isn&apos;t ordinary e-commerce. These controls are part of the platform, not a policy page —
              they decide what can be listed, matched, sold and moved.
            </p>
          </div>

          <div className="mt-16 grid gap-px bg-parchment sm:grid-cols-2 lg:grid-cols-3">
            {safeguards.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-ivory p-8">
                <Icon className="h-6 w-6 text-gold-deep" strokeWidth={1.5} />
                <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.005em]">{title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-[#5a554b]">{body}</p>
              </div>
            ))}
          </div>

          <Link href="/trust" className="mt-10 inline-flex items-center gap-1.5 text-[14px] font-medium text-gold-deep hover:text-ink">
            Read our compliance framework <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </Container>
      </section>

      {/* ——— Audiences ——— */}
      <section className="border-b border-line-soft">
        <Container className="py-24 md:py-32">
          <SectionLabel index="05">Who it&apos;s for</SectionLabel>
          <ul className="mt-12 border-t border-line">
            {audiences.map((a) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="group grid items-center gap-3 border-b border-line py-8 transition-colors hover:bg-coal md:grid-cols-[1fr_1.3fr_auto] md:gap-10 md:px-4"
                >
                  <span className="font-display text-[34px] leading-none text-ivory transition-colors group-hover:text-gold sm:text-[44px]">
                    {a.who}
                  </span>
                  <span className="max-w-[52ch] text-[15px] leading-relaxed text-stone">{a.line}</span>
                  <ArrowUpRight className="hidden h-6 w-6 text-mute transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold md:block" strokeWidth={1.25} />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ——— CTA ——— */}
      <section className="grain relative overflow-hidden">
        <Container className="relative py-24 md:py-32">
          <div className="grid gap-12 border border-gold/30 bg-gold-wash p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:p-16">
            <div>
              <Eyebrow>Lagos founding cohort</Eyebrow>
              <h2 className="mt-6 font-display text-[40px] leading-[1.05] tracking-[-0.015em] text-ivory sm:text-[56px]">
                We&apos;re onboarding our first partner pharmacies and logistics fleets.
              </h2>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <ButtonLink href="/pharmacies#apply" arrow className="w-full sm:w-auto">Apply as a pharmacy</ButtonLink>
              <ButtonLink href="/logistics#apply" variant="outline" className="w-full sm:w-auto">Partner as a logistics provider</ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
