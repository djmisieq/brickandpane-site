// Client portal + staff CRM in demo mode. Two tabs share data (localStorage) but not sessions.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/login.html');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
});

test('architect and staff see each other’s changes live', async ({ page, context }) => {
  await page.goto('/portal.html');
  await expect(page).toHaveURL(/login\.html/);
  await page.locator('[data-demo-login="client"]').click();
  await expect(page.locator('.pcard').first()).toBeVisible();
  await expect(page.locator('.stat.is-you dd')).toHaveText('2');

  await page.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await expect(page.locator('.now-card')).toContainText('Quote issued');

  const staff = await context.newPage();
  await staff.goto('/admin.html');
  await staff.locator('[data-demo-login="staff"]').click();
  await expect(staff.locator('.board')).toBeVisible();

  // Architect accepts the quotation on the client's behalf (no client on the team yet), after confirming.
  await page.locator('[data-tab="documents"]').click();
  await expect(page.locator('[data-approve]')).toContainText('£23,900 + VAT');
  await page.locator('[data-approve] button[value="approved"]').click();
  await expect(page.locator('.toast')).toContainText('tick the confirmation');
  await page.locator('[data-approve] input[name="confirm"]').check();
  await page.locator('[data-approve] button[value="approved"]').click();
  await expect(page.locator('.badge-ok', { hasText: 'Accepted' }).first()).toBeVisible();
  await expect(page.locator('.doc-meta', { hasText: 'on the client’s behalf' })).toBeVisible();

  // Staff gets notified, moves the stage and replies.
  await expect(staff.locator('.notif-count')).toBeVisible();
  await staff.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await staff.locator('[data-stage] button[type="submit"]').click();
  await expect(staff.locator('.toast')).toContainText('Choose the new stage');
  await staff.selectOption('#ctl-stage', 'accepted');
  await staff.fill('#ctl-note', 'Order confirmed.');
  await staff.locator('[data-stage] button[type="submit"]').click();
  await staff.locator('[data-tab="messages"]').click();
  await staff.locator('.composer-mode input[value="internal"]').check();
  await expect(staff.locator('[data-message] button[type="submit"]')).toHaveText('Save internal note');
  await staff.fill('#msg-body', 'Margin is fine at this price.');
  await staff.locator('[data-message] button[type="submit"]').click();
  await staff.locator('.composer-mode input[value="client"]').check();
  await expect(staff.locator('[data-message] button[type="submit"]')).toHaveText('Send to client');
  await staff.fill('#msg-body', 'Survey booked for Tuesday.');
  await staff.locator('[data-message] button[type="submit"]').click();

  // Architect sees it without reloading.
  await expect(page.locator('.now-card')).toContainText('Order confirmed');
  await expect(page.locator('.notif-btn')).toHaveAttribute('aria-label', /unread/);
  await page.locator('[data-tab="messages"]').click();
  await expect(page.locator('.thread li').last()).toContainText('Survey booked for Tuesday.');
  await expect(page.locator('.thread')).not.toContainText('discount headroom'); // internal notes stay hidden
  await expect(page.locator('.thread')).not.toContainText('Margin is fine');
});

test('architect submits a new project with an openings schedule', async ({ page }) => {
  await page.locator('[data-demo-login="client"]').click();
  await page.goto('/portal.html#/new');
  await page.locator('.newp button[type="submit"]').click();
  await expect(page.locator('.newp .field.has-error')).toHaveCount(2);
  await page.fill('#np-name', 'Test villa');
  await page.fill('#np-loc', 'N1');
  await page.fill('[data-rows] input[name="width_mm"]', '6000');
  await page.fill('[data-rows] input[name="height_mm"]', '2800');
  await page.selectOption('[data-rows] select[name="config"]', '4C');
  await page.selectOption('[data-rows] select[name="material"]', 'timber');
  await expect(page.locator('[data-est]')).toHaveText(/kg/);
  await page.locator('[data-add]').click();
  const row2 = page.locator('[data-rows] tr').nth(1);
  await row2.locator('select[name="system"]').selectOption('rooflights');
  await row2.locator('input[name="width_mm"]').fill('2000');
  await row2.locator('input[name="height_mm"]').fill('3000');
  await page.locator('.newp button[type="submit"]').click();
  await expect(page.locator('.now-card')).toContainText('Received');
  await expect(page.locator('h1')).toHaveText('Test villa');
  await expect(page.locator('.spec-compact')).toContainText('Lift & slide · Timber');
  await expect(page.locator('.spec-compact')).toContainText('Roof lantern / rooflight');
});

