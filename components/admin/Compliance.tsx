"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { api, apiBlobUrl, type ApiDocument } from "@/lib/api";
import { danger, field, ghost, primary, shortDate, useAct, useList } from "./shared";

type PendingDoc = ApiDocument & { pharmacy: { id: string; name: string; area: string } };

/** Licences and certificates waiting to be checked against the issuing body. */
export default function Compliance() {
  const { items, error, setError, load } = useList<PendingDoc>("/admin/compliance/documents");
  const { busy, notice, act } = useAct(setError, load);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<string | null>(null);

  const review = (d: PendingDoc, decision: "VERIFY" | "REJECT") =>
    act(`${decision}-${d.id}`, () =>
      api(`/admin/compliance/documents/${d.id}/review`, {
        method: "POST",
        body: { decision, ...(notes[d.id]?.trim() ? { note: notes[d.id].trim() } : {}), ...(expiry[d.id] ? { expiresAt: expiry[d.id] } : {}) },
      }), `${d.label} for ${d.pharmacy.name} ${decision === "VERIFY" ? "verified" : "rejected"}`);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-[13.5px] text-stone">
          Check each document with the issuing body (e.g. the PCN register) before verifying. A verified premises licence becomes the pharmacy&apos;s
          licence of record. Pharmacies are suspended automatically when their licence lapses.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh"><RotateCw className="h-3.5 w-3.5" /></button>
          <button
            disabled={!!busy}
            onClick={() =>
              act("check", async () => {
                const r = await api<{ suspended: string[]; reminded: string[] }>("/admin/compliance/check", { method: "POST" });
                setCheck(`${r.suspended.length} suspended${r.suspended.length ? ` (${r.suspended.join(", ")})` : ""} · ${r.reminded.length} reminder${r.reminded.length === 1 ? "" : "s"} sent`);
              })
            }
            className={ghost}
          >
            Run licence check now
          </button>
        </div>
      </div>
      {check && <p className="mt-3 text-[13px] text-stone">{check}</p>}
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
      {notice && <p className="mt-3 text-[13px] text-ok">{notice}</p>}
      <div className="mt-4 space-y-2">
        {items === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
        {items?.length === 0 && <p className="text-[13px] text-mute">Nothing waiting for review.</p>}
        {items?.map((d) => (
          <div key={d.id} className="grid gap-3 border border-line bg-coal p-4 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div className="min-w-0">
              <p className="text-[14.5px] text-bone">{d.label} · {d.pharmacy.name}</p>
              <p className="mt-1 font-mono text-[11.5px] text-mute">
                {d.reference} · {d.issuer} · expires {shortDate(d.expiresAt)} · uploaded {shortDate(d.createdAt)}
              </p>
              <button
                onClick={async () => {
                  try {
                    const url = await apiBlobUrl(`/admin/compliance/documents/${d.id}/file`);
                    window.open(url, "_blank", "noopener");
                    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  } catch {
                    setError("Couldn’t open the document.");
                  }
                }}
                className="mt-1 font-mono text-[11px] text-gold hover:text-gold-soft"
              >
                Open file{d.fileName ? ` · ${d.fileName}` : ""}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
              <input value={notes[d.id] ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} placeholder="What you checked / why it’s rejected" className={field} />
              <input type="date" value={expiry[d.id] ?? ""} onChange={(e) => setExpiry({ ...expiry, [d.id]: e.target.value })} className={`${field} [color-scheme:dark]`} aria-label="Corrected expiry date" title="Only if the expiry differs from what was entered" />
              <div className="flex gap-2 sm:col-span-2">
                <button disabled={!!busy} onClick={() => review(d, "VERIFY")} className={primary}>Verify</button>
                <button disabled={!!busy || !(notes[d.id] ?? "").trim()} onClick={() => review(d, "REJECT")} className={danger}>Reject</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
