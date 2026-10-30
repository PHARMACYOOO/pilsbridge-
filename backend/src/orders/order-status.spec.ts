import { OrderStatus } from '../generated/prisma/client.js';
import { allocateFefo, canPharmacyMove } from './order-status.js';

const d = (iso: string) => new Date(iso);

describe('allocateFefo', () => {
  const batches = [
    { id: 'late', quantity: 40, expiresAt: d('2028-04-30') },
    { id: 'soon', quantity: 14, expiresAt: d('2027-03-31') },
    { id: 'mid', quantity: 5, expiresAt: d('2027-09-30') },
  ];

  it('takes from the soonest-expiring batch first', () => {
    expect(allocateFefo(batches, 3)).toEqual([{ batchId: 'soon', take: 3 }]);
  });

  it('spills over into the next batch by expiry, not by input order', () => {
    expect(allocateFefo(batches, 21)).toEqual([
      { batchId: 'soon', take: 14 },
      { batchId: 'mid', take: 5 },
      { batchId: 'late', take: 2 },
    ]);
  });

  it('returns null when there is not enough stock', () => {
    expect(allocateFefo(batches, 60)).toBeNull();
  });
});

describe('canPharmacyMove', () => {
  it('follows the dispensing workflow', () => {
    expect(canPharmacyMove(OrderStatus.ACCEPTED, OrderStatus.PREPARING)).toBe(true);
    expect(canPharmacyMove(OrderStatus.PREPARING, OrderStatus.READY)).toBe(true);
    expect(canPharmacyMove(OrderStatus.READY, OrderStatus.CANCELLED)).toBe(true);
  });

  it('leaves collection and hand-over to the rider', () => {
    expect(canPharmacyMove(OrderStatus.READY, OrderStatus.PICKED_UP)).toBe(false);
    expect(canPharmacyMove(OrderStatus.PICKED_UP, OrderStatus.DELIVERED)).toBe(false);
  });

  it('never lets staff skip pharmacist review or reopen finished orders', () => {
    expect(canPharmacyMove(OrderStatus.PHARMACIST_REVIEW, OrderStatus.ACCEPTED)).toBe(false);
    expect(canPharmacyMove(OrderStatus.ACCEPTED, OrderStatus.DELIVERED)).toBe(false);
    expect(canPharmacyMove(OrderStatus.DELIVERED, OrderStatus.PREPARING)).toBe(false);
    expect(canPharmacyMove(OrderStatus.PICKED_UP, OrderStatus.CANCELLED)).toBe(false); // it's with the rider
  });
});
