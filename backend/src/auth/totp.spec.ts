import { base32Decode, base32Encode, hotp, matchTotp, newTotpSecret, otpauthUrl, stepAt } from './totp.js';

// RFC 6238 appendix B: SHA-1 secret "12345678901234567890".
const RFC_SECRET = Buffer.from('12345678901234567890');

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(hotp(RFC_SECRET, stepAt(59_000), 8)).toBe('94287082');
    expect(hotp(RFC_SECRET, stepAt(1_111_111_109_000), 8)).toBe('07081804');
    expect(hotp(RFC_SECRET, stepAt(2_000_000_000_000), 8)).toBe('69279037');
  });

  it('round-trips base32', () => {
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv-gy3tqojqgezdgnbvgy3tqojq')).toEqual(RFC_SECRET);
    expect(base32Decode(newTotpSecret())).toHaveLength(20);
  });

  it('accepts the current code and one step either side, never a replay', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1_700_000_000_000;
    const at = (step: number) => hotp(RFC_SECRET, step);
    const s = stepAt(now);
    expect(matchTotp(secret, at(s), now, null)).toBe(s);
    expect(matchTotp(secret, at(s - 1), now, null)).toBe(s - 1);
    expect(matchTotp(secret, at(s + 1), now, null)).toBe(s + 1);
    expect(matchTotp(secret, at(s - 2), now, null)).toBeNull();
    expect(matchTotp(secret, at(s), now, s)).toBeNull(); // already used
    expect(matchTotp(secret, at(s - 1), now, s)).toBeNull(); // older than the last one used
    expect(matchTotp(secret, '12345', now, null)).toBeNull();
  });

  it('builds the authenticator link', () => {
    expect(otpauthUrl('ABC', '+2348030000001')).toBe('otpauth://totp/Pilbridge%3A%2B2348030000001?secret=ABC&issuer=Pilbridge&algorithm=SHA1&digits=6&period=30');
  });
});
