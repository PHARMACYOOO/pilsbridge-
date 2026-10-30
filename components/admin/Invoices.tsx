"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Courier } from "./Couriers";
import { field, label, naira, primary, textarea, useList } from "./shared";

type InvoiceSummary = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  totalKobo: number;
  status: "OPEN" | "RECONCILED";
  lines: number;
  courier: { name: string };
};
type Outcome = "MATCHED" | "OVERCHARGED" | "UNDERCHARGED" | "UNKNOWN" | "DUPLICATE" | "CANCELLED_BEFORE_PICKUP" | "COURIER_FAULT" | "NOT_FINISHED";
type Checked = {
  id: string;
  number: string;
  status: "OPEN" | "RECONCILED";
  note: string | null;
  periodStart: string;
  periodEnd: string;
  courier: { name: string };
  lines: { providerRef: string; amountKobo: number; outcome: Outcome; expectedKobo: number | null; delivery: string | null; order: string | null; disputedKobo: number }[];
  notInvoiced: { delivery: string; order: string; providerRef: string | null; status: string; feeKobo: number | null }[];
  totals: { invoicedKobo: number; disputedKobo: number; payableKobo: number; lines: number; matched: number; disputed: number };
};

const outcomeText: Record<Outcome, [string, string]> = {
  MATCHED: ["Matches", "Our record, same amount"],
  UNDERCHARGED: ["Less than booked", "Fine to pay — worth knowing"],
  OVERCHARGED: ["Overcharged", "More than the fee we booked at — dispute the difference"],
  UNKNOWN: ["Not ours", "No delivery of ours has this reference"],
  DUPLICATE: ["Charged twice", "This reference is already on the invoice"],
  CANCELLED_BEFORE_PICKUP: ["Never collected", "Cancelled before pickup — pay only if the contract has a cancellation fee"],
  COURIER_FAULT: ["Their fault", "Failed through the courier’s fault — they bear it"],
  NOT_FINISHED: ["Still in progress", "Not finished on our side yet"],
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

/** "RLY-1, 1,800" / "RLY-1\t1800.50" → lines in kobo. Amounts are in naira. */
function parseLines(text: string) {
  const lines: { providerRef: string; amountKobo: number }[] = [];
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const row = raw.trim();
    if (!row || /^ref|reference/i.test(row)) return;
    const m = row.match(/^\s*"?([^",\t]+?)"?\s*[,\t;]\s*"?₦?\s*([\d,]+(?:\.\d{1,2})?)"?\s*$/);
    if (!m) return bad.push(i + 1);
    lines.push({ providerRef: m[1].trim(), amountKobo: Math.round(Number(m[2].replace(/,/g, "")) * 100) });
  });
  return { lines, bad };
}

