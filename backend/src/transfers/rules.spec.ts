import { BatchStatus, ProductClass } from '../generated/prisma/client.js';
import { receiptHold, transferBlock } from './rules.js';

const now = new Date('2026-10-23T09:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60_000);
const batch = (over: Partial<{ status: BatchStatus; expiresAt: Date; classification: ProductClass; coldChain: boolean }> = {}) => ({
  status: over.status ?? BatchStatus.SALEABLE,
  expiresAt: over.expiresAt ?? inDays(120),
  product: { classification: over.classification ?? ProductClass.OTC, coldChain: over.coldChain ?? false },
});

describe('transferBlock', () => {
  it('allows saleable, in-date stock', () => {
    expect(transferBlock(batch(), now)).toBeNull();
    expect(transferBlock(batch({ classification: ProductClass.POM }), now)).toBeNull();
  });

  it('never moves controlled or cold-chain products', () => {
    expect(transferBlock(batch({ classification: ProductClass.CONTROLLED }), now)).toMatch(/Controlled/);
    expect(transferBlock(batch({ coldChain: true }), now)).toMatch(/Cold-chain/);
  });

  it('blocks stock on hold, expired or nearly expired', () => {
    expect(transferBlock(batch({ status: BatchStatus.RECALLED }), now)).toMatch(/recall/);
    expect(transferBlock(batch({ status: BatchStatus.QUARANTINED }), now)).toMatch(/quarantined/);
    expect(transferBlock(batch({ expiresAt: inDays(-1) }), now)).toMatch(/expired/);
    expect(transferBlock(batch({ expiresAt: inDays(20) }), now)).toMatch(/shelf life/);
    expect(transferBlock(batch({ expiresAt: inDays(31) }), now)).toBeNull();
  });
});

describe('receiptHold', () => {
  it('quarantines stock whose batch went on hold or expired on the road', () => {
    expect(receiptHold(batch(), now)).toBeNull();
    expect(receiptHold(batch({ status: BatchStatus.RECALLED }), now)).toMatch(/recalled/);
    expect(receiptHold(batch({ expiresAt: inDays(-1) }), now)).toMatch(/Expired/);
  });
});
