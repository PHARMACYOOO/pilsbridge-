/** The fields of a Flutterwave transaction we rely on (GET /v3/transactions/:id/verify → data). */
export type FlutterwaveTransaction = { id: number; tx_ref: string; status: string; currency: string; amount: number };

/** Each payment attempt gets its own reference: the order code plus a random suffix. */
export const orderCodeFromTxRef = (txRef: string) => {
  const cut = txRef.lastIndexOf('-');
  return cut > 0 ? txRef.slice(0, cut) : null;
};

/**
 * Why a verified transaction doesn't pay for this order, or null when it does. Flutterwave amounts
 * are in naira (major units); orders are in kobo.
 */
export function chargeProblem(tx: FlutterwaveTransaction, order: { code: string; totalKobo: number }): string | null {
  if (tx.status !== 'successful') return `payment ${tx.status}`;
  if (tx.currency !== 'NGN') return `paid in ${tx.currency}`;
  if (orderCodeFromTxRef(tx.tx_ref) !== order.code) return 'reference is for another order';
  if (Math.round(Number(tx.amount) * 100) < order.totalKobo) return 'amount is less than the order total';
  return null;
}
