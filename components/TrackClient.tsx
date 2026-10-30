"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bike, Check, CircleAlert, EyeOff, KeyRound, RotateCw } from "lucide-react";
import PayButton from "./PayButton";
import SignInPanel from "./SignInPanel";
import { Badge, type BadgeTone } from "./ui";
import { api, ApiError, formatKobo, incidentLabel, type ApiOrder, type IncidentType, type OrderStatus } from "@/lib/api";
import { isStaff, useAuth } from "@/lib/auth";
import { clock } from "@/lib/delivery";

const label: Record<OrderStatus, [string, BadgeTone]> = {
  PHARMACIST_REVIEW: ["Pharmacist review", "warn"],
  ACCEPTED: ["Accepted", "neutral"],
  PREPARING: ["Preparing", "neutral"],
  READY: ["Ready for pickup", "ok"],
  PICKED_UP: ["On its way", "ok"],
  DELIVERED: ["Delivered", "ok"],
  REJECTED: ["Not approved", "alert"],
  CANCELLED: ["Cancelled", "neutral"],
};

const steps: { status: OrderStatus; title: string; note: string }[] = [
  { status: "PHARMACIST_REVIEW", title: "Prescription review", note: "A registered pharmacist checks your prescription" },
  { status: "ACCEPTED", title: "Accepted", note: "The pharmacy has your order" },
  { status: "PREPARING", title: "Preparing", note: "Picked from stock and sealed" },
  { status: "READY", title: "Ready for pickup", note: "Waiting for the rider" },
  { status: "PICKED_UP", title: "On its way", note: "Sealed parcel with the rider" },
  { status: "DELIVERED", title: "Delivered", note: "Handed over to you" },
];

/** Accepted but not paid yet: the pharmacy starts once it's paid. */
const awaitingPayment = (o: ApiOrder) => o.status === "ACCEPTED" && o.paymentStatus === "UNPAID";
const badge = (o: ApiOrder): [string, BadgeTone] => (awaitingPayment(o) ? ["Pay now", "warn"] : label[o.status]);

const ON_THE_WAY: OrderStatus[] = ["PREPARING", "READY", "PICKED_UP"];

/** Arrival time, rider and the drop-off code, while the order is on its way to the patient. */
function DeliveryPanel({ order }: { order: ApiOrder }) {
  const d = order.delivery;
  if (order.status === "DELIVERED" && d?.deliveredAt) {
    return (
      <div className="border border-line bg-coal p-5">
        <p className="eyebrow text-gold">Delivered</p>
        <p className="mt-2 text-[13.5px] text-stone">Handed over at {clock(d.deliveredAt)}{d.rider?.firstName && ` by ${d.rider.firstName}`}.</p>
      </div>
    );
  }
  if (!ON_THE_WAY.includes(order.status)) return null;

  const late = order.arriveBy && new Date(order.arriveBy).getTime() < Date.now();
  const rider =
    d?.provider === "COURIER"
      ? `A ${d.courier?.name ?? "courier"} rider`
      : d?.rider?.firstName
        ? `${d.rider.firstName}${d.rider.riderProfile ? ` from ${d.rider.riderProfile.partner}` : ""}`
        : null;
  const line =
    d?.status === "FAILED"
      ? `The last delivery attempt didn’t work out (${d.failReason}). Your parcel is back at the pharmacy, still sealed — a new rider will be booked.`
      : d?.status === "PICKED_UP"
        ? `${rider ?? "Your rider"} has your parcel and is on the way.`
        : d?.status === "ASSIGNED"
          ? `${rider ?? "A rider"} is heading to ${order.pharmacy.name} to collect it.`
          : "We’re finding a rider near the pharmacy.";

  return (
    <div className="border border-gold/40 bg-gold-wash p-5">
      <p className="eyebrow flex items-center gap-2 text-gold">
        <Bike className="h-3.5 w-3.5" /> Delivery
      </p>
      {order.arriveBy && (
        <p className={`mt-2 font-display text-[26px] leading-tight ${late ? "text-warn" : "text-ivory"}`}>
          {late ? "Running late" : `Arriving by ${clock(order.arriveBy)}`}
        </p>
      )}
      {late && order.arriveBy && <p className="text-[12.5px] text-stone">It was due by {clock(order.arriveBy)} — sorry for the wait.</p>}
      <p className="mt-2 text-[13px] leading-relaxed text-stone">{line}</p>
      {d?.trackingUrl && (
        <a href={d.trackingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] text-gold hover:text-gold-soft">
          Live tracking on {d.courier?.name ?? "the courier’s site"} →
        </a>
      )}
      {d?.dropoffCode && (
        <div className="mt-4 border-t border-gold/20 pt-4">
          <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">
            <KeyRound className="h-3.5 w-3.5 text-gold" /> Your delivery code
          </p>
          <p className="mt-1 font-mono text-[34px] leading-none tracking-[0.3em] text-ivory">{d.dropoffCode}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-mute">Give it to the rider only once you have your sealed parcel in hand.</p>
        </div>
      )}
    </div>
  );
}

