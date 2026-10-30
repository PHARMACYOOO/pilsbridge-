import type { Metadata } from "next";
import { ArrowRightLeft, Boxes, ClipboardCheck, Truck } from "lucide-react";
import PartnerForm from "@/components/PartnerForm";
import { Badge, ButtonLink, Container, PageHero, SectionLabel, type BadgeTone } from "@/components/ui";

export const metadata: Metadata = { title: "For pharmacies" };

const benefits = [
  { icon: ArrowRightLeft, title: "Redistribute surplus", body: "List eligible slow-moving stock to verified pharmacies and facilities that need it — before it becomes a write-off." },
  { icon: Truck, title: "Delivery without a dispatch team", body: "Receive home-delivery orders from nearby patients. Our logistics partners collect sealed parcels from your counter." },
  { icon: Boxes, title: "FEFO inventory", body: "Batch and expiry on every line. Pick lists sorted first-expiry-first-out, with alerts weeks before stock goes short-dated." },
  { icon: ClipboardCheck, title: "A real pharmacist workflow", body: "Prescription queue, intervention notes, rejection reasons and a full audit trail — designed around your professional judgement." },
];

const expiry: { product: string; batch: string; exp: string; onHand: number; demand: string; risk: [BadgeTone, string]; action: string }[] = [
  { product: "Amoxicillin 500 mg caps", batch: "AMX-2309-114", exp: "Mar 2027", onHand: 140, demand: "12 / mo", risk: ["warn", "Surplus"], action: "Matched · 1 offer" },
  { product: "Ceftriaxone 1 g inj.", batch: "CFX-2401-022", exp: "Jan 2027", onHand: 36, demand: "3 / mo", risk: ["alert", "High"], action: "List for transfer" },
  { product: "Metformin 500 mg tabs", batch: "MTF-2405-310", exp: "Aug 2027", onHand: 220, demand: "64 / mo", risk: ["ok", "Healthy"], action: "—" },
  { product: "Salbutamol 100 mcg MDI", batch: "SLB-2312-077", exp: "Dec 2026", onHand: 18, demand: "2 / mo", risk: ["alert", "High"], action: "List for transfer" },
  { product: "Insulin glargine pen", batch: "IGL-2406-019", exp: "Jun 2027", onHand: 12, demand: "9 / mo", risk: ["ok", "Healthy"], action: "—" },
];

const onboarding = [
  ["Apply", "Tell us about your premises and superintendent pharmacist. Ten minutes."],
  ["Documents", "CAC certificate, current PCN premises licence, pharmacist registration and bank details for settlement."],
  ["Verification", "We confirm each credential with the issuing body and may visit the premises. Typical turnaround: one to two weeks."],
  ["Go live", "Import your inventory, set delivery hours and coverage, and start receiving orders and transfer offers."],
];

export default function PharmaciesPage() {
  return (
    <>
      <PageHero
        eyebrow="For pharmacies"
        title={<>Your shelves, connected to the <em className="text-gold">city&apos;s demand.</em></>}
        lede="Pilbridge gives licensed community pharmacies a second channel for every unit on the shelf — delivery orders from nearby patients, and transfer offers from facilities that need what you hold."
      >
        <ButtonLink href="#apply" arrow>Apply to join</ButtonLink>
        <ButtonLink href="/portal" variant="outline">Preview the pharmacy portal</ButtonLink>
      </PageHero>

      <section className="border-b border-line-soft">
        <Container className="grid gap-px bg-line-soft py-0 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-ink px-0 py-12 sm:px-8 lg:first:pl-0">
              <Icon className="h-6 w-6 text-gold" strokeWidth={1.5} />
              <h3 className="mt-6 text-[17px] font-medium text-bone">{title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-stone">{body}</p>
            </div>
          ))}
        </Container>
      </section>

      <section className="border-b border-line-soft bg-coal">
        <Container className="py-24 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <SectionLabel index="01">Expiry intelligence</SectionLabel>
              <h2 className="mt-8 font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
                See risk while there&apos;s still time to act on it.
              </h2>
              <p className="mt-6 max-w-[44ch] text-[15.5px] leading-relaxed text-stone">
                We compare each batch&apos;s expiry against your actual rate of sale. When you hold more than you can sell
                in time, the stock is flagged — and, where the product is eligible, offered to the network for a
                pharmacist-approved transfer.
              </p>
              <p className="mt-5 max-w-[44ch] text-[13px] leading-relaxed text-mute">
                Expired, damaged, recalled, controlled or cold-chain-compromised stock can never be listed.
              </p>
            </div>

            <div className="overflow-x-auto border border-line bg-ink">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <span className="font-mono text-[11px] tracking-[0.08em] text-stone">EXPIRY RISK · NEXT 6 MONTHS</span>
                <span className="font-mono text-[11px] text-mute">Sample data</span>
              </div>
              <table className="w-full min-w-[620px] text-left text-[13px]">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                    <th className="px-5 py-3 font-normal">Product · batch</th>
                    <th className="px-3 py-3 font-normal">Expiry</th>
                    <th className="px-3 py-3 text-right font-normal">On hand</th>
                    <th className="px-3 py-3 text-right font-normal">Sells</th>
                    <th className="px-3 py-3 font-normal">Risk</th>
                    <th className="px-5 py-3 text-right font-normal">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expiry.map((r) => (
                    <tr key={r.batch} className="border-t border-line-soft">
                      <td className="px-5 py-3.5">
                        <p className="text-bone">{r.product}</p>
                        <p className="font-mono text-[10.5px] text-mute">{r.batch}</p>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-[12px] text-stone">{r.exp}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-[12px] text-bone">{r.onHand}</td>
                      <td className="px-3 py-3.5 text-right font-mono text-[12px] text-stone">{r.demand}</td>
                      <td className="px-3 py-3.5"><Badge tone={r.risk[0]}>{r.risk[1]}</Badge></td>
                      <td className={`px-5 py-3.5 text-right text-[12.5px] ${r.action === "—" ? "text-mute" : "text-gold"}`}>{r.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-line-soft">
        <Container className="py-24 md:py-28">
          <SectionLabel index="02">Onboarding</SectionLabel>
          <h2 className="mt-8 max-w-[20ch] font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
            Verified before you&apos;re visible.
          </h2>
          <ol className="mt-14 grid gap-px bg-line-soft md:grid-cols-4">
            {onboarding.map(([t, b], i) => (
              <li key={t} className="bg-ink py-8 md:px-7 md:first:pl-0">
                <span className="font-display text-[56px] leading-none text-gold/80">{i + 1}</span>
                <h3 className="mt-5 text-[17px] font-medium text-bone">{t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-stone">{b}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-[70ch] text-[13px] leading-relaxed text-mute">
            Licences are tracked continuously. We remind you ahead of each renewal, and listings pause automatically if a
            licence lapses — protecting you and your patients.
          </p>
        </Container>
      </section>

      <section id="apply" className="scroll-mt-28">
        <Container className="grid gap-12 py-24 md:py-28 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionLabel index="03">Apply</SectionLabel>
            <h2 className="mt-8 font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
              Join the founding Lagos cohort.
            </h2>
            <p className="mt-6 max-w-[42ch] text-[15.5px] leading-relaxed text-stone">
              We&apos;re starting with a small group of community pharmacies across the Mainland and Lekki corridor, so
              every partner gets hands-on onboarding.
            </p>
          </div>
          <PartnerForm kind="pharmacy" />
        </Container>
      </section>
    </>
  );
}
