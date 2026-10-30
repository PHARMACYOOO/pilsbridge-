import { phoneTracker } from './throttle.js';

describe('phoneTracker', () => {
  it('keys sign-in requests by the normalised phone number', () => {
    expect(phoneTracker({ ip: '1.2.3.4', body: { phone: '0803 123 4567' } })).toBe('phone:+2348031234567');
    expect(phoneTracker({ ip: '5.6.7.8', body: { phone: '+234 803 123 4567' } })).toBe('phone:+2348031234567');
  });

  it('falls back to the client IP for anything else', () => {
    expect(phoneTracker({ ip: '1.2.3.4', body: { phone: 'not a phone' } })).toBe('ip:1.2.3.4');
    expect(phoneTracker({ ip: '1.2.3.4', body: undefined })).toBe('ip:1.2.3.4');
    expect(phoneTracker({ ip: '1.2.3.4', ips: ['9.9.9.9', '1.2.3.4'], body: {} })).toBe('ip:9.9.9.9');
  });
});
