/**
 * Delivery performance against the pilot targets (operating model, section 8). Pure: takes one row
 * per delivery attempt, so it can be tested and reused for any period, provider or pharmacy.
 */
export const TARGETS = {
  pickupWithinMinutes: 15,
  pickupPunctuality: 0.9,
  completion: 0.95,
  proofOfDelivery: 1,
};

export type DeliveryRow = {
  code: string;
  orderCode: string;
  provider: string; // "Pilbridge riders" or the courier's name
  pharmacy: string;
  area: string | null;
  status: 'AWAITING_RIDER' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  createdAt: Date;
  assignedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  paidAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  arriveBy: Date | null;
  feeKobo: number | null; // what the courier charges us
  deliveryKobo: number; // what the customer paid for delivery
  proof: string | null;
  failureCause: string | null;
  costBearer: string | null;
};

const minutes = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / 60_000 : null);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && x >= 0);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
};
const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 1000 : null);
const count = <T>(xs: T[], key: (x: T) => string | null) =>
  Object.entries(xs.reduce<Record<string, number>>((acc, x) => {
    const k = key(x) ?? 'UNKNOWN';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {})).map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count);

export function summarise(rows: DeliveryRow[]) {
  const delivered = rows.filter((r) => r.status === 'DELIVERED');
  const failed = rows.filter((r) => r.status === 'FAILED');
  const pickedUp = rows.filter((r) => r.pickedUpAt);
  // Wait from "ready, with this job open" to collection.
  const pickupWait = (r: DeliveryRow) => {
    const from = r.readyAt && r.readyAt > r.createdAt ? r.readyAt : r.createdAt;
    return minutes(from, r.pickedUpAt);
  };
  const onTime = delivered.filter((r) => r.arriveBy && r.deliveredAt && r.deliveredAt <= r.arriveBy);
  const charged = rows.filter((r) => r.feeKobo != null && (r.status === 'DELIVERED' || (r.status === 'FAILED' && r.costBearer !== 'COURIER')));
  const courierCost = charged.reduce((s, r) => s + r.feeKobo!, 0);
  const revenueOrders = new Map(delivered.map((r) => [r.orderCode, r.deliveryKobo]));
  const revenue = [...revenueOrders.values()].reduce((s, x) => s + x, 0);
  const orders = new Map(rows.map((r) => [r.orderCode, r]));

  return {
    jobs: rows.length,
    delivered: delivered.length,
    failed: failed.length,
    cancelled: rows.filter((r) => r.status === 'CANCELLED').length,
    inProgress: rows.filter((r) => r.status === 'AWAITING_RIDER' || r.status === 'ASSIGNED' || r.status === 'PICKED_UP').length,
    completionRate: rate(delivered.length, delivered.length + failed.length),
    onTimeRate: rate(onTime.length, delivered.filter((r) => r.arriveBy).length),
    pickupPunctuality: rate(pickedUp.filter((r) => (pickupWait(r) ?? Infinity) <= TARGETS.pickupWithinMinutes).length, pickedUp.length),
    proofCoverage: rate(delivered.filter((r) => r.proof).length, delivered.length),
    avgMinutes: {
      packing: avg([...orders.values()].map((r) => minutes(r.preparingAt, r.readyAt))),
      toAssignRider: avg(rows.map((r) => minutes(r.createdAt, r.assignedAt))),
      pickupWait: avg(pickedUp.map(pickupWait)),
      ride: avg(delivered.map((r) => minutes(r.pickedUpAt, r.deliveredAt))),
      paymentToDoor: avg(delivered.map((r) => minutes(r.paidAt, r.deliveredAt))),
    },
    money: {
      deliveryRevenueKobo: revenue,
      courierCostKobo: courierCost,
      courierCostPerDeliveryKobo: delivered.filter((r) => r.feeKobo != null).length ? Math.round(courierCost / delivered.filter((r) => r.feeKobo != null).length) : null,
      failedCostByBearer: count(failed.filter((r) => r.feeKobo != null), (r) => r.costBearer).map(({ key }) => ({
        bearer: key,
        kobo: failed.filter((r) => (r.costBearer ?? 'UNKNOWN') === key && r.feeKobo != null).reduce((s, r) => s + r.feeKobo!, 0),
      })),
    },
    failureCauses: count(failed, (r) => r.failureCause),
  };
}

/** The same summary for each provider and each pharmacy. */
export function breakdown(rows: DeliveryRow[], by: (r: DeliveryRow) => string) {
  const groups = new Map<string, DeliveryRow[]>();
  for (const r of rows) groups.set(by(r), [...(groups.get(by(r)) ?? []), r]);
  return [...groups.entries()].map(([name, rs]) => ({ name, ...summarise(rs) })).sort((a, b) => b.jobs - a.jobs);
}
