import { normalisePhone } from './phone.js';

describe('normalisePhone', () => {
  it.each([
    ['0803 123 4567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['234-701-234-5678', '+2347012345678'],
    ['09012345678', '+2349012345678'],
  ])('accepts %s', (input, expected) => expect(normalisePhone(input)).toBe(expected));

  it.each(['12345', '0603 123 4567', '+44 7911 123456', '0803123456'])('rejects %s', (input) => expect(normalisePhone(input)).toBeNull());
});
