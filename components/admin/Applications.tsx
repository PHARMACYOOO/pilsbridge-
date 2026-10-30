"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import { api } from "@/lib/api";
import { NewPharmacyForm } from "./Onboarding";
import { field, ghost, shortDate, useAct, useList } from "./shared";

type Application = {
  id: string;
  code: string;
  kind: "PHARMACY" | "HOSPITAL" | "LOGISTICS";
  organisation: string;
  contactName: string;
  email: string;
  phone: string;
  details: Record<string, string>;
  status: "NEW" | "CONTACTED" | "APPROVED" | "DECLINED";
  note: string | null;
  pharmacyId: string | null;
  createdAt: string;
};

const tone: Record<Application["status"], BadgeTone> = { NEW: "warn", CONTACTED: "neutral", APPROVED: "ok", DECLINED: "neutral" };

/** Applications from the website's partner forms. Nothing is activated until someone here acts on it. */
export default function Applications() {
  const { items, error, setError, load } = useList<Application>("/admin/applications");
  const { busy, notice, act } = useAct(setError, load);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<string | null>(null);

  const review = (a: Application, status: "CONTACTED" | "APPROVED" | "DECLINED") =>
    act(`${status}-${a.id}`, () => api(`/admin/applications/${a.id}/review`, { method: "POST", body: { status, ...(notes[a.id]?.trim() ? { note: notes[a.id].trim() } : {}) } }), `${a.code} marked ${status.toLowerCase()}`);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <p className="max-w-[70ch] text-[13.5px] text-stone">Call each applicant, check their credentials with the issuing body, then create the pharmacy (it starts pending verification) or decline.</p>
        <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh"><RotateCw className="h-3.5 w-3.5" /></button>
      </div>
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
      {notice && <p className="mt-3 text-[13px] text-ok">{notice}</p>}
      <div className="mt-4 space-y-2">
        {items === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
        {items?.length === 0 && <p className="text-[13px] text-mute">No applications yet.</p>}
        {items?.map((a) => {
          const open = a.status === "NEW" || a.status === "CONTACTED";
          return (
            <div key={a.id} className="border border-line bg-coal p-4">
              <p className="flex flex-wrap items-center gap-2 text-[14.5px] text-bone">
                {a.organisation}
                <Badge tone="neutral">{a.kind.toLowerCase()}</Badge>
                <Badge tone={tone[a.status]}>{a.status.toLowerCase()}</Badge>
              </p>
              <p className="mt-1 font-mono text-[11.5px] text-mute">
                {a.code} · {shortDate(a.createdAt)} · {a.contactName || "—"} · {a.email} · {a.phone}
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
                {Object.entries(a.details).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="shrink-0 font-mono text-[11px] uppercase text-mute">{k}</dt>
                    <dd className="text-stone">{v}</dd>
                  </div>
                ))}
              </dl>
              {a.note && <p className="mt-2 text-[12.5px] text-mute">Note: {a.note}</p>}
              {open && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} placeholder="Note (optional)" className={`${field} max-w-[320px]`} />
                  {a.status === "NEW" && <button disabled={!!busy} onClick={() => review(a, "CONTACTED")} className={ghost}>Contacted</button>}
                  {a.kind === "PHARMACY" ? (
                    <button disabled={!!busy} onClick={() => setCreating(creating === a.id ? null : a.id)} className={ghost}>{creating === a.id ? "Close" : "Create pharmacy"}</button>
                  ) : (
                    <button disabled={!!busy} onClick={() => review(a, "APPROVED")} className={ghost}>Approve</button>
                  )}
                  <button disabled={!!busy} onClick={() => review(a, "DECLINED")} className={ghost}>Decline</button>
                </div>
              )}
              {creating === a.id && (
                <div className="mt-4 max-w-[720px]">
                  <NewPharmacyForm
                    applicationId={a.id}
                    initial={{ name: a.organisation, address: a.details.address ?? "", premisesLicenceNo: a.details.premises ?? "", superintendentName: a.details.superintendent ?? "", email: a.email, phone: a.phone }}
                    onCreated={async () => {
                      setCreating(null);
                      await load();
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
