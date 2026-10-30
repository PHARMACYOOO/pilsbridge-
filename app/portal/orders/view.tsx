"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bike, Search, Snowflake } from "lucide-react";
import { usePortal } from "@/components/portal/store";
import { Btn, Drawer, PortalHeading, Tabs, thead } from "@/components/portal/ui";
import { Badge } from "@/components/ui";
import { naira } from "@/lib/catalog";
import { clock } from "@/lib/delivery";
import { deliveryStatus, nextStep, orderStatus, orderTotal, type Order, type OrderStatus } from "@/lib/portal-data";
import { incidentLabel, type IncidentType } from "@/lib/api";

type Filter = "all" | "review" | "active" | "out" | "done" | "rejected";

const groups: Record<Filter, OrderStatus[] | null> = {
  all: null,
  review: ["pharmacist_review"],
  active: ["accepted", "preparing"],
  out: ["ready", "picked_up"],
  done: ["delivered"],
  rejected: ["rejected", "cancelled"],
};

const flow: OrderStatus[] = ["pharmacist_review", "accepted", "preparing", "ready", "picked_up", "delivered"];

/** Accepted but not paid: the pharmacy waits before preparing. */
const unpaid = (o: Order) => o.status === "accepted" && o.payment === "unpaid";
const badgeFor = (o: Order) => (unpaid(o) ? { label: "Awaiting payment", tone: "warn" as const } : orderStatus[o.status]);
const cols = "grid grid-cols-[minmax(120px,0.9fr)_1fr_2fr_1.3fr_0.8fr] items-center";

export default function OrdersView() {
  const { orders, prescriptions, setOrderStatus, bookRider, handover, reportIncident } = usePortal();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setOpenId(id);
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return orders.filter((o) => {
      const g = groups[filter];
      if (g && !g.includes(o.status)) return false;
      return !term || [o.id, o.customer, o.area, ...o.items.map((i) => i.name)].some((f) => f.toLowerCase().includes(term));
    });
  }, [orders, filter, q]);

  const open = orders.find((o) => o.id === openId) ?? null;
  const count = (f: Filter) => orders.filter((o) => !groups[f] || groups[f]!.includes(o.status)).length;

  return (
    <>
      <PortalHeading eyebrow="Pharmacy" title="Orders">
        <label className="flex items-center gap-2 border border-line px-3 focus-within:border-gold">
          <Search className="h-3.5 w-3.5 text-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order, customer or item"
            className="h-10 w-56 bg-transparent text-[13px] text-bone placeholder:text-mute focus:outline-none"
          />
        </label>
      </PortalHeading>

      <div className="mt-8">
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: count("all") },
            { value: "review", label: "Pharmacist review", count: count("review") },
            { value: "active", label: "To prepare", count: count("active") },
            { value: "out", label: "Ready & in transit", count: count("out") },
            { value: "done", label: "Delivered", count: count("done") },
            { value: "rejected", label: "Rejected", count: count("rejected") },
          ]}
        />
      </div>

      <div className="mt-4 overflow-x-auto border border-line bg-coal">
        <div className="min-w-[760px] text-[13px]">
          <div className={`${cols} ${thead}`}>
            <span className="px-5 py-3">Order</span>
            <span className="px-3 py-3">Customer</span>
            <span className="px-3 py-3">Items</span>
            <span className="px-3 py-3">Status</span>
            <span className="px-5 py-3 text-right">Total</span>
          </div>
          {shown.map((o) => (
            <button key={o.id} onClick={() => setOpenId(o.id)} className={`${cols} w-full border-t border-line-soft text-left transition-colors hover:bg-char`}>
              <span className="px-5 py-3.5">
                <span className="block whitespace-nowrap font-mono text-[12px] text-bone">{o.id}</span>
                <span className="block font-mono text-[10.5px] text-mute">{o.time}</span>
              </span>
              <span className="px-3 py-3.5">
                <span className="block text-bone">{o.customer}</span>
                <span className="block text-[11.5px] text-mute">{o.area}</span>
              </span>
              <span className="px-3 py-3.5 text-stone">
                {o.items.map((i) => i.name.split(" · ")[0]).join(", ")}
                {o.rx && <span className="ml-2"><Badge tone="pom">Rx</Badge></span>}
              </span>
              <span className="px-3 py-3.5"><Badge tone={badgeFor(o).tone}>{badgeFor(o).label}</Badge></span>
              <span className="px-5 py-3.5 text-right font-mono text-[12px] text-bone">{naira(orderTotal(o))}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="border-t border-line-soft px-5 py-12 text-center text-[13.5px] text-mute">No orders match.</p>}
        </div>
      </div>

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? `ORDER ${open.id}` : ""}>
        {open && (
          <OrderDetail
            order={open}
            rxId={prescriptions.find((r) => r.orderId === open.id)?.id}
            onStatus={(s, note) => setOrderStatus(open.id, s, note)}
            onBookRider={() => bookRider(open.id)}
            onHandover={(seal) => handover(open.id, seal)}
            onIncident={(type, text) => reportIncident(open.id, type, text)}
          />
        )}
      </Drawer>
    </>
  );
}

