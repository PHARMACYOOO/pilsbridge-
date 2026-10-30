import { parseArgs } from './admin-recovery.js';

describe('admin recovery arguments', () => {
  it('reads multi-word values and flags', () => {
    expect(parseArgs(['--phone', '0803', '000', '0009', '--reason', 'Lost', 'phone', 'confirmed', 'in', 'person', '--enable', '--yes'])).toEqual({
      phone: '0803 000 0009',
      reason: 'Lost phone confirmed in person',
      enable: true,
      yes: true,
    });
  });

  it('refuses unknown options', () => {
    expect(() => parseArgs(['--phone', '0803', '--drop-table'])).toThrow(/Unknown option/);
  });
});
