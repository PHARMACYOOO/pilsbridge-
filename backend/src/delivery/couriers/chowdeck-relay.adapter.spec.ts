import { ConfigService } from '@nestjs/config';
import { ChowdeckRelayAdapter, relayStatus } from './chowdeck-relay.adapter.js';
import { CourierApiError, localPhone } from './courier-api.js';

const relay = () => new ChowdeckRelayAdapter(new ConfigService({ CHOWDECK_API_KEY: 'sk_test', CHOWDECK_BASE_URL: 'https://relay.test/' }));
const ok = (data: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', message: 'ok', data }), { status: 200 }));

describe('ChowdeckRelayAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('quotes by coordinates, as their docs describe', async () => {
    const fetch = ok({ id: 18987, total_amount: 210000, delivery_amount: 210000 });
    vi.stubGlobal('fetch', fetch);
    expect(await relay().quote({ lat: 6.5, lng: 3.37 }, { lat: 6.6, lng: 3.35 }, { dropoffAddress: '5 Allen Avenue' })).toEqual({ feeId: '18987', amountKobo: 210000 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://relay.test/relay/delivery/fee');
    expect(init.headers.Authorization).toBe('Bearer sk_test');
    expect(JSON.parse(init.body)).toEqual({
      source_address: { latitude: 6.5, longitude: 3.37 },
      destination_address: { latitude: 6.6, longitude: 3.35 },
      destination_address_string: '5 Allen Avenue',
    });
  });

  it('books with the fee id and neutral parcel details', async () => {
    const fetch = ok({ reference: 'RLY-77', delivery_price: 210000, status: 'preparing' });
    vi.stubGlobal('fetch', fetch);
    const booking = await relay().book({
      feeId: '18987',
      reference: 'DL-9F2C41AA',
      pickup: { name: 'Oakfield Pharmacy', phone: '08030000100' },
      dropoff: { name: 'Ada', phone: '08031234567' },
      note: 'Sealed pharmacy parcel',
    });
    expect(booking).toMatchObject({ reference: 'RLY-77', priceKobo: 210000, status: 'pending' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ fee_id: 18987, reference: 'DL-9F2C41AA', user_action: 'sending', destination_contact: { name: 'Ada', phone: '08031234567', country_code: 'NG' } });
  });

  it('turns Relay errors and outages into readable errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failed', message: 'Location not covered' }), { status: 400 })));
    await expect(relay().quote({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, {})).rejects.toThrow(/Location not covered/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(relay().status('RLY-77')).rejects.toBeInstanceOf(CourierApiError);
  });

  it('maps Relay statuses and needs a key to be used', () => {
    expect(['preparing', 'awaiting_pickup', 'in_transit', 'success', 'rejected', 'completed', 'weird'].map(relayStatus)).toEqual([
      'pending', 'rider_assigned', 'in_transit', 'delivered', 'cancelled', 'delivered', 'unknown',
    ]);
    expect(new ChowdeckRelayAdapter(new ConfigService({})).configured()).toBe(false);
    expect(localPhone('+2348031234567')).toBe('08031234567');
  });
});
