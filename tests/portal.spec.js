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
  await staff.goto('/admin.html#/board');
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
  // Staff start on an internal note, so a call note never reaches the client by accident (audit K6).
  await expect(staff.locator('.composer-mode input[value="internal"]')).toBeChecked();
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

test('the CRM has no prospects tab: companies to win are kept in HubSpot', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/prospects');
  await expect(page.locator('.board-tools > .seg').first().locator('a')).toHaveText([/Today/, /My work/, /Projects/, /Enquiries/, /Calendar/, /Email/, /Companies/, /Quotes/, /Dashboard/]);
  await expect(page.locator('h1')).not.toHaveText('Prospects');
});

test('staff build a quote in five steps and get a printable estimate', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html');
  await page.locator('.seg a[href="#/quotes"]').click();
  await expect(page.locator('h1')).toHaveText('Quotes');
  await expect(page.locator('#app')).toContainText('Nothing yet.');
  await page.locator('[data-act="new"]').click();
  await expect(page).toHaveURL(/#\/quotes\/[\w-]+$/);
  // 01 client
  await page.locator('[data-act="audience"][data-v="architect"]').click();
  await page.locator('[data-b="q:customerName"]').fill('Jo Bennett');
  await page.locator('[data-b="q:billingAddress"]').fill('12 Orford Road\nLondon');
  await page.locator('[data-b="q:postcode"]').fill('E17 9NJ');
  await page.locator('[data-b="q:internalNote"]').fill('Call after 5');
  await expect(page.locator('#q-crumb')).toHaveText('Jo Bennett');
  // 02 products: 2 × £1,000 and 1 × £2,500.50
  await page.locator('[data-act="next"]').click();
  await page.locator('[data-act="add-item"]').click();
  await page.locator('[data-b$=":qty"]').fill('2');
  await page.locator('[data-b$=":unitPrice"]').fill('1000');
  await page.locator('[data-act="add-item"]').click();
  await page.locator('[data-b$=":kind"]').nth(1).selectOption('bifold');
  await page.locator('[data-b$=":unitPrice"]').nth(1).fill('2500,50');
  await expect(page.locator('#q-sum')).toContainText('£4,500.50');
  // 03 installation, priced separately: not part of the main total
  await page.locator('[data-act="next"]').click();
  await page.locator('[data-act="mode"][data-v="separate"]').click();
  await page.locator('[data-b="il:windows:amount"]').fill('800');
  await expect(page.locator('#q-total')).toHaveText('£4,500.50');
  // 04 terms: VAT on, stages must add up to 100%
  await page.locator('[data-act="next"]').click();
  await page.locator('[data-act="vat"]').check();
  await expect(page.locator('#q-total')).toHaveText('£5,400.60');
  await page.locator('[data-b$=":percent"]').first().fill('30');
  await expect(page.locator('#q-paysum')).toContainText('90%');
  await page.locator('[data-b$=":percent"]').first().fill('40');
  await expect(page.locator('#q-paysum')).toContainText('100%');
  // 05 the estimate, in Polish
  await page.locator('[data-act="lang"][data-v="pl"]').click();
  await page.locator('[data-act="step"][data-v="offer"]').click();
  const offer = page.locator('#offer');
  await expect(offer).toContainText('Jo Bennett');
  await expect(offer).toContainText('E17 9NJ');
  await expect(offer).toContainText('Dla projektanta · Dostawa, montaż osobno');
  await expect(offer).toContainText('Harmonijkowe');
  await expect(offer).toContainText('Razem z VAT');
  await expect(offer).toContainText('Montaż — osobna wycena');
  await expect(offer).not.toContainText('Call after 5'); // the note stays with the team
  // Saved for the team: back on the list after a reload.
  await page.waitForTimeout(800);
  await page.goto('/admin.html#/quotes');
  const item = page.locator('.q-item', { hasText: 'Jo Bennett' });
  await expect(item).toContainText(`BP-${new Date().getFullYear()}-001`);
  await expect(item).toContainText('5400,60'); // amounts follow the quote's language (PL here)
  await item.locator('[data-act="dup"]').click();
  await expect(page.locator('.q-item')).toHaveCount(2);
  await page.locator('.q-item').first().locator('[data-act="del-ask"]').click();
  await page.locator('[data-act="del-yes"]').click();
  await expect(page.locator('.q-item')).toHaveCount(1);
});

