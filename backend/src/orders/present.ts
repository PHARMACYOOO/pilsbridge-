import { DeliveryStatus, type Prisma } from '../generated/prisma/client.js';
import { arriveBy } from '../delivery/eta.js';

export const orderInclude = {
  items: { include: { product: { select: { name: true, strength: true, classification: true, coldChain: true } }, batch: { select: { batchNumber: true, expiresAt: true } } } },
  pharmacy: { select: { name: true, area: true } },
  prescription: { select: { code: true, status: true } },
} satisfies Prisma.OrderInclude;

const deliverySelect = {
  code: true, status: true, assignedAt: true, pickedUpAt: true, deliveredAt: true, failReason: true,
  provider: true, trackingUrl: true, courier: { select: { name: true } },
  rider: { select: { firstName: true, riderProfile: { select: { partner: true } } } },
} satisfies Prisma.DeliverySelect;

/** The latest delivery attempt. Only the patient gets the drop-off code. */
export const patientOrderInclude = {
  ...orderInclude,
  deliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: { ...deliverySelect, dropoffCode: true } },
} satisfies Prisma.OrderInclude;

export const pharmacyOrderInclude = {
  ...orderInclude,
  patient: { select: { firstName: true, lastName: true } },
  deliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: deliverySelect },
} satisfies Prisma.OrderInclude;

const CODE_VISIBLE: DeliveryStatus[] = [DeliveryStatus.AWAITING_RIDER, DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP];

/** Adds `arriveBy` and flattens the latest delivery into `delivery`. */
export function present<T extends { paidAt: Date | null; etaMinutes: number | null; deliveries: ({ status: DeliveryStatus; dropoffCode?: string } & object)[] }>(o: T) {
  const { deliveries, ...rest } = o;
  const d = deliveries[0];
  const delivery = d && { ...d, ...('dropoffCode' in d ? { dropoffCode: CODE_VISIBLE.includes(d.status) ? d.dropoffCode : null } : {}) };
  return { ...rest, arriveBy: arriveBy(o), delivery: delivery ?? null };
}
