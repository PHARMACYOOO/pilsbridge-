"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, ShieldCheck, ThermometerSnowflake, TriangleAlert } from "lucide-react";
import ExpiryBars, { type ExpiryMonth } from "@/components/ExpiryBars";
import { usePortal } from "@/components/portal/store";
import { useAuth } from "@/lib/auth";
import { Panel, PanelLink, thead } from "@/components/portal/ui";
import { Badge } from "@/components/ui";
import { naira } from "@/lib/catalog";
import { api, formatKobo, type ApiSettlements } from "@/lib/api";
import { orderStatus, orderTotal, transferBadge } from "@/lib/portal-data";


const cols = "grid grid-cols-[minmax(130px,0.8fr)_2fr_1.3fr_0.8fr] items-center";

export default function Overview() {
  const { orders, prescriptions, stock, transfers, loading } = usePortal();
  const { user } = useAuth();
  const pharmacist = user?.role === "PHARMACIST";
  const [owed, setOwed] = useState<ApiSettlements["unsettled"] | null>(null);
  useEffect(() => {
    if (!pharmacist) return;
    api<ApiSettlements>("/pharmacy/settlements")
      .then((s) => setOwed(s.unsettled))
      .catch(() => setOwed(null));
  }, [pharmacist]);
  const now = new Date();
  const today = now.toDateString();
  const ordersToday = orders.filter((o) => o.createdAt && new Date(o.createdAt).toDateString() === today).length;
  const open = orders.filter((o) => ["pharmacist_review", "accepted", "preparing", "ready"].includes(o.status)).length;
  const quarantined = stock.filter((b) => b.status === "quarantined");
  const waitingRx = prescriptions.filter((r) => r.status === "pending");
  const licenceDays = user?.pharmacy ? Math.ceil((new Date(user.pharmacy.licenceExpiresAt).getTime() - now.getTime()) / 86_400_000) : null;
  const alerts = [
    ...(waitingRx.length
      ? [{ icon: TriangleAlert, tone: "text-warn", title: `${waitingRx.length} prescription${waitingRx.length > 1 ? "s" : ""} waiting`, body: `Oldest has waited ${waitingRx[0]?.waiting ?? "a while"}. Orders stay on hold until a pharmacist decides.`, href: "/portal/prescriptions" }]
      : []),
    ...(quarantined.length
      ? [{ icon: ThermometerSnowflake, tone: "text-alert", title: `${quarantined.length} batch${quarantined.length > 1 ? "es" : ""} quarantined`, body: quarantined.slice(0, 2).map((b) => `${b.name} (${b.batch})${b.reason ? ` — ${b.reason}` : ""}`).join("; "), href: "/portal/inventory?filter=quarantined" }]
      : []),
    ...(licenceDays !== null && licenceDays <= 60
      ? [{ icon: ShieldCheck, tone: "text-warn", title: "Premises licence renewal", body: `Your licence expires in ${licenceDays} day${licenceDays === 1 ? "" : "s"}. Upload the renewed certificate to stay listed.`, href: "/portal/compliance" }]
      : []),
  ];
  // Packs reaching expiry in each of the next six months, from live inventory (saleable or not).
  const months: (ExpiryMonth & { key: string; top?: string })[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, m: d.toLocaleDateString("en-GB", { month: "short" }), units: 0, skus: 0 };
  });
  for (const b of stock) {
    const slot = months.find((x) => x.key === b.expiry);
    if (slot && b.onHand > 0) {
      slot.units += b.onHand;
      slot.skus += 1;
    }
  }
  const peakMonth = months.reduce((a, b) => (b.units > a.units ? b : a), months[0]);
  const peakBatch = stock.filter((b) => b.expiry === peakMonth.key && b.onHand > 0).sort((a, b) => b.onHand - a.onHand)[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const pendingRx = prescriptions.filter((r) => r.status === "pending").length;
  const shortDated = stock.filter((s) => s.status === "expiring").length;

  const kpis = [
    { k: "Orders today", v: loading ? "—" : String(ordersToday), d: `${open} open in the queue`, href: "/portal/orders" },
    { k: "Awaiting pharmacist", v: loading ? "—" : String(pendingRx), d: loading ? "Loading…" : pendingRx ? `Oldest ${waitingRx[0]?.waiting ?? ""}` : "Queue clear", warn: !loading && pendingRx > 0, href: "/portal/prescriptions" },
    { k: "Short-dated batches", v: loading ? "—" : String(shortDated), d: "Expire within 6 months", href: "/portal/inventory?filter=expiring" },
    pharmacist
      ? { k: "Not yet settled", v: owed ? formatKobo(owed.netKobo) : "—", d: owed ? `${owed.orderCount} delivered order${owed.orderCount === 1 ? "" : "s"} · after commission` : "Loading…", href: "/portal/settlements" }
      : { k: "Open transfers", v: String(transfers.filter((t) => ["DRAFT", "OFFERED", "ACCEPTED", "IN_TRANSIT"].includes(t.status)).length), d: "Across both directions", href: "/portal/transfers" },
  ];

  const live = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).slice(0, 5);
  const offers = transfers.filter((t) => ["DRAFT", "OFFERED", "ACCEPTED", "IN_TRANSIT"].includes(t.status)).slice(0, 4);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-gold">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-2 font-display text-[40px] leading-none text-ivory">
            {greeting}
            {user?.firstName ? `, ${user.firstName}` : ""}.
          </h1>
        </div>
        <span className="font-mono text-[11px] text-mute">Live data · refreshes every 30 s</span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-px border border-line bg-line xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.k} href={k.href} className="group bg-coal p-5 transition-colors hover:bg-char">
            <p className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.08em] text-mute">
              {k.k}
              <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
            <p className={`mt-3 font-display text-[38px] leading-none ${k.warn ? "text-warn" : "text-ivory"}`}>{k.v}</p>
            <p className="mt-2 text-[12px] text-mute">{k.d}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Live orders" action={<PanelLink href="/portal/orders">View all →</PanelLink>}>
          <div className="overflow-x-auto">
            <div className="min-w-[620px] text-[13px]">
              <div className={`${cols} ${thead}`}>
                <span className="px-5 py-3">Order</span>
                <span className="px-3 py-3">Items</span>
                <span className="px-3 py-3">Status</span>
                <span className="px-5 py-3 text-right">Total</span>
              </div>
              {live.map((o) => (
                <Link key={o.id} href={`/portal/orders?id=${o.id}`} className={`${cols} border-t border-line-soft transition-colors hover:bg-char`}>
                  <span className="px-5 py-3.5">
                    <span className="block whitespace-nowrap font-mono text-[12px] text-bone">{o.id}</span>
                    <span className="block font-mono text-[10.5px] text-mute">{o.time}</span>
                  </span>
                  <span className="px-3 py-3.5 text-stone">
                    {o.items.map((i) => i.name.split(" · ")[0]).join(", ")}
                    {o.rx && <span className="ml-2"><Badge tone="pom">Rx</Badge></span>}
                  </span>
                  <span className="px-3 py-3.5"><Badge tone={orderStatus[o.status].tone}>{orderStatus[o.status].label}</Badge></span>
                  <span className="px-5 py-3.5 text-right font-mono text-[12px] text-bone">{naira(orderTotal(o))}</span>
                </Link>
              ))}
              {live.length === 0 && <p className="border-t border-line-soft px-5 py-8 text-[13.5px] text-mute">{loading ? "Loading orders…" : "No open orders right now."}</p>}
            </div>
          </div>
        </Panel>

        <Panel title="Needs attention" action={<span className="font-mono text-[11px] text-mute">{alerts.length}</span>}>
          {alerts.length === 0 && <p className="px-5 py-8 text-[13.5px] text-mute">Nothing needs attention right now.</p>}
          <ul className="divide-y divide-line-soft">
            {alerts.map(({ icon: Icon, tone, title, body, href }) => (
              <li key={title}>
                <Link href={href} className="group flex gap-3.5 px-5 py-4 transition-colors hover:bg-char">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} strokeWidth={1.75} />
                  <span className="flex-1">
                    <span className="block text-[13.5px] text-bone">{title}</span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-mute">{body}</span>
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-mute transition-colors group-hover:text-gold" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <div className="p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[15px] text-bone">Units reaching expiry</h2>
              <PanelLink href="/portal/inventory?filter=expiring">Short-dated stock →</PanelLink>
            </div>
            <p className="mt-1 text-[12.5px] text-mute">
              {peakMonth.units === 0
                ? "Nothing expires in the next six months."
                : `${peakMonth.m} is the peak — largest batch: ${peakBatch?.name} ${peakBatch?.batch} (${peakBatch?.onHand} packs).`}
            </p>
            <div className="mt-6">
              <ExpiryBars data={months} />
            </div>
          </div>
        </Panel>

        <Panel title="Open transfers" action={<PanelLink href="/portal/transfers">View all →</PanelLink>}>
          {offers.length === 0 && <p className="px-5 py-8 text-[13.5px] text-mute">{loading ? "Loading…" : "No open transfers. Offer surplus stock from Inventory."}</p>}
          <ul className="divide-y divide-line-soft">
            {offers.map((t) => {
              const badge = transferBadge(t);
              return (
                <li key={t.id}>
                  <Link href="/portal/transfers" className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-char">
                    <span className="min-w-0">
                      <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                        {t.code} · {t.direction === "OUTGOING" ? "Outgoing" : "Incoming"}
                      </span>
                      <span className="mt-1 block truncate text-[13.5px] text-bone">{t.product.name} × {t.quantity}</span>
                      <span className="block truncate text-[12px] text-mute">
                        {t.direction === "OUTGOING" ? (t.toPharmacy ? `To ${t.toPharmacy.name}` : "Offered to the network") : `From ${t.fromPharmacy.name}`}
                      </span>
                    </span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