test('staff see website enquiries sent without an account and triage them', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html');
  await expect(page.locator('.seg a[href="#/enquiries"] .seg-count')).toHaveText('1');
  await page.locator('.seg a[href="#/enquiries"]').click();
  await expect(page.locator('h1')).toHaveText('Enquiries');
  const enq = page.locator('details.enq', { hasText: 'BP-261018-3F2A' });
  await enq.locator('summary').click();
  await expect(enq).toContainText('jo@example.com');
  await expect(enq).toContainText('3600 × 2200 mm');
  await enq.locator('select[name="status"]').selectOption('replied');
  await enq.locator('textarea[name="staff_note"]').fill('Called back, survey next week.');
  await enq.locator('button[type="submit"]').click();
  await expect(page.locator('details.enq', { hasText: 'BP-261018-3F2A' }).locator('.badge')).toHaveText('Replied');
  await page.locator('#rq-filter').selectOption('closed');
  await expect(page.locator('#app')).toContainText('No enquiries match.');
});

test('clients cannot use the staff CRM', async ({ page }) => {
  await page.locator('[data-demo-login="client"]').click();
  await page.goto('/admin.html');
  await expect(page.locator('#app')).toContainText('This area is for Brick & Pane staff');
});

test('sizing tool opening carries into a homeowner’s new request with a budget', async ({ page }) => {
  await page.goto('/lift-and-slide-doors.html#sizing');
  await page.locator('[data-tool-portal]').click();
  await expect(page).toHaveURL(/login\.html\?next=portal\.html/);
  await page.locator('[data-demo-login="homeowner"]').click();
  await expect(page).toHaveURL(/portal\.html#\/new$/);
  await expect(page.locator('h1')).toHaveText('Add your opening');
  await expect(page.locator('[data-rows] input[name="width_mm"]')).toHaveValue('5600');
  await expect(page.locator('[data-rows] select[name="config"]')).toHaveValue('4C');
  await expect(page.locator('[data-total-value]')).toHaveText(/£[\d,]+–£[\d,]+ inc\. VAT/);
  await expect(page.locator('#np-riba')).toBeHidden();
  await page.fill('#np-name', 'Our kitchen');
  await page.fill('#np-loc', 'E17');
  await page.locator('.newp button[type="submit"]').click();
  await expect(page.locator('.now-card')).toContainText('Request received');
  await expect(page.locator('.estimate')).toContainText('Budget estimate');
  await expect(page.locator('.tracker li.is-current')).toHaveText('Quote');
});

test('homeowner tracks an order like an online shop', async ({ page }) => {
  await page.locator('[data-demo-login="homeowner"]').click();
  await expect(page.locator('.eyebrow').first()).toHaveText('Your orders');
  const card = page.locator('.pcard', { hasText: 'Kitchen extension doors' });
  await expect(card.locator('.badge')).toHaveText('Being made');
  await expect(card.locator('.tracker li.is-current')).toHaveText('Made');
  await card.click();
  await expect(page.locator('.now-card')).toContainText('being made to your approved drawings');
});

test('change register: architect decides on a Brick & Pane proposal', async ({ page }) => {
  await page.locator('[data-demo-login="client"]').click();
  await page.locator('.pcard', { hasText: 'Mews house' }).click();
  await expect(page.locator('[data-tab="changes"] .dot-you')).toBeVisible();
  await page.locator('[data-tab="changes"]').click();
  await expect(page.locator('.change-impact').first()).toContainText('No change to U-value');
  await page.locator('[data-change] button[value="rejected"]').click();
  await expect(page.locator('.toast')).toContainText('Please say why');
  await page.locator('[data-change] button[value="approved"]').click();
  await expect(page.locator('.badge-ok', { hasText: 'Approved' }).first()).toBeVisible();
  // Drawings are reviewed, not "accepted".
  await page.locator('[data-tab="documents"]').click();
  await expect(page.locator('[data-approve] button[value="approved"]')).toHaveText('Reviewed — no comments');
});

test('once a client is on the team, only they can accept the quotation', async ({ page }) => {
  await page.locator('[data-demo-login="client"]').click();
  await page.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await page.fill('#inv-email', 'ravi@example-homes.co.uk');
  await page.selectOption('#inv-role', 'client');
  await page.locator('[data-invite] button').click();
  await expect(page.locator('.team')).toContainText('Ravi Patel');
  await page.locator('[data-tab="documents"]').click();
  await expect(page.locator('[data-approve]')).toHaveCount(0);
  await expect(page.locator('#panel-documents .badge-you')).toContainText('Waiting for Ravi Patel');
});

test('homeowner sees delivery dates and payments; developer demo shows the scheme', async ({ page, context }) => {
  await page.locator('[data-demo-login="homeowner"]').click();
  await page.locator('.pcard', { hasText: 'Kitchen extension doors' }).click();
  await expect(page.locator('.now-card')).toContainText('Delivery');
  await expect(page.locator('.now-card')).toContainText('Fitting');
  await expect(page.locator('#panel-overview')).toContainText('Paid £6,984 of £23,280');
  const dev = await context.newPage();
  await dev.goto('/login.html');
  await dev.locator('[data-demo-login="developer"]').click();
  await expect(dev.locator('.pcard', { hasText: 'Northfield Terrace' })).toBeVisible();
});

test('an internal note stays internal when the page updates live', async ({ page, context }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html');
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-tab="messages"]').click();
  await page.locator('.composer-mode input[value="internal"]').check();
  await page.fill('#msg-body', 'Margin is fine at this price.');
  // Another tab changes the data, which re-renders this panel.
  const client = await context.newPage();
  await client.goto('/login.html');
  await client.locator('[data-demo-login="client"]').click();
  await client.goto('/portal.html');
  await client.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await client.locator('[data-tab="messages"]').click();
  await client.fill('#msg-body', 'Any news?');
  await client.locator('[data-message] button[type="submit"]').click();
  await expect(page.locator('.thread')).toContainText('Any news?');
  await expect(page.locator('.composer-mode input[value="internal"]')).toBeChecked();
  await expect(page.locator('#msg-body')).toHaveValue('Margin is fine at this price.');
  await expect(page.locator('[data-message] button[type="submit"]')).toHaveText('Save internal note');
  await page.locator('[data-message] button[type="submit"]').click();
  await expect(client.locator('.thread')).toContainText('Any news?');
  await client.reload();
  await client.locator('[data-tab="messages"]').click();
  await expect(client.locator('.thread')).not.toContainText('Margin is fine');
});

