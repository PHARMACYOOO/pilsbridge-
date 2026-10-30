"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

export const field = "h-11 w-full border border-line bg-transparent px-3 text-[13.5px] text-bone placeholder:text-mute focus:border-gold focus:outline-none";
export const label = "font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute";
export const btn = "rounded-[3px] px-4 py-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const primary = `${btn} bg-gold text-ink hover:bg-gold-soft`;
export const ghost = `${btn} border border-line text-bone hover:border-gold`;
export const textarea = "w-full border border-line bg-transparent px-3 py-2 text-[13.5px] text-bone placeholder:text-mute focus:border-gold focus:outline-none";
export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

/** Failure causes and who bears the cost (mirrors COST_BEARER on the server). */
export const CAUSES: Record<string, string> = {
  CUSTOMER_UNAVAILABLE: "Customer unavailable — customer pays",
  WRONG_ADDRESS: "Wrong address — customer pays",
  CUSTOMER_REFUSED: "Customer refused — customer pays",
  PHARMACY_DELAY: "Pharmacy delay — pharmacy pays",
  COURIER_FAULT: "Courier’s fault — courier pays",
  SAFETY: "Safety / seal problem — Pilbridge pays",
  OTHER: "Other — Pilbridge pays",
};

/** Load a list from the API, with reload and an error line. */
export function useList<T>(path: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await api<T[]>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load — check your connection.");
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { items, error, setError, load };
}

/** Run an admin action: one at a time, with a success notice or the API's error, then reload. */
export function useAct(setError: (e: string | null) => void, load: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const act = useCallback(
    async (key: string, fn: () => Promise<unknown>, done?: string) => {
      setBusy(key);
      setError(null);
      setNotice(null);
      try {
        await fn();
        if (done) setNotice(done);
        await load();
        return true;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong — try again.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [setError, load],
  );
  return { busy, notice, act };
}

export const danger = `${btn} border border-alert/40 text-alert hover:border-alert`;
export const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