/** Courier invoices, checked line by line against our deliveries before anyone pays. */
export default function Invoices() {
  const { items: invoices, error, setError, load } = useList<InvoiceSummary>("/admin/invoices");
  const { items: couriers } = useList<Courier>("/admin/couriers");
  const [form, setForm] = useState({ courierId: "", number: "", periodStart: "", periodEnd: "", text: "" });
  const [open, setOpen] = useState<Checked | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseLines(form.text), [form.text]);

  async function show(id: string) {
    setError(null);
    try {
      setOpen(await api<Checked>(`/admin/invoices/${id}`));
      setNote("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t open the invoice.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const checked = await api<Checked>(`/admin/couriers/${form.courierId}/invoices`, {
        method: "POST",
        body: { number: form.number.trim(), periodStart: form.periodStart, periodEnd: form.periodEnd, lines: parsed.lines },
      });
      setOpen(checked);
      setForm({ courierId: form.courierId, number: "", periodStart: "", periodEnd: "", text: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t save the invoice.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      setOpen(await api<Checked>(`/admin/invoices/${open.id}/reconcile`, { method: "POST", body: note.trim() ? { note: note.trim() } : {} }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
      <section className="min-w-0">
        {error && <p className="mb-3 text-[13px] text-alert">{error}</p>}
        {open ? (
          <div>
            <button onClick={() => setOpen(null)} className="text-[13px] text-mute hover:text-bone">← All invoices</button>
            <h2 className="mt-3 flex flex-wrap items-center gap-2 font-display text-[28px] leading-none text-ivory">
              {open.courier.name} · {open.number}
              {open.status === "RECONCILED" ? <Badge tone="ok">Reconciled</Badge> : <Badge tone="warn">Open</Badge>}
            </h2>
            <p className="mt-1 text-[13px] text-mute">{day(open.periodStart)} – {day(open.periodEnd)}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["Invoiced", naira(open.totals.invoicedKobo), `${open.totals.lines} lines`],
                  ["To query", naira(open.totals.disputedKobo), `${open.totals.disputed} lines`],
                  ["OK to pay", naira(open.totals.payableKobo), `${open.totals.matched} lines match`],
                ] as const
              ).map(([l, v, sub]) => (
                <div key={l} className="border border-line bg-coal p-4">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">{l}</p>
                  <p className="mt-2 font-display text-[28px] leading-none text-ivory">{v}</p>
                  <p className="mt-1 text-[12.5px] text-stone">{sub}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto border border-line bg-coal">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                    <th className="px-4 py-3 text-left font-normal">Their reference</th>
                    <th className="px-4 py-3 text-right font-normal">Charged</th>
                    <th className="px-4 py-3 text-right font-normal">We booked</th>
                    <th className="px-4 py-3 text-left font-normal">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {open.lines.map((l, i) => {
                    const ok = l.outcome === "MATCHED" || l.outcome === "UNDERCHARGED";
                    return (
                      <tr key={`${l.providerRef}-${i}`} className="border-t border-line-soft align-top">
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-[12.5px] text-bone">{l.providerRef}</span>
                          {l.order && <span className="block font-mono text-[11px] text-mute">{l.order} · {l.delivery}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-stone">{naira(l.amountKobo)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-stone">{l.expectedKobo == null ? "—" : naira(l.expectedKobo)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`flex items-center gap-1.5 ${ok ? "text-ok" : "text-warn"}`}>
                            {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                            {outcomeText[l.outcome][0]}{l.disputedKobo > 0 && ` · query ${naira(l.disputedKobo)}`}
                          </span>
                          <span className="block text-[12px] text-mute">{outcomeText[l.outcome][1]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!!open.notInvoiced.length && (
              <div className="mt-5">
                <p className="eyebrow text-gold">Not on this invoice · {open.notInvoiced.length}</p>
                <p className="mt-1 text-[12.5px] text-mute">Our finished jobs with this courier in the period that they haven’t billed — expect them on a later invoice.</p>
                <ul className="mt-2 divide-y divide-line-soft border border-line bg-coal text-[13px]">
                  {open.notInvoiced.map((n) => (
                    <li key={n.delivery} className="flex justify-between gap-3 px-4 py-2">
                      <span className="font-mono text-[12.5px] text-bone">{n.providerRef} <span className="text-mute">· {n.order}</span></span>
                      <span className="font-mono text-[12.5px] text-stone">{n.feeKobo == null ? "—" : naira(n.feeKobo)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {open.status === "OPEN" ? (
              <div className="mt-5 space-y-2 border border-line bg-coal p-4">
                <p className={label}>When it’s settled with the courier</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Disputed 3 lines by email; paid ₦3,300 on 14 Oct" className={textarea} />
                <button disabled={busy} onClick={reconcile} className={primary}>Mark reconciled</button>
              </div>
            ) : (
              open.note && <p className="mt-5 text-[13px] text-stone">Note: {open.note}</p>
            )}
          </div>
        ) : (
          <div>
            <p className="eyebrow text-gold">Courier invoices</p>
            <div className="mt-3 space-y-2">
              {invoices?.length === 0 && <p className="text-[13px] text-mute">No invoices yet — enter the first one on the right.</p>}
              {invoices?.map((i) => (
                <button key={i.id} onClick={() => show(i.id)} className="flex w-full flex-wrap items-center justify-between gap-3 border border-line bg-coal p-4 text-left hover:border-gold">
                  <span>
                    <span className="block text-[14.5px] text-bone">{i.courier.name} · {i.number}</span>
                    <span className="block text-[12.5px] text-mute">{day(i.periodStart)} – {day(i.periodEnd)} · {i.lines} lines</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[13px] text-bone">{naira(i.totalKobo)}</span>
                    {i.status === "RECONCILED" ? <Badge tone="ok">Reconciled</Badge> : <Badge tone="warn">Open</Badge>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow text-gold">Enter an invoice</p>
        <form onSubmit={submit} className="mt-3 space-y-3 border border-line bg-coal p-5">
          <label className="block">
            <span className={label}>Courier</span>
            <select value={form.courierId} onChange={(e) => setForm({ ...form, courierId: e.target.value })} className={`${field} mt-2 bg-coal`}>
              <option value="">Choose…</option>
              {(couriers ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Invoice number</span>
            <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className={`${field} mt-2`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={label}>From</span>
              <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} className={`${field} mt-2 bg-coal`} />
            </label>
            <label className="block">
              <span className={label}>To</span>
              <input type="date" value={form.periodEnd} min={form.periodStart} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} className={`${field} mt-2 bg-coal`} />
            </label>
          </div>
          <label className="block">
            <span className={label}>Lines — reference, amount in ₦ (one per line)</span>
            <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={7} placeholder={"RLY-88213, 1800\nRLY-88214, 2,150.50"} className={`${textarea} mt-2 font-mono`} />
          </label>
          <p className="text-[12px] text-mute">
            {parsed.lines.length} lines · {naira(parsed.lines.reduce((s, l) => s + l.amountKobo, 0))}
            {!!parsed.bad.length && <span className="text-warn"> · can’t read line {parsed.bad.slice(0, 5).join(", ")}</span>}
          </p>
          <button disabled={busy || !form.courierId || !form.number.trim() || !form.periodStart || !form.periodEnd || !parsed.lines.length || !!parsed.bad.length} className={`${primary} w-full`}>
            {busy ? "Checking…" : "Check invoice"}
          </button>
          <p className="text-[12px] leading-relaxed text-mute">Paste from the courier’s statement or a spreadsheet. Nothing is paid from here — this is the check before you pay.</p>
        </form>
      </section>
    </div>
  );
}
