"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Snowflake } from "lucide-react";
import { usePortal } from "@/components/portal/store";
import { api, type ApiPharmacy, type ApiProduct } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Btn, Drawer, PortalHeading, Tabs, thead } from "@/components/portal/ui";
import { Badge } from "@/components/ui";
import { stockStatus, type StockItem, type StockStatus } from "@/lib/portal-data";

type Filter = "all" | StockStatus;
const cols = "grid grid-cols-[2fr_1fr_0.8fr_0.7fr_0.8fr_1fr] items-center";

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};
const monthsLeft = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
};

export default function InventoryView() {
  const { stock } = usePortal();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openSku, setOpenSku] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get("filter");
    if (f && f in stockStatus) setFilter(f as StockStatus);
    if (p.get("q")) setQ(p.get("q")!);
  }, []);

  // First expiry, first out: soonest-expiring batches on top.
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return stock
      .filter((s) => (filter === "all" || s.status === filter) && (!term || [s.name, s.batch, s.sku, s.location].some((f) => f.toLowerCase().includes(term))))
      .sort((a, b) => a.expiry.localeCompare(b.expiry));
  }, [stock, filter, q]);

  const open = stock.find((s) => s.sku === openSku) ?? null;
  const count = (f: Filter) => stock.filter((s) => f === "all" || s.status === f).length;

  return (
    <>
      <PortalHeading eyebrow="Pharmacy" title="Inventory">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 border border-line px-3 focus-within:border-gold">
            <Search className="h-3.5 w-3.5 text-mute" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product, batch or location" className="h-10 w-52 bg-transparent text-[13px] text-bone placeholder:text-mute focus:outline-none" />
          </label>
          <Btn variant="gold" onClick={() => setReceiving(true)}>
            <Plus className="h-4 w-4" /> Receive stock
          </Btn>
        </div>
      </PortalHeading>

      <div className="mt-8">
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All batches", count: count("all") },
            { value: "expiring", label: "Short-dated", count: count("expiring") },
            { value: "low", label: "Low stock", count: count("low") },
            { value: "quarantined", label: "Quarantined", count: count("quarantined") },
          ]}
        />
      </div>

      <p className="mt-3 font-mono text-[10.5px] text-mute">Sorted first-expiry-first-out · pick from the top</p>

      <div className="mt-3 overflow-x-auto border border-line bg-coal">
        <div className="min-w-[780px] text-[13px]">
          <div className={`${cols} ${thead}`}>
            <span className="px-5 py-3">Product · batch</span>
            <span className="px-3 py-3">Location</span>
            <span className="px-3 py-3">Expiry</span>
            <span className="px-3 py-3 text-right">On hand</span>
            <span className="px-3 py-3 text-right">Sells / mo</span>
            <span className="px-5 py-3">Status</span>
          </div>
          {shown.map((s) => (
            <button key={s.sku} onClick={() => setOpenSku(s.sku)} className={`${cols} w-full border-t border-line-soft text-left transition-colors hover:bg-char`}>
              <span className="px-5 py-3.5">
                <span className="flex items-center gap-2 text-bone">
                  {s.name}
                  {s.rx && <Badge tone="pom">Rx</Badge>}
                  {s.cold && <Snowflake className="h-3 w-3 text-cold" />}
                </span>
                <span className="block font-mono text-[10.5px] text-mute">{s.batch}</span>
              </span>
              <span className="px-3 py-3.5 text-stone">{s.location}</span>
              <span className={`px-3 py-3.5 font-mono text-[12px] ${monthsLeft(s.expiry) <= 6 ? "text-warn" : "text-stone"}`}>{monthLabel(s.expiry)}</span>
              <span className={`px-3 py-3.5 text-right font-mono text-[12px] ${s.onHand <= s.reorderAt ? "text-warn" : "text-bone"}`}>{s.onHand}</span>
              <span className="px-3 py-3.5 text-right font-mono text-[12px] text-stone">{s.monthly || "—"}</span>
              <span className="px-5 py-3.5"><Badge tone={stockStatus[s.status].tone}>{stockStatus[s.status].label}</Badge></span>
            </button>
          ))}
          {shown.length === 0 && <p className="border-t border-line-soft px-5 py-12 text-center text-[13.5px] text-mute">No batches match.</p>}
        </div>
      </div>

      <Drawer open={!!open} onClose={() => setOpenSku(null)} title={open ? `BATCH ${open.batch}` : ""}>
        {open && <BatchDetail key={open.sku} item={open} />}
      </Drawer>

      <Drawer open={receiving} onClose={() => setReceiving(false)} title="RECEIVE STOCK">
        <ReceiveForm onDone={() => setReceiving(false)} />
      </Drawer>
    </>
  );
}

