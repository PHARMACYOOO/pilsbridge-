"use client";

import { useMemo, useState } from "react";
import { Snowflake } from "lucide-react";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { field, useList } from "./shared";

type Product = { id: string; name: string; strength: string | null; category: string; classification: "OTC" | "POM" | "DEVICE"; coldChain: boolean; deliveryAllowed: boolean };

/** The product eligibility list: which products may be delivered. Owned by the compliance lead. */
export default function Products() {
  const { items, error, setError, load } = useList<Product>("/admin/products");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter((p) => !t || `${p.name} ${p.category}`.toLowerCase().includes(t));
  }, [items, q]);

  async function toggle(p: Product) {
    setBusy(p.id);
    setError(null);
    try {
      await api(`/admin/products/${p.id}`, { method: "PATCH", body: { deliveryAllowed: !p.deliveryAllowed } });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8">
      <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-stone">
        For the pharmacy/compliance lead. Products set to <strong className="text-bone">pickup only</strong> can’t be added to delivery orders.
        Controlled medicines are never listed or sold. Prescription-only and cold-chain parcels go only to couriers approved for them.
      </p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products or categories" className={`${field} mt-4 max-w-[360px]`} />
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
      <div className="mt-4 divide-y divide-line-soft border border-line bg-coal">
        {items === null && !error && <p className="px-4 py-6 text-[13px] text-mute">Loading…</p>}
        {shown.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[14px] text-bone">
                {p.name} {p.strength && <span className="text-stone">{p.strength}</span>}
                {p.classification === "POM" && <Badge tone="pom">Rx</Badge>}
                {p.coldChain && <Badge tone="cold"><Snowflake className="h-2.5 w-2.5" /> 2–8 °C</Badge>}
              </p>
              <p className="font-mono text-[11px] text-mute">{p.category}</p>
            </div>
            <button
              disabled={busy === p.id}
              onClick={() => toggle(p)}
              className={`rounded-[3px] border px-3 py-1.5 text-[12.5px] ${p.deliveryAllowed ? "border-ok/50 text-ok" : "border-warn/60 text-warn"}`}
            >
              {p.deliveryAllowed ? "Delivered" : "Pickup only"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
