"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { api, API_URL, ApiError, incidentLabel, token, type IncidentType } from "@/lib/api";
import { CAUSES, field, ghost, naira } from "./shared";

type Summary = {
  jobs: number;
  delivered: number;
  failed: number;
  cancelled: number;
  inProgress: number;
  completionRate: number | null;
  onTimeRate: number | null;
  pickupPunctuality: number | null;
  proofCoverage: number | null;
  avgMinutes: { packing: number | null; toAssignRider: number | null; pickupWait: number | null; ride: number | null; paymentToDoor: number | null };
  money: { deliveryRevenueKobo: number; courierCostKobo: number; courierCostPerDeliveryKobo: number | null; failedCostByBearer: { bearer: string; kobo: number }[] };
  failureCauses: { key: string; count: number }[];
};
type Report = {
  period: { from: string; to: string };
  targets: { pickupWithinMinutes: number; pickupPunctuality: number; completion: number; proofOfDelivery: number };
  overall: Summary;
  byProvider: (Summary & { name: string })[];
  byPharmacy: (Summary & { name: string })[];
  incidents: { type: IncidentType; count: number }[];
};

const lagosDay = (offsetDays = 0) => new Date(Date.now() + 60 * 60_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 1000) / 10}%`);
const mins = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
const bearer: Record<string, string> = { CUSTOMER: "Customers", COURIER: "Couriers", PHARMACY: "Pharmacies", PLATFORM: "Pilbridge", UNKNOWN: "Not recorded" };

/** A headline number against its target, with an icon and words — never colour alone. */
function Tile({ label, value, sub, target }: { label: string; value: string; sub?: string; target?: { met: boolean | null; text: string } }) {
  return (
    <div className="border border-line bg-coal p-4">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">{label}</p>
      <p className="mt-2 font-display text-[34px] leading-none text-ivory">{value}</p>
      {sub && <p className="mt-1.5 text-[12.5px] text-stone">{sub}</p>}
      {target && target.met != null && (
        <p className={`mt-2 flex items-center gap-1.5 text-[12.5px] ${target.met ? "text-ok" : "text-warn"}`}>
          {target.met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {target.met ? "Meets target" : "Below target"} · {target.text}
        </p>
      )}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto border border-line bg-coal">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-3 font-normal ${i ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-t border-line-soft">
              {r.map((c, i) => (
                <td key={i} className={`px-4 py-2.5 ${i ? "text-right font-mono text-[12.5px] text-stone" : "text-bone"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Delivery performance against the pilot targets, for any period. */
export default function Reports() {
  const [from, setFrom] = useState(lagosDay(6));
  const [to, setTo] = useState(lagosDay());
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<Report>(`/admin/reports/delivery?from=${from}&to=${to}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load the report.");
    }
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);

  async function downloadCsv() {
    setDownloading(true);
    try {
      const t = token.get();
      const res = await fetch(`${API_URL}/admin/reports/deliveries.csv?from=${from}&to=${to}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `pilbridge-deliveries-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn’t download the CSV.");
    } finally {
      setDownloading(false);
    }
  }

  const o = data?.overall;
  const t = data?.targets;
  const meets = (v: number | null, target: number) => (v == null ? null : v >= target);

  return (
    <div className="mt-8 space-y-8">
      {/* Period — one row of controls above everything it filters */}
      <div className="flex flex-wrap items-end gap-3">
        {(
          [
            ["Today", 0],
            ["Last 7 days", 6],
            ["Last 30 days", 29],
          ] as const
        ).map(([l, d]) => (
          <button
            key={l}
            onClick={() => {
              setFrom(lagosDay(d));
              setTo(lagosDay());
            }}
            className={`rounded-[3px] border px-3 py-2 text-[13px] ${from === lagosDay(d) && to === lagosDay() ? "border-gold text-gold-soft" : "border-line text-stone hover:text-bone"}`}
          >
            {l}
          </button>
        ))}
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute">From</span>
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${field} mt-1 h-10 bg-coal`} />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute">To</span>
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${field} mt-1 h-10 bg-coal`} />
        </label>
        <button onClick={downloadCsv} disabled={downloading} className={`${ghost} ml-auto inline-flex items-center gap-1.5`}>
          <Download className="h-3.5 w-3.5" /> {downloading ? "Preparing…" : "Download CSV"}
        </button>
      </div>
      {error && <p className="text-[13px] text-alert">{error}</p>}
      {o && o.jobs === 0 && <p className="border border-line bg-coal px-5 py-10 text-center text-[14px] text-mute">No deliveries in this period.</p>}

      {o && t && o.jobs > 0 && (
        <>
          <section>
            <p className="eyebrow text-gold">Pilot targets</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="Delivered successfully" value={pct(o.completionRate)} sub={`${o.delivered} delivered · ${o.failed} failed`} target={{ met: meets(o.completionRate, t.completion), text: `${pct(t.completion)} or more` }} />
              <Tile label={`Collected within ${t.pickupWithinMinutes} min of ready`} value={pct(o.pickupPunctuality)} sub={`Average wait ${mins(o.avgMinutes.pickupWait)}`} target={{ met: meets(o.pickupPunctuality, t.pickupPunctuality), text: `${pct(t.pickupPunctuality)} or more` }} />
              <Tile label="Proof of delivery recorded" value={pct(o.proofCoverage)} sub="Customer code or courier proof" target={{ met: meets(o.proofCoverage, t.proofOfDelivery), text: "every delivery" }} />
              <Tile label="Arrived by the promised time" value={pct(o.onTimeRate)} sub={`Payment to door ${mins(o.avgMinutes.paymentToDoor)} on average`} />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Delivery jobs" value={String(o.jobs)} sub={`${o.inProgress} in progress · ${o.cancelled} cancelled`} />
            <Tile label="Courier cost per delivery" value={o.money.courierCostPerDeliveryKobo == null ? "—" : naira(o.money.courierCostPerDeliveryKobo)} sub={`${naira(o.money.courierCostKobo)} owed to couriers`} />
            <Tile label="Delivery fees from customers" value={naira(o.money.deliveryRevenueKobo)} sub="Delivered orders only" />
            <Tile label="Average pharmacy packing" value={mins(o.avgMinutes.packing)} sub={`Rider found in ${mins(o.avgMinutes.toAssignRider)} · ride ${mins(o.avgMinutes.ride)}`} />
          </section>

          <section>
            <p className="eyebrow text-gold">By provider</p>
            <div className="mt-3">
              <Table
                head={["Provider", "Jobs", "Delivered", "Success", "On time", `Pickup ≤${t.pickupWithinMinutes} min`, "Cost / delivery"]}
                rows={data.byProvider.map((p) => [p.name, p.jobs, p.delivered, pct(p.completionRate), pct(p.onTimeRate), pct(p.pickupPunctuality), p.money.courierCostPerDeliveryKobo == null ? "—" : naira(p.money.courierCostPerDeliveryKobo)])}
              />
            </div>
            <p className="mt-2 text-[12px] text-mute">Pilbridge riders’ cost isn’t recorded yet (rider payouts aren’t built), so only courier costs appear.</p>
          </section>

          <section>
            <p className="eyebrow text-gold">By pharmacy</p>
            <div className="mt-3">
              <Table
                head={["Pharmacy", "Jobs", "Avg packing", `Pickup ≤${t.pickupWithinMinutes} min`, "Success"]}
                rows={data.byPharmacy.map((p) => [p.name, p.jobs, mins(p.avgMinutes.packing), pct(p.pickupPunctuality), pct(p.completionRate)])}
              />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div>
              <p className="eyebrow text-gold">Why deliveries failed</p>
              <ul className="mt-3 divide-y divide-line-soft border border-line bg-coal text-[13px]">
                {!o.failureCauses.length && <li className="px-4 py-3 text-mute">No failed deliveries.</li>}
                {o.failureCauses.map((c) => (
                  <li key={c.key} className="flex justify-between gap-3 px-4 py-2.5">
                    <span className="text-bone">{(CAUSES[c.key] ?? c.key).split(" — ")[0]}</span>
                    <span className="font-mono text-stone">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow text-gold">Who pays for failed attempts</p>
              <ul className="mt-3 divide-y divide-line-soft border border-line bg-coal text-[13px]">
                {!o.money.failedCostByBearer.length && <li className="px-4 py-3 text-mute">No courier charges for failed attempts.</li>}
                {o.money.failedCostByBearer.map((b) => (
                  <li key={b.bearer} className="flex justify-between gap-3 px-4 py-2.5">
                    <span className="text-bone">{bearer[b.bearer] ?? b.bearer}</span>
                    <span className="font-mono text-stone">{naira(b.kobo)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow text-gold">Incidents</p>
              <ul className="mt-3 divide-y divide-line-soft border border-line bg-coal text-[13px]">
                {!data.incidents.length && <li className="px-4 py-3 text-mute">No incidents reported.</li>}
                {data.incidents.map((i) => (
                  <li key={i.type} className="flex justify-between gap-3 px-4 py-2.5">
                    <span className="text-bone">{incidentLabel[i.type]}</span>
                    <span className="font-mono text-stone">{i.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
