/** Fees in kobo (₦1 = 100 kobo). Placeholder values for the pilot — confirm with finance before launch. */
export const FEES = {
  deliveryKobo: 150_000,
  coldChainDeliveryKobo: 250_000,
  serviceKobo: 30_000,
} as const;

/** Batches expiring within this many days are "short-dated". */
export const SHORT_DATED_DAYS = 180;

/**
 * Platform commission on a pharmacy's goods subtotal, in basis points (700 = 7%). Delivery and
 * service fees paid by the customer stay with the platform. Placeholder — confirm with finance.
 */
export const PHARMACY_COMMISSION_BPS = 700;

/** After a pharmacy's bank details change (and are re-verified), payouts wait this long. */
export const BANK_CHANGE_HOLD_HOURS = 48;

/** A transferred batch must have at least this much shelf life left, so the receiver can sell it. */
export const TRANSFER_MIN_DAYS_LEFT = 30;

/** Licence and certificate expiry reminders, in days before expiry. */
export const EXPIRY_REMINDER_DAYS = [60, 30, 7] as const;
