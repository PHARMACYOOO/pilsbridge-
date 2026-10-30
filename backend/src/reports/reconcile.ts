/**
 * Checks a courier's invoice against our delivery records, line by line. Everything that isn't a
 * clean match is a question to raise with the courier before paying.
 */
export type InvoiceLine = { providerRef: string; amountKobo: number };

export type OurDelivery = {
  code: string;
  orderCode: string;
  providerRef: string | null;
  status: 'AWAITING_RIDER' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  feeKobo: number | null;
  pickedUpAt: Date | null;
  costBearer: 'CUSTOMER' | 'COURIER' | 'PHARMACY' | 'PLATFORM' | null;
  /** Booked within the invoice period. */
  inPeriod: boolean;
};

export type Outcome =
  | 'MATCHED' // our record, same amount
  | 'OVERCHARGED' // more than the fee we booked at
  | 'UNDERCHARGED' // less than booked — fine to pay, worth knowing
  | 'UNKNOWN' // no delivery of ours with this reference
  | 'DUPLICATE' // the same reference charged again
  | 'CANCELLED_BEFORE_PICKUP' // they never collected it — only payable if the contract has a cancellation fee
  | 'COURIER_FAULT' // failed through the courier's fault: they bear it
  | 'NOT_FINISHED'; // still in progress on our side

export const DISPUTED: Outcome[] = ['OVERCHARGED', 'UNKNOWN', 'DUPLICATE', 'CANCELLED_BEFORE_PICKUP', 'COURIER_FAULT', 'NOT_FINISHED'];

export type LineResult = InvoiceLine & { outcome: Outcome; expectedKobo: number | null; delivery: string | null; order: string | null; disputedKobo: number };

export function reconcile(lines: InvoiceLine[], ours: OurDelivery[]) {
  const byRef = new Map(ours.filter((d) => d.providerRef).map((d) => [d.providerRef!, d]));
  const seen = new Set<string>();

  const results: LineResult[] = lines.map((line) => {
    const d = byRef.get(line.providerRef);
    const base = { ...line, expectedKobo: d?.feeKobo ?? null, delivery: d?.code ?? null, order: d?.orderCode ?? null };
    const dispute = (outcome: Outcome, disputedKobo = line.amountKobo): LineResult => ({ ...base, outcome, disputedKobo });

    if (seen.has(line.providerRef)) return dispute('DUPLICATE');
    seen.add(line.providerRef);
    if (!d) return dispute('UNKNOWN');
    if (d.status === 'CANCELLED' && !d.pickedUpAt) return dispute('CANCELLED_BEFORE_PICKUP');
    if (d.status === 'FAILED' && d.costBearer === 'COURIER') return dispute('COURIER_FAULT');
    if (d.status !== 'DELIVERED' && d.status !== 'FAILED' && d.status !== 'CANCELLED') return dispute('NOT_FINISHED');
    if (d.feeKobo != null && line.amountKobo > d.feeKobo) return dispute('OVERCHARGED', line.amountKobo - d.feeKobo);
    if (d.feeKobo != null && line.amountKobo < d.feeKobo) return { ...base, outcome: 'UNDERCHARGED', disputedKobo: 0 };
    return { ...base, outcome: 'MATCHED', disputedKobo: 0 };
  });

  // Finished, chargeable jobs of ours in the period that the courier hasn't billed (yet).
  const notInvoiced = ours.filter(
    (d) => d.inPeriod && d.providerRef && !seen.has(d.providerRef) && (d.status === 'DELIVERED' || (d.status === 'FAILED' && d.costBearer !== 'COURIER')),
  );

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    lines: results,
    notInvoiced: notInvoiced.map((d) => ({ delivery: d.code, order: d.orderCode, providerRef: d.providerRef, status: d.status, feeKobo: d.feeKobo })),
    totals: {
      invoicedKobo: sum(lines.map((l) => l.amountKobo)),
      disputedKobo: sum(results.map((r) => r.disputedKobo)),
      payableKobo: sum(lines.map((l) => l.amountKobo)) - sum(results.map((r) => r.disputedKobo)),
      lines: results.length,
      matched: results.filter((r) => r.outcome === 'MATCHED' || r.outcome === 'UNDERCHARGED').length,
      disputed: results.filter((r) => DISPUTED.includes(r.outcome)).length,
    },
  };
}
