import { TRANSFER_MIN_DAYS_LEFT } from '../common/fees.js';
import { BatchStatus, ProductClass } from '../generated/prisma/client.js';

const DAY = 24 * 60 * 60_000;

type BatchLike = { status: BatchStatus; expiresAt: Date; product: { classification: ProductClass; coldChain: boolean } };

/**
 * Why this batch can't be transferred right now, or null. Controlled medicines never move;
 * cold-chain stock needs an equipped logistics partner (not supported yet); stock on hold,
 * expired or too close to expiry for the receiver to sell can't be offered or accepted.
 */
export function transferBlock(b: BatchLike, now: Date): string | null {
  if (b.product.classification === ProductClass.CONTROLLED) return 'Controlled medicines can’t be transferred';
  if (b.product.coldChain) return 'Cold-chain products can only move with an equipped logistics partner — contact support';
  if (b.status === BatchStatus.RECALLED) return 'This batch is on recall hold';
  if (b.status === BatchStatus.QUARANTINED) return 'This batch is quarantined';
  if (b.status === BatchStatus.WRITTEN_OFF) return 'This batch has been written off';
  if (b.expiresAt.getTime() <= now.getTime()) return 'This batch has expired';
  if (b.expiresAt.getTime() - now.getTime() < TRANSFER_MIN_DAYS_LEFT * DAY) return `Less than ${TRANSFER_MIN_DAYS_LEFT} days of shelf life left`;
  return null;
}

/**
 * At check-in: why received stock must go into quarantine instead of on sale, or null. The batch
 * may have been recalled or quarantined at the sender, or expired, while it was on the road.
 */
export function receiptHold(b: Pick<BatchLike, 'status' | 'expiresAt'>, now: Date): string | null {
  if (b.status !== BatchStatus.SALEABLE) return `Sending batch was ${b.status.toLowerCase().replace('_', ' ')} while in transit — inspect before sale`;
  if (b.expiresAt.getTime() <= now.getTime()) return 'Expired in transit — do not sell';
  return null;
}