test('a quote goes to its HubSpot deal: new, then a revision; a copy stays on the same deal', async ({ page }) => {
  const ref = `BP-${new Date().getFullYear()}-001`;
  const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%demo\n') });
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="new"]').click();
  await expect(page).toHaveURL(/#\/quotes\/[\w-]+$/);
  // 01 client: pick the deal; its contact fills the empty fields.
  const deal = page.locator('#q-deal');
  await expect(deal).toContainText('HubSpot deal');
  await expect(deal.locator('.q-st')).toHaveText('Draft');
  // An empty search lists the open deals with where each came from; the source filter narrows them.
  await deal.locator('[data-act="deal-search"]').click();
  await expect(deal.locator('.q-deals li')).toHaveCount(3);
  await expect(deal.locator('.q-deals li').first()).toContainText('Website');
  await expect(deal.locator('.q-deals li').first()).toContainText('Portal BP-2026-0001');
  await deal.locator('[data-act="deal-src"][data-v="cold"]').click();
  await expect(deal.locator('.q-deals li')).toHaveCount(1);
  await expect(deal.locator('.q-deals li')).toContainText('Example Homes');
  await page.locator('#q-deal-q').fill('bennett');
  await page.locator('#q-deal-q').press('Enter');
  await expect(deal.locator('.q-deals li')).toHaveCount(1);
  await deal.locator('[data-act="deal-pick"]').click();
  await expect(page.locator('.toast').last()).toContainText('Filled from HubSpot: 5 empty field(s).');
  await expect(page.locator('[data-b="q:customerName"]')).toHaveValue('Jo Bennett');
  await expect(page.locator('[data-b="q:email"]')).toHaveValue('jo@example.com');
  await expect(deal).toContainText('BP-261018-3F2A · Jo Bennett');
  await deal.locator('[data-act="deal-files"]').click();
  await expect(deal.locator('.q-files')).toContainText('Bennett-estimate-Grok.pdf');
  // 05: send the first time.
  await page.locator('[data-act="step"][data-v="offer"]').click();
  const send = page.locator('#q-send');
  await send.locator('[data-act="send-open"]').click();
  await expect(send).toContainText('New quote');
  await expect(send).toContainText(`Brick-and-Pane-${ref}-rev00.pdf`);
  await send.locator('[data-act="send-go"]').click();
  await expect(send).toContainText('Choose the PDF you sent to the client.');
  await page.locator('#q-send-file').setInputFiles(pdf(`Brick-and-Pane-${ref}-rev00.pdf`));
  await send.locator('[data-act="send-go"]').click();
  await expect(page.locator('.toast').last()).toContainText('The note with the PDF is on the HubSpot deal.');
  await expect(send.locator('.q-sends li')).toHaveCount(1);
  await expect(send.locator('.q-sends li')).toContainText('rev 00');
  await expect(send.locator('.q-sends li')).toContainText('deal moved to Quote sent');
  await expect(send.locator('.q-st')).toHaveText('Sent · rev 00');
  // Change the quote: it is flagged, and the next send is revision 01.
  await page.locator('[data-act="step"][data-v="client"]').click();
  await page.locator('[data-b="q:phone"]').fill('07700 900999');
  await page.locator('[data-act="step"][data-v="offer"]').click();
  await expect(page.locator('.q-changed')).toContainText('sent as revision 00');
  await send.locator('[data-act="send-open"]').click();
  await expect(page.locator('.toast').last()).toContainText('it is now revision 01');
  await expect(send).toContainText('Revision 01, replacing revision 00');
  await page.locator('#q-send-file').setInputFiles(pdf('estimate.pdf'));
  await send.locator('[data-act="send-go"]').click();
  await expect(send).toContainText(`Tick that this is the PDF of ${ref}.`);
  await page.locator('#q-send-sure').check();
  await send.locator('[data-act="send-go"]').click();
  await expect(send.locator('.q-sends li')).toHaveCount(2);
  await expect(send.locator('.q-sends li').first()).toContainText('rev 01');
  await expect(send.locator('.q-sends li').nth(1)).toContainText('replaced');
  await expect(page.locator('.q-changed')).toHaveCount(0);
  // The same quote again, unchanged: a resend of revision 01.
  await send.locator('[data-act="send-open"]').click();
  await expect(send).toContainText('The same revision 01 again, with no changes');
  await send.locator('[data-act="send-cancel"]').click();
  // Staff can set the status themselves.
  await send.locator('[data-act="st-accepted"]').click();
  await expect(send.locator('.q-st')).toHaveText('Accepted · rev 01');
  // The list: status and deal; a sent quote cannot be deleted; a copy is a second quote on the same deal.
  await page.waitForTimeout(800);
  await page.goto('/admin.html#/quotes');
  const item = page.locator('.q-item', { hasText: 'Jo Bennett' });
  await expect(item).toContainText('Accepted · rev 01');
  await expect(item).toContainText('BP-261018-3F2A · Jo Bennett');
  await expect(item.locator('[data-act="del-ask"]')).toHaveCount(0);
  await item.locator('[data-act="dup"]').click();
  await expect(page.locator('.toast').last()).toContainText('on the same HubSpot deal');
  const copy = page.locator('.q-item', { hasText: `BP-${new Date().getFullYear()}-002` });
  await expect(copy).toContainText('Draft');
  await copy.locator('.q-item-open').click();
  await page.locator('[data-act="step"][data-v="client"]').click();
  await expect(page.locator('#q-deal')).toContainText('Other quotes on this deal');
  await expect(page.locator('#q-deal')).toContainText(ref);
  await expect(page.locator('[data-b="q:revision"]')).toHaveValue('00');
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
  await enq.locator('[data-req-form] button[type="submit"]').click();
  await expect(page.locator('details.enq', { hasText: 'BP-261018-3F2A' }).locator('.badge')).toHaveText('Replied');
  await page.locator('#rq-filter').selectOption('closed');
  await expect(page.locator('#app')).toContainText('No enquiries match.');
  // Turn it into a project: the openings come across, the enquiry links to the project.
  await page.locator('#rq-filter').selectOption('open');
  await page.locator('details.enq summary').first().click();
  await expect(page.locator('[data-req-invite]')).toBeChecked(); // invitation email on by default (owner, 01.11.2026)
  await page.locator('[data-req-convert]').click();
  await expect(page.locator('.toast').last()).toContainText('Project created.');
  await expect(page).toHaveURL(/admin\.html#\/p\//);
  await expect(page.locator('h1')).toHaveText('Jo Bennett, Walthamstow, E17');
  await page.locator('[data-tab="overview"]').click();
  await expect(page.locator('#panel-overview')).toContainText('3600');
  await expect(page.locator('#panel-overview')).toContainText('1200');
  await page.goto('/admin.html#/enquiries');
  await page.locator('#rq-filter').selectOption('all');
  await page.locator('details.enq summary').first().click();
  await expect(page.locator('details.enq a', { hasText: 'Open the project' })).toBeVisible();
});

test('CRM: the source enquiry sits on the project card; one search in the app bar finds projects and enquiries', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/enquiries');
  await page.locator('details.enq summary').first().click();
  await page.locator('[data-req-convert]').click();
  await expect(page).toHaveURL(/admin\.html#\/p\//);
  // What the client wrote, without going back to Enquiries; the stage can be moved here.
  await page.locator('[data-fold="enquiry"] > summary').click();
  await expect(page.locator('[data-fold="enquiry"]')).toContainText('A quotation');
  await expect(page.locator('[data-stage]')).toBeVisible();
  await expect(page.locator('.eyebrow', { hasText: 'Internal' })).toHaveCount(0);
  // One search from anywhere.
  await page.locator('#crm-gq').fill('bennett');
  await page.locator('#crm-gq').press('Enter');
  await expect(page).toHaveURL(/#\/search\/bennett$/);
  const res = page.locator('#search-results');
  await expect(res.locator('.today-sec', { hasText: 'Projects' })).toContainText('Jo Bennett');
  await expect(res.locator('.today-sec', { hasText: 'Enquiries' })).toContainText('Jo Bennett');
  await expect(page.locator('#crm-gq')).toHaveValue('bennett');
  await page.locator('#crm-gq').fill('nothing-like-this');
  await page.locator('#crm-gq').press('Enter');
  await expect(res.locator('.today-sec').first()).toContainText('Nothing found.');
});

test('tasks: a task on the project shows on Today; a logged call plans the next contact; the client sees none of it', async ({ page, context }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-fold="tasks"] > summary').click();
  const box = page.locator('[data-fold="tasks"] [data-tasks]');
  await expect(box).toContainText('No open tasks.');
  await box.locator('[data-task-add] input[name="title"]').fill('Send the revised drawings');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await box.locator('[data-task-add] input[name="due_on"]').fill(today);
  await box.locator('[data-task-add] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Task added.');
  await expect(page.locator('[data-fold="tasks"] .task', { hasText: 'Send the revised drawings' })).toBeVisible();
  // Log a call: saved as done, the next contact planned.
  const tbox = page.locator('[data-fold="tasks"] [data-tasks]');
  await tbox.locator('[data-task-log] textarea[name="note"]').fill('Client happy with the frames, wants the drawings by Friday.');
  await tbox.locator('[data-task-log] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('next contact planned');
  await expect(page.locator('[data-fold="tasks"] .task', { hasText: 'Follow up' })).toBeVisible();
  await expect(page.locator('[data-fold="tasks"] .task-done')).toContainText('Done recently (1)');
  // Today lists the task due today; ticking it off clears it.
  await page.goto('/admin.html#/today');
  const sec = page.locator('#t-tasks');
  await expect(sec).toContainText('Send the revised drawings');
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-fold="tasks"] .task', { hasText: 'Send the revised drawings' }).locator('[data-task-done]').check();
  await page.goto('/admin.html#/today');
  await expect(page.locator('#t-tasks')).not.toContainText('Send the revised drawings');
  // The client on the project: no tasks anywhere.
  const client = await context.newPage();
  await client.goto('/login.html');
  await client.locator('[data-demo-login="client"]').click();
  await client.goto('/portal.html');
  await client.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await expect(client.locator('.now-card')).toBeVisible();
  for (const text of ['Send the revised drawings', 'Follow up', 'Client happy with the frames']) await expect(client.locator('body')).not.toContainText(text);
});

test('CRM: opens on Today; the board is one click away and its breadcrumb leads back to it', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html');
  await expect(page.locator('h1')).toHaveText('Today');
  await expect(page.locator('.seg a.is-on')).toHaveText('Today');
  await page.locator('.seg a[href="#/board"]').click();
  await expect(page.locator('.board')).toBeVisible();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('.breadcrumb a[href="#/board"]').click();
  await expect(page.locator('.board')).toBeVisible();
});

test('owner dashboard: one page with enquiries, quotes, wins, money and workload; the source is set on the project', async ({ page, context }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-fold="internal"] > summary').click();
  await page.locator('#ctl-src').selectOption('referral');
  await page.locator('#ctl-camp').fill('JSA Architects');
  await page.locator('[data-internal] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Saved.');
  await page.goto('/admin.html#/owner');
  const dash = page.locator('#dashboard');
  await expect(page.locator('h1')).toHaveText('Dashboard');
  for (const t of ['New enquiries', 'First reply, median', 'Quotes in play', 'Won', 'Paid in', 'Due in 30 days', 'Overdue']) await expect(dash.locator('.dash-tiles')).toContainText(t);
  await expect(dash).toContainText('From enquiry to order');
  await expect(dash).toContainText('Who carries what');
  await dash.locator('[data-days="365"]').click();
  await expect(page.locator('[data-days="365"]')).toHaveAttribute('aria-pressed', 'true');
  // Clients never reach it.
  const client = await context.newPage();
  await client.goto('/login.html');
  await client.locator('[data-demo-login="client"]').click();
  await client.goto('/admin.html#/owner');
  await expect(client.locator('#app')).toContainText('This area is for Brick & Pane staff');
});

