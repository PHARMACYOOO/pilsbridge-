import type { Metadata } from "next";
import { Ban } from "lucide-react";
import { Badge, Container, PageHero, SectionLabel, type BadgeTone } from "@/components/ui";

export const metadata: Metadata = { title: "Trust & compliance" };

const classes: { tone: BadgeTone; label: string; name: string; rule: string }[] = [
  { tone: "otc", label: "OTC", name: "Over-the-counter medicines", rule: "Supplied by a licensed partner pharmacy. Quantity limits apply, and a pharmacist can intervene on any order." },
  { tone: "pom", label: "Rx", name: "Prescription-only medicines", rule: "Held until a registered pharmacist verifies a valid prescription. Payment is captured only after approval." },
  { tone: "cold", label: "2–8 °C", name: "Cold-chain products", rule: "Fulfilled only where the pharmacy and courier are equipped, with temperature logged from shelf to door." },
  { tone: "device", label: "Device", name: "Devices & consumables", rule: "Sourced from verified suppliers with traceable batch or serial information where available." },
  { tone: "alert", label: "Restricted", name: "Controlled medicines", rule: "Not offered on Pilbridge — not for sale, not for delivery and not for redistribution." },
];

const responsibilities = [
  ["Dispensing & prescription verification", "Licensed partner pharmacy", "Registered pharmacist"],
  ["Product quality & storage", "Licensed pharmacy / distributor", "Superintendent pharmacist"],
  ["Transfer approval (redistribution)", "Sending & receiving facilities", "Authorised pharmacist"],
  ["Transport & proof of delivery", "Logistics partner", "Logistics partner"],
  ["Platform, matching, payments, audit trail", "Pilbridge", "Pilbridge"],
  ["Partner verification & monitoring", "Pilbridge", "Pilbridge compliance lead"],
];

const exclusions = [
  "Expired products",
  "Damaged or opened packs",
  "Suspected counterfeit or unregistered products",
  "Recalled batches",
  "Products whose cold chain has been broken",
  "Products that cannot lawfully be transferred",
  "Controlled medicines",
  "Stock without batch and expiry records",
];

export default function TrustPage() {
  return (
    <>
      <PageHero
        eyebrow="Trust & compliance"
        title={<>Technology coordinates. <em className="text-gold">Professionals decide.</em></>}
        lede="Pilbridge is a technology and logistics-coordination platform. We don't treat platform status as an exemption from pharmaceutical regulation — every regulated activity on the network is carried out by an appropriately licensed entity and professional."
      />

      <section className="border-b border-line-soft">
        <Container className="py-24 md:py-28">
          <SectionLabel index="01">Product classes</SectionLabel>
          <h2 className="mt-8 max-w-[22ch] font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
            Different medicines, different rules.
          </h2>
          <ul className="mt-12 border-t border-line">
            {classes.map((c) => (
              <li key={c.name} className="grid gap-3 border-b border-line py-7 md:grid-cols-[110px_1fr_1.6fr] md:items-baseline md:gap-8">
                <span><Badge tone={c.tone}>{c.label}</Badge></span>
                <span className="font-display text-[25px] leading-tight text-ivory">{c.name}</span>
                <span className="text-[15px] leading-relaxed text-stone">{c.rule}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-line-soft bg-coal">
        <Container className="py-24 md:py-28">
          <SectionLabel index="02">Who is responsible</SectionLabel>
          <h2 className="mt-8 max-w-[24ch] font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
            Clear accountability at every hand-off.
          </h2>
          <div className="mt-12 overflow-x-auto border border-line">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="bg-char font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">
                  <th className="px-6 py-4 font-normal">Activity</th>
                  <th className="px-6 py-4 font-normal">Performed by</th>
                  <th className="px-6 py-4 font-normal">Accountable</th>
                </tr>
              </thead>
              <tbody>
                {responsibilities.map(([a, r, acc]) => (
                  <tr key={a} className="border-t border-line-soft text-[14.5px]">
                    <td className="px-6 py-4 text-bone">{a}</td>
                    <td className="px-6 py-4 text-stone">{r}</td>
                    <td className={`px-6 py-4 ${acc.startsWith("Pilbridge") ? "text-gold" : "text-stone"}`}>{acc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section className="bg-ivory text-ink">
        <Container className="grid gap-12 py-24 md:py-28 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionLabel index="03" tone="light">Redistribution limits</SectionLabel>
            <h2 className="mt-8 font-display text-[40px] leading-[1.05] sm:text-[50px]">What can never be listed.</h2>
            <p className="mt-6 max-w-[42ch] text-[15.5px] leading-relaxed text-[#4d483f]">
              Eligibility checks run before a product is visible to the network, and again before any transfer is
              approved. Automated checks never replace the pharmacist&apos;s sign-off.
            </p>
          </div>
          <ul className="grid gap-px self-start bg-parchment sm:grid-cols-2">
            {exclusions.map((e) => (
              <li key={e} className="flex items-center gap-3 bg-ivory px-5 py-4 text-[14.5px]">
                <Ban className="h-4 w-4 shrink-0 text-[#a2482f]" strokeWidth={1.75} />
                {e}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section id="privacy" className="scroll-mt-28 border-b border-line-soft">
        <Container className="grid gap-12 py-24 md:py-28 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionLabel index="04">Privacy</SectionLabel>
            <h2 className="mt-8 font-display text-[40px] leading-[1.05] text-ivory sm:text-[50px]">
              Health data is kept apart.
            </h2>
          </div>
          <div className="space-y-8">
            {[
              ["Separated by design", "Prescriptions and health information are stored separately from commercial and delivery records, with access limited to the professionals who need it."],
              ["Minimum necessary", "Riders get an address and a parcel reference. Analytics run on de-identified data. We collect only what an order or a legal record requires."],
              ["Your rights", "We process personal data in line with the Nigeria Data Protection Act 2023. You can request access to, correction of, or deletion of your data where the law permits."],
              ["Encrypted & audited", "Data is encrypted in transit and at rest, and every access to a prescription is written to a tamper-evident audit log."],
            ].map(([t, b]) => (
              <div key={t} className="border-l border-gold/40 pl-6">
                <h3 className="text-[17px] font-medium text-bone">{t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-stone">{b}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section id="report" className="scroll-mt-28">
        <Container className="py-24 md:py-28">
          <div className="grid gap-10 border border-line p-8 sm:p-12 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <SectionLabel index="05">Report a concern</SectionLabel>
              <h2 className="mt-8 font-display text-[36px] leading-[1.08] text-ivory sm:text-[44px]">
                Suspect a counterfeit, a side effect or a problem with a delivery?
              </h2>
              <p className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-stone">
                Tell us straight away and keep the product and packaging. We&apos;ll quarantine the batch across the network
                while it&apos;s investigated, and help you report to NAFDAC where appropriate.
              </p>
            </div>
            <div className="space-y-3 lg:justify-self-end">
              <a href="mailto:safety@pilbridge.ng" className="block rounded-[3px] bg-gold px-6 py-3.5 text-center text-[14px] font-medium text-ink hover:bg-gold-soft">
                safety@pilbridge.ng
              </a>
              <p className="text-center font-mono text-[11px] text-mute">Monitored by our superintendent pharmacist</p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
