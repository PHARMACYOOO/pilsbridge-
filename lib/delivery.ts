"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

export type Area = { key: string; name: string; lat: number; lng: number };

const AREA_KEY = "pilbridge-delivery-area";
const PIN_KEY = "pilbridge-dropoff-pin";

/** Lagos delivery areas from the API (empty while loading or offline). */
export function useAreas() {
  const [areas, setAreas] = useState<Area[]>([]);
  useEffect(() => {
    api<Area[]>("/delivery/areas", { auth: false })
      .then(setAreas)
      .catch(() => setAreas([]));
  }, []);
  return areas;
}

/** The customer's delivery area, remembered on this device. */
export function useDeliveryArea() {
  const [area, setArea] = useState("");
  useEffect(() => {
    try {
      setArea(localStorage.getItem(AREA_KEY) ?? "");
    } catch {}
  }, []);
  const choose = (key: string) => {
    setArea(key);
    try {
      localStorage.setItem(AREA_KEY, key);
    } catch {}
  };
  return [area, choose] as const;
}

export type Pin = { lat: number; lng: number };

/** Lagos, roughly — a pin outside this is almost certainly a mistake. */
export const inLagos = (p: Pin) => p.lat >= 6.3 && p.lat <= 6.8 && p.lng >= 2.7 && p.lng <= 4.4;

/** The customer's exact drop-off pin, remembered on this device. */
export function useDropoffPin() {
  const [pin, setPin] = useState<Pin | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PIN_KEY) ?? "null") as Pin | null;
      if (saved && inLagos(saved)) setPin(saved);
    } catch {}
  }, []);
  const choose = (p: Pin | null) => {
    setPin(p);
    try {
      if (p) localStorage.setItem(PIN_KEY, JSON.stringify(p));
      else localStorage.removeItem(PIN_KEY);
    } catch {}
  };
  return [pin, choose] as const;
}

/** "~45 min", "~1 h 20 min". */
export function etaLabel(minutes: number | null | undefined) {
  if (!minutes) return null;
  return minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

/** "2:45 pm" */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });

export type LiveDelivery = { deliveryKobo: number; quoteId: string | null; source: "courier" | "standard" };

/**
 * The delivery price to the pinned location from the chosen pharmacy — a live courier quote when
 * the platform prices that way, otherwise the standard fee. Null until there's a pin.
 */
export function useLiveDelivery(input: { pharmacyId: string | null; pin: Pin | null; prescription: boolean; coldChain: boolean; address: string }) {
  const [live, setLive] = useState<LiveDelivery | null>(null);
  const { pharmacyId, pin, prescription, coldChain, address } = input;
  useEffect(() => {
    if (!pharmacyId || !pin) {
      setLive(null);
      return;
    }
    let current = true;
    const t = window.setTimeout(() => {
      api<LiveDelivery>("/delivery/quote", {
        method: "POST",
        auth: false,
        body: { pharmacyId, lat: pin.lat, lng: pin.lng, prescription, coldChain, ...(address.trim().length >= 3 ? { address: address.trim() } : {}) },
      })
        .then((q) => current && setLive(q))
        .catch(() => current && setLive(null));
    }, 400);
    return () => {
      current = false;
      window.clearTimeout(t);
    };
    // Re-quote when the address is first long enough to help the courier; not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId, pin?.lat, pin?.lng, prescription, coldChain, address.trim().length >= 3]);
  return live;
}
