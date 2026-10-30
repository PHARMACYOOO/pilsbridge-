"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ApiPharmacy, type ApiProduct } from "./api";
import { catalog as sampleCatalog, type Product } from "./catalog";

/** Map an API product onto the shape the ordering UI already uses. */
export function toProduct(p: ApiProduct): Product {
  return {
    id: p.id,
    name: p.name,
    generic: p.genericName,
    form: p.form,
    strength: p.strength ?? "—",
    pack: p.packDescription,
    maker: p.manufacturer,
    category: p.category,
    classification: p.classification === "DEVICE" ? "Device" : p.classification,
    coldChain: p.coldChain,
    storage: p.storage,
    uses: p.uses ?? undefined,
    deliveryAllowed: p.deliveryAllowed,
    price: p.fromPriceKobo !== null ? p.fromPriceKobo / 100 : 0,
    pharmacies: p.pharmaciesInStock,
    unitsPerPack: p.unitsPerPack,
    inStock: p.fromPriceKobo !== null,
  };
}

/**
 * Live catalogue and pharmacies from the API. If the API can't be reached, falls back to the
 * sample catalogue so the page still renders — `offline` tells the UI ordering is unavailable.
 */
export function useCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pharmacies, setPharmacies] = useState<ApiPharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, ph] = await Promise.all([api<ApiProduct[]>("/products", { auth: false }), api<ApiPharmacy[]>("/pharmacies", { auth: false })]);
      setProducts(p.map(toProduct));
      setPharmacies(ph);
      setOffline(false);
    } catch {
      setProducts(sampleCatalog);
      setPharmacies([]);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { products, pharmacies, loading, offline, reload: load };
}
