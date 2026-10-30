"use client";

import { useEffect, useState } from "react";
import { api, type ApiQuote } from "./api";
import type { Product } from "./catalog";
import { useLiveDelivery, type Pin } from "./delivery";

export type Line = { product: Product; qty: number };

/** The bag survives a reload, a trip to the scan page, or the step to checkout (this tab only). */
const BAG_KEY = "pilbridge-bag";
/** The pharmacy picked on the order page, carried to checkout. */
const PHARMACY_KEY = "pilbridge-pharmacy";
export const ADDRESS_KEY = "pilbridge-last-address";

/** The bag, restored once the catalogue is in (with current product details), then kept saved. */
export function useBag(products: Product[]) {
  const [bag, setBag] = useState<Line[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready || !products.length) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(BAG_KEY) ?? "[]") as { id: string; qty: number }[];
      setBag(saved.flatMap((l) => {
        const product = products.find((p) => p.id === l.id);
        return product ? [{ product, qty: l.qty }] : [];
      }));
    } catch {}
    setReady(true);
  }, [products, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(BAG_KEY, JSON.stringify(bag.map((l) => ({ id: l.product.id, qty: l.qty }))));
    } catch {}
  }, [bag, ready]);

  return [bag, setBag, ready] as const;
}

/**
 * Prices the bag at every pharmacy whenever it changes. Keeps the chosen pharmacy while it still has
 * everything; otherwise picks the fastest to the delivery area (or, without one, the cheapest).
 */
export function useQuotes(bag: Line[], offline: boolean, area: string) {
  const [quotes, setQuotes] = useState<ApiQuote[] | null>(null);
  const [pharmacyId, setPharmacyIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PHARMACY_KEY);
      if (saved) setPharmacyIdState((current) => current ?? saved);
    } catch {}
  }, []);

  const setPharmacyId = (id: string | null) => {
    setPharmacyIdState(id);
    try {
      if (id) sessionStorage.setItem(PHARMACY_KEY, id);
      else sessionStorage.removeItem(PHARMACY_KEY);
    } catch {}
  };

  const basketKey = bag.map((l) => `${l.product.id}:${l.qty}`).join(",");
  useEffect(() => {
    if (!bag.length || offline) {
      setQuotes(null);
      return;
    }
    const t = window.setTimeout(() => {
      const items = bag.map((l) => ({ productId: l.product.id, quantity: l.qty }));
      api<ApiQuote[]>("/quotes", { method: "POST", auth: false, body: { items, ...(area ? { area } : {}) } })
        .then((qs) => {
          setQuotes(qs);
          setPharmacyIdState((current) => {
            if (current && qs.some((q) => q.pharmacy.id === current && q.unavailable === 0)) return current;
            const complete = qs.filter((q) => q.unavailable === 0);
            const best = area ? complete[0] : [...complete].sort((a, b) => a.totalKobo - b.totalKobo)[0];
            const next = best?.pharmacy.id ?? current ?? qs[0]?.pharmacy.id ?? null;
            try {
              if (next) sessionStorage.setItem(PHARMACY_KEY, next);
            } catch {}
            return next;
          });
        })
        .catch(() => setQuotes(null));
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketKey, offline, area]);

  return { quotes, pharmacyId, setPharmacyId };
}

/** What the chosen pharmacy charges for the bag, with a live delivery price when there's a pin. */
export function useOrderTotals(bag: Line[], quotes: ApiQuote[] | null, pharmacyId: string | null, pin: Pin | null, address: string) {
  const needsRx = bag.some((l) => l.product.classification === "POM");
  const quote = quotes?.find((q) => q.pharmacy.id === pharmacyId) ?? null;
  const live = useLiveDelivery({ pharmacyId: quote?.pharmacy.id ?? null, pin, prescription: needsRx, coldChain: bag.some((l) => !!l.product.coldChain), address });
  const deliveryKobo = live?.deliveryKobo ?? quote?.deliveryKobo ?? 0;
  const totalKobo = quote ? quote.subtotalKobo + deliveryKobo + quote.serviceKobo : 0;
  return { needsRx, quote, live, deliveryKobo, totalKobo };
}

/** The delivery address, remembered on this device as it's typed. */
export function useSavedAddress() {
  const [address, setAddress] = useState("");
  useEffect(() => {
    try {
      setAddress(localStorage.getItem(ADDRESS_KEY) ?? "");
    } catch {}
  }, []);
  const change = (v: string) => {
    setAddress(v);
    try {
      localStorage.setItem(ADDRESS_KEY, v);
    } catch {}
  };
  return [address, change] as const;
}
