// Shared Playwright fixtures. The site ships with live Supabase keys in js/portal/config.js;
// every test sees an empty config instead, so the portal runs in demo mode and no test touches the real database.
// A test that needs live mode routes config.js itself (page routes take priority over this context route).
// Cloudflare Turnstile (build.mjs TURNSTILE) is replaced by a stub that hands out a test token at once, so no test
// waits for a real challenge (headless browsers never pass one) or reaches Cloudflare.
import { test as base, expect } from '@playwright/test';

const TURNSTILE_STUB = "window.turnstile = { render: () => 'w0', getResponse: () => 'TEST-TOKEN', reset() {} };";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = '';" }));
    await context.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }));
    await use(context);
  },
});
export { expect };
