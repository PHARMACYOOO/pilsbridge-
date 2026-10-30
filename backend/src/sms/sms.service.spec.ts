import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service.js';

const termii = { TERMII_API_KEY: 'test-key', TERMII_BASE_URL: 'https://termii.test/', TERMII_SENDER_ID: 'Pilbridge' };
const sms = (env: Record<string, string>) => new SmsService(new ConfigService(env));
const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('SmsService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the code through Termii on the DND route', async () => {
    const fetch = reply(200, { code: 'ok', message_id: '123' });
    vi.stubGlobal('fetch', fetch);
    await sms(termii).sendOtp('+2348031234567', '042917');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://termii.test/api/sms/send');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ api_key: 'test-key', to: '2348031234567', from: 'Pilbridge', type: 'plain', channel: 'dnd' });
    expect(body.sms).toContain('042917');
  });

  it('fails clearly when Termii rejects the message or can’t be reached', async () => {
    vi.stubGlobal('fetch', reply(400, { code: 'error', message: 'Sender ID not approved' }));
    await expect(sms(termii).sendOtp('+2348031234567', '042917')).rejects.toBeInstanceOf(ServiceUnavailableException);

    vi.stubGlobal('fetch', reply(200, { message: 'Insufficient balance' }));
    await expect(sms(termii).sendOtp('+2348031234567', '042917')).rejects.toBeInstanceOf(ServiceUnavailableException);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(sms(termii).sendOtp('+2348031234567', '042917')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses to send without an API key, and only logs codes in development', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(sms({}).sendOtp('+2348031234567', '042917')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await sms({ OTP_DEV_ECHO: 'true' }).sendOtp('+2348031234567', '042917');
    await expect(sms({ OTP_DEV_ECHO: 'true', NODE_ENV: 'production' }).sendOtp('+2348031234567', '042917')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