test('live mode offers only the sign-in providers switched on in Supabase', async ({ page }) => {
  // Pretend the portal is connected: fake config, auth settings with Google and Microsoft on, Apple off.
  await page.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://fake.supabase.co'; export const SUPABASE_ANON_KEY = 'anon';" }));
  await page.route('https://fake.supabase.co/**', (r) => {
    const url = r.request().url();
    if (url.endsWith('/auth/v1/settings')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ external: { google: true, azure: true, apple: false, email: true } }) });
    if (url.includes('/authorize')) return r.fulfill({ body: 'provider page' });
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/login.html?signup=homeowner');
  const signup = page.locator('[data-signup] [data-oauth]');
  await expect(signup.locator('[data-provider]')).toHaveText(['Continue with Google', 'Continue with Microsoft']);
  await expect(page.locator('[data-demo]')).toBeHidden();
  await signup.locator('[data-provider="google"]').click();
  await expect(page).toHaveURL(/fake\.supabase\.co\/auth\/v1\/authorize\?provider=google/);
  expect(decodeURIComponent(page.url())).toContain('redirect_to=http://127.0.0.1:4173/portal.html');
  await page.goto('/404.html'); // back on our origin to read what was stored before the redirect
  expect(await page.evaluate(() => localStorage.getItem('bp-oauth-account-type'))).toBe('homeowner');
});

test('Polish login labels the provider buttons in Polish', async ({ page }) => {
  await page.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://fake.supabase.co'; export const SUPABASE_ANON_KEY = 'anon';" }));
  await page.route('https://fake.supabase.co/**', (r) => r.request().url().endsWith('/auth/v1/settings') ? r.fulfill({ contentType: 'application/json', body: '{"external":{"google":true}}' }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('/pl/login.html');
  await expect(page.locator('[data-signin] [data-provider="google"]')).toHaveText('Kontynuuj przez Google');
  await expect(page.locator('[data-signin] .oauth-or')).toHaveText('albo zaloguj się e-mailem');
});

test('demo mode shows no provider buttons', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page.locator('[data-demo]')).toBeVisible();
  await expect(page.locator('[data-oauth]').first()).toBeHidden();
});
