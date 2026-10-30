import { breakdown, summarise, type DeliveryRow } from './summarise.js';

const t = (min: number) => new Date(Date.UTC(2026, 9, 12, 9, 0) + min * 60_000);
const row = (over: Partial<DeliveryRow>): DeliveryRow => ({
  code: 'DL', orderCode: 'PB', provider: 'Pilbridge riders', pharmacy: 'Oakfield', area: 'ikeja', status: 'DELIVERED',
  createdAt: t(5), assignedAt: t(8), pickedUpAt: t(20), deliveredAt: t(45), paidAt: t(0), preparingAt: t(5), readyAt: t(15),
  arriveBy: t(50), feeKobo: null, deliveryKobo: 150_000, proof: 'customer code', failureCause: null, costBearer: null, ...over,
});

describe('summarise', () => {
  const rows = [
    row({ code: 'A', orderCode: 'PB-1' }),
    row({ code: 'B', orderCode: 'PB-2', provider: 'Relay', feeKobo: 180_000, deliveredAt: t(70), pickedUpAt: t(40), proof: null }),
    row({ code: 'C', orderCode: 'PB-3', status: 'FAILED', deliveredAt: null, provider: 'Relay', feeKobo: 180_000, failureCause: 'CUSTOMER_UNAVAILABLE', costBearer: 'CUSTOMER' }),
    row({ code: 'D', orderCode: 'PB-4', status: 'FAILED', deliveredAt: null, provider: 'Relay', feeKobo: 180_000, failureCause: 'COURIER_FAULT', costBearer: 'COURIER' }),
    row({ code: 'E', orderCode: 'PB-5', status: 'AWAITING_RIDER', assignedAt: null, pickedUpAt: null, deliveredAt: null }),
  ];

  it('measures completion, punctuality, timing and cost against the targets', () => {
    const s = summarise(rows);
    expect(s).toMatchObject({ jobs: 5, delivered: 2, failed: 2, inProgress: 1, completionRate: 0.5, onTimeRate: 0.5, proofCoverage: 0.5 });
    // Pickups: A 5 min after ready (ok), B 25 (late), C and D 5 (ok) → 3 of 4.
    expect(s.pickupPunctuality).toBe(0.75);
    expect(s.avgMinutes).toMatchObject({ packing: 10, toAssignRider: 3, ride: 28 });
    // The courier is paid for B and C, not for D (its own fault).
    expect(s.money).toMatchObject({ deliveryRevenueKobo: 300_000, courierCostKobo: 360_000, courierCostPerDeliveryKobo: 360_000 });
    expect(s.failureCauses).toEqual(expect.arrayContaining([{ key: 'CUSTOMER_UNAVAILABLE', count: 1 }, { key: 'COURIER_FAULT', count: 1 }]));
  });

  it('breaks down by provider', () => {
    const b = breakdown(rows, (r) => r.provider);
    expect(b.map((x) => [x.name, x.jobs, x.completionRate])).toEqual([
      ['Relay', 3, 0.333],
      ['Pilbridge riders', 2, 1],
    ]);
  });

  it('copes with no data', () => {
    expect(summarise([])).toMatchObject({ jobs: 0, completionRate: null, onTimeRate: null, pickupPunctuality: null });
  });
});
