/**
 * What Pilbridge needs from a courier company's API. Each courier gets an adapter; the rest of the
 * app only sees this interface, so couriers can be added or swapped without touching orders.
 */
export type Point = { lat: number; lng: number };

/** Courier statuses, mapped onto a common set. */
export type CourierStatus = 'pending' | 'rider_assigned' | 'in_transit' | 'delivered' | 'cancelled' | 'unknown';

export type CourierQuote = { feeId: string; amountKobo: number };

export type CourierBookingInput = {
  feeId: string;
  /** Our delivery code — also the seal number on the parcel. Never a medicine name. */
  reference: string;
  pickup: { name: string; phone: string };
  dropoff: { name: string; phone: string };
  note: string;
};

export type CourierBooking = { reference: string; priceKobo: number | null; trackingUrl: string | null; status: CourierStatus; rawStatus: string };

export interface CourierApi {
  readonly key: string;
  readonly label: string;
  /** Has credentials; otherwise it's skipped. */
  configured(): boolean;
  quote(pickup: Point, dropoff: Point, opts: { pickupAddress?: string; dropoffAddress?: string }): Promise<CourierQuote>;
  book(input: CourierBookingInput): Promise<CourierBooking>;
  status(reference: string): Promise<{ status: CourierStatus; rawStatus: string; trackingUrl: string | null }>;
  cancel(reference: string, reason: string): Promise<void>;
}

/** A courier API call that failed, with a message safe to show operations staff. */
export class CourierApiError extends Error {}

/** +2348031234567 → 08031234567 (11 digits, as Nigerian couriers expect). */
export function localPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return digits.startsWith('234') ? `0${digits.slice(3)}` : digits;
}
