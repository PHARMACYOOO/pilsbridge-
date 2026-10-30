import { config } from 'dotenv';

// Point every e2e worker at the test database before any app code loads.
config({ path: '.env', quiet: true });
config({ path: '.env.test', override: true, quiet: true });
// Late-delivery texts are checked on a timer in the app; tests trigger the check themselves.
process.env.LATE_CHECK_MS = '0';
// Same for the licence check.
process.env.COMPLIANCE_CHECK_MS = '0';