function BatchDetail({ item }: { item: StockItem }) {
  const { adjustBatch, quarantineBatch, releaseBatch, createTransfer } = usePortal();
  const { user } = useAuth();
  const isPharmacist = user?.role === "PHARMACIST";
  const [adjust, setAdjust] = useState("");
  const [reason, setReason] = useState("Damaged");
  const [qty, setQty] = useState(String(Math.min(10, item.onHand)));
  const [toPharmacy, setToPharmacy] = useState("");
  const [partners, setPartners] = useState<ApiPharmacy[]>([]);
  const [qa, setQa] = useState(false);
  const [quarantineReason, setQuarantineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = item.status !== "quarantined" && !item.cold;

  useEffect(() => {
    if (!eligible) return;
    api<ApiPharmacy[]>("/pharmacies", { auth: false })
      .then((ps) => setPartners(ps.filter((p) => p.id !== user?.pharmacyId)))
      .catch(() => setPartners([]));
  }, [eligible, user?.pharmacyId]);
  const recalled = item.reason === "Recalled";

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    return ok;
  };

  return (
    <div className="space-y-8 px-6 py-6">
      <div>
        <p className="font-display text-[28px] leading-tight text-ivory">{item.name}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={stockStatus[item.status].tone}>{stockStatus[item.status].label}</Badge>
          {item.rx && <Badge tone="pom">Prescription-only</Badge>}
          {item.cold && <Badge tone="cold">2–8 °C</Badge>}
        </div>
        {item.reason && <p className="mt-4 border-l-2 border-alert bg-alert/10 px-3.5 py-2.5 text-[13px] text-bone">{item.reason}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-px border border-line-soft bg-line-soft text-[13px]">
          {[
            ["On hand", String(item.onHand)],
            ["Price per pack", item.priceKobo ? `₦${(item.priceKobo / 100).toLocaleString("en-NG")}` : "—"],
            ["Expiry", monthLabel(item.expiry)],
            ["Months left", String(monthsLeft(item.expiry))],
            ["Location", item.location],
            ["Sells / month", item.monthly ? String(item.monthly) : "Not enough history"],
          ].map(([k, v]) => (
            <div key={k} className="bg-coal px-4 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">{k}</dt>
              <dd className="mt-1 text-bone">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {item.status === "quarantined" ? (
        <div>
          <p className="eyebrow text-mute">Quality assessment</p>
          {recalled ? (
            <p className="mt-3 text-[13px] text-stone">Recalled stock can&apos;t be released here. Follow the supplier&apos;s recall instructions.</p>
          ) : !isPharmacist ? (
            <p className="mt-3 text-[13px] text-stone">Only a registered pharmacist can release quarantined stock.</p>
          ) : (
            <>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-[13.5px] text-stone">
                <input type="checkbox" checked={qa} onChange={() => setQa(!qa)} className="mt-0.5 h-4 w-4 accent-[var(--color-gold)]" />
                I have assessed this batch (temperature log, packaging, recall status) and it is fit for sale.
              </label>
              <div className="mt-4 flex gap-3">
                <Btn variant="gold" disabled={!qa || busy} onClick={() => act(() => releaseBatch(item.sku))}>
                  Release to stock
                </Btn>
                <Btn variant="danger" disabled={busy || item.onHand === 0} onClick={() => act(() => adjustBatch(item.sku, -item.onHand, "Written off for destruction"))}>
                  Write off
                </Btn>
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          <p className="eyebrow text-mute">Redistribute surplus</p>
          {eligible ? (
            <>
              <p className="mt-2 text-[13px] text-stone">
                Offer units to other verified pharmacies. This creates a draft; a pharmacist publishes it, and the receiving
                pharmacist accepts before anything moves.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input type="number" min={1} max={item.onHand} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Packs to transfer" className="h-10 w-24 border border-line bg-transparent px-3 font-mono text-[13px] text-bone focus:border-gold focus:outline-none" />
                <select value={toPharmacy} onChange={(e) => setToPharmacy(e.target.value)} aria-label="Offer to" className="h-10 min-w-0 flex-1 border border-line bg-coal px-3 text-[13px] text-bone focus:border-gold focus:outline-none">
                  <option value="">Every verified pharmacy</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}, {p.area}</option>
                  ))}
                </select>
                <Btn variant="gold" disabled={busy || !(+qty > 0 && +qty <= item.onHand)} onClick={() => act(() => createTransfer(item.sku, +qty, toPharmacy || undefined))}>
                  List for transfer
                </Btn>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-mute">Cold-chain products can only be transferred through an equipped logistics partner — contact support.</p>
          )}
        </div>
      )}

      <div>
        <p className="eyebrow text-mute">Stock adjustment</p>
        <div className="mt-3 grid grid-cols-[96px_1fr_auto] gap-3">
          <input type="number" placeholder="−2" value={adjust} onChange={(e) => setAdjust(e.target.value)} className="h-10 border border-line bg-transparent px-3 font-mono text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none" />
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 border border-line bg-coal px-2 text-[13px] text-bone focus:border-gold focus:outline-none">
            {["Damaged", "Count correction", "Returned by patient", "Expired — removed"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <Btn
            disabled={busy || !adjust || Number.isNaN(+adjust) || +adjust === 0 || item.onHand + +adjust < 0}
            onClick={async () => {
              if (await act(() => adjustBatch(item.sku, Math.trunc(+adjust), reason))) setAdjust("");
            }}
          >
            Apply
          </Btn>
        </div>
        {item.status !== "quarantined" && (
          <div className="mt-6">
            <p className="eyebrow text-mute">Quarantine</p>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
              <input
                value={quarantineReason}
                onChange={(e) => setQuarantineReason(e.target.value)}
                placeholder="Reason — e.g. Fridge 2 temperature excursion"
                className="h-10 border border-line bg-transparent px-3 text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none"
              />
              <Btn variant="danger" disabled={busy || quarantineReason.trim().length < 2} onClick={() => act(() => quarantineBatch(item.sku, quarantineReason.trim()))}>
                Quarantine
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const field = "mt-2 h-10 w-full border-b border-line bg-transparent text-[14px] text-bone placeholder:text-mute/70 focus:border-gold focus:outline-none [color-scheme:dark]";

function ReceiveForm({ onDone }: { onDone: () => void }) {
  const { receiveBatch } = usePortal();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [form, setForm] = useState({ productId: "", batchNumber: "", expiry: "", quantity: "", price: "", location: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api<ApiProduct[]>("/products", { auth: false }).then(setProducts).catch(() => setProducts([]));
  }, []);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const [y, m] = form.expiry.split("-").map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // a batch "expires 03/2027" is good to the month's end
        setBusy(true);
        const ok = await receiveBatch({
          productId: form.productId,
          batchNumber: form.batchNumber.trim(),
          expiresAt: lastDay,
          quantity: Number(form.quantity),
          priceKobo: Math.round(Number(form.price) * 100),
          ...(form.location.trim() ? { location: form.location.trim() } : {}),
        });
        setBusy(false);
        if (ok) onDone();
      }}
      className="space-y-5 px-6 py-6"
    >
      <label className="block">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Product</span>
        <select required value={form.productId} onChange={set("productId")} className={`${field} bg-coal`}>
          <option value="" disabled>Select a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.strength ?? ""} · {p.packDescription}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Batch / lot number</span>
        <input required value={form.batchNumber} onChange={set("batchNumber")} placeholder="As printed on the pack" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-5">
        <label className="block">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Expiry (month)</span>
          <input required type="month" value={form.expiry} onChange={set("expiry")} className={field} />
        </label>
        <label className="block">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Packs received</span>
          <input required type="number" min={1} value={form.quantity} onChange={set("quantity")} className={field} />
        </label>
        <label className="block">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Selling price per pack (₦)</span>
          <input required type="number" min={1} step="0.01" value={form.price} onChange={set("price")} className={field} />
        </label>
        <label className="block">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Location (optional)</span>
          <input value={form.location} onChange={set("location")} placeholder="Shelf B3" className={field} />
        </label>
      </div>
      <p className="text-[12px] text-mute">Batches without a batch number and expiry date can&apos;t be sold or listed for transfer. Expired batches are refused.</p>
      <Btn variant="gold" type="submit" disabled={busy}>{busy ? "Adding…" : "Add to inventory"}</Btn>
    </form>
  );
}