function OrderDetail({
  order,
  rxId,
  onStatus,
  onBookRider,
  onHandover,
  onIncident,
}: {
  order: Order;
  rxId?: string;
  onStatus: (s: OrderStatus, note?: string) => Promise<boolean>;
  onBookRider: () => Promise<boolean>;
  onHandover: (sealCode: string) => Promise<boolean>;
  onIncident: (type: IncidentType, description: string) => Promise<boolean>;
}) {
  const [seal, setSeal] = useState("");
  const [reporting, setReporting] = useState(false);
  const [incident, setIncident] = useState<{ type: IncidentType; text: string }>({ type: "DAMAGED", text: "" });
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const act = (s: OrderStatus, note?: string) => run(() => onStatus(s, note));
  const d = order.delivery;
  const needsRider = (order.status === "preparing" || order.status === "ready") && (!d || d.status === "FAILED" || d.status === "CANCELLED");
  const step = nextStep[order.status];
  const reached = flow.indexOf(order.status);
  const cold = order.cold;

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-[28px] leading-none text-ivory">{order.customer}</p>
          <p className="mt-1.5 text-[13px] text-mute">Delivery to {order.area} · placed {order.time}</p>
        </div>
        <Badge tone={badgeFor(order).tone}>{badgeFor(order).label}</Badge>
      </div>

      <p className="mt-4 font-mono text-[11.5px] text-stone">
        {order.payment === "paid" ? "Paid" : order.payment === "refund_due" ? "Refund due — paid, then cancelled" : "Not paid yet"}
        {order.arriveBy && order.status !== "delivered" && ` · customer expects it by ${clock(order.arriveBy)}`}
      </p>

      {order.note && (
        <p className="mt-5 flex items-start gap-2 border-l-2 border-warn bg-warn/10 px-3.5 py-2.5 text-[13px] text-bone">
          {cold && <Snowflake className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cold" />}
          {order.note}
        </p>
      )}

      <ul className="mt-6 divide-y divide-line-soft border-y border-line-soft">
        {order.items.map((i) => (
          <li key={i.name} className="flex items-center justify-between gap-4 py-3 text-[13.5px]">
            <span className="text-bone">{i.name} <span className="text-mute">× {i.qty}</span></span>
            <span className="font-mono text-[12px] text-stone">{naira(i.qty * i.price)}</span>
          </li>
        ))}
        <li className="flex justify-between py-3 text-[14px]">
          <span className="text-stone">Total</span>
          <span className="text-ivory">{naira(orderTotal(order))}</span>
        </li>
      </ul>

      {(d || needsRider) && order.status !== "cancelled" && (
        <div className="mt-6 border border-line-soft bg-char p-4">
          <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">
            <Bike className="h-3.5 w-3.5 text-gold" /> Delivery {d && <span className="text-stone">· seal {d.code}</span>}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px] text-bone">
              {!d || needsRider
                ? d?.status === "FAILED"
                  ? `Failed: ${d.failReason}. The parcel is coming back — book another rider when it’s here.`
                  : "No rider booked."
                : d.rider
                  ? `${d.rider}${d.partner ? ` (${d.partner})` : ""} — ${deliveryStatus[d.status].label.toLowerCase()}`
                  : deliveryStatus[d.status].label}
            </p>
            {d && !needsRider && <Badge tone={deliveryStatus[d.status].tone}>{deliveryStatus[d.status].label}</Badge>}
          </div>
          {d && order.status === "preparing" && !needsRider && (
            <p className="mt-2 text-[12.5px] text-mute">Write seal code <span className="font-mono text-bone">{d.code}</span> on the parcel label when you seal it.</p>
          )}
          {order.status === "ready" && d?.status === "ASSIGNED" && (
            <form
              className="mt-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onHandover(seal)) setSeal("");
              }}
            >
              <p className="text-[12.5px] text-mute">
                Ask the {d.provider === "COURIER" ? "courier" : "rider"} to show their job’s seal code. Hand over only if it matches the parcel label.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={seal}
                  onChange={(e) => setSeal(e.target.value.toUpperCase())}
                  placeholder="Seal code they show, e.g. DL-9F2C41AA"
                  className="h-10 min-w-0 flex-1 border border-line bg-transparent px-3 font-mono text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none"
                />
                <Btn type="submit" variant="gold" disabled={busy || seal.trim().length < 4}>Hand over</Btn>
              </div>
            </form>
          )}
          {needsRider && (
            <div className="mt-3">
              <Btn variant="gold" disabled={busy} onClick={() => run(onBookRider)}>
                {d?.status === "FAILED" ? "Book another rider" : "Book a rider"}
              </Btn>
            </div>
          )}
        </div>
      )}

      {order.status !== "rejected" && order.status !== "cancelled" && (
        <ol className="mt-6 space-y-3">
          {flow.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-[13px]">
              <span className={`h-2 w-2 rounded-full ${i < reached ? "bg-gold" : i === reached ? "pulse-dot bg-gold" : "bg-line"}`} />
              <span className={i <= reached ? "text-bone" : "text-mute"}>{orderStatus[s].label}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {order.status === "pharmacist_review" && rxId && (
          <Link
            href={`/portal/prescriptions?id=${rxId}`}
            className="inline-flex items-center gap-2 rounded-[3px] bg-gold px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-gold-soft"
          >
            Review prescription {rxId} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {step && (
          <Btn variant="gold" disabled={busy || unpaid(order)} onClick={() => act(step.to)}>
            {unpaid(order) ? "Waiting for the customer to pay" : step.label}
          </Btn>
        )}
        {(order.status === "accepted" || order.status === "preparing" || order.status === "ready") && (
          <Btn variant="danger" disabled={busy} onClick={() => act("cancelled", "Cancelled by pharmacy")}>
            Cancel order
          </Btn>
        )}
        {order.status !== "pharmacist_review" && (
          <Btn onClick={() => setReporting((r) => !r)}>Report a problem</Btn>
        )}
        {(order.status === "picked_up" || order.status === "ready") && (
          <Link href="/portal/deliveries" className="inline-flex items-center gap-2 rounded-[3px] border border-line px-4 py-2.5 text-[13px] text-bone hover:border-gold">
            Track delivery <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {reporting && (
        <form
          className="mt-4 space-y-2 border border-line-soft bg-char p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            let ok = false;
            await run(async () => (ok = await onIncident(incident.type, incident.text.trim())));
            if (ok) {
              setReporting(false);
              setIncident({ type: "DAMAGED", text: "" });
            }
          }}
        >
          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Report a problem with this parcel</p>
          <select
            value={incident.type}
            onChange={(e) => setIncident({ ...incident, type: e.target.value as IncidentType })}
            className="h-10 w-full border border-line bg-coal px-3 text-[13px] text-bone focus:border-gold focus:outline-none"
          >
            {(Object.keys(incidentLabel) as IncidentType[]).map((t) => (
              <option key={t} value={t}>{incidentLabel[t]}</option>
            ))}
          </select>
          <textarea
            value={incident.text}
            onChange={(e) => setIncident({ ...incident, text: e.target.value })}
            placeholder="What happened? Seal, condition, temperature reading…"
            rows={3}
            className="w-full border border-line bg-transparent px-3 py-2 text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none"
          />
          <p className="text-[12px] text-mute">Tampering, loss and temperature problems alert the operations team and your pharmacists by text straight away.</p>
          <Btn type="submit" variant="danger" disabled={busy || incident.text.trim().length < 5}>Report</Btn>
        </form>
      )}
    </div>
  );
}