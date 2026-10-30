"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortal, type TransferAction } from "@/components/portal/store";
import { Btn, PortalHeading, Tabs } from "@/components/portal/ui";
import { Badge } from "@/components/ui";
import type { ApiTransfer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { transferBadge } from "@/lib/portal-data";

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const input = "h-10 border border-line bg-transparent px-3 text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none";
const OPEN = ["DRAFT", "OFFERED", "ACCEPTED", "IN_TRANSIT"];

export default function TransfersView() {
  const { transfers, loading } = usePortal();
  const [tab, setTab] = useState<"open" | "OUTGOING" | "INCOMING" | "closed">("open");
  const list = transfers.filter((t) => (tab === "open" ? OPEN.includes(t.status) : tab === "closed" ? !OPEN.includes(t.status) : t.direction === tab));

  return (
    <>
      <PortalHeading eyebrow="Redistribution" title="Transfers">
        <Link href="/portal/inventory?filter=expiring" className="rounded-[3px] bg-gold px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-gold-soft">
          List surplus stock
        </Link>
      </PortalHeading>
      <p className="mt-3 max-w-[70ch] text-[13.5px] text-mute">
        Every transfer needs a pharmacist&apos;s approval at both ends. Stock is reserved when the receiving pharmacist accepts.
        Batches on recall hold, quarantined, cold-chain, controlled or within 30 days of expiry can&apos;t be moved.
      </p>

      <div className="mt-8">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "open", label: "Open", count: transfers.filter((t) => OPEN.includes(t.status)).length },
            { value: "OUTGOING", label: "Outgoing", count: transfers.filter((t) => t.direction === "OUTGOING").length },
            { value: "INCOMING", label: "Incoming", count: transfers.filter((t) => t.direction === "INCOMING").length },
            { value: "closed", label: "Closed", count: transfers.filter((t) => !OPEN.includes(t.status)).length },
          ]}
        />
      </div>

      <ul className="mt-4 space-y-3">
        {list.map((t) => (
          <TransferCard key={t.id} t={t} />
        ))}
        {list.length === 0 && (
          <li className="border border-line bg-coal px-5 py-8 text-[13.5px] text-mute">
            {loading ? "Loading transfers…" : tab === "open" ? "No open transfers. List surplus stock from Inventory to offer it to other pharmacies." : "Nothing here."}
          </li>
        )}
      </ul>
    </>
  );
}

function TransferCard({ t }: { t: ApiTransfer }) {
  const { transferAction } = usePortal();
  const { user } = useAuth();
  const pharmacist = user?.role === "PHARMACIST";
  const [form, setForm] = useState<null | "reason" | "receive">(null);
  const [reasonFor, setReasonFor] = useState<"cancel" | "decline">("cancel");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const badge = transferBadge(t);
  const out = t.direction === "OUTGOING";
  const other = out ? (t.toPharmacy ? `To ${t.toPharmacy.name}, ${t.toPharmacy.area}` : "Offered to every verified pharmacy") : `From ${t.fromPharmacy.name}, ${t.fromPharmacy.area}`;

  const act = async (action: TransferAction, body?: Record<string, unknown>) => {
    setBusy(true);
    const ok = await transferAction(t.code, action, body);
    setBusy(false);
    if (ok) setForm(null);
  };
  const askReason = (what: "cancel" | "decline") => {
    setReasonFor(what);
    setReason("");
    setForm("reason");
  };

  const actions: React.ReactNode[] = [];
  if (out && t.status === "DRAFT") {
    if (pharmacist) actions.push(<Btn key="p" variant="gold" disabled={busy || !!t.blocked} onClick={() => act("publish")}>Approve &amp; publish</Btn>);
    actions.push(<Btn key="w" disabled={busy} onClick={() => askReason("cancel")}>Withdraw</Btn>);
  }
  if (out && t.status === "OFFERED") actions.push(<Btn key="w" disabled={busy} onClick={() => askReason("cancel")}>Withdraw</Btn>);
  if (out && t.status === "ACCEPTED") {
    actions.push(<Btn key="d" variant="gold" disabled={busy || !!t.blocked} onClick={() => act("dispatch")}>Mark as sent</Btn>);
    if (pharmacist) actions.push(<Btn key="c" disabled={busy} onClick={() => askReason("cancel")}>Cancel</Btn>);
  }
  if (!out && t.status === "OFFERED" && pharmacist) {
    actions.push(<Btn key="a" variant="gold" disabled={busy || !!t.blocked} onClick={() => act("accept")}>Accept</Btn>);
    if (t.toPharmacy) actions.push(<Btn key="x" disabled={busy} onClick={() => askReason("decline")}>Decline</Btn>);
  }
  if (!out && t.status === "ACCEPTED" && pharmacist) actions.push(<Btn key="c" disabled={busy} onClick={() => askReason("cancel")}>Cancel</Btn>);
  if (!out && t.status === "IN_TRANSIT" && pharmacist) actions.push(<Btn key="r" variant="gold" disabled={busy} onClick={() => setForm("receive")}>Check in</Btn>);

  const needsPharmacist = !pharmacist && ((out && t.status === "DRAFT") || (!out && ["OFFERED", "IN_TRANSIT"].includes(t.status)));

  return (
    <li className="border border-line bg-coal p-5">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-mute">
            {t.code} · {out ? "Outgoing" : "Incoming"}
          </p>
          <p className="mt-1.5 text-[15px] text-bone">
            {t.product.name}
            {t.product.strength ? ` ${t.product.strength}` : ""} × {t.quantity}
          </p>
          <p className="font-mono text-[11px] text-mute">
            Batch {t.batch.batchNumber} · expires {monthYear(t.batch.expiresAt)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-stone">{other}</p>
          {t.note && <p className="mt-1 text-[12px] text-mute">“{t.note}”</p>}
          {t.blocked && <p className="mt-1 text-[12px] text-alert">{t.blocked}</p>}
          {t.closeReason && <p className="mt-1 text-[12px] text-mute">{t.status === "DECLINED" ? "Declined" : "Cancelled"}: {t.closeReason}</p>}
          {needsPharmacist && <p className="mt-1 text-[12px] text-mute">A pharmacist approves this step.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {actions}
        </div>
      </div>

      {form === "reason" && (
        <form
          className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            act(reasonFor, { reason: reason.trim() });
          }}
        >
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonFor === "decline" ? "Why are you declining? e.g. We have enough stock" : "Why? e.g. Needed for our own orders"} className={`${input} min-w-0 flex-1`} autoFocus />
          <Btn type="submit" variant="danger" disabled={busy || reason.trim().length < 2}>{reasonFor === "decline" ? "Decline offer" : "Confirm"}</Btn>
          <Btn onClick={() => setForm(null)}>Back</Btn>
        </form>
      )}

      {form === "receive" && (
        <form
          className="mt-4 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            act("receive", { conditionConfirmed: true, priceKobo: Math.round(Number(price) * 100), ...(location.trim() ? { location: location.trim() } : {}) });
          }}
        >
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Your selling price per pack (₦)" className={input} aria-label="Selling price per pack in naira" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Shelf (optional)" className={input} aria-label="Shelf location" />
          <Btn type="submit" variant="gold" disabled={busy || !checked || !(Number(price) > 0)}>Check in</Btn>
          <label className="flex items-start gap-2 text-[12.5px] text-stone sm:col-span-3">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-gold)]" />
            Seal and packaging intact, batch number and expiry match, nothing damaged. If the sending batch went on hold, the stock is checked in to quarantine.
          </label>
        </form>
      )}
    </li>
  );
}
