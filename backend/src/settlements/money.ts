import { PHARMACY_COMMISSION_BPS } from '../common/fees.js';

/** Platform commission on one order's goods subtotal, rounded to the nearest kobo. */
export const commissionKobo = (subtotalKobo: number) => Math.round((subtotalKobo * PHARMACY_COMMISSION_BPS) / 10_000);

/** What a pharmacy is owed for a set of orders. Commission is rounded per order, so lines add up. */
export function settle(orders: { subtotalKobo: number }[]) {
  const grossKobo = orders.reduce((s, o) => s + o.subtotalKobo, 0);
  const feesKobo = orders.reduce((s, o) => s + commissionKobo(o.subtotalKobo), 0);
  return { orderCount: orders.length, grossKobo, feesKobo, netKobo: grossKobo - feesKobo };
}

/** For text messages, which can't carry the naira sign reliably. */
export const ngn = (kobo: number) => `NGN ${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
