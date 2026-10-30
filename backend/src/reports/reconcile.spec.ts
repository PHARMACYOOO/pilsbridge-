import { reconcile, type OurDelivery } from './reconcile.js';

const d = (over: Partial<OurDelivery>): OurDelivery => ({
  code: 'DL-1', orderCode: 'PB-1', providerRef: 'R1', status: 'DELIVERED', feeKobo: 180_000, pickedUpAt: new Date(), costBearer: null, inPeriod: true, ...over,
});

describe('reconcile', () => {
  const ours = [
    d({ code: 'DL-1', providerRef: 'R1' }),
    d({ code: 'DL-2', providerRef: 'R2', feeKobo: 150_000 }),
    d({ code: 'DL-3', providerRef: 'R3', status: 'CANCELLED', pickedUpAt: null }),
    d({ code: 'DL-4', providerRef: 'R4', status: 'FAILED', costBearer: 'COURIER' }),
    d({ code: 'DL-5', providerRef: 'R5', status: 'FAILED', costBearer: 'CUSTOMER' }),
    d({ code: 'DL-6', providerRef: 'R6' }), // never invoiced
    d({ code: 'DL-7', providerRef: 'R7', status: 'PICKED_UP' }),
  ];

  it('sorts every line and totals what’s payable', () => {
    const res = reconcile(
      [
        { providerRef: 'R1', amountKobo: 180_000 },
        { providerRef: 'R2', amountKobo: 170_000 },
        { providerRef: 'R1', amountKobo: 180_000 },
        { providerRef: 'R3', amountKobo: 50_000 },
        { providerRef: 'R4', amountKobo: 180_000 },
        { providerRef: 'R5', amountKobo: 180_000 },
        { providerRef: 'R9', amountKobo: 99_000 },
        { providerRef: 'R7', amountKobo: 180_000 },
      ],
      ours,
    );
    expect(res.lines.map((l) => l.outcome)).toEqual(['MATCHED', 'OVERCHARGED', 'DUPLICATE', 'CANCELLED_BEFORE_PICKUP', 'COURIER_FAULT', 'MATCHED', 'UNKNOWN', 'NOT_FINISHED']);
    expect(res.lines[1].disputedKobo).toBe(20_000); // only the overcharge
    expect(res.notInvoiced.map((n) => n.delivery)).toEqual(['DL-6']);
    expect(res.totals).toMatchObject({ invoicedKobo: 1_219_000, disputedKobo: 20_000 + 180_000 + 50_000 + 180_000 + 99_000 + 180_000, lines: 8, matched: 2, disputed: 6 });
    expect(res.totals.payableKobo).toBe(1_219_000 - res.totals.disputedKobo);
  });
});
