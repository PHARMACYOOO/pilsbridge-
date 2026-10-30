import { CostBearer, FailureCause } from '../generated/prisma/client.js';

/**
 * Who bears the cost of a failed delivery attempt, by cause (operating model, section 9). This is
 * business policy: change it here, and in the courier contract, together.
 */
export const COST_BEARER: Record<FailureCause, CostBearer> = {
  CUSTOMER_UNAVAILABLE: CostBearer.CUSTOMER,
  WRONG_ADDRESS: CostBearer.CUSTOMER,
  CUSTOMER_REFUSED: CostBearer.CUSTOMER,
  PHARMACY_DELAY: CostBearer.PHARMACY,
  COURIER_FAULT: CostBearer.COURIER,
  SAFETY: CostBearer.PLATFORM,
  OTHER: CostBearer.PLATFORM,
};

/** The rider app's fixed reasons, for attempts reported without an explicit cause. */
export function causeFromReason(reason: string): FailureCause {
  const r = reason.toLowerCase();
  if (r.includes('not reachable') || r.includes('unavailable')) return FailureCause.CUSTOMER_UNAVAILABLE;
  if (r.includes('address')) return FailureCause.WRONG_ADDRESS;
  if (r.includes('refused')) return FailureCause.CUSTOMER_REFUSED;
  if (r.includes('seal') || r.includes('tamper') || r.includes('unsafe')) return FailureCause.SAFETY;
  if (r.includes('pharmacy')) return FailureCause.PHARMACY_DELAY;
  if (r.includes('courier')) return FailureCause.COURIER_FAULT;
  return FailureCause.OTHER;
}
