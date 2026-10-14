// Client portal + staff CRM in demo mode. Two tabs share data (localStorage) but not sessions.
import { test, expect } from '@playwright/test';

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

  // Architect approves the quotation.
  await page.locator('[data-tab="documents"]').click();
  await page.locator('[data-approve] button[value="approved"]').click();
  await expect(page.locator('.badge-ok', { hasText: 'Approved' }).first()).toBeVisible();

  // Staff gets notified, moves the stage and replies.
  await expect(staff.locator('.notif-count')).toBeVisible();
  await staff.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await staff.selectOption('#ctl-stage', 'accepted');
  await staff.fill('#ctl-note', 'Order confirmed.');
  await staff.locator('[data-stage] button[type="submit"]').click();
  await staff.fill('#msg-body', 'Survey booked for Tuesday.');
  await staff.locator('[data-message] button[type="submit"]').click();

  // Architect sees it without reloading.
  await expect(page.locator('.now-card')).toContainText('Order confirmed');
  await expect(page.locator('.notif-btn')).toHaveAttribute('aria-label', /unread/);
  await page.locator('[data-tab="messages"]').click();
  await expect(page.locator('.thread li').last()).toContainText('Survey booked for Tuesday.');
  await expect(page.locator('.thread')).not.toContainText('discount headroom'); // internal note stays hidden
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
  await expect(page.locator('[data-est]')).toHaveText(/kg/);
  await page.locator('.newp button[type="submit"]').click();
  await expect(page.locator('.now-card')).toContainText('Received');
  await expect(page.locator('h1')).toHaveText('Test villa');
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
  await expect(page.locator('h1')).toHaveText('Get a price');
  await expect(page.locator('[data-rows] input[name="width_mm"]')).toHaveValue('5600');
  await expect(page.locator('[data-rows] select[name="config"]')).toHaveValue('4C');
  await expect(page.locator('[data-total-value]')).toHaveText(/£[\d,]+–£[\d,]+ \+ VAT/);
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
