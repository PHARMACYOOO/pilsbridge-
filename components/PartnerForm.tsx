"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Field = { name: string; label: string; type?: string; placeholder?: string; half?: boolean; options?: string[] };

const fieldSets: Record<string, Field[]> = {
  pharmacy: [
    { name: "business", label: "Registered business name", placeholder: "As shown on CAC certificate" },
    { name: "cac", label: "CAC registration no.", placeholder: "RC / BN number", half: true },
    { name: "premises", label: "PCN premises licence no.", placeholder: "Current licence", half: true },
    { name: "superintendent", label: "Superintendent pharmacist", placeholder: "Full name", half: true },
    { name: "pcn", label: "Pharmacist registration no.", placeholder: "PCN registration", half: true },
    { name: "address", label: "Premises address", placeholder: "Street, area, LGA" },
    { name: "email", label: "Work email", type: "email", half: true },
    { name: "phone", label: "Phone", type: "tel", placeholder: "+234", half: true },
    { name: "interest", label: "Primary interest", options: ["Home delivery orders", "Redistributing surplus stock", "Inventory & expiry tools", "All of the above"] },
  ],
  hospital: [
    { name: "facility", label: "Facility name" },
    { name: "type", label: "Facility type", options: ["Private hospital", "Specialist clinic", "Diagnostic centre", "Public facility", "NGO / programme"], half: true },
    { name: "beds", label: "Approx. beds", placeholder: "e.g. 60", half: true },
    { name: "contact", label: "Your name", half: true },
    { name: "role", label: "Your role", options: ["Hospital administrator", "Procurement officer", "Pharmacist", "Store manager", "Finance officer"], half: true },
    { name: "email", label: "Work email", type: "email", half: true },
    { name: "phone", label: "Phone", type: "tel", placeholder: "+234", half: true },
    { name: "needs", label: "What should we know about your procurement?", placeholder: "Volumes, recurring shortages, cold-chain needs…" },
  ],
  logistics: [
    { name: "company", label: "Company name" },
    { name: "cac", label: "CAC registration no.", half: true },
    { name: "fleet", label: "Active riders / vehicles", placeholder: "e.g. 40 bikes, 6 vans", half: true },
    { name: "coverage", label: "Coverage areas", placeholder: "e.g. Mainland, Lekki–Ajah, Ikeja" },
    { name: "cold", label: "Cold-chain capability", options: ["Validated cold boxes with loggers", "Refrigerated vehicles", "Not yet — ambient only"], half: true },
    { name: "tracking", label: "Live GPS tracking", options: ["Yes, via API", "Yes, app only", "No"], half: true },
    { name: "email", label: "Work email", type: "email", half: true },
    { name: "phone", label: "Phone", type: "tel", placeholder: "+234", half: true },
  ],
};

/** Which answers are the organisation and the contact person; the rest are sent as details. */
const ORGANISATION = ["business", "facility", "company"];
const CONTACT = ["contact", "superintendent"];

export default function PartnerForm({ kind }: { kind: "pharmacy" | "hospital" | "logistics" }) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = fieldSets[kind];

  async function submit(form: HTMLFormElement) {
    const answers = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
    const pick = (keys: string[]) => keys.map((k) => answers[k]).find(Boolean);
    const details = Object.fromEntries(Object.entries(answers).filter(([k, v]) => v && !["email", "phone", ...ORGANISATION].includes(k)));
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ code: string }>("/partners/applications", {
        method: "POST",
        auth: false,
        body: { kind: kind.toUpperCase(), organisation: pick(ORGANISATION), contactName: pick(CONTACT), email: answers.email, phone: answers.phone, details },
      });
      setSent(res.code);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn’t send your application — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="border border-gold/30 bg-gold-wash p-10">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold text-gold">
          <Check className="h-5 w-5" />
        </span>
        <p className="mt-6 font-display text-[30px] leading-tight text-ivory">Application received.</p>
        <p className="mt-3 max-w-[46ch] text-[14.5px] leading-relaxed text-stone">
          A member of our partnerships team will contact you within two working days with the document checklist and
          next steps for verification. Your reference is <span className="font-mono text-bone">{sent}</span>.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="grid grid-cols-2 gap-x-5 gap-y-6 border border-line bg-coal p-6 sm:p-8"
    >
      {fields.map((f) => (
        <label key={f.name} className={`flex flex-col gap-2 ${f.half ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">{f.label}</span>
          {f.options ? (
            <select
              required
              name={f.name}
              defaultValue=""
              className="h-11 border-b border-line bg-transparent text-[15px] text-bone focus:border-gold focus:outline-none"
            >
              <option value="" disabled className="bg-coal">Select…</option>
              {f.options.map((o) => (
                <option key={o} className="bg-coal">{o}</option>
              ))}
            </select>
          ) : (
            <input
              required
              name={f.name}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              className="h-11 border-b border-line bg-transparent text-[15px] text-bone placeholder:text-mute/70 focus:border-gold focus:outline-none"
            />
          )}
        </label>
      ))}
      <div className="col-span-2 mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[44ch] text-[12px] leading-relaxed text-mute">
          We verify every credential with the issuing body before activation. Submitting this form doesn&apos;t create an
          account.
          {error && <span className="mt-2 block text-alert" role="alert">{error}</span>}
        </p>
        <button disabled={busy} className="rounded-[3px] bg-gold px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-gold-soft disabled:opacity-50">
          {busy ? "Sending…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}
