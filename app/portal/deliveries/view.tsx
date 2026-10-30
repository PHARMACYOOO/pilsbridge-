"use client";

import Link from "next/link";
import { useState } from "react";
import { EyeOff, Snowflake } from "lucide-react";
import { usePortal } from "@/components/portal/store";
import { Btn, PortalHeading, Tabs } from "@/components/portal/ui";
import { Badge } from "@/components/ui";
import { clock } from "@/lib/delivery";
import { deliveryStatus, type Order } from "@/lib/portal-data";

type Filter = "action" | "moving" | "done";

/** Paid orders in packing or ready, with no rider booked (e.g. after a failed attempt). */
const needsRider = (o: Order) =>
  (o.status === "preparing" || o.status === "ready") && (!o.delivery || o.delivery.status === "FAILED" || o.delivery.status === "CANCELLED");
const moving = (o: Order) => !!o.delivery && ["AWAITING_RIDER", "ASSIGNED", "PICKED_UP"].includes(o.delivery.status) && !needsRider(o);
const late = (o: Order) => !!o.arriveBy && o.status !== "delivered" && new Date(o.arriveBy).getTime() < Date.now();

export default function DeliveriesView() {
  const { orders, bookRider } = usePortal();
  const [filter, setFilter] = useState<Filter>("moving");
  const [busy, setBusy] = useState<string | null>(null);

  const groups: Record<Filter, Order[]> = {
    action: orders.filter(needsRider),
    moving: orders.filter(moving),
    done: orders.filter((o) => o.delivery?.status === "DELIVERED").slice(0, 30),
  };
  const shown = groups[filter];

  return (
    <>
      <PortalHeading eyebrow="Logistics" title="Deliveries" />
      <p className="mt-3 flex max-w-[76ch] items-start gap-2 text-[13.5px] text-mute">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
        A rider is requested the moment you start preparing a paid order. Riders see the seal number, your pharmacy and the
        drop-off address only — never the items or the prescription — and finish only with the customer&apos;s code.
      </p>

      <div className="mt-8">
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "action", label: "Needs a rider", count: groups.action.length },
            { value: "moving", label: "On the way", count: groups.moving.length },
            { value: "done", label: "Delivered", count: groups.done.length },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-3">
        {shown.length === 0 && (
          <p className="border border-line bg-coal px-5 py-12 text-center text-[13.5px] text-mute">
            {filter === "action" ? "Nothing needs a rider right now." : filter === "moving" ? "No deliveries in progress." : "No deliveries yet."}
          </p>
        )}
        {shown.map((o) => {
          const d = o.delivery;
          const status = needsRider(o) && !d ? null : d ? deliveryStatus[d.status] : null;
          return (
            <div key={o.id} className="grid gap-4 border border-line bg-coal p-5 md:grid-cols-[1fr_1.2fr_1.2fr_auto] md:items-center">
              <div>
                <Link href={`/portal/orders?id=${o.id}`} className="font-mono text-[12px] text-gold hover:text-gold-soft">
                  Order {o.id} →
                </Link>
                {d && <p className="font-mono text-[11px] text-mute">Seal {d.code}</p>}
              </div>
              <div className="text-[13px]">
                <p className="text-bone">{d?.rider ? `${d.rider}${d.partner ? ` · ${d.partner}` : ""}` : d?.status === "AWAITING_RIDER" ? "Finding a rider…" : "No rider booked"}</p>
                {d?.status === "FAILED" && d.failReason && <p className="text-alert">{d.failReason}</p>}
                {d?.pickedUpAt && d.status !== "FAILED" && <p className="text-mute">Collected {clock(d.pickedUpAt)}</p>}
              </div>
              <div className="font-mono text-[11.5px] text-stone">
                <p>{o.status === "delivered" && d?.deliveredAt ? `Delivered ${clock(d.deliveredAt)}` : o.arriveBy ? `Due by ${clock(o.arriveBy)}` : "—"}</p>
                <p className="flex items-center gap-1.5 text-mute">
                  To {o.area} {o.cold && <><Snowflake className="h-3 w-3 text-cold" /> cold box</>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {late(o) && <Badge tone="alert">Late</Badge>}
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
                {needsRider(o) && (
                  <Btn
                    variant="gold"
                    disabled={busy === o.id}
                    onClick={async () => {
                      setBusy(o.id);
                      await bookRider(o.id);
                      setBusy(null);
                    }}
                  >
                    {d?.status === "FAILED" ? "Book another rider" : "Book a rider"}
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