/** Something wrong with what arrived, or with the delivery. Goes to the operations team. */
function ReportProblem({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncidentType>("DAMAGED");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) return <p className="border border-line-soft px-5 py-4 text-[13px] text-stone">Thanks — we’ve logged {done} and will contact you. Don’t take any medicine from a parcel that was opened or damaged.</p>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full border border-line-soft px-5 py-3 text-left text-[13px] text-mute hover:border-alert hover:text-alert">
        Problem with this order? Report it
      </button>
    );
  }
  return (
    <form
      className="space-y-2 border border-line bg-coal p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await api<{ code: string }>(`/orders/${code}/incidents`, { method: "POST", body: { type, description: text.trim() } });
          setDone(res.code);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Couldn’t send — please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="eyebrow text-gold">Report a problem</p>
      <select value={type} onChange={(e) => setType(e.target.value as IncidentType)} className="h-10 w-full border border-line bg-coal px-3 text-[13px] text-bone focus:border-gold focus:outline-none">
        {(["DAMAGED", "TAMPERED", "WRONG_ITEM", "LOST", "OTHER"] as IncidentType[]).map((t) => (
          <option key={t} value={t}>{incidentLabel[t]}</option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Tell us what happened"
        className="w-full border border-line bg-transparent px-3 py-2 text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none"
      />
      {error && <p className="text-[12.5px] text-alert">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || text.trim().length < 5} className="rounded-[3px] bg-gold px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-gold-soft disabled:opacity-50">
          {busy ? "Sending…" : "Send"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-[13px] text-mute hover:text-bone">Cancel</button>
      </div>
    </form>
  );
}

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function TrackClient() {
  const { user, ready } = useAuth();
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api<ApiOrder[]>("/orders");
      setOrders(list);
      const wanted = new URLSearchParams(window.location.search).get("code");
      setSelected((s) => s ?? (wanted && list.some((o) => o.code === wanted) ? wanted : list[0]?.code ?? null));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load your orders.");
    }
  }, []);

  useEffect(() => {
    if (user?.profileComplete && !isStaff(user)) load();
  }, [user, load]);

  const order = orders?.find((o) => o.code === selected) ?? null;

  async function cancel() {
    if (!order) return;
    setCancelling(true);
    try {
      const updated = await api<ApiOrder>(`/orders/${order.code}/cancel`, { method: "POST" });
      setOrders((os) => os?.map((o) => (o.code === updated.code ? updated : o)) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t cancel this order.");
    } finally {
      setCancelling(false);
    }
  }

  if (!ready) return <div className="h-[400px]" />;

  if (!user?.profileComplete) {
    return (
      <div className="mx-auto max-w-[460px] px-4 pb-24 pt-12">
        <div className="border border-line bg-coal p-6 sm:p-8">
          {user ? (
            <h2 className="mb-6 font-display text-[28px] leading-none text-ivory">Finish setting up</h2>
          ) : (
            <>
              <h2 className="mb-2 font-display text-[28px] leading-none text-ivory">Sign in to track</h2>
              <p className="mb-6 text-[13.5px] text-stone">Use the account you ordered with.</p>
            </>
          )}
          <SignInPanel />
        </div>
      </div>
    );
  }

  if (isStaff(user)) {
    return (
      <div className="mx-auto max-w-[620px] px-4 pb-24 pt-12 text-center">
        <p className="text-[15px] text-stone">You&apos;re signed in with a pharmacy account.</p>
        <Link href="/portal/orders" className="mt-4 inline-block text-gold hover:text-gold-soft">Open pharmacy orders →</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-24 pt-10 sm:px-8 lg:grid-cols-[300px_1fr]">
      <aside>
        <div className="flex items-center justify-between">
          <p className="eyebrow text-gold">Your orders</p>
          <button onClick={load} className="text-mute hover:text-gold" aria-label="Refresh">
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="mt-4 border border-line bg-coal">
          {orders === null && !error && <li className="px-5 py-6 text-[13px] text-mute">Loading…</li>}
          {orders?.length === 0 && (
            <li className="px-5 py-6 text-[13.5px] text-stone">
              No orders yet. <Link href="/order" className="text-gold">Start one →</Link>
            </li>
          )}
          {orders?.map((o) => (
            <li key={o.code} className="border-b border-line-soft last:border-b-0">
              <button
                onClick={() => setSelected(o.code)}
                className={`flex w-full items-start justify-between gap-3 border-l-2 px-5 py-4 text-left transition-colors ${selected === o.code ? "border-gold bg-gold-wash" : "border-transparent hover:bg-char"}`}
              >
                <span>
                  <span className="block font-mono text-[12px] text-bone">{o.code}</span>
                  <span className="block text-[12px] text-mute">{time(o.createdAt)} · {o.pharmacy.name}</span>
                </span>
                <Badge tone={badge(o)[1]}>{badge(o)[0]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0">
        {error && (
          <p className="mb-5 flex items-start gap-2 border-l-2 border-alert bg-alert/10 px-4 py-3 text-[13.5px] text-bone">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-alert" /> {error}
          </p>
        )}
        {order && (
          <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <section className="border border-line bg-coal">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.08em] text-mute">ORDER {order.code}</p>
                  <p className="mt-1 font-display text-[30px] leading-none text-ivory">{awaitingPayment(order) ? "Waiting for payment" : label[order.status][0]}</p>
                  <p className="mt-2 text-[13px] text-mute">{order.pharmacy.name}, {order.pharmacy.area} · to {order.deliveryAddress}</p>
                </div>
                <Badge tone={badge(order)[1]}>{badge(order)[0]}</Badge>
              </div>

              {(order.status === "REJECTED" || order.status === "CANCELLED") ? (
                <div className="px-6 py-6">
                  <p className="text-[14px] text-stone">{order.statusNote ?? (order.status === "CANCELLED" ? "This order was cancelled." : "The pharmacist couldn’t approve this order.")}</p>
                  {order.status === "REJECTED" && (
                    <Link href="/scan" className="mt-4 inline-block text-[14px] text-gold hover:text-gold-soft">Upload a new prescription →</Link>
                  )}
                </div>
              ) : (
                <ol className="px-6 py-6">
                  {steps
                    .filter((s) => s.status !== "PHARMACIST_REVIEW" || order.prescription)
                    .map((s, i, all) => {
                      const reachedIdx = all.findIndex((x) => x.status === order.status);
                      const state = i < reachedIdx || order.status === "DELIVERED" ? "done" : i === reachedIdx ? "current" : "next";
                      return (
                        <li key={s.status} className="relative grid grid-cols-[22px_1fr] gap-3 pb-6 last:pb-0">
                          <span className="relative flex justify-center">
                            {i < all.length - 1 && <span className={`absolute top-4 h-[calc(100%+8px)] w-px ${state === "done" ? "bg-gold/50" : "bg-line"}`} />}
                            {state === "done" ? (
                              <span className="relative mt-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gold">
                                <Check className="h-2.5 w-2.5 text-ink" strokeWidth={3} />
                              </span>
                            ) : state === "current" ? (
                              <span className="relative mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-gold bg-ink">
                                <span className="pulse-dot absolute inset-[2px] rounded-full bg-gold" />
                              </span>
                            ) : (
                              <span className="relative mt-0.5 h-3.5 w-3.5 rounded-full border border-line bg-ink" />
                            )}
                          </span>
                          <div>
                            <p className={`text-[14px] ${state === "next" ? "text-mute" : "text-bone"}`}>{s.title}</p>
                            <p className="mt-0.5 text-[12.5px] text-mute">
                              {state === "current" && awaitingPayment(order)
                                ? "Pay to confirm — the pharmacy starts preparing once you’ve paid"
                                : state === "current" && order.statusNote
                                  ? order.statusNote
                                  : s.note}
                              {state === "current" && <span className="text-stone"> · updated {time(order.updatedAt)}</span>}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              )}
            </section>

            <aside className="space-y-4">
              <DeliveryPanel order={order} />
              {["PREPARING", "READY", "PICKED_UP", "DELIVERED"].includes(order.status) && <ReportProblem key={order.code} code={order.code} />}
              {awaitingPayment(order) && (
                <div className="border border-gold/40 bg-gold-wash p-5">
                  <p className="eyebrow text-gold">{order.prescription ? "Prescription approved" : "Pay to confirm"}</p>
                  <p className="mb-4 mt-2 text-[13px] leading-relaxed text-stone">
                    {order.pharmacy.name} starts preparing your order as soon as you&apos;ve paid.
                  </p>
                  <PayButton order={order} onPaid={(paid) => setOrders((os) => os?.map((o) => (o.code === paid.code ? paid : o)) ?? null)} />
                </div>
              )}
              <div className="border border-line bg-coal">
                <ul className="divide-y divide-line-soft px-5">
                  {order.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 py-3 text-[13.5px]">
                      <span className="text-bone">{i.product.name} {i.product.strength} <span className="text-mute">× {i.quantity}</span></span>
                      <span className="font-mono text-[12px] text-stone">{formatKobo(i.unitPriceKobo * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1.5 border-t border-line px-5 py-4 text-[13px]">
                  <div className="flex justify-between text-stone"><dt>Delivery</dt><dd>{formatKobo(order.deliveryKobo)}</dd></div>
                  <div className="flex justify-between text-stone"><dt>Service fee</dt><dd>{formatKobo(order.serviceKobo)}</dd></div>
                  <div className="flex justify-between pt-1 text-[14.5px] text-ivory"><dt>Total</dt><dd>{formatKobo(order.totalKobo)}</dd></div>
                  {order.paymentStatus === "PAID" && (
                    <p className="flex items-center gap-1.5 pt-1 text-[12.5px] text-gold"><Check className="h-3.5 w-3.5" /> Paid{order.paidAt && ` · ${time(order.paidAt)}`}</p>
                  )}
                  {order.paymentStatus === "REFUND_DUE" && (
                    <p className="pt-1 text-[12.5px] text-warn">Refund on its way — this order was cancelled after you paid.</p>
                  )}
                </dl>
                {(order.status === "PHARMACIST_REVIEW" || order.status === "ACCEPTED") && (
                  <div className="border-t border-line px-5 py-4">
                    <button onClick={cancel} disabled={cancelling} className="text-[13px] text-alert hover:underline disabled:opacity-50">
                      {cancelling ? "Cancelling…" : "Cancel order"}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 border border-line-soft px-5 py-4">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
                <p className="text-[12.5px] leading-relaxed text-stone">
                  Your rider sees a sealed parcel, the pharmacy, and your address and first name — never the contents or your
                  prescription. The delivery is only complete when you give them your code.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
