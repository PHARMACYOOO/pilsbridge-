import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CourierApiError, type CourierApi, type CourierBooking, type CourierBookingInput, type CourierQuote, type CourierStatus, type Point } from './courier-api.js';

const TIMEOUT_MS = 15_000;

/** Relay's statuses (guide and webhook events) mapped onto ours. */
export function relayStatus(raw: string | undefined): CourierStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'preparing':
    case 'accepted':
      return 'pending';
    case 'awaiting_pickup':
      return 'rider_assigned';
    case 'in_transit':
    case 'picked':
    case 'arrived':
      return 'in_transit';
    case 'success':
    case 'completed':
      return 'delivered';
    case 'rejected':
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/**
 * Chowdeck Relay (https://chowdeck-api.readme.io — "Relay" section). Two steps: get a fee quote
 * for pickup/drop-off coordinates, then create the delivery with the fee id. Amounts are in kobo.
 *
 * Confirm with Chowdeck at onboarding: the base URL (their docs show both api.chowdeck.com and
 * api.relay.chowdeck.com — set CHOWDECK_BASE_URL), the item_type to use for sealed pharmacy
 * parcels, whether Relay deliveries send webhooks, and how to pass our own 4-digit delivery PIN.
 */
@Injectable()
export class ChowdeckRelayAdapter implements CourierApi {
  readonly key = 'CHOWDECK_RELAY';
  readonly label = 'Chowdeck Relay';
  private readonly log = new Logger(ChowdeckRelayAdapter.name);

  constructor(private readonly config: ConfigService) {}

  configured() {
    return !!this.config.get<string>('CHOWDECK_API_KEY');
  }

  private get base() {
    return (this.config.get<string>('CHOWDECK_BASE_URL') || 'https://api.chowdeck.com').replace(/\/$/, '');
  }

  async quote(pickup: Point, dropoff: Point, opts: { pickupAddress?: string; dropoffAddress?: string }): Promise<CourierQuote> {
    const data = await this.call<{ id: number; total_amount: number }>('POST', '/relay/delivery/fee', {
      source_address: { latitude: pickup.lat, longitude: pickup.lng },
      destination_address: { latitude: dropoff.lat, longitude: dropoff.lng },
      ...(opts.pickupAddress ? { source_address_string: opts.pickupAddress } : {}),
      ...(opts.dropoffAddress ? { destination_address_string: opts.dropoffAddress } : {}),
    });
    if (typeof data.id !== 'number' || typeof data.total_amount !== 'number') throw new CourierApiError('Relay returned an unexpected fee quote');
    return { feeId: String(data.id), amountKobo: data.total_amount };
  }

  async book(input: CourierBookingInput): Promise<CourierBooking> {
    const data = await this.call<{ reference: string; delivery_price?: number; status?: string; tracking_url?: string }>('POST', '/relay/delivery', {
      fee_id: Number(input.feeId),
      reference: input.reference,
      item_type: this.config.get<string>('CHOWDECK_ITEM_TYPE') || 'others',
      user_action: 'sending',
      source_contact: { name: input.pickup.name, phone: input.pickup.phone, country_code: 'NG' },
      destination_contact: { name: input.dropoff.name, phone: input.dropoff.phone, country_code: 'NG' },
      customer_delivery_note: input.note,
    });
    if (!data.reference) throw new CourierApiError('Relay didn’t return a delivery reference');
    return {
      reference: data.reference,
      priceKobo: typeof data.delivery_price === 'number' ? data.delivery_price : null,
      trackingUrl: data.tracking_url ?? null,
      status: relayStatus(data.status),
      rawStatus: data.status ?? 'unknown',
    };
  }

  async status(reference: string) {
    const data = await this.call<{ status?: string; tracking_url?: string }>('GET', `/relay/delivery/${encodeURIComponent(reference)}`);
    return { status: relayStatus(data.status), rawStatus: data.status ?? 'unknown', trackingUrl: data.tracking_url ?? null };
  }

  async cancel(reference: string, reason: string) {
    await this.call('POST', `/relay/delivery/${encodeURIComponent(reference)}/cancel`, { reason });
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let status = 0;
    let json: { status?: string; message?: string; data?: T } = {};
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.config.getOrThrow<string>('CHOWDECK_API_KEY')}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      json = await res.json().catch(() => ({}));
    } catch (e) {
      this.log.error(`Relay unreachable (${method} ${path}): ${e instanceof Error ? e.message : String(e)}`);
      throw new CourierApiError('Chowdeck Relay can’t be reached right now');
    }
    if (status < 200 || status >= 300 || json.status !== 'success' || json.data === undefined) {
      this.log.warn(`Relay ${method} ${path} → HTTP ${status}: ${json.message ?? ''}`);
      throw new CourierApiError(`Chowdeck Relay: ${json.message ?? `request failed (HTTP ${status})`}`);
    }
    return json.data;
  }
}