test('companies: a practice with its people, linked to a project in a role, found by the one search; clients see none of it', async ({ page, context }) => {
  await page.goto('/admin.html#/companies');
  await page.locator('[data-demo-login="staff"]').click();
  await expect(page.locator('h1')).toHaveText('Companies');
  await page.locator('#co-name').fill('JSA Architects');
  await page.locator('#co-kind').selectOption('architect');
  await page.locator('[data-co-new] button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/company\//);
  await expect(page.locator('h1')).toHaveText('JSA Architects');
  await page.locator('#co-pname').fill('Jane Smith');
  await page.locator('#co-ptitle').fill('Associate');
  await page.locator('#co-pemail').fill('jane@jsa.example');
  await page.locator('[data-person-add] button[type="submit"]').click();
  await expect(page.locator('[data-person]')).toContainText('Jane Smith');
  // The same practice twice is refused.
  await page.goto('/admin.html#/companies');
  await page.locator('#co-name').fill('jsa architects');
  await page.locator('#co-kind').selectOption('architect');
  await page.locator('[data-co-new] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('already exists');
  // On the project card, in a role.
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  // Found by typing, not in a list of every company (projects audit 26.11.2026); the box is open on the card.
  await page.locator('#pco-co').fill('jsa');
  await page.locator('#pco-co-list [role="option"]', { hasText: 'JSA Architects' }).click();
  await page.locator('#pco-role').selectOption('architect');
  await page.locator('[data-pco-add] button[type="submit"]').click();
  await expect(page.locator('[data-pco-item]')).toContainText('JSA Architects');
  await page.locator('[data-pco-item] a').click();
  await expect(page.locator('#company')).toContainText('Hartley Road');
  // The one search finds the person.
  await page.locator('#crm-gq').fill('jane');
  await page.locator('#crm-gq').press('Enter');
  await expect(page.locator('#search-results .today-sec', { hasText: 'Companies and people' })).toContainText('Jane Smith');
  const client = await context.newPage();
  await client.goto('/login.html');
  await client.locator('[data-demo-login="client"]').click();
  await client.goto('/portal.html');
  await client.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await expect(client.locator('.now-card')).toBeVisible();
  for (const text of ['JSA Architects', 'Jane Smith']) await expect(client.locator('body')).not.toContainText(text);
});

test('CRM views never scroll sideways, whatever the width (8 tabs in the view switch)', async ({ page }) => {
  await page.goto('/admin.html#/today');
  await page.locator('[data-demo-login="staff"]').click();
  for (const h of ['#/today', '#/board', '#/enquiries', '#/quotes', '#/companies', '#/owner']) {
    await page.goto(`/admin.html${h}`);
    await page.locator('h1').waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), h).toBeLessThanOrEqual(1);
  }
});

test('mail: a reply is written on the project and goes only after the tick that it was checked', async ({ page }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-tab="mail"]').click();
  const panel = page.locator('[data-mail-panel]');
  const first = panel.locator('details.mail:not(.is-out)', { hasText: 'threshold detail' }).first();
  await first.locator(':scope > summary').click();
  await first.locator('[data-mail-reply]').click();
  const form = panel.locator('[data-mail-compose]');
  await expect(form.locator('#mc-subj')).toHaveValue('Re: Hartley Road: threshold detail');
  await expect(form.locator('#mc-to')).toHaveValue(/@/);
  await expect(form.locator('#mc-text')).toHaveValue(/> Hi Kate,/);
  await form.locator('#mc-text').fill('Hi Anna,\n\nThe flush threshold is in the revised quote.\n\nKate');
  // Without the tick nothing goes.
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Tick that you checked');
  await form.locator('input[name="confirm"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Sent.');
  await expect(panel.locator('[data-mail-compose]')).toHaveCount(0);
  await expect(panel.locator('details.mail.is-out').first()).toContainText('Re: Hartley Road: threshold detail');
});

test('stage change: the client is told only when ticked, with a preview; the date stays unless changed', async ({ page }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  const f = page.locator('[data-stage]');
  await expect(f.locator('input[name="visible"]')).not.toBeChecked();
  await expect(f.locator('[data-stage-preview]')).toHaveText('Only the team sees this change.');
  const before = await f.locator('#ctl-due').inputValue();
  await f.locator('#ctl-stage').selectOption('accepted');
  await f.locator('input[name="visible"]').check();
  await expect(f.locator('[data-stage-preview]')).toContainText('and gets an email');
  if (before) await expect(f.locator('#ctl-due')).toHaveValue(before);
});

test('enquiry: Today links to the enquiry itself; a templated reply goes after the tick and marks it replied', async ({ page }) => {
  await page.goto('/admin.html#/today');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('#t-fresh .today-row').first().click();
  await expect(page).toHaveURL(/#\/enquiries\/[\w-]+$/);
  const enq = page.locator('details.enq[open]');
  await expect(enq).toHaveCount(1);
  await enq.locator('[data-req-reply]').click();
  const form = enq.locator('[data-req-reply-form]');
  await expect(form.locator('textarea[name="text"]')).toHaveValue(/To prepare the quotation we need/);
  await form.locator('select[name="lang"]').selectOption('pl');
  await expect(form.locator('textarea[name="text"]')).toHaveValue(/Do przygotowania wyceny potrzebujemy/);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Tick that you checked');
  await form.locator('input[name="confirm"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('marked as replied');
  await expect(page.locator('details.enq[open] .badge')).toHaveText('Replied');
});

test('companies: a person marked do not contact shows it, and can be allowed again', async ({ page }) => {
  await page.goto('/admin.html#/companies');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('#co-name').fill('Prospect Ltd');
  await page.locator('[data-co-new] button[type="submit"]').click();
  await page.locator('#co-pname').fill('Pat Prospect');
  await page.locator('[data-person-add] button[type="submit"]').click();
  await page.locator('[data-person] [data-person-dnc]').click();
  await expect(page.locator('[data-person]')).toContainText('do not contact');
  await page.locator('[data-person] [data-person-dnc]').click();
  await expect(page.locator('[data-person]')).not.toContainText('do not contact');
});

test('openings listed on the public site fill a new portal project after sign-in', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bp-openings-list', JSON.stringify([
    { ref: 'D01', system: 'bifold', material: 'alu', width_mm: 4200, height_mm: 2400, qty: 1, note: '3 leaves' },
    { ref: 'W01', system: 'windows', material: 'timber', width_mm: 1200, height_mm: 1400, qty: 2 }])));
  await page.locator('[data-demo-login="homeowner"]').click();
  await page.goto('/portal.html#/new');
  await expect(page.locator('[data-rows] tr')).toHaveCount(2);
  await expect(page.locator('[data-rows] tr').nth(1).locator('[name="qty"]')).toHaveValue('2');
  await expect(page.locator('[data-rows] tr').nth(1).locator('[name="material"]')).toHaveValue('timber');
  await page.fill('#np-name', 'Our kitchen');
  await page.fill('#np-loc', 'E17');
  await page.locator('.newp button[type="submit"]').click();
  await expect(page.locator('.now-card')).toContainText('Request received');
  expect(await page.evaluate(() => localStorage.getItem('bp-openings-list'))).toBeNull();
});

test('clients cannot use the staff CRM', async ({ page }) => {
  await page.locator('[data-demo-login="client"]').click();
  await page.goto('/admin.html');
  await expect(page.locator('#app')).toContainText('This area is for Brick & Pane staff');
});

test('sizing tool opening carries into a homeowner’s new request, with no automatic price', async ({ page }) => {
  // One path to a quote: the tool adds to the visitor's list, and the portal takes the list over after sign-in.
  await page.goto('/lift-and-slide-doors.html#sizing');
  await expect(page.locator('[data-tool-portal]')).toHaveCount(0);
  await page.locator('[data-tool-add]').click();
  await page.goto('/portal.html#/new');
  await expect(page).toHaveURL(/login\.html\?next=portal\.html/);
  await page.locator('[data-demo-login="homeowner"]').click();
  await expect(page).toHaveURL(/portal\.html#\/new$/);
  await expect(page.locator('h1')).toHaveText('Add your opening');
  await expect(page.locator('[data-rows] input[name="width_mm"]')).toHaveValue('5600');
  await expect(page.locator('[data-rows] select[name="config"]')).toHaveValue('4C');
  await expect(page.locator('.newp')).not.toContainText('£');
  await expect(page.locator('#np-riba')).toBeHidden();
  await page.fill('#np-name', 'Our kitchen');
  await page.fill('#np-loc', 'E17');
  await page.locator('.newp button[type="submit"]').click();
  await expect(page.locator('.now-card')).toContainText('Request received');
  await expect(page.locator('#panel-overview .estimate')).toHaveCount(0);
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
  await page.goto('/admin.html#/board');
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
  // The project host is the real one (the page's CSP allows only it), but every request to it is answered here.
  await page.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://kgnjyyzjmyilorgaeabc.supabase.co'; export const SUPABASE_ANON_KEY = 'anon';" }));
  await page.route('https://kgnjyyzjmyilorgaeabc.supabase.co/**', (r) => {
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
  await expect(page).toHaveURL(/kgnjyyzjmyilorgaeabc\.supabase\.co\/auth\/v1\/authorize\?provider=google/);
  expect(decodeURIComponent(page.url())).toContain('redirect_to=http://127.0.0.1:4173/portal.html');
  await page.goto('/404.html'); // back on our origin to read what was stored before the redirect
  expect(await page.evaluate(() => localStorage.getItem('bp-oauth-account-type'))).toBe('homeowner');
});

test('OAuth from a deep link returns to a URL without a fragment and keeps the route aside', async ({ page }) => {
  // Supabase appends #access_token=… to redirect_to: a fragment already there (admin.html#/enquiries) breaks the sign-in.
  await page.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://kgnjyyzjmyilorgaeabc.supabase.co'; export const SUPABASE_ANON_KEY = 'anon';" }));
  await page.route('https://kgnjyyzjmyilorgaeabc.supabase.co/**', (r) => {
    const url = r.request().url();
    if (url.endsWith('/auth/v1/settings')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ external: { google: true, azure: true } }) });
    if (url.includes('/authorize')) return r.fulfill({ body: 'provider page' });
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  });
  for (const provider of ['google', 'azure']) {
    await page.goto('/login.html?next=admin.html%23%2Fenquiries');
    await page.locator(`[data-signin] [data-provider="${provider}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/auth/v1/authorize[?]provider=${provider}`));
    const redirect = new URL(page.url()).searchParams.get('redirect_to');
    expect(redirect).toBe('http://127.0.0.1:4173/admin.html');
    await page.goto('/404.html');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('bp-auth-return')))).toMatchObject({ path: '/admin.html', hash: '#/enquiries' });
  }
});

