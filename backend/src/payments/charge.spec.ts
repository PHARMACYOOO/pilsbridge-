import { chargeProblem, orderCodeFromTxRef } from './charge.js';

const order = { code: 'PB-118903', totalKobo: 300_000 };
const tx = { id: 1, tx_ref: 'PB-118903-9f2c41aa', status: 'successful', currency: 'NGN', amount: 3000 };

describe('chargeProblem', () => {
  it('accepts a successful naira payment of the full amount for this order', () => {
    expect(chargeProblem(tx, order)).toBeNull();
    expect(chargeProblem({ ...tx, amount: 3000.5 }, order)).toBeNull();
  });

  it('rejects anything that doesn’t pay for this order in full', () => {
    expect(chargeProblem({ ...tx, status: 'failed' }, order)).toMatch(/failed/);
    expect(chargeProblem({ ...tx, currency: 'USD' }, order)).toMatch(/USD/);
    expect(chargeProblem({ ...tx, amount: 2999.99 }, order)).toMatch(/less/);
    expect(chargeProblem({ ...tx, amount: 30 }, order)).toMatch(/less/); // kobo sent as naira
    expect(chargeProblem({ ...tx, tx_ref: 'PB-118904-9f2c41aa' }, order)).toMatch(/another order/);
    expect(chargeProblem({ ...tx, tx_ref: 'PB-118903' }, order)).toMatch(/another order/);
  });
});

describe('orderCodeFromTxRef', () => {
  it('takes the order code from a payment reference', () => {
    expect(orderCodeFromTxRef('PB-118903-9f2c41aa')).toBe('PB-118903');
    expect(orderCodeFromTxRef('nothing')).toBeNull();
  });
});
