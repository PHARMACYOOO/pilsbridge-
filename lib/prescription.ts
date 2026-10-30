import { z } from "zod";
import { catalog, type Product } from "./catalog";

/* ——— What the reader returns for each line on the prescription ——— */

export const ExtractedItemSchema = z.object({
  drug: z.string(),
  strength: z.string().nullable(),
  form: z.string().nullable(),
  dose_units: z.number().nullable(),
  times_per_day: z.number().nullable(),
  duration_days: z.number().nullable(),
  quantity_written: z.number().nullable(),
  directions: z.string(),
  legible: z.boolean(),
});

export const ExtractionSchema = z.object({
  is_prescription: z.boolean(),
  prescriber_details_present: z.boolean(),
  date_written: z.string().nullable(),
  items: z.array(ExtractedItemSchema),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
export type Extraction = z.infer<typeof ExtractionSchema>;

export type ScanResponse = { extraction: Extraction; demo: boolean } | { error: string };

/* ——— Matching a written line to partner stock ——— */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const firstWord = (s: string) => norm(s).split(" ")[0];
const strengthNumber = (s: string | null) => (s ? parseFloat(s.replace(/,/g, "")) : NaN);

export function matchProduct(item: ExtractedItem, products: Product[] = catalog): Product | null {
  const written = norm(item.drug);
  const candidates = products.filter((p) => {
    const keys = [firstWord(p.name), firstWord(p.generic)];
    return keys.some((k) => k.length > 3 && (written.includes(k) || k.includes(firstWord(item.drug))));
  });
  if (candidates.length === 0) return null;

  // Strength must agree when both sides state one — never substitute a different strength.
  const wanted = strengthNumber(item.strength);
  if (!Number.isNaN(wanted)) {
    return candidates.find((p) => strengthNumber(p.strength) === wanted) ?? null;
  }
  return candidates[0];
}

/** Units the prescription calls for, or null when it can't be worked out from what's written. */
export function unitsNeeded(item: ExtractedItem): number | null {
  if (item.quantity_written && item.quantity_written > 0) return item.quantity_written;
  if (item.dose_units && item.times_per_day && item.duration_days) {
    return Math.ceil(item.dose_units * item.times_per_day * item.duration_days);
  }
  return null;
}

export function packsNeeded(item: ExtractedItem, product: Product): number {
  const units = unitsNeeded(item);
  if (units === null || product.unitsPerPack <= 1) return 1;
  return Math.max(1, Math.ceil(units / product.unitsPerPack));
}

export function describeDirections(item: ExtractedItem): string {
  const parts: string[] = [];
  if (item.dose_units) parts.push(`${item.dose_units} × dose`);
  if (item.times_per_day) parts.push(`${item.times_per_day}× daily`);
  if (item.duration_days) parts.push(`${item.duration_days} days`);
  return parts.length ? parts.join(" · ") : item.directions || "As directed";
}

/* ——— Nearby partner pharmacies (sample) ——— */

export const nearbyPharmacies = [
  { id: "oak", name: "Oakfield Pharmacy", area: "Ikeja GRA", km: 6.2, factor: 1, coldChain: true, missing: [] as string[] },
  { id: "unity", name: "Unity Pharmacy", area: "Surulere", km: 4.1, factor: 0.95, coldChain: false, missing: ["p5"] },
  { id: "marina", name: "Marina Health Pharmacy", area: "Yaba", km: 1.8, factor: 1.06, coldChain: true, missing: [] as string[] },
];

/* ——— Sample extraction used when no API credentials are configured ——— */

export const demoExtraction: Extraction = {
  is_prescription: true,
  prescriber_details_present: true,
  date_written: "28/09/2026",
  items: [
    { drug: "Amoxicillin", strength: "500 mg", form: "capsule", dose_units: 1, times_per_day: 3, duration_days: 7, quantity_written: null, directions: "1 cap tds × 7/7", legible: true },
    { drug: "Paracetamol", strength: "500 mg", form: "tablet", dose_units: 2, times_per_day: 3, duration_days: 3, quantity_written: null, directions: "ii tabs tds × 3/7", legible: true },
    { drug: "Loratadine", strength: "10 mg", form: "tablet", dose_units: 1, times_per_day: 1, duration_days: 10, quantity_written: null, directions: "1 tab nocte × 10/7", legible: true },
    { drug: "Vitamin C", strength: "1000 mg", form: "tablet", dose_units: 1, times_per_day: 1, duration_days: 30, quantity_written: null, directions: "1 daily × 30/7", legible: true },
    { drug: "Esomeprazole", strength: "40 mg", form: "tablet", dose_units: 1, times_per_day: 2, duration_days: 14, quantity_written: null, directions: "1 bd × 14/7 (partly illegible)", legible: false },
  ],
};
