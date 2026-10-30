"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { usePortal } from "@/components/portal/store";
import { Btn, Panel, PortalHeading, thead } from "@/components/portal/ui";
import { Badge } from "@/components/ui";
import { api, ApiError, formatKobo, type ApiPayout, type ApiSettlements } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const cols = "grid grid-cols-[0.8fr_1.3fr_1fr_1fr_0.9fr_1fr_0.9fr_auto] items-center";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const statusTone = { SCHEDULED: "warn", PAID: "ok", VOID: "neutral" } as const;
const statusLabel = { SCHEDULED: "Scheduled", PAID: "Paid", VOID: "Void" } as const;

type PayoutLines = { code: string; orders: { code: string; deliveredAt: string | null; subtotalKobo: number; feesKobo: number; netKobo: number }[] };

function downloadCsv(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SettlementsView() {
  const { user } = useAuth();
  const { notify } = usePortal();
  const [data, setData] = useState<ApiSettlements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pharmacist = user?.role === "PHARMACIST";

  const load = useCallback(async () => {
    try {
      setData(await api<ApiSettlements>("/pharmacy/settlements"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load settlements.");
    }
  }, []);
  useEffect(() => {
    if (pharmacist) load();
  }, [pharmacist, load]);

  /** One payout's orders (or the not-yet-settled ones) as CSV. */
  const exportLines = async (code: string) => {
    try {
      const p = await api<PayoutLines>(`/pharmacy/settlements/${code}`);
      downloadCsv(`pilbridge-${code.toLowerCase()}.csv`, [
        ["Order", "Delivered", "Goods (NGN)", "Commission (NGN)", "Net (NGN)"],
        ...p.orders.map((o) => [o.code, o.deliveredAt?.slice(0, 10) ?? "", o.subtotalKobo / 100, o.feesKobo / 100, o.netKobo / 100]),
      ]);
      notify("Statement downloaded");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn’t download the statement", "error");
    }
  };

  if (!pharmacist) {
    return (
      <>
        <PortalHeading eyebrow="Finance" title="Settlements" />
        <p className="mt-6 max-w-[60ch] text-[14px] text-stone">Settlements are visible to your pharmacy&apos;s pharmacists only.</p>
      </>
    );
  }

  const next = data?.payouts.find((p) => p.status === "SCHEDULED") ?? null;
  const bank = data?.bank;

  return (
    <>
      <PortalHeading eyebrow="Finance" title="Settlements">
        <Btn onClick={() => exportLines("unsettled")} disabled={!data?.unsettled.orderCount}>
          <Download className="h-4 w-4" /> Unsettled orders CSV
        </Btn>
      </PortalHeading>
      {error && <p className="mt-4 text-[13px] text-alert">{error}</p>}

      <div className="mt-8 grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
        <Stat k="Next payout" v={next ? formatKobo(next.netKobo) : "—"} d={next ? `${next.code} · ${next.orderCount} orders` : "None scheduled yet"} />
        <Stat k="Not yet settled" v={data ? formatKobo(data.unsettled.netKobo) : "—"} d={data ? `${data.unsettled.orderCount} delivered order${data.unsettled.orderCount === 1 ? "" : "s"} · after commission` : "Loading…"} />
        <Stat
          k="Paid to"
          v={bank?.accountNumber ? `${bank.bankName ?? ""} ${bank.accountNumber}` : "No account"}
          d={bank ? (bank.payable ? "Verified" : (bank.reason ?? "")) : ""}
          warn={!!bank && !bank.payable}
          href="/portal/settings"
        />
      </div>

      <Panel title="Payout history" className="mt-6">
        <div className="overflow-x-auto">
          <div className="min-w-[860px] text-[13px]">
            <div className={`${cols} ${thead}`}>
              {["Payout", "Deliveries", "Paid", "Goods", "Commission", "Net", "Status", ""].map((h, i) => (
                <span key={h + i} className={`py-3 ${i === 0 ? "px-5" : "px-3"} ${i >= 3 && i <= 5 ? "text-right" : ""}`}>{h}</span>
              ))}
            </div>
            {data?.payouts.map((p: ApiPayout) => (
              <div key={p.id} className={`${cols} border-t border-line-soft`}>
                <span className="px-5 py-3.5 font-mono text-[12px] text-bone">{p.code}</span>
                <span className="px-3 py-3.5 text-stone">{day(p.periodStart)} – {day(new Date(new Date(p.periodEnd).getTime() - 1).toISOString())}</span>
                <span className="px-3 py-3.5 text-stone">{p.paidAt ? day(p.paidAt) : "—"}</span>
                <span className="px-3 py-3.5 text-right font-mono text-[12px] text-stone">{formatKobo(p.grossKobo)}</span>
                <span className="px-3 py-3.5 text-right font-mono text-[12px] text-mute">−{formatKobo(p.feesKobo)}</span>
                <span className="px-3 py-3.5 text-right font-mono text-[12px] text-bone">{formatKobo(p.netKobo)}</span>
                <span className="px-3 py-3.5"><Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge></span>
                <span className="px-3 py-3.5">
                  <button onClick={() => exportLines(p.code)} className="font-mono text-[11px] text-gold hover:text-gold-soft" aria-label={`Download ${p.code} statement`}>CSV</button>
                </span>
              </div>
            ))}
            {data && data.payouts.length === 0 && <p className="border-t border-line-soft px-5 py-8 text-[13.5px] text-mute">No payouts yet. Delivered orders are settled in the next payout run.</p>}
          </div>
        </div>
      </Panel>
      <p className="mt-4 max-w-[80ch] text-[12px] text-mute">
        Each delivered, paid order is settled once: its goods subtotal less the Pilbridge commission. Delivery and service fees paid by
        the customer aren&apos;t part of your settlement. A new bank account is verified by Pilbridge and held for 48 hours before payouts.
      </p>
    </>
  );
}

function Stat({ k, v, d, warn, href }: { k: string; v: string; d: string; warn?: boolean; href?: string }) {
  const body = (
    <>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-mute">{k}</p>
      <p className="mt-3 truncate font-display text-[30px] leading-none text-ivory">{v}</p>
      <p className={`mt-2 text-[12px] ${warn ? "text-warn" : "text-mute"}`}>{d}</p>
    </>
  );
  return href ? (
    <Link href={href} className="bg-coal p-5 transition-colors hover:bg-char">{body}</Link>
  ) : (
    <div className="bg-coal p-5">{body}</div>
  );
}
