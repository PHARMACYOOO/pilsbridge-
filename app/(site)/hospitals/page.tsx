import type { Metadata } from "next";
import { Check, Clock, Siren } from "lucide-react";
import PartnerForm from "@/components/PartnerForm";
import { Badge, ButtonLink, Container, PageHero, SectionLabel } from "@/components/ui";

export const metadata: Metadata = { title: "For hospitals" };

const capabilities = [
  ["Procurement requests", "Raise routine or recurring requests against your formulary, with quantities, required-by dates and storage needs."],
  ["Verified quotations", "Receive quotations only from verified pharmacies and licensed distributors — with batch and expiry disclosed up front."],
  ["Emergency requests", "Flag a critical shortage and see eligible stock nearby, ranked by expiry, distance and delivery feasibility."],
  ["Your approval chain", "Route each request through procurement, pharmacy and finance the way your organisation already works."],
  ["Receiving & inventory", "Check deliveries against the PO at your store, record batches on receipt and track expiry from day one."],
  ["Reporting", "Spend by supplier, fill rate, lead time and short-dated exposure — exportable for audit and management review."],
];

const roles = ["Hospital administrator", "Procurement officer", "Pharmacist", "Doctor", "Store manager", "Finance officer"];

const lines = [
  { item: "Ceftriaxone 1 g injection", qty: 120, src: "Lagoon Pharma (distributor)", exp: "Feb 2028", price: "₦1,420" },
  { item: "Normal saline 0.9% 500 ml", qty: 300, src: "Northgate Medical", exp: "Nov 2027", price: "₦780" },
  { item: "Oxytocin 10 IU/ml injection", qty: 40, src: "Meridale Health · 2–8 °C", exp: "Apr 2027", price: "₦950", cold: true },
];

const approvals = [
  { who: "Procurement officer", name: "K. Adebayo", state: "done", at: "09:12" },
  { who: "Pharmacist", name: "Pharm. T. Nwosu", state: "done", at: "09:40" },
  { who: "Finance officer", name: "F. Bello", state: "pending", at: "—" },
];

export default function HospitalsPage() {
  return (
    <>
      <PageHero
        eyebrow="For hospitals & clinics"
        title={<>Procurement that sees <em className="text-gold">the whole city.</em></>}
        lede="Request, compare, approve and receive pharmaceutical supplies from verified sources — and when a shortage is urgent, find eligible stock within reach in minutes, not phone calls."
      >
        <ButtonLink href="#apply" arrow>Request a walkthrough</ButtonLink>
      </PageHero>

      <section className="border-b border-line-soft">
        <Container className="grid gap-14 py-24 md:py-28 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <SectionLabel index="01">Purchase request</SectionLabel>
            <h2 className="mt-8 font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
              Every line sourced, every approval recorded.
            </h2>
            <p className="mt-6 max-w-[44ch] text-[15.5px] leading-relaxed text-stone">
              Role-based access means a doctor can request, a pharmacist can verify suitability, and only finance can
              commit spend. Each action is time-stamped in an audit log your team can export.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {roles.map((r) => (
                <li key={r} className="border border-line px-3 py-1.5 text-[12.5px] text-stone">{r}</li>
              ))}
            </ul>
          </div>

          <div className="border border-line bg-coal">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
              <span className="font-mono text-[11px] tracking-[0.08em] text-stone">PR-0932 · HARBOUR CLINIC, LEKKI</span>
              <Badge tone="warn">Awaiting finance</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-[13px]">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                    <th className="px-5 py-3 font-normal">Item · source</th>
                    <th className="px-3 py-3 text-right font-normal">Qty</th>
                    <th className="px-3 py-3 font-normal">Expiry</th>
                    <th className="px-5 py-3 text-right font-normal">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.item} className="border-t border-line-soft">
                      <td className="px-5 py-3.5">
                        <p className="text-bone">{l.item}</p>
                        <p className={`font-mono text-[10.5px] ${l.cold ? "text-cold" : "text-mute"}`}>{l.src}</p>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-[12px] text-bone">{l.qty}</td>
                      <td className="px-3 py-3.5 font-mono text-[12px] text-stone">{l.exp}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-[12px] text-bone">{l.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-5 py-5">
              <p className="eyebrow text-mute">Approval chain</p>
              <ol className="mt-4 space-y-3">
                {approvals.map((a) => (
                  <li key={a.who} className="flex items-center justify-between gap-4 text-[13px]">
                    <span className="flex items-center gap-2.5">
                      {a.state === "done" ? (
                        <Check className="h-3.5 w-3.5 text-ok" strokeWidth={2.25} />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-warn" />
                      )}
                      <span className="text-bone">{a.who}</span>
                      <span className="text-mute">{a.name}</span>
                    </span>
                    <span className="font-mono text-[11px] text-mute">{a.at}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-line-soft bg-coal">
        <Container className="py-24 md:py-28">
          <SectionLabel index="02">Capabilities</SectionLabel>
          <div className="mt-12 grid gap-px bg-line-soft sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(([t, b], i) => (
              <div key={t} className="bg-coal py-8 sm:px-7">
                <span className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 text-[17px] font-medium text-bone">{t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-stone">{b}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-ivory text-ink">
        <Container className="grid gap-10 py-20 md:grid-cols-[auto_1fr] md:items-center md:py-24">
          <Siren className="h-10 w-10 text-gold-deep" strokeWidth={1.25} />
          <div>
            <h2 className="font-display text-[34px] leading-[1.1] sm:text-[42px]">
              Emergency requests never skip the pharmacist.
            </h2>
            <p className="mt-4 max-w-[70ch] text-[15.5px] leading-relaxed text-[#4d483f]">
              Urgency raises priority in matching and logistics — it never bypasses eligibility checks, batch verification
              or professional sign-off. Speed and safety are designed to work together.
            </p>
          </div>
        </Container>
      </section>

      <section id="apply" className="scroll-mt-28">
        <Container className="grid gap-12 py-24 md:py-28 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionLabel index="03">Talk to us</SectionLabel>
            <h2 className="mt-8 font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
              Bring your facility onto the network.
            </h2>
            <p className="mt-6 max-w-[42ch] text-[15.5px] leading-relaxed text-stone">
              We&apos;ll walk your procurement and pharmacy teams through the portal and agree a pilot scope with you.
            </p>
          </div>
          <PartnerForm kind="hospital" />
        </Container>
      </section>
    </>
  );
}