test('Polish login labels the provider buttons in Polish', async ({ page }) => {
  await page.route('**/js/portal/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = 'https://kgnjyyzjmyilorgaeabc.supabase.co'; export const SUPABASE_ANON_KEY = 'anon';" }));
  await page.route('https://kgnjyyzjmyilorgaeabc.supabase.co/**', (r) => r.request().url().endsWith('/auth/v1/settings') ? r.fulfill({ contentType: 'application/json', body: '{"external":{"google":true}}' }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('/pl/login.html');
  await expect(page.locator('[data-signin] [data-provider="google"]')).toHaveText('Kontynuuj przez Google');
  await expect(page.locator('[data-signin] .oauth-or')).toHaveText('albo zaloguj się e-mailem');
});

test('demo mode shows no provider buttons', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page.locator('[data-demo]')).toBeVisible();
  await expect(page.locator('[data-oauth]').first()).toBeHidden();
});

test('portal pages: CSP, frame guard, password settings and size checks', async ({ page }) => {
  const errors = [];
  await page.goto('/login.html');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /frame-src ('none'|https:\/\/challenges\.cloudflare\.com);/); // Turnstile only, when on
  await expect(page.locator('#no-frame')).toHaveCount(0); // top window: the page is shown
  expect(await page.evaluate(() => typeof self.supabase?.createClient)).toBe('function'); // vendored, not from a CDN

  // Inside someone else's frame the page stays hidden.
  // (sandboxed without allow-top-navigation, so the guard can't redirect this test's page)
  await page.goto('/404.html');
  await page.evaluate(() => { const f = document.createElement('iframe'); f.src = 'login.html'; f.sandbox = 'allow-scripts allow-same-origin'; document.body.append(f); });
  const framed = page.frameLocator('iframe');
  await expect(framed.locator('#no-frame')).toHaveCount(1);

  await page.goto('/login.html');
  await page.locator('[data-demo-login="client"]').click();
  await expect(page.locator('.pcard').first()).toBeVisible();
  await page.goto('/portal.html#/settings');
  await page.locator('#s-pw').fill('short');
  await page.locator('.password button[type=submit]').click();
  await expect(page.locator('.password .has-error')).toContainText('at least 10 characters');
  await page.locator('#s-pw').fill('a-long-password');
  await page.locator('#s-pw2').fill('a-long-password');
  await page.locator('.password button[type=submit]').click();
  await expect(page.locator('.toast')).toContainText('Password set.');
  await expect(page.locator('#app a[href^="mailto:"]')).toHaveText('contact@brickandpane.co.uk');

  // A size outside what the database accepts is pointed out before anything is created.
  await page.goto('/portal.html#/new');
  await page.locator('form [name="name"]').fill('Test house');
  await page.locator('form [name="location"]').fill('E17');
  await page.locator('[name="height_mm"]').first().fill('7000');
  await page.locator('form button[type=submit]').last().click();
  await expect(page.locator('.toast')).toContainText('Check the sizes');
  await expect(page.locator('[name="height_mm"]').first()).toHaveAttribute('aria-invalid', 'true');
  expect(errors.filter((e) => /Content Security Policy/i.test(e))).toEqual([]);
});

test('costs: staff add a supplier quote in £, accept it and see the margin; the client sees none of it', async ({ page, context }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await expect(page.locator('.key-numbers')).toContainText('£23,900'); // value on top of the card, no scrolling
  await page.locator('[data-tab="money"]').click();
  const box = page.locator('[data-costs]');
  await expect(box).toContainText('Costs & margin');
  await expect(box).toContainText('£23,900'); // the Commercial value, until a quote goes out on a deal
  await expect(box).toContainText('No supplier quotes yet.');
  await box.locator('#cost-sup').fill('Okna Polska (demo)');
  await box.locator('#cost-ref').fill('OP/2026/114');
  await expect(box.locator('#cost-cur, #cost-fx')).toHaveCount(0); // costs are in £ only
  await box.locator('#cost-amt').fill('7800');
  await box.locator('[data-cost-add] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Supplier quote added.');
  const row = page.locator('[data-costs] [data-cost]', { hasText: 'Okna Polska (demo)' });
  await expect(row).toContainText('£7,800.00');
  await expect(row).toContainText('Received');
  await row.locator('[data-cost-set="accepted"]').click();
  await expect(page.locator('[data-costs] [data-cost]', { hasText: 'Okna Polska (demo)' })).toContainText('Accepted');
  await expect(page.locator('[data-costs] .cost-sum')).toContainText('£7,800');
  await expect(page.locator('[data-costs] .cost-sum')).toContainText('£16,100 (67.4%)');

  // The architect on the same project: no costs, no supplier, no margin.
  const client = await context.newPage();
  await client.goto('/login.html');
  await client.locator('[data-demo-login="client"]').click();
  await client.goto('/portal.html');
  await client.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await expect(client.locator('.now-card')).toBeVisible();
  for (const text of ['Costs & margin', 'Okna Polska', 'Margin', '7,800']) await expect(client.locator('body')).not.toContainText(text);
});

test('costs: supplier quotes compare at one net figure; a supplier asked waits on the list until the price comes in', async ({ page }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-tab="money"]').click();
  const box = page.locator('[data-costs]');
  // Asked, no price yet.
  await box.locator('#cost-ask-sup').fill('Okna Nowak (demo)');
  await box.locator('[data-cost-ask] button[type="submit"]').click();
  const asked = box.locator('[data-cost]', { hasText: 'Okna Nowak (demo)' });
  await expect(asked).toContainText('Requested');
  await expect(asked).toContainText('waiting 0 days');
  // VAT inside the price, a discount and delivery on top: compared at £12,000 / 1.2 × 0.95 + £250.
  await box.locator('#cost-sup').fill('Aluprof partner (demo)');
  await box.locator('#cost-var').fill('MB-86');
  await box.locator('#cost-amt').fill('12000');
  await box.locator('#cost-vat').selectOption('20');
  await box.locator('#cost-disc').fill('5');
  await box.locator('#cost-del').fill('250');
  await expect(box.locator('[data-cost-net]')).toContainText('£9,750.00');
  await box.locator('[data-cost-add] button[type="submit"]').click();
  const alu = box.locator('[data-cost]', { hasText: 'Aluprof partner (demo)' });
  await expect(alu).toContainText('£9,750.00 net');
  await expect(alu).toContainText('incl. VAT 20%');
  await box.locator('#cost-sup').fill('Plain Frames (demo)');
  await box.locator('#cost-amt').fill('9000');
  await box.locator('#cost-lead').fill('21');
  await box.locator('[data-cost-add] button[type="submit"]').click();
  const plain = box.locator('[data-cost]', { hasText: 'Plain Frames (demo)' });
  await expect(plain).toContainText('Lowest');
  await expect(plain).toContainText('21 days lead time');
  await expect(alu).toContainText('+£750.00 (+8.3%) vs lowest');
  // The price for the supplier we asked fills that same row.
  await asked.locator('[data-cost-price]').click();
  await expect(box.locator('#cost-sup')).toHaveValue('Okna Nowak (demo)');
  await box.locator('#cost-amt').fill('9500');
  await box.locator('[data-cost-add] button[type="submit"]').click();
  await expect(box.locator('[data-cost]', { hasText: 'Okna Nowak (demo)' })).toHaveCount(1);
  await expect(box.locator('[data-cost]', { hasText: 'Okna Nowak (demo)' })).toContainText('Received');
  // Accepting one counts it at its net in the margin.
  await alu.locator('[data-cost-set="accepted"]').click();
  await expect(box.locator('.cost-sum')).toContainText('£9,750');
});

