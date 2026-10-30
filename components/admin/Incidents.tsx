"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Badge } from "@/components/ui";
import { api, ApiError, incidentLabel, type IncidentType } from "@/lib/api";
import { clock } from "@/lib/delivery";
import { primary, textarea, useList } from "./shared";

type Incident = {
  id: string;
  code: string;
  type: IncidentType;
  description: string;
  reporterRole: string;
  status: "OPEN" | "RESOLVED";
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  order: { code: string; status: string; pharmacy: { name: string } };
  delivery: { code: string; provider: string; courier: { name: string } | null } | null;
};

const CRITICAL: IncidentType[] = ["TAMPERED", "LOST", "TEMPERATURE_EXCURSION"];
const who: Record<string, string> = { PATIENT: "Customer", PHARMACIST: "Pharmacist", PHARMACY_STAFF: "Pharmacy staff", RIDER: "Rider", PLATFORM_ADMIN: "Operations" };
const when = (iso: string) => `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${clock(iso)}`;

/** Parcel incidents from riders, pharmacies and customers, with how each was resolved. */
export default function Incidents() {
  const [show, setShow] = useState<"OPEN" | "">("OPEN");
  const { items, error, setError, load } = useList<Incident>(`/admin/incidents${show ? `?status=${show}` : ""}`);
  const [resolving, setResolving] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-[13px]">
          {(
            [
              ["OPEN", "Open"],
              ["", "All"],
            ] as const
          ).map(([v, l]) => (
            <button key={l} onClick={() => setShow(v)} className={`rounded-[3px] border px-3 py-1.5 ${show === v ? "border-gold text-gold-soft" : "border-line text-stone"}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh"><RotateCw className="h-3.5 w-3.5" /></button>
      </div>
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
      <div className="mt-4 space-y-2">
        {items?.length === 0 && <p className="border border-line bg-coal px-5 py-10 text-center text-[14px] text-ok">No open incidents.</p>}
        {items?.map((i) => (
          <div key={i.id} className={`border bg-coal p-4 ${i.status === "OPEN" && CRITICAL.includes(i.type) ? "border-alert/50" : "border-line"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] text-bone">
                  <span className="font-mono text-[12px] text-mute">{i.code}</span> {incidentLabel[i.type]}
                  {CRITICAL.includes(i.type) && <Badge tone="alert">Critical</Badge>}
                  {i.status === "RESOLVED" && <Badge tone="ok">Resolved</Badge>}
                </p>
                <p className="mt-1 text-[13px] text-stone">{i.description}</p>
                <p className="mt-1 font-mono text-[11.5px] text-mute">
                  Order {i.order.code} · {i.order.pharmacy.name}
                  {i.delivery && ` · seal ${i.delivery.code}${i.delivery.courier ? ` · ${i.delivery.courier.name}` : ""}`} · {who[i.reporterRole] ?? i.reporterRole}, {when(i.createdAt)}
                </p>
                {i.resolution && <p className="mt-2 text-[13px] text-ok">Resolution: {i.resolution}</p>}
              </div>
              {i.status === "OPEN" && resolving !== i.id && (
                <button onClick={() => { setResolving(i.id); setText(""); }} className={primary}>Resolve</button>
              )}
            </div>
            {resolving === i.id && (
              <form
                className="mt-3 space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError(null);
                  try {
                    await api(`/admin/incidents/${i.id}/resolve`, { method: "POST", body: { resolution: text.trim() } });
                    setResolving(null);
                    await load();
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Couldn’t save — try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="What was done: pharmacist inspection, stock decision, refund or redelivery…" className={textarea} />
                <div className="flex gap-2">
                  <button disabled={busy || text.trim().length < 5} className={primary}>Save resolution</button>
                  <button type="button" onClick={() => setResolving(null)} className="px-3 text-[13px] text-mute hover:text-bone">Cancel</button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
