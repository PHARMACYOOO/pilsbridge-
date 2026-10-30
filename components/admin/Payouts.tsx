"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Badge } from "@/components/ui";
import { api, type ApiPayout, type BankState, type SettlementTotals } from "@/lib/api";
import { danger, field, ghost, label, naira, primary, shortDate, useAct, useList } from "./shared";

type AdminPayout = ApiPayout & { pharmacyId: string; pharmacy: { id: string; name: string; bankName: string | null; bankAccountName: string | null; bankAccountNumber: string | null }; bank: BankState };
type Preview = { before: string; pharmacies: (SettlementTotals & { pharmacy: { id: string; name: string }; bank: BankState })[] };

const lagosToday = () => new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 10);

/** Pharmacy payouts: group delivered, paid orders per pharmacy, pay by bank transfer, record the reference. */
export default function Payouts() {
  const { items, error, setError, load } = useList<AdminPayout>("/admin/payouts");
  const { busy, notice, act } = useAct(setError, load);
  const [before, setBefore] = useState(lagosToday());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
      <section>
        <div className="flex items-center justify-between">
          <p className="eyebrow text-gold">Payouts {items && <span className="text-mute">· {items.length}</span>}</p>
          <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh"><RotateCw className="h-3.5 w-3.5" /></button>
        </div>
        {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
        {notice && <p className="mt-3 text-[13px] text-ok">{notice}</p>}
        <div className="mt-3 space-y-2">
          {items === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
          {items?.length === 0 && <p className="text-[13px] text-mute">No payouts yet.</p>}
          {items?.map((p) => (
            <div key={p.id} className="border border-line bg-coal p-4">
              <p className="flex flex-wrap items-center gap-2 text-[14.5px] text-bone">
                {p.pharmacy.name} · {naira(p.netKobo)}
                <Badge tone={p.status === "PAID" ? "ok" : p.status === "VOID" ? "neutral" : "warn"}>{p.status.toLowerCase()}</Badge>
              </p>
              <p className="mt-1 font-mono text-[11.5px] text-mute">
                {p.code} · {p.orderCount} orders · goods {naira(p.grossKobo)} − commission {naira(p.feesKobo)} · deliveries {shortDate(p.periodStart)} – {shortDate(new Date(new Date(p.periodEnd).getTime() - 1).toISOString())}
              </p>
              {p.status === "PAID" && <p className="mt-1 font-mono text-[11.5px] text-stone">Paid {shortDate(p.paidAt)} to {p.bankName} {p.bankAccountNumber} · ref {p.reference}</p>}
              {p.status === "SCHEDULED" && (
                <>
                  <p className={`mt-1 text-[12.5px] ${p.bank.payable ? "text-stone" : "text-warn"}`}>
                    {p.bank.payable ? `Pay to ${p.pharmacy.bankName} · ${p.pharmacy.bankAccountName} · ${p.pharmacy.bankAccountNumber}` : p.bank.reason}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={refs[p.id] ?? ""} onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })} placeholder="Bank transfer reference" className={`${field} max-w-[260px]`} />
                    <button disabled={!!busy || !p.bank.payable || (refs[p.id] ?? "").trim().length < 3} onClick={() => act(`paid-${p.id}`, () => api(`/admin/payouts/${p.id}/paid`, { method: "POST", body: { reference: refs[p.id].trim() } }), `${p.code} recorded as paid — the pharmacy is texted`)} className={primary}>
                      Mark paid
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => {
                        const reason = window.prompt("Why void this payout? Its orders go into the next run.");
                        if (reason && reason.trim().length >= 5) act(`void-${p.id}`, () => api(`/admin/payouts/${p.id}/void`, { method: "POST", body: { reason: reason.trim() } }), `${p.code} voided`);
                      }}
                      className={danger}
                    >
                      Void
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow text-gold">New payout run</p>
        <div className="mt-3 space-y-3 border border-line bg-coal p-5">
          <label className="block">
            <span className={label}>Deliveries before (Lagos day)</span>
            <input type="date" value={before} max={lagosToday()} onChange={(e) => { setBefore(e.target.value); setPreview(null); }} className={`${field} mt-2 [color-scheme:dark]`} />
          </label>
          <button disabled={!!busy || !before} onClick={() => act("preview", async () => setPreview(await api<Preview>(`/admin/payouts/preview?before=${before}`)))} className={`${ghost} w-full`}>
            Preview
          </button>
          {preview && (
            <ul className="divide-y divide-line-soft border border-line text-[13px]">
              {preview.pharmacies.length === 0 && <li className="px-3 py-3 text-mute">Nothing to settle before this day.</li>}
              {preview.pharmacies.map((x) => (
                <li key={x.pharmacy.id} className="px-3 py-2.5">
                  <span className="text-bone">{x.pharmacy.name}</span> · {naira(x.netKobo)} <span className="text-mute">({x.orderCount} orders)</span>
                  {!x.bank.payable && <span className="block text-[12px] text-warn">{x.bank.reason}</span>}
                </li>
              ))}
            </ul>
          )}
          <button
            disabled={!!busy || !preview?.pharmacies.length}
            onClick={() => act("create", async () => { await api("/admin/payouts", { method: "POST", body: { before } }); setPreview(null); }, "Payouts created — pay each by bank transfer, then record the reference")}
            className={`${primary} w-full`}
          >
            Create payouts
          </button>
          <p className="text-[12px] leading-relaxed text-mute">
            Each delivered, paid order is settled once: goods subtotal less commission. A payout can only be marked paid to a verified account
            that hasn&apos;t changed in the last 48 hours.
          </p>
        </div>
      </section>
    </div>
  );
}
