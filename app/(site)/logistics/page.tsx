import type { Metadata } from "next";
import { Lock, PackageCheck, Route, ScanLine, ThermometerSnowflake, Undo2 } from "lucide-react";
import PartnerForm from "@/components/PartnerForm";
import TempChart from "@/components/TempChart";
import { Badge, ButtonLink, Container, PageHero, SectionLabel } from "@/components/ui";

export const metadata: Metadata = { title: "Logistics partners" };

const scope = [
  { icon: Route, title: "Pickup & last-mile", body: "Scheduled and on-demand jobs from partner pharmacies to patients, and between facilities." },
  { icon: ScanLine, title: "Proof of custody", body: "Scan at pickup, scan at hand-over, one-time code from the recipient. No code, no completed delivery." },
  { icon: ThermometerSnowflake, title: "Cold-chain routes", body: "For equipped partners only: validated packaging, continuous logging and time-limited delivery windows." },
  { icon: Undo2, title: "Reverse logistics", body: "Failed deliveries, returns and recalls brought back to the pharmacy — quarantined, never re-dispatched by default." },
];

const excursion = [
  ["Detect", "Logger reports a reading outside the product's range. Rider, dispatch and the dispensing pharmacy are alerted."],
  ["Quarantine", "The shipment is flagged non-saleable. The recipient is told not to accept it as normal stock."],
  ["Assess", "A pharmacist reviews the full temperature log against the product's stability guidance."],
  ["Decide", "Only that pharmacist can release, return or destroy the product. Every step is written to the audit trail."],
];

export default function LogisticsPage() {
  return (
    <>
      <PageHero
        eyebrow="For logistics partners"
        title={<>Carry medicine with <em className="text-gold">a clear chain of custody.</em></>}
        lede="We partner with established, vetted delivery companies rather than building our own fleet. You bring riders, vehicles and tracking; we bring steady pharmaceutical volume, well-specified jobs and clean hand-over rules."
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="#apply" arrow>Become a partner</ButtonLink>
          <ButtonLink href="/rider" variant="ghost">Open the rider app</ButtonLink>
        </div>
      </PageHero>

      <section className="border-b border-line-soft">
        <Container className="grid gap-px bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
          {scope.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-ink py-12 sm:px-8 lg:first:pl-0">
              <Icon className="h-6 w-6 text-gold" strokeWidth={1.5} />
              <h3 className="mt-6 text-[17px] font-medium text-bone">{title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-stone">{body}</p>
            </div>
          ))}
        </Container>
      </section>

      <section className="border-b border-line-soft bg-coal">
        <Container className="py-24 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <SectionLabel index="01">Cold chain</SectionLabel>
              <h2 className="mt-8 font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
                An excursion is a quality event, not a delay.
              </h2>
              <ol className="mt-10 space-y-6">
                {excursion.map(([t, b], i) => (
                  <li key={t} className="grid grid-cols-[34px_1fr]">
                    <span className="font-mono text-[11px] text-gold">0{i + 1}</span>
                    <div>
                      <p className="text-[15.5px] font-medium text-bone">{t}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-stone">{b}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="self-start border border-line bg-ink">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
                <span className="font-mono text-[11px] tracking-[0.08em] text-stone">SHIPMENT CC-0412 · INSULIN GLARGINE × 12</span>
                <Badge tone="alert">Quarantined</Badge>
              </div>
              <div className="px-3 pb-2 pt-4 sm:px-5">
                <p className="mb-2 px-2 font-mono text-[10.5px] text-mute sm:px-0">Product temperature, °C · required 2–8 °C</p>
                <TempChart />
              </div>
              <dl className="grid grid-cols-2 border-t border-line text-[12.5px] sm:grid-cols-4">
                {[
                  ["Peak", "8.9 °C", "text-alert"],
                  ["Above range", "~25 min", "text-alert"],
                  ["Logger", "TL-0937", "text-bone"],
                  ["Pharmacist", "Assessing", "text-warn"],
                ].map(([k, v, c]) => (
                  <div key={k} className="border-line-soft px-5 py-3.5 [&:not(:first-child)]:border-l">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">{k}</dt>
                    <dd className={`mt-1 ${c}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-ivory text-ink">
        <Container className="grid gap-10 py-20 md:grid-cols-[auto_1fr] md:items-center md:py-24">
          <Lock className="h-10 w-10 text-gold-deep" strokeWidth={1.25} />
          <div>
            <h2 className="font-display text-[34px] leading-[1.1] sm:text-[42px]">Riders see a parcel, not a patient.</h2>
            <p className="mt-4 max-w-[72ch] text-[15.5px] leading-relaxed text-[#4d483f]">
              Your team receives a sealed, tamper-evident parcel, a pickup point, a drop-off address and handling
              instructions. Prescriptions, diagnoses and product names stay with the pharmacy.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-line-soft">
        <Container className="py-24 md:py-28">
          <SectionLabel index="02">What we ask of partners</SectionLabel>
          <div className="mt-12 grid gap-x-12 gap-y-5 md:grid-cols-2">
            {[
              "Registered company with verifiable business records",
              "Identity-verified riders and drivers, with background checks",
              "Live GPS tracking, ideally exposed through an API",
              "Proof of delivery: scan, one-time code and timestamp",
              "Defined process for failed deliveries and returns",
              "For cold chain: validated boxes or vehicles and calibrated loggers",
              "Goods-in-transit insurance appropriate to pharmaceutical value",
              "Incident reporting within agreed service levels",
            ].map((r) => (
              <p key={r} className="flex items-start gap-3 border-b border-line-soft pb-5 text-[15px] text-stone">
                <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
                {r}
              </p>
            ))}
          </div>
        </Container>
      </section>

      <section id="apply" className="scroll-mt-28">
        <Container className="grid gap-12 py-24 md:py-28 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionLabel index="03">Partner with us</SectionLabel>
            <h2 className="mt-8 font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
              Tell us about your fleet.
            </h2>
            <p className="mt-6 max-w-[42ch] text-[15.5px] leading-relaxed text-stone">
              We&apos;re selecting a small number of logistics partners for the Lagos pilot, including at least one with
              cold-chain capability.
            </p>
          </div>
          <PartnerForm kind="logistics" />
        </Container>
      </section>
    </>
  );
}