test('mail: the client’s email shows on the project, the rest waits in Email; the client sees none of it', async ({ page, context }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-tab="mail"]').click();
  const panel = page.locator('[data-mail-panel]');
  await expect(panel).toContainText('Hartley Road: threshold detail');
  await expect(panel).toContainText('Re: Hartley Road: threshold detail');
  await expect(panel).not.toContainText('Offer for frames');
  await panel.locator('details.mail', { hasText: 'threshold detail' }).first().locator(':scope > summary').click();
  await expect(panel).toContainText('Could the threshold be flush');
  // A site name in the subject routes mail too (one client, several sites).
  await page.locator('#mk-word').fill('Avon Run');
  await page.locator('#mk-word').press('Enter');
  await expect(page.locator('.toast').last()).toContainText('Site name added.');
  await expect(page.locator('[data-mail-keywords]')).toContainText('Avon Run');

  // The supplier matches no project: it waits in Email until the team adds its domain to the project.
  await page.goto('/admin.html#/mail');
  const list = page.locator('.mail-list');
  await expect(list).toContainText('Offer for frames');
  await expect(list).not.toContainText('threshold detail');
  await page.locator('details.mail', { hasText: 'Offer for frames' }).locator('summary').click();
  await page.locator('[data-mail-known]').click();
  await expect(page.locator('#mc-match')).toHaveValue('jan@okna-demo.pl');
  await page.locator('#mc-match').fill('@okna-demo.pl');
  await page.locator('#mc-project').selectOption({ label: await page.locator('#mc-project option', { hasText: 'Hartley Road' }).innerText() });
  await page.locator('#mc-label').fill('Okna (demo)');
  await page.locator('#mc-label').press('Enter'); // on the phone layout the page still moves under a click here
  await expect(page.locator('.toast').last()).toContainText('Contact added.');
  await expect(page.locator('.callout')).toContainText('Every email is on a project.');
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await expect(page.locator('[data-mail-panel]')).toContainText('Offer for frames');

  // The architect on the same project: no mail, no Email view.
  const client = await context.newPage();
  await client.goto('/login.html');
  await client.locator('[data-demo-login="client"]').click();
  await client.goto('/portal.html');
  await client.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await expect(client.locator('.now-card')).toBeVisible();
  for (const text of ['threshold detail', 'Offer for frames', 'Zimbra']) await expect(client.locator('body')).not.toContainText(text);
});

