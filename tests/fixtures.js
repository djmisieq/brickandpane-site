// Shared Playwright fixtures. The site ships with live Supabase keys in js/portal/config.js;
// every test sees an empty config instead, so the portal runs in demo mode and no test touches the real database.
// A test that needs live mode routes config.js itself (page routes take priority over this context route).
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = '';" }));
    await use(context);
  },
});
export { expect };
