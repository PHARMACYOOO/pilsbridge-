"use client";

import { useCallback, useEffect, useState } from "react";
import { AlarmClock, Phone, RotateCw, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { clock } from "@/lib/delivery";
import type { Courier } from "./Couriers";
import { CAUSES, field, ghost, naira, primary, useList } from "./shared";

export type Attention = {
  late: {
    order: string;
    status: "PREPARING" | "READY" | "PICKED_UP";
    dueAt: string;
    minutesLate: number;
    pharmacy: string;
    dropoffArea: string | null;
    delivery: { code: string; status: string } | null;
    rider: { name: string; phone: string | null; partner: string | null } | null;
  }[];
  unassigned: { order: string; delivery: string; waitingMinutes: number; coldChain: boolean; pharmacy: string; dropoffArea: string | null }[];
  queue: { order: string; orderStatus: string; delivery: string; waitingMinutes: number; coldChain: boolean; prescription: boolean; bookingError: string | null; pharmacy: string; dropoffArea: string | null }[];
  courierJobs: {
    delivery: string;
    status: "ASSIGNED" | "PICKED_UP";
    order: string;
    orderStatus: string;
    courier: string | null;
    courierContact: string | null;
    providerRef: string | null;
    feeKobo: number | null;
    trackingUrl: string | null;
    connected: boolean;
    providerStatus: string | null;
    warning: string | null;
    pharmacy: string;
    dropoffArea: string | null;
  }[];
};
/** Where an order is stuck, in plain words. */
function stage(l: Attention["late"][number]) {
  if (l.status === "PICKED_UP") return "With the rider";
  if (l.delivery?.status === "FAILED") return "Delivery failed — needs a new rider";
  if (l.status === "READY") return l.delivery?.status === "ASSIGNED" ? "Ready — rider not there yet" : "Ready — no rider yet";
  return l.delivery?.status === "ASSIGNED" ? "Being packed — rider booked" : "Being packed";
}
const mins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

/** Late orders and jobs no rider has taken — what someone should be on the phone about right now. */
export default function Live() {
  const [data, setData] = useState<Attention | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Attention>("/admin/deliveries/attention"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load — check your connection.");
    }
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className="mt-8 space-y-10">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-stone">
          Refreshes every 30 seconds. Admins also get a text when something new appears here; customers with late orders are
          texted automatically.
        </p>
        <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh">
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="text-[13px] text-alert">{error}</p>}
      {data && !data.late.length && !data.unassigned.length && (
        <p className="border border-line bg-coal px-5 py-10 text-center text-[14px] text-ok">All deliveries on time — nothing needs attention.</p>
      )}

      {!!data?.late.length && (
        <section>
          <p className="eyebrow flex items-center gap-2 text-alert">
            <AlarmClock className="h-3.5 w-3.5" /> Running late · {data.late.length}
          </p>
          <div className="mt-3 space-y-2">
            {data.late.map((l) => (
              <div key={l.order} className="grid gap-3 border border-alert/40 bg-coal p-4 md:grid-cols-[1fr_1.4fr_1.3fr] md:items-center">
                <div>
                  <p className="font-mono text-[13px] text-bone">{l.order}</p>
                  <p className="text-[12.5px] text-alert">{mins(l.minutesLate)} late · was due {clock(l.dueAt)}</p>
                </div>
                <div className="text-[13px]">
                  <p className="text-bone">{stage(l)}</p>
                  <p className="text-mute">{l.pharmacy}{l.dropoffArea && ` → ${l.dropoffArea}`}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  {l.rider ? (
                    <>
                      <span className="text-stone">{l.rider.name}{l.rider.partner && <span className="text-mute"> · {l.rider.partner}</span>}</span>
                      {l.rider.phone && (
                        <a href={`tel:${l.rider.phone}`} className={`${ghost} inline-flex items-center gap-1.5`}>
                          <Phone className="h-3.5 w-3.5" /> Call rider
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-mute">No rider</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!data?.unassigned.length && (
        <section>
          <p className="eyebrow text-warn">No rider for 10+ minutes · {data.unassigned.length}</p>
          <div className="mt-3 space-y-2">
            {data.unassigned.map((u) => (
              <div key={u.delivery} className="grid gap-2 border border-warn/40 bg-coal p-4 md:grid-cols-[1fr_1.4fr_auto] md:items-center">
                <div>
                  <p className="font-mono text-[13px] text-bone">{u.order}</p>
                  <p className="text-[12.5px] text-warn">Waiting {mins(u.waitingMinutes)}</p>
                </div>
                <p className="text-[13px] text-mute">{u.pharmacy}{u.dropoffArea && ` → ${u.dropoffArea}`}</p>
                {u.coldChain && <Badge tone="cold"><Snowflake className="h-2.5 w-2.5" /> Needs cold box</Badge>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-mute">Call a partner’s dispatcher, or ask riders on the Riders tab to go online nearby.</p>
        </section>
      )}

      {!!data?.queue.length && <DispatchQueue queue={data.queue} onChange={load} />}
      {!!data?.courierJobs.length && <CourierJobs jobs={data.courierJobs} onChange={load} />}
    </div>
  );
}

/** Every job without a rider or courier. Book couriers once the order is ready, to avoid waiting fees. */
function DispatchQueue({ queue, onChange }: { queue: Attention["queue"]; onChange: () => Promise<void> }) {
  const { items: couriers } = useList<Courier>("/admin/couriers");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ courierId: "", providerRef: "", fee: "", trackingUrl: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = (couriers ?? []).filter((c) => c.active);

  return (
    <section>
      <p className="eyebrow text-gold">Dispatch queue · {queue.length}</p>
      <p className="mt-1 text-[12.5px] text-mute">Jobs riders can still take in the app. Book a courier when there’s no rider — ideally once the order is ready.</p>
      {error && <p className="mt-2 text-[13px] text-alert">{error}</p>}
      <div className="mt-3 space-y-2">
        {queue.map((q) => (
          <div key={q.delivery} className="border border-line bg-coal p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-mono text-[13px] text-bone">
                  {q.order} <span className="text-mute">· seal {q.delivery}</span>
                  {q.orderStatus === "READY" ? <Badge tone="ok">Ready</Badge> : <Badge tone="neutral">Being packed</Badge>}
                  {q.prescription && <Badge tone="pom">Rx</Badge>}
                  {q.coldChain && <Badge tone="cold"><Snowflake className="h-2.5 w-2.5" /> Cold</Badge>}
                </p>
                <p className="text-[12.5px] text-mute">{q.pharmacy}{q.dropoffArea && ` → ${q.dropoffArea}`} · waiting {q.waitingMinutes} min</p>
                {q.bookingError && <p className="text-[12.5px] text-warn">Couldn’t auto-book: {q.bookingError}</p>}
              </div>
              {open !== q.delivery && (
                <div className="flex flex-wrap gap-2">
                  {active.some((c) => c.api) && (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          const r = await api<{ booked?: string; failed?: string }>(`/admin/deliveries/${q.delivery}/courier/api`, { method: "POST" });
                          if (r.failed) setError(`${q.order}: ${r.failed}`);
                          await onChange();
                        } catch (err) {
                          setError(err instanceof ApiError ? err.message : "Couldn’t book.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className={primary}
                    >
                      Book through API
                    </button>
                  )}
                  <button onClick={() => { setOpen(q.delivery); setError(null); setForm({ courierId: active[0]?.id ?? "", providerRef: "", fee: "", trackingUrl: "" }); }} className={ghost}>
                    Book by hand
                  </button>
                </div>
              )}
            </div>
            {open === q.delivery && (
              <form
                className="mt-3 grid gap-2 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError(null);
                  try {
                    const fee = Math.round(Number(form.fee.replace(/[^\d.]/g, "")) * 100);
                    await api(`/admin/deliveries/${q.delivery}/courier`, {
                      method: "POST",
                      body: { courierId: form.courierId, providerRef: form.providerRef.trim(), ...(fee > 0 ? { feeKobo: fee } : {}), ...(form.trackingUrl.trim() ? { trackingUrl: form.trackingUrl.trim() } : {}) },
                    });
                    setOpen(null);
                    await onChange();
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Couldn’t save the booking.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <select value={form.courierId} onChange={(e) => setForm({ ...form, courierId: e.target.value })} className={`${field} bg-coal`}>
                  {!active.length && <option value="">Add a courier on the Couriers tab first</option>}
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.acceptsPrescription ? " · Rx ok" : ""}{c.acceptsColdChain ? " · cold ok" : ""}
                    </option>
                  ))}
                </select>
                <input value={form.providerRef} onChange={(e) => setForm({ ...form, providerRef: e.target.value })} placeholder="Courier’s booking reference" className={field} />
                <input value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="Their fee, ₦ (optional)" inputMode="decimal" className={field} />
                <input value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} placeholder="Tracking link (optional)" className={field} />
                <p className="text-[12px] text-mute sm:col-span-2">Book on the courier’s dashboard first, with “Sealed pharmacy parcel” as the description and seal {q.delivery} as your reference — no medicine names.</p>
                <div className="flex gap-2 sm:col-span-2">
                  <button disabled={busy || !form.courierId || form.providerRef.trim().length < 2} className={primary}>{busy ? "Saving…" : "Save booking"}</button>
                  <button type="button" onClick={() => setOpen(null)} className="px-3 text-[13px] text-mute hover:text-bone">Cancel</button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Courier bookings in progress: ops records what the courier reports. */
function CourierJobs({ jobs, onChange }: { jobs: Attention["courierJobs"]; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState<{ code: string; mode: "delivered" | "failed" } | null>(null);
  const [value, setValue] = useState({ customerCode: "", courierProof: "", reason: "", cause: "CUSTOMER_UNAVAILABLE" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", ...(body ? { body } : {}) });
      setOpen(null);
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t save — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="eyebrow text-gold">Courier bookings · {jobs.length}</p>
      {error && <p className="mt-2 text-[13px] text-alert">{error}</p>}
      <div className="mt-3 space-y-2">
        {jobs.map((j) => (
          <div key={j.delivery} className="border border-line bg-coal p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[13px] text-bone">{j.order} <span className="text-mute">· seal {j.delivery}</span></p>
                <p className="text-[13px] text-stone">
                  {j.courier} · ref {j.providerRef}{j.feeKobo != null && ` · ${naira(j.feeKobo)}`}
                  {j.connected && <span className="text-mute"> · API{j.providerStatus && `: ${j.providerStatus.replace(/_/g, " ")}`}</span>}
                </p>
                {j.warning && <p className="text-[12.5px] text-alert">{j.warning}</p>}
                <p className="text-[12.5px] text-mute">
                  {j.status === "PICKED_UP" ? "Collected — on the way" : j.orderStatus === "READY" ? "Waiting for the pharmacy to hand over" : "Order still being packed"} · {j.pharmacy}{j.dropoffArea && ` → ${j.dropoffArea}`}
                </p>
                <p className="mt-1 flex flex-wrap gap-3 text-[12.5px]">
                  {j.trackingUrl && <a href={j.trackingUrl} target="_blank" rel="noreferrer" className="text-gold hover:text-gold-soft">Tracking →</a>}
                  {j.courierContact && <span className="text-mute">{j.courierContact}</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {j.status === "ASSIGNED" && (
                  <button disabled={busy} onClick={() => send(`/admin/deliveries/${j.delivery}/courier/cancel`)} className={ghost}>Courier didn’t come</button>
                )}
                {j.status === "PICKED_UP" && (
                  <>
                    <button onClick={() => { setOpen({ code: j.delivery, mode: "delivered" }); setValue({ customerCode: "", courierProof: "", reason: "", cause: "CUSTOMER_UNAVAILABLE" }); }} className={primary}>Delivered</button>
                    <button onClick={() => { setOpen({ code: j.delivery, mode: "failed" }); setValue({ customerCode: "", courierProof: "", reason: "", cause: "CUSTOMER_UNAVAILABLE" }); }} className={ghost}>Not delivered</button>
                  </>
                )}
              </div>
            </div>
            {open?.code === j.delivery && (
              <form
                className="mt-3 grid gap-2 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (open.mode === "failed") send(`/admin/deliveries/${j.delivery}/courier/failed`, { reason: value.reason.trim(), cause: value.cause });
                  else send(`/admin/deliveries/${j.delivery}/courier/delivered`, value.customerCode ? { customerCode: value.customerCode } : { courierProof: value.courierProof.trim() });
                }}
              >
                {open.mode === "delivered" ? (
                  <>
                    <input value={value.customerCode} onChange={(e) => setValue({ ...value, customerCode: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Customer’s 4-digit code" inputMode="numeric" className={field} />
                    <input value={value.courierProof} onChange={(e) => setValue({ ...value, courierProof: e.target.value })} placeholder="…or courier’s proof-of-delivery ref" className={field} />
                  </>
                ) : (
                  <>
                    <select value={value.cause} onChange={(e) => setValue({ ...value, cause: e.target.value })} className={`${field} bg-coal`} aria-label="Cause">
                      {Object.entries(CAUSES).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                    <input value={value.reason} onChange={(e) => setValue({ ...value, reason: e.target.value })} placeholder="What happened" className={field} />
                  </>
                )}
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    disabled={busy || (open.mode === "delivered" ? value.customerCode.length !== 4 && value.courierProof.trim().length < 3 : value.reason.trim().length < 3)}
                    className={primary}
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className="px-3 text-[13px] text-mute hover:text-bone">Cancel</button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