test('Today lists what needs doing now: new enquiries, overdue projects; Mine filters to my projects', async ({ page }) => {
  await page.goto('/login.html');
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/today');
  await expect(page.locator('h1')).toHaveText('Today');
  await expect(page.locator('#t-fresh')).toContainText('Jo Bennett');
  await expect(page.locator('#t-overdue')).toContainText('Northfield Terrace');
  await expect(page.locator('#t-overdue .today-row').first()).toHaveClass(/is-late/);
  const jump = page.locator('[data-jump="overdue"]'); // counters are hidden on phones: each list shows its own
  if (await jump.isVisible()) await jump.click();
  await page.locator('#t-overdue .today-row', { hasText: 'Northfield Terrace' }).click();
  await expect(page).toHaveURL(/#\/p\//);
  await page.goto('/admin.html#/today');
  await page.locator('[data-mine="1"]').click();
  await expect(page.locator('[data-mine="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#t-fresh')).toContainText('Jo Bennett'); // enquiries have no owner yet: always shown
});

test('a quote started on a project goes out without a HubSpot deal: PDF in Documents, value, payments, stage', async ({ page, context }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Garden room, Dulwich' }).click();
  await page.locator('[data-tab="money"]').click();
  const box = page.locator('[data-project-quotes]');
  await expect(box).toContainText('No quote yet.');
  await box.locator('[data-new-quote]').click();
  await expect(page).toHaveURL(/#\/quotes\/[\w-]+$/);
  // The client, the project and its openings come along (it opens on the estimate, as any quote with products).
  await expect(page.locator('.offer')).toContainText('Lift and slide');
  await page.locator('[data-act="step"][data-v="client"]').click();
  await expect(page.locator('[data-b="q:projectId"] option:checked')).toContainText('Garden room, Dulwich');
  await expect(page.locator('[data-b="q:customerName"]')).not.toHaveValue('');
  const ref = await page.locator('[data-b="q:reference"]').inputValue();
  await page.locator('[data-act="step"][data-v="offer"]').click();
  const send = page.locator('#q-send');
  await expect(send).toContainText('Garden room, Dulwich');
  await send.locator('[data-act="send-open"]').click();
  await expect(send.locator('#q-send-share')).toBeChecked();
  await page.locator('#q-send-file').setInputFiles({ name: `Brick-and-Pane-${ref}-rev00.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%demo\n') });
  await expect(send.locator('#q-send-share')).toBeChecked(); // a redraw keeps the choice
  await send.locator('[data-act="send-go"]').click();
  await expect(page.locator('.toast').last()).toContainText('the client can accept it in Documents');
  await expect(send.locator('.q-sends li')).toContainText('No HubSpot deal');
  // Back on the project: the quote is listed, the PDF is in Documents for approval, the stage moved.
  await send.locator('a', { hasText: 'Garden room, Dulwich' }).click();
  await expect(page.locator('[data-project-quotes]')).toContainText(ref);
  await expect(page.locator('[data-project-quotes]')).toContainText('Sent');
  await expect(page.locator('.key-numbers')).toContainText('Quote issued');
  await page.locator('[data-tab="documents"]').click();
  await expect(page.locator('#app')).toContainText(`Quotation ${ref}`);
});

test('quote builder: our cost per line shows the margin live and never reaches the printed quote', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="sample"]').click();
  await expect(page).toHaveURL(/#\/quotes\/[\w-]+$/);
  await page.locator('[data-act="step"][data-v="products"]').click();
  await expect(page.locator('#q-margin')).toContainText('Type our cost');
  const first = page.locator('[data-pid]').first();
  await first.locator('[data-b$=":unitCost"]').fill('6000');
  await expect(page.locator('#q-margin')).toContainText('£6,000.00'); // our cost; the sale stays as priced
  await expect(page.locator('#q-margin .q-margin-v')).toContainText('%');
  // Copying a line keeps its price and cost.
  const before = await page.locator('[data-pid]').count();
  await first.locator('[data-act="copy-item"]').click();
  await expect(page.locator('[data-pid]')).toHaveCount(before + 1);
  await expect(page.locator('[data-pid]').nth(1).locator('[data-b$=":unitCost"]')).toHaveValue('6000');
  await page.locator('[data-act="step"][data-v="offer"]').click();
  await expect(page.locator('.offer')).not.toContainText('£6,000'); // our cost is not printed (the total may contain 26,000)
});

test('quote builder: freight cost and a reserve lower the margin, markup shows beside it; item codes print', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="sample"]').click();
  await page.locator('[data-act="step"][data-v="products"]').click();
  const first = page.locator('[data-pid]').first();
  await first.locator('[data-b$=":ref"]').fill('D01');
  await first.locator('[data-b$=":unitCost"]').fill('6000');
  await page.locator('[data-act="step"][data-v="terms"]').click();
  await page.locator('[data-b="q:deliveryCost"]').fill('500');
  await page.locator('[data-b="q:contingencyPct"]').fill('10');
  const box = page.locator('#q-margin');
  await expect(box).toContainText('£6,500.00'); // our cost: line + freight
  await expect(box).toContainText('Reserve 10%');
  await expect(box).toContainText('£650.00');
  await expect(box).toContainText('Markup on cost');
  await page.locator('[data-act="step"][data-v="offer"]').click();
  await expect(page.locator('.offer .of-no').first()).toHaveText('D01');
  await expect(page.locator('.offer')).not.toContainText('Reserve');
});

test('quote builder: our cost comes from a supplier quote on the project, the prices from cost + markup', async ({ page }) => {
  await page.goto('/admin.html#/board');
  await page.locator('[data-demo-login="staff"]').click();
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await page.locator('[data-tab="money"]').click();
  const costs = page.locator('[data-costs]');
  await costs.locator('#cost-sup').fill('Frames Ltd (demo)');
  await costs.locator('#cost-amt').fill('12000');
  await costs.locator('#cost-vat').selectOption('20'); // £10,000 net
  await costs.locator('[data-cost-add] button[type="submit"]').click();
  await expect(costs.locator('[data-cost]', { hasText: 'Frames Ltd (demo)' })).toContainText('£10,000.00 net');
  await page.locator('[data-new-quote]').first().click();
  await expect(page).toHaveURL(/#\/quotes\/[\w-]+$/);
  await page.locator('[data-act="step"][data-v="products"]').click();
  const box = page.locator('#q-costs');
  await expect(box.locator('[data-act="cost-pick"]', { hasText: 'Frames Ltd (demo)' })).toHaveAttribute('aria-pressed', 'true');
  await box.locator('[data-act="cost-spread"]').click();
  await expect(page.locator('.toast').last()).toContainText('Cost spread over');
  await page.locator('#q-costs [data-b="q:markupPct"]').fill('25');
  await page.locator('#q-costs [data-act="cost-price"]').click();
  await expect(page.locator('.toast').last()).toContainText('Prices set on');
  const margin = page.locator('#q-margin');
  await expect(margin).toContainText('Markup on cost');
  await expect(margin).toContainText(/Our cost£(9,999\.9\d|10,000\.0\d)/);
  await expect(margin).toContainText(/2[45]\.\d%|25%/);
  // Never on the printed quote.
  await page.locator('[data-act="step"][data-v="offer"]').click();
  await expect(page.locator('.offer')).not.toContainText('Frames Ltd');
});

test('quote builder: the PDF is made in the browser and sent, no print and upload', async ({ page }) => {
  test.setTimeout(90000);
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text())); page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Garden room, Dulwich' }).click();
  await page.locator('[data-tab="money"]').click();
  await page.locator('[data-new-quote]').click();
  await expect(page).toHaveURL(/#\/quotes\/[\w-]+$/);
  await page.locator('[data-act="step"][data-v="client"]').click();
  const ref = await page.locator('[data-b="q:reference"]').inputValue();
  await page.locator('[data-act="step"][data-v="offer"]').click();
  await page.locator('#q-send [data-act="send-open"]').click();
  await page.locator('#q-send [data-act="send-make"]').click();
  await expect(page.locator('#q-send')).toContainText(`Chosen: Brick-and-Pane-${ref}-rev00.pdf`, { timeout: 60000 });
  await expect(page.locator('#q-send [data-act="send-make-open"]')).toBeVisible();
  await expect(page.locator('#q-send-sure')).toHaveCount(0); // the name carries the reference
  await page.locator('#q-send [data-act="send-go"]').click();
  await expect(page.locator('#q-send')).toContainText('rev 00');
  await expect(page.locator('.offer')).toBeVisible();
  await expect(page.locator('.offer.is-pdf')).toHaveCount(0);
});

test('quote builder: Uw with the Part L limit, installation cost from the fitters, a by-others list on the quote', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="sample"]').click();
  await page.locator('[data-act="step"][data-v="products"]').click();
  const first = page.locator('[data-pid]').first();
  await first.locator('[data-b$=":uw"]').fill('1.6');
  await expect(first.locator('[data-uw-warn]')).toContainText('Above the Part L limit of 1.4');
  await first.locator('[data-b$=":uw"]').fill('1.3');
  await expect(first.locator('[data-uw-warn]')).toHaveText('');
  await page.locator('[data-act="step"][data-v="install"]').click();
  await page.locator('[data-act="mode"][data-v="included"]').click();
  await page.locator('[data-b="q:fitDays"]').fill('2');
  await page.locator('[data-b="q:fitCrew"]').fill('2');
  await page.locator('[data-b="q:fitRate"]').fill('250');
  await page.locator('[data-b="q:fitTravel"]').fill('80');
  await page.locator('[data-b="q:fitSurvey"]').fill('120');
  await expect(page.locator('#q-fit-sum')).toContainText('£1,200.00'); // 2 × 2 × 250 + 80 + 120
  await expect(page.locator('#q-margin')).toContainText('£1,200.00');
  await page.locator('[data-act-check="by-others"][data-v="decoration"]').check();
  await page.locator('[data-act-check="by-others"][data-v="scaffolding"]').check();
  await page.locator('[data-act="step"][data-v="offer"]').click();
  const offer = page.locator('.offer');
  await expect(offer).toContainText('By others');
  await expect(offer).toContainText('Decoration; Scaffolding');
  await expect(offer).toContainText('1.3 W/m²K');
  await expect(offer).not.toContainText('£1,200');
  await expect(offer).not.toContainText('Day rate');
});

test('quote builder: an extra is a line in the total, an option is priced beside it; our cost stays off the print', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="sample"]').click();
  await page.locator('[data-act="step"][data-v="offer"]').click();
  const before = await page.locator('.offer .of-totals').first().innerText();
  await page.locator('[data-act="step"][data-v="products"]').click();
  const box = page.locator('#q-extras');
  await box.locator('[data-act="add-x"][data-v="extra"]').click();
  const extra = box.locator('[data-xid]').first();
  await extra.locator('[data-b$=":label"]').fill('Scaffolding, two weeks');
  await extra.locator('[data-b$=":amount"]').fill('850');
  await extra.locator('[data-b$=":cost"]').fill('600');
  await box.locator('[data-act="add-x"][data-v="option"]').click();
  const option = box.locator('[data-xid]').nth(1);
  await expect(option.locator('[data-act="x-kind"][data-v="option"]')).toHaveAttribute('aria-pressed', 'true');
  await option.locator('[data-b$=":label"]').fill('Triple glazing on all items');
  await option.locator('[data-b$=":amount"]').fill('1200');
  await expect(page.locator('#q-sum')).toContainText('Extras');
  await expect(page.locator('#q-sum')).toContainText('£850.00');
  await page.locator('[data-act="step"][data-v="offer"]').click();
  const totalsBox = page.locator('.offer .of-totals').first();
  await expect(totalsBox).toContainText('Scaffolding, two weeks');
  await expect(totalsBox).not.toContainText('Triple glazing');
  expect(await totalsBox.innerText()).not.toEqual(before);
  const opts = page.locator('.offer [data-options]');
  await expect(opts).toContainText('Options, not in the total');
  await expect(opts).toContainText('Triple glazing on all items');
  await expect(opts).toContainText('+ £1,200.00');
  await expect(page.locator('.offer')).not.toContainText('£600');
});

test('quote builder: an item saved to the library goes into another quote; a schedule pasted from Excel becomes lines', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="sample"]').click();
  await page.locator('[data-act="step"][data-v="products"]').click();
  await page.locator('[data-pid]').first().locator('[data-act="lib-save"]').click();
  await expect(page.locator('.toast').last()).toContainText('Saved to the library');
  // A new, empty quote takes it from the library.
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="new"]').click();
  await page.locator('[data-act="step"][data-v="products"]').click();
  await expect(page.locator('#q-lib-pick option')).toHaveCount(1);
  await page.locator('#q-lib [data-act="lib-add"]').click();
  await expect(page.locator('[data-pid]')).toHaveCount(1);
  await expect(page.locator('[data-pid]').first().locator('[data-b$=":unitPrice"]')).not.toHaveValue('');
  // Cells copied from Excel, with a header row.
  await page.locator('#q-import').fill('Code\tDescription\tWidth\tHeight\tQty\nW01\tTimber sash window\t920\t1450\t2\nD01\tAluminium bi-fold door\t3600\t2100\t1\n');
  await page.locator('#q-lib [data-act="import"]').click();
  await expect(page.locator('.toast').last()).toContainText('2 lines added');
  const cards = page.locator('[data-pid]');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1).locator('[data-b$=":ref"]')).toHaveValue('W01');
  await expect(cards.nth(1).locator('[data-b$=":widthMm"]')).toHaveValue('920');
  await expect(cards.nth(2).locator('[data-b$=":ref"]')).toHaveValue('D01');
  await page.locator('[data-act="step"][data-v="offer"]').click();
  await expect(page.locator('.offer')).toContainText('Aluminium bi-fold door');
});

test('quote builder: one request for quotes to suppliers from the items, without the client’s name or address', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/quotes');
  await page.locator('[data-act="sample"]').click();
  await page.locator('[data-act="step"][data-v="products"]').click();
  await page.locator('[data-pid]').first().locator('[data-b$=":ref"]').fill('D01');
  await page.locator('[data-act="rfq"][data-v="pl"]').click();
  const text = page.locator('#q-rfq-text');
  await expect(text).toHaveValue(/prosimy o wycenę/);
  await expect(text).toHaveValue(/D01: Aluminium; Lift and slide; 4200 × 2400 mm; ilość 1/);
  await expect(text).toHaveValue(/Dostawa na kod pocztowy/);
  await expect(text).toHaveValue(/kod E8\./);
  await expect(text).not.toHaveValue(/Hannah|Lantern Mews|hannah@/);
  await page.locator('[data-act="rfq"][data-v="en"]').click();
  await expect(text).toHaveValue(/Please quote for the items below/);
  const download = page.waitForEvent('download');
  await page.locator('[data-act="rfq-csv"]').click();
  expect((await download).suggestedFilename()).toMatch(/-schedule\.csv$/);
});

test('Today: a sent quote about to lapse is on the chase list', async ({ page }) => {
  await page.locator('[data-demo-login="staff"]').click();
  await page.goto('/admin.html#/board');
  await page.locator('.kcard', { hasText: 'Garden room, Dulwich' }).click();
  await page.locator('[data-tab="money"]').click();
  await page.locator('[data-new-quote]').click();
  await expect(page).toHaveURL(/#\/quotes\/[\w-]+$/);
  await page.locator('[data-act="step"][data-v="client"]').click();
  const ref = await page.locator('[data-b="q:reference"]').inputValue();
  const soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  await page.locator('[data-b="q:validUntil"]').fill(soon);
  await page.locator('[data-act="step"][data-v="offer"]').click();
  await page.locator('#q-send [data-act="send-open"]').click();
  await page.locator('#q-send-file').setInputFiles({ name: `Brick-and-Pane-${ref}-rev00.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%demo\n') });
  await page.locator('#q-send [data-act="send-go"]').click();
  await expect(page.locator('.toast').last()).toContainText('Saved');
  await page.goto('/admin.html#/today');
  const sec = page.locator('#t-quotes');
  await expect(sec).toContainText(ref);
  await expect(sec).toContainText('valid 2 more days');
  await expect(sec.locator('.today-row').first()).toHaveClass(/is-late/);
});

// ---------- Projects audit 26.11.2026: linked, movable, and built for the team ----------
const staffOn = async (page, hash = '#/board') => { await page.goto(`/admin.html${hash}`); await page.locator('[data-demo-login="staff"]').click(); };
const pick = async (page, id, text, option) => { await page.locator(`#${id}`).fill(text); await page.locator(`#${id}-list [role="option"]`, { hasText: option || text }).first().click(); };
const fold = async (page, key) => { const d = page.locator(`[data-fold="${key}"]`); if (!(await d.evaluate((e) => e.open))) await d.locator(':scope > summary').click(); };
const asKate = async (context) => { const p = await context.newPage(); await p.goto('/login.html'); await p.evaluate(() => sessionStorage.setItem('bp-portal-demo-session', 'u-kate')); await p.goto('/admin.html#/my'); return p; };
const card = async (page, name) => { await page.goto('/admin.html#/board'); await page.locator('.kcard', { hasText: name }).click(); await expect(page.locator('.project-head h1')).toContainText(name); };

test('project card: the facts on top, the next stage one tap away, and one activity feed', async ({ page }) => {
  await staffOn(page);
  await page.locator('.kcard', { hasText: 'Hartley Road' }).click();
  await expect(page.locator('.key-numbers')).toContainText('Account manager');
  await expect(page.locator('.key-numbers')).toContainText('Waiting on');
  await expect(page.locator('[data-tab="activity"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-activity] .feed')).toContainText('Quotation Q1 is in Documents.');
  // The next stage: one tap fills the form and names the tasks it starts.
  await page.locator('[data-next-stage]').click();
  await expect(page.locator('#ctl-stage')).toHaveValue('accepted');
  await expect(page.locator('[data-stage-tasks]')).toContainText('Book the survey with the client');
  await page.locator('[data-stage] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Stage updated');
  await expect(page.locator('[data-fold="tasks"]')).toContainText('Book the survey with the client');
  await expect(page.locator('[data-fold="tasks"]')).toContainText('Send the deposit invoice');
  // Quick actions open the place where the thing is done.
  await page.locator('[data-quick="booking"]').click();
  await expect(page.locator('#bk-start')).toBeFocused();
  await page.locator('[data-quick="note"]').click();
  await expect(page.locator('#msg-body')).toBeFocused();
  await expect(page.locator('.composer-mode input[value="internal"]')).toBeChecked();
  // Filters: what the client sees, team only.
  await page.locator('[data-tab="activity"]').click();
  await page.locator('[data-feed="internal"]').click();
  await expect(page.locator('[data-activity] .feed')).toContainText('Book the survey with the client');
  await page.locator('[data-feed="client"]').click();
  await expect(page.locator('[data-activity] .feed')).not.toContainText('Book the survey with the client');
});

test('people and companies: found by typing, created on the spot, re-roled, the main contact marked, all in the feed', async ({ page, context }) => {
  await staffOn(page);
  await card(page, 'Hartley Road');
  await pick(page, 'pco-co', 'Northside Fit (TEST)', 'Create');
  await page.locator('#pco-role').selectOption('contractor');
  await page.locator('[data-pco-add] button[type="submit"]').click();
  await expect(page.locator('[data-pco-item]')).toContainText('Northside Fit (TEST)');
  await page.locator('[data-pco-item] [data-pco-role]').selectOption('supplier');
  await expect(page.locator('.toast').last()).toContainText('Role changed.');
  await pick(page, 'pp-person', 'Pat Site (TEST)', 'Create');
  await page.locator('#pp-role').selectOption('site');
  await page.locator('[data-pp-add] button[type="submit"]').click();
  await expect(page.locator('[data-pp-item]')).toContainText('main contact');
  await expect(page.locator('[data-pp-item] [data-pp-role]')).toHaveValue('site');
  await page.locator('[data-tab="activity"]').click();
  await expect(page.locator('[data-activity]')).toContainText('Northside Fit (TEST) linked as Contractor');
  await expect(page.locator('[data-activity]')).toContainText('role Contractor → Supplier');
  await expect(page.locator('[data-activity]')).toContainText('Pat Site (TEST) linked as On site');
  // The client sees none of it.
  const client = await context.newPage();
  await client.goto('/login.html'); await client.locator('[data-demo-login="client"]').click();
  await client.goto('/portal.html'); await client.locator('.pcard', { hasText: 'Hartley Road' }).click();
  await expect(client.locator('.now-card')).toBeVisible();
  for (const t of ['Northside Fit', 'Pat Site']) await expect(client.locator('body')).not.toContainText(t);
});

test('moving: a supplier quote, a task and an email go to the right project, and both feeds say so', async ({ page }) => {
  await staffOn(page);
  await card(page, 'Hartley Road');
  await page.locator('[data-tab="money"]').click();
  await page.locator('#cost-sup').fill('Wrong Place Ltd (TEST)');
  await page.locator('#cost-amt').fill('900');
  await page.locator('[data-cost-add] button[type="submit"]').click();
  const row = page.locator('[data-cost]', { hasText: 'Wrong Place Ltd (TEST)' });
  await row.locator('.cost-move > summary').click();
  await pick(page, await row.locator('[data-linker-input]').getAttribute('id'), 'Mews', 'Mews house');
  await row.locator('[data-cost-move] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Moved to the other project.');
  await expect(page.locator('[data-costs]')).not.toContainText('Wrong Place Ltd (TEST)');
  // A task too.
  await page.locator('[data-quick="task"]').click();
  await page.locator('#tk-p-title').fill('Measure the side door (TEST)');
  await page.locator('[data-task-add] button[type="submit"]').click();
  const task = page.locator('[data-fold="tasks"] [data-task]', { hasText: 'Measure the side door (TEST)' });
  await task.locator('.task-edit > summary').click();
  await pick(page, await task.locator('[data-linker-input]').getAttribute('id'), 'Mews', 'Mews house');
  await task.locator('[data-task-edit] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Task moved to the other project.');
  // An email on the wrong project.
  await page.locator('[data-tab="mail"]').click();
  const mail = page.locator('[data-mail-panel] details.mail:not(.is-out)', { hasText: 'threshold detail' }).first();
  await mail.locator(':scope > summary').click();
  await mail.locator('.mail-move > summary').click();
  await pick(page, await mail.locator('.mail-move [data-linker-input]').getAttribute('id'), 'Mews', 'Mews house');
  await mail.locator('.mail-move button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Moved to the other project.');
  await expect(page.locator('[data-mail-panel] details.mail:not(.is-out)', { hasText: 'threshold detail' })).toHaveCount(0);
  // On the other project, all three arrived, and its feed says where from.
  await card(page, 'Mews house');
  await page.locator('[data-tab="activity"]').click();
  await expect(page.locator('[data-activity]')).toContainText('A supplier quote moved here from another project');
  await expect(page.locator('[data-activity]')).toContainText('A task moved here');
  await expect(page.locator('[data-activity]')).toContainText('An email was filed on this project');
  await expect(page.locator('[data-fold="tasks"]')).toContainText('Measure the side door (TEST)');
});

test('an enquiry from a known client joins their project instead of making a new one', async ({ page }) => {
  await staffOn(page, '#/board');
  await expect(page.locator('.kcard').first()).toBeVisible();
  const before = await page.locator('.kcard').count();
  await page.goto('/admin.html#/enquiries');
  const enq = page.locator('details.enq', { hasText: 'Jo Bennett' });
  await enq.locator('summary').click();
  await pick(page, await enq.locator('[data-req-attach] [data-linker-input]').getAttribute('id'), 'Hartley', 'Hartley Road');
  await enq.locator('[data-req-attach] button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/p\//);
  await expect(page.locator('.project-head h1')).toContainText('Hartley Road');
  await expect(page.locator('[data-activity]')).toContainText('An enquiry joined this project');
  await expect(page.locator('[data-activity]')).toContainText('Kitchen extension, would like a 3-panel slider');
  await page.locator('[data-tab="overview"]').click();
  await expect(page.locator('#panel-overview')).toContainText('jo@example.com');
  await page.goto('/admin.html#/board');
  await expect(page.locator('.kcard')).toHaveCount(before);
  // Saved as a contact from an enquiry: the person (and their email) lands in Companies.
  await page.goto('/admin.html#/enquiries');
  await page.locator('#rq-filter').selectOption('all');
  const done = page.locator('details.enq', { hasText: 'Jo Bennett' });
  await done.locator('summary').click();
  await done.locator('[data-req-contact]').click();
  await expect(page.locator('.toast').last()).toContainText('Saved as a contact.');
  await expect(page.locator('details.enq', { hasText: 'Jo Bennett' }).locator('.enq-contact')).toContainText('Jo Bennett');
});

test('waiting on: who has the ball and when to chase, on the card, the board and Today', async ({ page }) => {
  await staffOn(page);
  await card(page, 'Hartley Road');
  await fold(page, 'waiting');
  await page.locator('#w-on').selectOption('supplier');
  await page.locator('#w-note').fill('Production date from the factory');
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.locator('#w-chase').fill(today);
  await page.locator('[data-waiting] button[type="submit"]').click();
  await expect(page.locator('.key-numbers')).toContainText('the supplier');
  await page.goto('/admin.html#/board');
  await expect(page.locator('.kcard', { hasText: 'Hartley Road' })).toContainText('waiting on the supplier');
  await page.goto('/admin.html#/today');
  await expect(page.locator('#t-chase')).toContainText('Production date from the factory');
  await page.goto('/admin.html#/list');
  await expect(page.locator('.crm-table tbody tr').first()).toBeVisible();
  await page.locator('[data-sort="waiting"]').click();
  await expect(page.locator('.crm-table tbody tr').first()).toContainText('Hartley Road');
});

test('the team: a project handed to a colleague tells them; My work shows their tasks; hand over for a holiday', async ({ page, context }) => {
  await staffOn(page);
  await card(page, 'Hartley Road');
  await page.locator('#head-owner').selectOption({ label: 'Kate Nowak' });
  await expect(page.locator('.toast').last()).toContainText('Account manager saved.');
  await page.locator('[data-next-stage]').click();
  await page.locator('[data-stage] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Stage updated');
  await expect(page.locator('[data-fold="tasks"] [data-task]', { hasText: 'Book the survey' })).toContainText('Kate Nowak');
  // My work for Kate (the owner opens anyone's) lists the playbook tasks; then all of it goes back to Tom.
  await page.goto('/admin.html#/my');
  await expect(page.locator('h1')).toHaveText('My work');
  await page.locator('#mw-who').selectOption({ label: 'Kate Nowak' });
  await expect(page.locator('h1')).toContainText('Kate Nowak');
  await expect(page.locator('#my-work')).toContainText('Book the survey with the client');
  await page.locator('#ho-to').selectOption({ label: 'Tom Reid' });
  await page.locator('[data-handover] input[name="sure"]').check();
  await page.locator('[data-handover] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Handed over.');
  await page.locator('#mw-who').selectOption({ index: 0 });
  await expect(page.locator('#my-work')).toContainText('Book the survey with the client');
  // Kate was told (her bell), and the client never was.
  const kate = await asKate(context);
  await expect(kate.locator('#mw-mentions')).toContainText('You now look after: Hartley Road rear extension');
});

test('@mention in an internal note reaches that colleague; the client never sees it', async ({ page, context }) => {
  await staffOn(page);
  await card(page, 'Hartley Road');
  await page.locator('[data-tab="messages"]').click();
  await page.fill('#msg-body', 'Can you call the architect, @Kate?');
  await page.locator('[data-message] button[type="submit"]').click();
  const kate = await asKate(context);
  await expect(kate.locator('#mw-mentions')).toContainText('You were mentioned');
});

test('calendar: a booking with its crew shows in the week; the same crew twice on a day is a clash; an .ics comes out', async ({ page }) => {
  await staffOn(page);
  await card(page, 'Hartley Road');
  await fold(page, 'dates');
  await page.locator('#bk-kind').selectOption('install');
  await pick(page, 'bk-crew', 'Crew One (TEST)', 'Create');
  await page.locator('[data-booking-add] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Added to the calendar.');
  await expect(page.locator('[data-booking]')).toContainText('Crew One (TEST)');
  const start = await page.locator('#bk-start').inputValue();
  await card(page, 'Mews house');
  await fold(page, 'dates');
  await page.locator('#bk-start').fill(start); await page.locator('#bk-end').fill(start);
  await pick(page, 'bk-crew', 'Crew One', 'Crew One (TEST)');
  await page.locator('[data-booking-add] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Added to the calendar.');
  await page.goto('/admin.html#/calendar');
  await expect(page.locator('h1')).toHaveText('Calendar');
  if (!(await page.locator(`.cal-d[data-day="${start}"]`).count())) await page.locator('[data-cal="1"]').click();
  const day = page.locator(`.cal-d[data-day="${start}"]`);
  await expect(day.locator('.cal-e')).toHaveCount(2);
  await expect(day.locator('.cal-e.is-clash')).toHaveCount(2);
  const dl = page.waitForEvent('download');
  await page.locator('[data-cal-ics]').click();
  expect((await dl).suggestedFilename()).toMatch(/\.ics$/);
  await page.locator('[data-cal-mode="month"]').click();
  await expect(page.locator('.cal-month')).toBeVisible();
});

test('duplicates: two records of one company are found and merged, people and links kept', async ({ page }) => {
  await staffOn(page, '#/companies');
  for (const name of ['Acme Glazing Ltd (TEST)', 'ACME glazing (TEST)']) {
    await page.goto('/admin.html#/companies');
    await page.locator('#co-name').fill(name);
    await page.locator('[data-co-new] button[type="submit"]').click();
    await expect(page.locator('h1')).toHaveText(name);
    await page.locator('#co-pname').fill(`Person at ${name}`);
    await page.locator('[data-person-add] button[type="submit"]').click();
    await expect(page.locator('[data-person]')).toContainText(`Person at ${name}`);
  }
  await page.goto('/admin.html#/companies');
  await page.locator('[data-dupes] > summary').click();
  await expect(page.locator('[data-dupes]')).toContainText('Acme Glazing Ltd (TEST)');
  await page.locator('[data-dupes] a', { hasText: 'Acme Glazing Ltd (TEST)' }).click();
  await pick(page, 'co-merge', 'ACME glazing', 'ACME glazing (TEST)');
  await page.locator('[data-co-merge] input[name="sure"]').check();
  await page.locator('[data-co-merge] button[type="submit"]').click();
  await expect(page.locator('.toast').last()).toContainText('Merged.');
  await expect(page.locator('[data-person]')).toHaveCount(2);
  await page.goto('/admin.html#/companies');
  await expect(page.locator('.co-table')).not.toContainText('ACME glazing (TEST)');
});

test('stage playbook: the team switches a task off and adds its own', async ({ page }) => {
  await staffOn(page, '#/playbook');
  await expect(page.locator('h1')).toHaveText('Stage playbook');
  const row = page.locator('[data-pb]', { hasText: 'Send the deposit invoice' });
  await row.locator('[data-pb-toggle]').click();
  await expect(page.locator('[data-pb]', { hasText: 'Send the deposit invoice' }).locator('[data-pb-toggle]')).toHaveText('Switch on');
  const form = page.locator('[data-pb-add][data-stage="accepted"]');
  await form.locator('input[name="title"]').fill('Order the samples (TEST)');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('[data-pb]', { hasText: 'Order the samples (TEST)' })).toBeVisible();
  await card(page, 'Hartley Road');
  await page.locator('#ctl-stage').selectOption('accepted');
  await expect(page.locator('[data-stage-tasks]')).toContainText('Order the samples (TEST)');
  await expect(page.locator('[data-stage-tasks]')).not.toContainText('Send the deposit invoice');
});
