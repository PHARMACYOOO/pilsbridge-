"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, Camera, CircleAlert, Info, MapPin, Minus, Plus, Search, ShieldCheck, X } from "lucide-react";
import { Badge } from "./ui";
import { ClassBadge, OrderTotals } from "./OrderSummary";
import { formatKobo } from "@/lib/api";
import { useBag, useOrderTotals, useQuotes, useSavedAddress } from "@/lib/bag";
import { naira, type Product } from "@/lib/catalog";
import { etaLabel, useAreas, useDeliveryArea, useDropoffPin } from "@/lib/delivery";
import { useCatalog } from "@/lib/useCatalog";

export default function OrderClient() {
  const { products, pharmacies, loading, offline } = useCatalog();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [rxOnly, setRxOnly] = useState<"all" | "OTC" | "POM">("all");
  const [bag, setBag] = useBag(products);
  // Delivery details are entered at checkout; any saved ones still sharpen the estimate here.
  const [area] = useDeliveryArea();
  const [pin] = useDropoffPin();
  const [address] = useSavedAddress();
  const areas = useAreas();
  const { quotes, pharmacyId, setPharmacyId } = useQuotes(bag, offline, area);
  const { needsRx, quote, live, deliveryKobo, totalKobo } = useOrderTotals(bag, quotes, pharmacyId, pin, address);
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== "All" && p.category !== cat) return false;
      if (rxOnly === "OTC" && p.classification === "POM") return false;
      if (rxOnly === "POM" && p.classification !== "POM") return false;
      return !q || [p.name, p.generic, p.category, p.form, p.uses ?? ""].some((f) => f.toLowerCase().includes(q));
    });
  }, [products, query, cat, rxOnly]);

  const pharmacyName = quote?.pharmacy.name ?? pharmacies.find((p) => p.id === pharmacyId)?.name;
  const areaName = areas.find((a) => a.key === area)?.name ?? "";

  const add = (p: Product) =>
    setBag((b) => {
      const hit = b.find((l) => l.product.id === p.id);
      if (hit) return b.map((l) => (l.product.id === p.id ? { ...l, qty: Math.min(l.qty + 1, 5) } : l));
      return [...b, { product: p, qty: 1 }];
    });

  const setQty = (id: string, d: number) =>
    setBag((b) =>
      b.flatMap((l) => {
        if (l.product.id !== id) return [l];
        const qty = l.qty + d;
        return qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, 5) }];
      }),
    );

  return (
    <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-24 pt-10 sm:px-8 lg:grid-cols-[1fr_380px]">
      {/* ——— Catalogue ——— */}
      <div className="min-w-0">
        <label className="flex items-center gap-3 border border-line bg-coal px-4 transition-colors focus-within:border-gold">
          <Search className="h-4.5 w-4.5 shrink-0 text-mute" strokeWidth={1.75} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or condition — e.g. malaria, typhoid, amlodipine"
            className="h-14 w-full bg-transparent text-[15px] text-bone placeholder:text-mute focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="text-mute hover:text-bone">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="-mx-1 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-[2px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                  cat === c ? "border-gold bg-gold text-ink" : "border-line text-stone hover:border-stone hover:text-bone"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex border border-line font-mono text-[11px]">
            {(["all", "OTC", "POM"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setRxOnly(k)}
                className={`px-3 py-1.5 uppercase tracking-[0.06em] transition-colors ${rxOnly === k ? "bg-graphite text-gold-soft" : "text-mute hover:text-bone"}`}
              >
                {k === "all" ? "All" : k === "OTC" ? "No Rx" : "Rx only"}
              </button>
            ))}
          </div>
        </div>

        {offline && (
          <div className="mt-6 flex gap-3 border-l-2 border-warn bg-warn/10 px-4 py-3.5 text-[13.5px] leading-relaxed text-bone">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p>We can&apos;t reach Pilbridge right now, so you&apos;re seeing a sample catalogue. Ordering will be back shortly.</p>
          </div>
        )}

        <div className="mt-6 flex gap-3 border-l-2 border-gold bg-gold-wash px-4 py-3.5 text-[13.5px] leading-relaxed text-bone">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
          <p>
            Prescription-only medicines need a valid prescription and a pharmacist&apos;s review before they leave the
            pharmacy. We never suggest substitutes — if one is appropriate, your pharmacist will contact you.{" "}
            <Link href="/scan" className="whitespace-nowrap text-gold underline-offset-2 hover:underline">
              Snap a paper prescription →
            </Link>
          </p>
        </div>

        <div className="mt-8 flex items-baseline justify-between border-b border-line pb-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">
            {loading ? "Loading…" : `${results.length} product${results.length === 1 ? "" : "s"}`}
          </p>
          <p className="font-mono text-[11px] text-mute">{offline ? "Sample catalogue · illustrative prices" : "Live stock · verified pharmacies"}</p>
        </div>

        <ul>
          {results.map((p) => {
            const inBag = bag.find((l) => l.product.id === p.id);
            const soldOut = p.inStock === false;
            const pickupOnly = p.deliveryAllowed === false;
            return (
              <li key={p.id} className="grid gap-4 border-b border-line-soft py-6 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h3 className="font-display text-[24px] leading-none text-ivory">
                      {p.name} <span className="text-stone">{p.strength !== "—" && p.strength}</span>
                    </h3>
                    <ClassBadge p={p} />
                    {pickupOnly && <Badge tone="warn">Pharmacy pickup only</Badge>}
                  </div>
                  <p className="mt-2 text-[13.5px] text-stone">
                    {p.generic} · {p.form} · {p.pack}
                  </p>
                  {p.uses && <p className="mt-1.5 text-[13px] text-bone">Used for: {p.uses}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-mute">
                    {p.maker !== "—" && <span>{p.maker}</span>}
                    <span>Store: {p.storage}</span>
                    <span className="flex items-center gap-1 text-stone">
                      <MapPin className="h-3 w-3" /> {soldOut ? "Out of stock nearby" : `${p.pharmacies} licensed pharmac${p.pharmacies === 1 ? "y" : "ies"} nearby`}
                    </span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-6 sm:justify-end">
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">from</p>
                    <p className="text-[18px] font-medium text-bone">{soldOut ? "—" : naira(p.price)}</p>
                  </div>
                  <button
                    onClick={() => add(p)}
                    disabled={soldOut || pickupOnly}
                    className={`min-w-[132px] rounded-[3px] border px-4 py-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      inBag ? "border-gold/50 text-gold-soft hover:border-gold" : "border-line text-bone hover:border-gold hover:text-gold-soft"
                    }`}
                  >
                    {pickupOnly ? "Not delivered" : soldOut ? "Out of stock" : inBag ? `In bag · ${inBag.qty}` : p.classification === "POM" ? "Add · needs Rx" : "Add to bag"}
                  </button>
                </div>
              </li>
            );
          })}
          {!loading && results.length === 0 && (
            <li className="py-16 text-center">
              <p className="font-display text-[26px] text-bone">Nothing matches “{query}”.</p>
              <p className="mt-2 text-[14px] text-stone">Try the generic name, or ask a pharmacist — we can check partner stock for you.</p>
            </li>
          )}
        </ul>

        <p className="mt-8 text-[12.5px] leading-relaxed text-mute">
          Controlled medicines are not available on Pilbridge. Product details are for identification only and are not a
          substitute for advice from your doctor or pharmacist.
        </p>
      </div>

      {/* ——— Bag ——— */}
      <aside className="lg:sticky lg:top-[120px] lg:self-start">
        <div className="border border-line bg-coal">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-display text-[24px] leading-none text-ivory">Your order</h2>
            <span className="font-mono text-[11px] text-mute">{bag.reduce((s, l) => s + l.qty, 0)} items</span>
          </div>

          {bag.length === 0 ? (
            <div className="space-y-3 px-5 py-6">
              <p className="text-[14px] text-stone">Your bag is empty. How would you like to order?</p>
              <Link href="/scan" className="flex items-start gap-3 border border-gold/40 bg-gold-wash p-4 transition-colors hover:border-gold">
                <Camera className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
                <span>
                  <span className="block text-[14px] text-bone">Snap your prescription</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mute">We read it and fill your bag. A pharmacist checks it, then you pay.</span>
                </span>
              </Link>
              <button onClick={() => searchRef.current?.focus()} className="flex w-full items-start gap-3 border border-line p-4 text-left transition-colors hover:border-stone">
                <Search className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
                <span>
                  <span className="block text-[14px] text-bone">Just order what you need</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mute">Search and add medicines, then continue to checkout.</span>
                </span>
              </button>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line-soft px-5">
                {bag.map((l) => {
                  const line = quote?.lines.find((x) => x.productId === l.product.id);
                  return (
                    <li key={l.product.id} className="flex items-start justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] text-bone">
                          {l.product.name} {l.product.strength !== "—" && l.product.strength}
                        </p>
                        <div className="mt-1.5">
                          <ClassBadge p={l.product} />
                        </div>
                        {line && !line.available && <p className="mt-1.5 text-[12px] text-alert">Not available at {pharmacyName}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-[14px] text-bone">
                          {line?.unitPriceKobo != null ? formatKobo(line.unitPriceKobo * l.qty) : naira(l.product.price * l.qty)}
                        </span>
                        <div className="flex items-center border border-line">
                          <button onClick={() => setQty(l.product.id, -1)} className="p-1.5 text-stone hover:text-bone" aria-label="Decrease">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center font-mono text-[12px]">{l.qty}</span>
                          <button onClick={() => setQty(l.product.id, 1)} className="p-1.5 text-stone hover:text-bone" aria-label="Increase">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {quotes && quotes.length > 0 && (
                <div className="border-t border-line">
                  <p className="eyebrow px-5 pt-4 text-gold">In stock at</p>
                  <ul className="mt-2">
                    {quotes.map((q) => (
                      <li key={q.pharmacy.id}>
                        <button
                          onClick={() => setPharmacyId(q.pharmacy.id)}
                          className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors ${pharmacyId === q.pharmacy.id ? "bg-gold-wash" : "hover:bg-char"}`}
                        >
                          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${pharmacyId === q.pharmacy.id ? "border-gold" : "border-line"}`}>
                            {pharmacyId === q.pharmacy.id && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] text-bone">{q.pharmacy.name}</span>
                            <span className="block font-mono text-[10.5px] text-mute">
                              <MapPin className="mr-1 inline h-2.5 w-2.5" />
                              {q.pharmacy.area} · {q.unavailable ? `${q.unavailable} unavailable` : "has everything"}
                              {q.etaMinutes != null && <span className="text-stone"> · delivery {etaLabel(q.etaMinutes)}</span>}
                            </span>
                          </span>
                          <span className="text-[13.5px] text-bone">{formatKobo(q.totalKobo)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-line px-5 py-5">
                {quote && <OrderTotals quote={quote} live={live} deliveryKobo={deliveryKobo} totalKobo={totalKobo} estimate />}

                {needsRx && (
                  <p className="mt-4 flex items-center gap-2 text-[12.5px] text-stone">
                    <Badge tone="pom">Rx</Badge> You&apos;ll add your prescription at checkout.
                  </p>
                )}

                <Link
                  href="/order/checkout"
                  className="group mt-5 flex items-center gap-3 border border-line px-4 py-3.5 transition-colors hover:border-gold"
                >
                  <MapPin className="h-4.5 w-4.5 shrink-0 text-gold" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Deliver to</span>
                    <span className="mt-0.5 block truncate text-[13.5px] text-bone">
                      {areaName || address.trim() ? [areaName, address.trim()].filter(Boolean).join(" · ") : "Add your location & address"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12.5px] text-gold group-hover:text-gold-soft">{areaName || address.trim() ? "Change" : "Add"} →</span>
                </Link>

                <Link
                  href="/order/checkout"
                  className="group mt-3 flex w-full items-center justify-center gap-2 rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-gold-soft"
                >
                  Continue to delivery
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
                </Link>
                {(offline || (quote && quote.unavailable > 0)) && (
                  <p className="mt-3 flex items-start gap-2 text-[12.5px] text-warn">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {offline ? "Ordering is unavailable right now — you can still add your address." : "Pick a pharmacy that has everything before you pay."}
                  </p>
                )}
                <p className="mt-3 text-center font-mono text-[10.5px] text-mute">Next: delivery address, then payment</p>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-start gap-3 border border-line-soft px-5 py-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
          <p className="text-[12.5px] leading-relaxed text-stone">
            Fulfilled by a PCN-licensed partner pharmacy. Your prescription is visible only to the reviewing pharmacist —
            never to the rider.
          </p>
        </div>
      </aside>
    </div>
  );
}
