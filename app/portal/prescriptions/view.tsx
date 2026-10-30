"use client";

import { useEffect, useState } from "react";
import { CircleAlert, FileImage, Lock } from "lucide-react";
import { usePortal } from "@/components/portal/store";
import { Btn, PortalHeading, Tabs } from "@/components/portal/ui";
import { Badge, type BadgeTone } from "@/components/ui";
import { apiBlobUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Prescription, RxStatus } from "@/lib/portal-data";

const rxTone: Record<RxStatus, [BadgeTone, string]> = {
  pending: ["warn", "Awaiting review"],
  approved: ["ok", "Approved"],
  clarify: ["neutral", "Clarification sent"],
  rejected: ["alert", "Rejected"],
};

const rejectReasons = ["Prescriber details missing", "Prescription expired", "Illegible", "Suspected alteration", "Not suitable — contact prescriber"];

export default function PrescriptionsView() {
  const { prescriptions, reviewRx } = usePortal();
  const { user } = useAuth();
  const isPharmacist = user?.role === "PHARMACIST";
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setSelected(id);
  }, []);

  const list = prescriptions.filter((r) => (tab === "pending" ? r.status === "pending" || r.status === "clarify" : r.status === "approved" || r.status === "rejected"));
  const current = prescriptions.find((r) => r.id === selected) ?? list[0] ?? null;

  return (
    <>
      <PortalHeading eyebrow="Pharmacist" title="Prescriptions" />
      <p className="mt-3 max-w-[70ch] text-[13.5px] text-mute">
        Prescription-only orders stay on hold until you approve them. Your decision and any intervention notes are saved to
        the audit log.
      </p>

      <div className="mt-8">
        <Tabs
          value={tab}
          onChange={(v) => {
            setTab(v);
            setSelected(null);
          }}
          options={[
            { value: "pending", label: "Queue", count: prescriptions.filter((r) => r.status === "pending" || r.status === "clarify").length },
            { value: "done", label: "Reviewed", count: prescriptions.filter((r) => r.status === "approved" || r.status === "rejected").length },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[340px_1fr]">
        <ul className="border border-line bg-coal">
          {list.map((r) => (
            <li key={r.id} className="border-b border-line-soft last:border-b-0">
              <button
                onClick={() => setSelected(r.id)}
                className={`flex w-full items-start justify-between gap-3 border-l-2 px-5 py-4 text-left transition-colors ${current?.id === r.id ? "border-gold bg-gold-wash" : "border-transparent hover:bg-char"}`}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[11px] text-mute">{r.id} · {r.orderId}</span>
                  <span className="mt-1 block truncate text-[14px] text-bone">{r.lines.map((l) => l.drug.split(" ")[0]).join(", ")}</span>
                  <span className="block truncate text-[12px] text-mute">{r.patient}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={rxTone[r.status][0]}>{rxTone[r.status][1]}</Badge>
                  {r.status === "pending" && <span className="font-mono text-[10.5px] text-warn">{r.waiting}</span>}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-5 py-12 text-center text-[13.5px] text-mute">Queue clear. Nice work.</li>}
        </ul>

        {current ? (
          <Review
            key={current.id}
            rx={current}
            canDecide={isPharmacist}
            onDecide={(status, note) => reviewRx(current.id, status, note)}
          />
        ) : (
          <div className="flex min-h-[300px] items-center justify-center border border-dashed border-line text-[13.5px] text-mute">Select a prescription</div>
        )}
      </div>
    </>
  );
}

/** The original prescription image, fetched with the pharmacist's token. Counter staff can't open it. */
function RxImage({ code, allowed }: { code: string; allowed: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let objectUrl: string | null = null;
    let live = true;
    apiBlobUrl(`/pharmacy/prescriptions/${code}/image`)
      .then((u) => {
        objectUrl = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Image unavailable"));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [code, allowed]);

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block aspect-[3/4] overflow-hidden border border-line-soft bg-char" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Prescription ${code}`} className="h-full w-full object-contain" />
      </a>
    );
  }
  return (
    <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 border border-line-soft bg-char px-4 text-center text-mute">
      {allowed ? <FileImage className="h-7 w-7" strokeWidth={1.25} /> : <Lock className="h-6 w-6" strokeWidth={1.25} />}
      <span className="font-mono text-[10.5px]">{!allowed ? "Pharmacist access only" : error ?? "Loading image…"}</span>
    </div>
  );
}

function Review({ rx, canDecide, onDecide }: { rx: Prescription; canDecide: boolean; onDecide: (s: RxStatus, note: string | undefined) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const decide = async (s: RxStatus, note?: string) => {
    setBusy(true);
    await onDecide(s, note);
    setBusy(false);
  };
  const [mode, setMode] = useState<"idle" | "reject" | "clarify">("idle");
  const [reason, setReason] = useState(rejectReasons[0]);
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState([false, false, false]);
  const decided = rx.status === "approved" || rx.status === "rejected";
  const checklist = ["Prescriber details and date verified", "Dose and quantity appropriate", "No interaction or allergy concerns from available history"];

  return (
    <section className="border border-line bg-coal">
      <div className="grid gap-6 border-b border-line p-6 lg:grid-cols-[200px_1fr]">
        <RxImage code={rx.id} allowed={canDecide} />
        <div>
          <p className="font-mono text-[11px] text-mute">{rx.id} · for order {rx.orderId}</p>
          <p className="mt-2 font-display text-[28px] leading-none text-ivory">{rx.patient}</p>
          <dl className="mt-4 space-y-1.5 text-[13px]">
            <div className="flex gap-3"><dt className="w-20 text-mute">Prescriber</dt><dd className="text-bone">{rx.prescriber}</dd></div>
            <div className="flex gap-3"><dt className="w-20 text-mute">Issued</dt><dd className="text-bone">{rx.issued}</dd></div>
          </dl>
          {rx.flags.map((f) => (
            <p key={f} className="mt-3 flex items-start gap-2 border-l-2 border-warn bg-warn/10 px-3 py-2 text-[12.5px] text-bone">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" /> {f}
            </p>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-line-soft border-b border-line">
        {rx.lines.map((l) => (
          <li key={l.drug} className="grid gap-1 px-6 py-4 sm:grid-cols-[1.3fr_1.3fr_0.6fr] sm:items-center">
            <span className="text-[14px] text-bone">{l.drug}</span>
            <span className="font-mono text-[12px] text-stone">{l.directions}</span>
            <span className="font-mono text-[12px] text-bone sm:text-right">{l.qty}</span>
          </li>
        ))}
      </ul>

      <div className="p-6">
        {decided ? (
          <p className="text-[13.5px] text-stone">
            This prescription was <span className={rx.status === "approved" ? "text-ok" : "text-alert"}>{rx.status}</span>. The decision is recorded in the audit log.
          </p>
        ) : !canDecide ? (
          <p className="flex items-start gap-2 text-[13.5px] text-stone">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
            Only a registered pharmacist can review prescriptions and release prescription-only orders.
          </p>
        ) : mode === "idle" ? (
          <>
            <p className="eyebrow text-mute">Professional checks</p>
            <ul className="mt-3 space-y-2.5">
              {checklist.map((c, i) => (
                <li key={c}>
                  <label className="flex cursor-pointer items-center gap-3 text-[13.5px] text-stone">
                    <input
                      type="checkbox"
                      checked={checks[i]}
                      onChange={() => setChecks((cs) => cs.map((v, n) => (n === i ? !v : v)))}
                      className="h-4 w-4 accent-[var(--color-gold)]"
                    />
                    {c}
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Btn variant="gold" disabled={busy || !checks.every(Boolean)} onClick={() => decide("approved")}>
                Approve & release order
              </Btn>
              <Btn onClick={() => setMode("clarify")}>Request clarification</Btn>
              <Btn variant="danger" onClick={() => setMode("reject")}>Reject</Btn>
            </div>
          </>
        ) : (
          <>
            {mode === "reject" && (
              <label className="block">
                <span className="eyebrow text-mute">Reason</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 h-10 w-full border-b border-line bg-transparent text-[14px] text-bone focus:border-gold focus:outline-none">
                  {rejectReasons.map((r) => <option key={r} className="bg-coal">{r}</option>)}
                </select>
              </label>
            )}
            <label className="mt-5 block">
              <span className="eyebrow text-mute">{mode === "reject" ? "Note to patient (optional)" : "Message to patient"}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={mode === "clarify" ? "e.g. Please upload a clearer photo showing the prescriber's stamp." : ""}
                className="mt-2 w-full border border-line bg-transparent p-3 text-[14px] text-bone placeholder:text-mute focus:border-gold focus:outline-none"
              />
            </label>
            <div className="mt-5 flex flex-wrap gap-3">
              {mode === "reject" ? (
                <Btn variant="danger" disabled={busy} onClick={() => decide("rejected", note.trim() ? `${reason} — ${note.trim()}` : reason)}>Confirm rejection</Btn>
              ) : (
                <Btn variant="gold" disabled={busy || !note.trim()} onClick={() => decide("clarify", note.trim())}>Send to patient</Btn>
              )}
              <Btn onClick={() => setMode("idle")}>Back</Btn>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
