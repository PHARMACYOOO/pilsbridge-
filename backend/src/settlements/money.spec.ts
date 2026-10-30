import { commissionKobo, ngn, settle } from './money.js';

describe('settle', () => {
  it('takes the commission off the goods subtotal, per order', () => {
    expect(commissionKobo(100_000)).toBe(7_000); // 7% of ₦1,000
    expect(commissionKobo(1_550)).toBe(109); // 108.5 rounds up
    expect(settle([{ subtotalKobo: 100_000 }, { subtotalKobo: 1_550 }])).toEqual({ orderCount: 2, grossKobo: 101_550, feesKobo: 7_109, netKobo: 94_441 });
  });

  it('is zero for no orders', () => {
    expect(settle([])).toEqual({ orderCount: 0, grossKobo: 0, feesKobo: 0, netKobo: 0 });
  });

  it('formats amounts for texts', () => {
    expect(ngn(184_000_050)).toBe('NGN 1,840,000.50');
  });
});
