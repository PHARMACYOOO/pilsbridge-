import { OrderStatus } from '../generated/prisma/client.js';

/**
 * Moves a pharmacy may make directly. PHARMACIST_REVIEW is left only through a prescription
 * decision (see PrescriptionsService), never by a plain status change. PICKED_UP and DELIVERED
 * belong to the rider (see DeliveryService): collected at the pharmacy, delivered only with the
 * recipient's code.
 */
export const PHARMACY_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.CANCELLED],
};

/** A patient can cancel until the pharmacy starts preparing. */
export const PATIENT_CANCELLABLE: OrderStatus[] = [OrderStatus.PHARMACIST_REVIEW, OrderStatus.ACCEPTED];

export const canPharmacyMove = (from: OrderStatus, to: OrderStatus) => PHARMACY_TRANSITIONS[from]?.includes(to) ?? false;

/** One allocation from a batch, in packs. */
export type Allocation = { batchId: string; take: number };

/**
 * First expiry, first out: take from the soonest-expiring batches until the quantity is covered.
 * `batches` must already be filtered to sellable stock. Returns null when there isn't enough.
 */
export function allocateFefo(batches: { id: string; quantity: number; expiresAt: Date }[], needed: number): Allocation[] | null {
  const sorted = [...batches].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  const out: Allocation[] = [];
  let remaining = needed;
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    if (take > 0) {
      out.push({ batchId: b.id, take });
      remaining -= take;
    }
  }
  return remaining > 0 ? null : out;
}
