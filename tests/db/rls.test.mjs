// Database rules for the project portal, run against real Postgres (PGlite) with a minimal Supabase stub.
// Run: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = ['0001_project_portal.sql', '0002_accounts_estimates.sql', '0003_team_changes_payments.sql', '0004_materials.sql', '0005_contact_requests.sql', '0007_my_enquiries.sql', '0008_enquiry_openings_convert.sql', '0011_portal_hardening.sql', '0012_saved_lists.sql', '0014_prospects.sql', '0018_hubspot_links.sql', '0019_hubspot_stage_sync.sql', '0021_hubspot_events.sql', '0023_drop_prospects.sql', '0024_convert_invite_email.sql', '0025_quotes.sql', '0026_quote_hubspot.sql', '0028_hubspot_account_backfill.sql', '0029_hubspot_crm_events.sql', '0030_hubspot_invite_on_email.sql', '0031_costs.sql', '0032_costs_hubspot.sql']
  .map((f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8'));
const A = '11111111-1111-1111-1111-111111111111'; // architect (owner)
const C = '22222222-2222-2222-2222-222222222222'; // homeowner client
const S = '33333333-3333-3333-3333-333333333333'; // staff
const O = '55555555-5555-5555-5555-555555555555'; // unrelated client

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz default now(), created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create publication supabase_realtime; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;`);
  await db.exec(`grant usage on schema public to anon, authenticated; grant usage on schema storage to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    grant all on all tables in schema storage to anon, authenticated; grant execute on function storage.foldername(text) to anon, authenticated;`);
  for (const m of MIGRATIONS) await db.exec(m);
  await db.query(`insert into auth.users values ($1,'arch@x.com','{"full_name":"Anna","account_type":"architect"}'),
    ($2,'client@x.com','{"full_name":"Jo","account_type":"homeowner"}'), ($3,'s@bp.com','{"full_name":"Tom"}'), ($4,'other@x.com','{"full_name":"Oz"}')`, [A, C, S, O]);
  await db.query(`update public.profiles set role = 'staff' where id = $1`, [S]);
  const as = async (id) => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id]); await db.exec('set role authenticated'); };
  const fails = async (sql, params) => { await assert.rejects(db.query(sql, params)); };
  return { db, as, fails };
}

test('project privacy, staff-only fields and role escalation', async () => {
  const { db, as, fails } = await setup();
  await as(A);
  const p = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id, stage`, [A])).rows[0];
  assert.equal(p.stage, 'submitted');
  await fails(`update public.profiles set role = 'staff' where id = $1`, [A]);
  await fails(`update public.projects set stage = 'accepted' where id = $1`, [p.id]);
  await fails(`update public.projects set delivery_at = now() where id = $1`, [p.id]);
  assert.equal((await db.query(`select * from public.project_internal`)).rows.length, 0);
  await fails(`insert into public.messages (project_id, author_id, body, internal) values ($1, $2, 'x', true)`, [p.id, A]);
  await as(O);
  assert.equal((await db.query(`select * from public.projects`)).rows.length, 0);
});

test('quotation decision rights and change register', async () => {
  const { db, as, fails } = await setup();
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  await as(S);
  const Q = (await db.query(`insert into public.documents (project_id, kind, title, approval, uploaded_by, amount) values ($1, 'quote', 'Q1', 'pending', $2, 23900) returning id`, [P, S])).rows[0].id;
  const D = (await db.query(`insert into public.documents (project_id, kind, title, approval, uploaded_by) values ($1, 'drawing', 'Rev A', 'pending', $2) returning id`, [P, S])).rows[0].id;
  await db.query(`insert into public.changes (project_id, title, impact, raised_by) values ($1, 'Black handles', 'No change', $2)`, [P, S]);
  await db.query(`insert into public.payments (project_id, label, amount) values ($1, 'Deposit', 7000)`, [P]);

  await as(A);
  await fails(`insert into public.approvals (document_id, project_id, decision, actor_id) values ($1, $2, 'approved', $3)`, [Q, P, A]); // architect without authority
  await db.query(`insert into public.approvals (document_id, project_id, decision, actor_id) values ($1, $2, 'approved', $3)`, [D, P, A]); // drawings: review is fine
  const ch = (await db.query(`select id from public.changes`)).rows[0].id;
  await db.query(`select public.decide_change($1, 'approved', 'ok')`, [ch]);
  assert.equal((await db.query(`select public.invite_member($1, 'client@x.com', 'client') r`, [P])).rows[0].r, 'added');
  await fails(`insert into public.approvals (document_id, project_id, decision, actor_id, on_behalf) values ($1, $2, 'approved', $3, true)`, [Q, P, A]); // client exists now

  await as(C);
  await db.query(`insert into public.approvals (document_id, project_id, decision, actor_id) values ($1, $2, 'approved', $3)`, [Q, P, C]);
  await db.query(`insert into public.changes (project_id, title, raised_by) values ($1, 'Add a panel', $2)`, [P, C]);
  const ch2 = (await db.query(`select id from public.changes where title = 'Add a panel'`)).rows[0].id;
  await fails(`select public.decide_change($1, 'approved', '')`, [ch2]);
  await db.query(`update public.payments set paid_at = now()`);
  assert.equal((await db.query(`select count(*)::int n from public.payments where paid_at is not null`)).rows[0].n, 0);

  await as(S);
  await db.query(`select public.decide_change($1, 'rejected', 'Too heavy')`, [ch2]);
  assert.equal((await db.query(`select approval from public.documents where id = $1`, [Q])).rows[0].approval, 'approved');
});

test('invitations attach on sign-up', async () => {
  const { db, as } = await setup();
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  assert.equal((await db.query(`select public.invite_member($1, 'eng@x.com', 'engineer') r`, [P])).rows[0].r, 'invited');
  await db.exec('reset role');
  await db.query(`insert into auth.users values ('66666666-6666-6666-6666-666666666666', 'eng@x.com', '{}')`);
  assert.equal((await db.query(`select role from public.project_members where user_id = '66666666-6666-6666-6666-666666666666'`)).rows[0].role, 'engineer');
});

test('quote requests: the public cannot read or write them, staff triage them', async () => {
  const { db, as, fails } = await setup();
  await db.exec('grant usage on schema public to anon; grant all on public.contact_requests to anon, service_role; grant usage on schema public to service_role;');
  // The Edge Function writes with the service role.
  await db.exec('set role service_role');
  const r = (await db.query(`insert into public.contact_requests (name, email, consent_at, systems) values ('Sam', 'sam@x.com', now(), '{bifold}') returning id, ref, status`)).rows[0];
  assert.match(r.ref, /^BP-\d{6}-[0-9A-F]{4}$/);
  assert.equal(r.status, 'new');
  await fails(`insert into public.contact_requests (name, email, consent_at) values ('Bad', 'not-an-email', now())`);
  await fails(`insert into public.contact_requests (name, email, consent_at, files_link) values ('Bad', 'a@b.co', now(), 'javascript:alert(1)')`);
  await db.exec('reset role');
  // Anyone on the internet (anon) and ordinary clients see nothing and cannot add rows directly.
  await db.exec('set role anon');
  assert.equal((await db.query('select * from public.contact_requests')).rows.length, 0);
  await fails(`insert into public.contact_requests (name, email, consent_at) values ('Spam', 'a@b.co', now())`);
  await as(A);
  assert.equal((await db.query('select * from public.contact_requests')).rows.length, 0);
  await db.query(`update public.contact_requests set status = 'closed'`);
  await as(S);
  const seen = (await db.query('select status from public.contact_requests')).rows;
  assert.deepEqual(seen, [{ status: 'new' }]);
  await db.query(`update public.contact_requests set status = 'replied', staff_note = 'Called back' where id = $1`, [r.id]);
  assert.equal((await db.query('select status from public.contact_requests where id = $1', [r.id])).rows[0].status, 'replied');
});

test('quote requests appear in the portal of the account with the same confirmed email', async () => {
  const { db, as } = await setup();
  await db.exec('grant all on public.contact_requests to service_role; grant usage on schema public to service_role; set role service_role');
  await db.query(`insert into public.contact_requests (name, email, consent_at, systems) values ('Jo', 'Client@X.com', now(), '{bifold}'), ('Spam', 'client@x.com', now(), '{}'), ('Anna', 'arch@x.com', now(), '{}')`);
  await db.query(`update public.contact_requests set status = 'spam' where name = 'Spam'`);
  await db.exec('reset role');
  await as(C);
  const mine = (await db.query('select ref, status, systems from public.my_enquiries()')).rows;
  assert.equal(mine.length, 1); // case-insensitive match, spam hidden
  assert.deepEqual(mine[0].systems, ['bifold']);
  assert.equal((await db.query('select * from public.contact_requests')).rows.length, 0); // the table itself stays closed
  await as(O);
  assert.equal((await db.query('select * from public.my_enquiries()')).rows.length, 0);
  // An unconfirmed address sees nothing, even if it matches.
  await db.exec('reset role');
  await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [A]);
  await as(A);
  assert.equal((await db.query('select * from public.my_enquiries()')).rows.length, 0);
});

test('staff turn an enquiry into a project with its openings; a new account takes it over', async () => {
  const { db, as, fails } = await setup();
  await db.exec('grant all on public.contact_requests to service_role; grant usage on schema public to service_role; set role service_role');
  const openings = JSON.stringify([{ ref: 'D01', system: 'sliding', material: 'alu', width_mm: 3600, height_mm: 2200, qty: 1 }, { ref: 'W01', system: 'windows', material: 'unsure', width_mm: 1200, height_mm: 1400, qty: 3 }]);
  const [noAcc, known] = (await db.query(`insert into public.contact_requests (name, email, consent_at, location, openings, staff_note) values
    ('Kim', 'Kim@New.com', now(), 'E17', $1, 'Called back'), ('Jo', 'client@x.com', now(), 'N1', '[]', null) returning id`, [openings])).rows.map((x) => x.id);
  await db.query(`update public.contact_requests set opening_width_mm = 4000, opening_height_mm = 2400, systems = '{bifold}' where id = $1`, [known]);
  await db.exec('reset role');
  await as(C);
  await fails('select public.convert_request($1)', [noAcc]);
  await as(S);
  const P = (await db.query('select public.convert_request($1) as id', [noAcc])).rows[0].id;
  assert.equal((await db.query('select public.convert_request($1) as id', [noAcc])).rows[0].id, P); // twice = same project
  const ops = (await db.query('select system, material, qty from public.openings where project_id = $1 order by ref', [P])).rows;
  assert.deepEqual(ops, [{ system: 'sliding', material: 'alu', qty: 1 }, { system: 'windows', material: '', qty: 3 }]);
  assert.deepEqual((await db.query('select status, project_id from public.contact_requests where id = $1', [noAcc])).rows[0], { status: 'converted', project_id: P });
  assert.equal((await db.query('select notes from public.project_internal where project_id = $1', [P])).rows[0].notes, 'Called back');
  assert.equal((await db.query('select * from public.project_members where project_id = $1', [P])).rows.length, 0); // staff not left on the team
  // An existing account with that email owns the project straight away.
  const P2 = (await db.query('select public.convert_request($1) as id', [known])).rows[0].id;
  assert.equal((await db.query('select owner_id from public.projects where id = $1', [P2])).rows[0].owner_id, C);
  assert.equal((await db.query('select width_mm from public.openings where project_id = $1', [P2])).rows[0].width_mm, 4000);
  // Signing up with the enquiry's email hands over the first project.
  await db.exec('reset role');
  const K = '66666666-6666-6666-6666-666666666666';
  await db.query(`insert into auth.users values ($1, 'kim@new.com', '{"full_name":"Kim","account_type":"homeowner"}')`, [K]);
  await as(K);
  const mine = (await db.query('select id, owner_id from public.projects')).rows;
  assert.deepEqual(mine, [{ id: P, owner_id: K }]);
  assert.equal((await db.query('select role from public.project_members where project_id = $1 and user_id = $2', [P, K])).rows[0].role, 'owner');
});

test('hardening: internal functions, account type, project fields, invitations, file paths', async () => {
  const { db, as, fails } = await setup();
  // Nobody outside the database calls the notification helpers (they send email).
  await db.exec('set role anon');
  await fails(`select public.notify_staff(null, 'x', 'Pay now', 'https://evil')`);
  assert.equal((await db.query('select * from public.profiles')).rows.length, 0); // the public key sees no names
  await as(A);
  await fails(`select public.notify_members(null, 'x', 'Pay now', 'https://evil')`);
  await fails(`select public.claim_invites($1, 'client@x.com')`, [A]);

  // Account type: free in the first minutes after sign-up, then staff only.
  await db.query(`update public.profiles set account_type = 'architect' where id = $1`, [A]);
  await db.exec('reset role');
  await db.query(`update auth.users set created_at = now() - interval '1 day'`);
  await as(A);
  await fails(`update public.profiles set account_type = 'homeowner' where id = $1`, [A]);
  await db.query(`update public.profiles set full_name = 'Anna C' where id = $1`, [A]);

  // A client's new project starts clean, whatever the request says.
  const p = (await db.query(`insert into public.projects (name, owner_id, assignee_id, ref, estimate_low, due_at) values ('X', $1, $2, 'BP-FAKE', 1, now()) returning *`, [A, O])).rows[0];
  assert.equal(p.assignee_id, null);
  assert.equal(p.estimate_low, null);
  assert.equal(p.due_at, null);
  assert.match(p.ref, /^BP-\d{4}-\d{4}$/);
  await fails(`update public.projects set ref = 'BP-MINE' where id = $1`, [p.id]);
  await as(O);
  assert.equal((await db.query('select * from public.notifications')).rows.length, 0); // no "new project" mail to a stranger

  // A document only points at a file in its own project's folder.
  await as(O);
  const q = (await db.query(`insert into public.projects (name, owner_id) values ('Y', $1) returning id`, [O])).rows[0].id;
  await fails(`insert into public.documents (project_id, kind, title, storage_path, uploaded_by) values ($1, 'client_upload', 'steal', $2, $3)`, [q, `${p.id}/abc-plan.pdf`, O]);
  await db.query(`insert into public.documents (project_id, kind, title, storage_path, uploaded_by) values ($1, 'client_upload', 'ok', $2, $3)`, [q, `${q}/abc-plan.pdf`, O]);
  await db.exec('reset role');
  await db.query(`insert into storage.objects (bucket_id, name) values ('project-files', $1), ('project-files', $2)`, [`${p.id}/abc-plan.pdf`, `${q}/abc-plan.pdf`]);
  await as(O);
  assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: `${q}/abc-plan.pdf` }]);
  await db.exec('reset role');
  assert.ok((await db.query(`select allowed_mime_types from storage.buckets where id = 'project-files'`)).rows[0].allowed_mime_types.includes('application/pdf'));

  // An invitation waits until the new account confirms its email.
  await as(A);
  assert.equal((await db.query(`select public.invite_member($1, 'late@x.com', 'client') r`, [p.id])).rows[0].r, 'invited');
  await db.exec('reset role');
  const L = '77777777-7777-7777-7777-777777777777';
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'late@x.com', null)`, [L]);
  assert.equal((await db.query('select * from public.project_members where user_id = $1', [L])).rows.length, 0);
  await db.query('update auth.users set email_confirmed_at = now() where id = $1', [L]);
  assert.equal((await db.query('select role from public.project_members where user_id = $1', [L])).rows[0].role, 'client');
});

test('deleting an account keeps the project and drops the person', async () => {
  const { db, as } = await setup();
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  await db.query(`insert into public.messages (project_id, author_id, body) values ($1, $2, 'Hello')`, [P, A]);
  await db.query(`insert into public.changes (project_id, title, raised_by) values ($1, 'Add a panel', $2)`, [P, A]);
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`); // the dashboard deletes with no signed-in user
  await db.query('delete from auth.users where id = $1', [A]);
  assert.equal((await db.query('select count(*)::int n from public.profiles where id = $1', [A])).rows[0].n, 0);
  assert.equal((await db.query('select owner_id from public.projects where id = $1', [P])).rows[0].owner_id, null);
  assert.equal((await db.query('select author_id from public.messages where project_id = $1', [P])).rows[0].author_id, null);
});

test('a saved list of openings belongs to its account only', async () => {
  const { db, as, fails } = await setup();
  const items = JSON.stringify([{ ref: 'D01', system: 'lift-slide', width_mm: 4000, height_mm: 2400, qty: 1 }]);
  await as(A);
  await db.query('insert into public.saved_lists (items) values ($1)', [items]);
  await db.query('update public.saved_lists set items = $1 where user_id = $2', [items, A]);
  await fails('insert into public.saved_lists (user_id, items) values ($1, $2)', [O, items]);
  await fails(`insert into public.saved_lists (items) values ('{"a":1}')`);
  await as(O);
  assert.equal((await db.query('select * from public.saved_lists')).rows.length, 0);
  assert.equal((await db.query('update public.saved_lists set items = $1 returning user_id', ['[]'])).rows.length, 0);
  await db.exec('reset role'); await db.exec('set role anon');
  await fails('select * from public.saved_lists');
  await db.exec('reset role');
  await db.query('delete from auth.users where id = $1', [A]);
  assert.equal((await db.query('select count(*)::int n from public.saved_lists')).rows[0].n, 0);
});

test('converting with an invitation marks it for email; a staff email gets no invite; stage emails use labels', async () => {
  const { db, as } = await setup();
  await db.exec('grant all on public.contact_requests to service_role; grant usage on schema public to service_role; set role service_role');
  const [kim, staffMail, known] = (await db.query(`insert into public.contact_requests (name, email, consent_at) values
    ('Kim', 'kim@new.com', now()), ('Bot (TEST)', 'S@bp.com', now()), ('Jo', 'client@x.com', now()) returning id`)).rows.map((x) => x.id);
  await db.exec('reset role');
  await as(S);
  const r1 = (await db.query('select public.convert_enquiry($1, true) as r', [kim])).rows[0].r;
  assert.equal(r1.client, 'invited'); assert.equal(r1.emailed, true); // pg_net is absent here: the failed call is swallowed
  await db.exec('reset role');
  assert.deepEqual((await db.query('select send_email, emailed_at from public.project_invites where project_id = $1', [r1.project_id])).rows, [{ send_email: true, emailed_at: null }]);
  await as(S);
  const r2 = (await db.query('select public.convert_enquiry($1, true) as r', [staffMail])).rows[0].r;
  assert.equal(r2.client, 'staff'); assert.equal(r2.emailed, false);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from public.project_invites where project_id = $1', [r2.project_id])).rows[0].n, 0);
  await as(S);
  const r3 = (await db.query('select public.convert_enquiry($1, false) as r', [known])).rows[0].r;
  assert.equal(r3.client, 'linked');
  // Old callers keep working, and an unticked box marks nothing.
  assert.equal((await db.query('select public.convert_request($1) as id', [kim])).rows[0].id, r1.project_id);
  // A client-visible stage change is announced with the portal's label.
  await db.query(`insert into public.stage_events (project_id, from_stage, to_stage, visible_to_client, actor_id) values ($1, 'submitted', 'quote_issued', true, $2)`, [r3.project_id, S]);
  await db.exec('reset role');
  const titles = (await db.query(`select title from public.notifications where project_id = $1 and type = 'stage'`, [r3.project_id])).rows.map((x) => x.title);
  assert.deepEqual(titles, ['Jo: Quote issued']);
});

test('the prospects table is gone, and dropping it never loses a row', async () => {
  const { db } = await setup();
  assert.equal((await db.query(`select to_regclass('public.prospects') t`)).rows[0].t, null);
  const sql = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
  await db.exec(sql('0014_prospects.sql'));
  await db.query('insert into public.prospects (company) values ($1)', ['Studio North']);
  await assert.rejects(db.exec(sql('0023_drop_prospects.sql')), /not empty/);
  await db.exec('delete from public.prospects');
  await db.exec(sql('0023_drop_prospects.sql'));
  assert.equal((await db.query(`select to_regclass('public.prospects') t`)).rows[0].t, null);
});

test('HubSpot ids are staff-only, and the link triggers never block a change', async () => {
  const { db, as, fails } = await setup(); // no pg_net here, so every trigger call fails and must be swallowed
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  await db.exec('reset role');
  await db.query(`update public.project_internal set hubspot_deal_id = '123' where project_id = $1`, [P]);
  await db.query(`insert into public.profile_internal (profile_id, hubspot_contact_id) values ($1, '456')`, [A]);
  await as(A);
  assert.equal((await db.query('select * from public.project_internal')).rows.length, 0);
  assert.equal((await db.query('select * from public.profile_internal')).rows.length, 0);
  await fails(`insert into public.profile_internal (profile_id, hubspot_contact_id) values ($1, '789')`, [C]);
  await fails('select public.hubspot_link($1)', [JSON.stringify({ project_id: P })]);
  await as(S);
  assert.equal((await db.query('select hubspot_deal_id from public.project_internal where project_id = $1', [P])).rows[0].hubspot_deal_id, '123');
  assert.equal((await db.query('select hubspot_contact_id from public.profile_internal')).rows[0].hubspot_contact_id, '456');
  await fails(`update public.profile_internal set hubspot_contact_id = 'x'`);
  await db.query(`update public.projects set stage = 'in_review' where id = $1`, [P]);
  assert.equal((await db.query('select stage from public.projects where id = $1', [P])).rows[0].stage, 'in_review');
  await db.exec('reset role');
  await db.query(`insert into auth.users values ('77777777-7777-7777-7777-777777777777', 'new@x.com', '{}')`);
  assert.equal((await db.query(`select count(*)::int as n from public.profiles where id = '77777777-7777-7777-7777-777777777777'`)).rows[0].n, 1);
});

test('a project linked to a HubSpot deal takes its stage only from the sync', async () => {
  const { db, as, fails } = await setup();
  await as(A);
  const [P, Q] = (await db.query(`insert into public.projects (name, owner_id) values ('Linked', $1), ('Manual', $1) returning id`, [A])).rows.map((r) => r.id);
  await db.exec('reset role');
  await db.query(`update public.project_internal set hubspot_deal_id = '123' where project_id = $1`, [P]);
  await as(S);
  await fails(`insert into public.stage_events (project_id, from_stage, to_stage, actor_id) values ($1, 'submitted', 'accepted', $2)`, [P, S]);
  await db.query(`insert into public.stage_events (project_id, from_stage, to_stage, actor_id) values ($1, 'submitted', 'in_review', $2)`, [Q, S]);
  assert.equal((await db.query('select stage from public.projects where id = $1', [Q])).rows[0].stage, 'in_review');
  await fails('select * from public.hubspot_sync_state');
  await fails(`insert into public.hubspot_sync_state values ('stage_sync', now())`);
  // The sync runs without a signed-in user (service role).
  await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.query(`insert into public.stage_events (project_id, from_stage, to_stage, note, actor_id) values ($1, 'submitted', 'quote_issued', '', null)`, [P]);
  assert.equal((await db.query('select stage from public.projects where id = $1', [P])).rows[0].stage, 'quote_issued');
  assert.equal((await db.query(`select count(*)::int as n from public.notifications where project_id = $1 and type = 'stage'`, [P])).rows[0].n, 1);
});

test('portal events for HubSpot are queued once, for the service role only', async () => {
  const { db, as, fails } = await setup();
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  await db.query(`insert into public.messages (project_id, author_id, body) values ($1, $2, 'Hello')`, [P, A]);
  await db.query(`insert into public.documents (project_id, kind, title, uploaded_by) values ($1, 'client_upload', 'Photos', $2)`, [P, A]);
  await fails('select * from public.hubspot_events');
  await fails(`select public.hubspot_queue('message', $1, $1)`, [P]);
  await as(S);
  await db.query(`insert into public.messages (project_id, author_id, body) values ($1, $2, 'From staff')`, [P, S]);
  await db.query(`insert into public.messages (project_id, author_id, body, internal) values ($1, $2, 'Internal', true)`, [P, S]);
  const Q = (await db.query(`insert into public.documents (project_id, kind, title, approval, uploaded_by, amount) values ($1, 'quote', 'Q1', 'pending', $2, 23900) returning id`, [P, S])).rows[0].id;
  await db.exec('reset role'); // decision rights are tested above; here only the queue matters
  await db.query(`insert into public.approvals (document_id, project_id, decision, actor_id) values ($1, $2, 'approved', $3)`, [Q, P, A]);
  await db.exec('reset role');
  const kinds = (await db.query('select kind from public.hubspot_events where project_id = $1 order by created_at, kind', [P])).rows.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ['client_upload', 'document', 'message', 'quote_accepted']);
});

// Migration 0029: the rest of the CRM reaches the deal the same way messages do. The openings event is the odd
// one out — one per project, reopened on every edit, so the note can be rewritten instead of repeated.
test('payments, changes, openings and team queue HubSpot events', async () => {
  const { db, as } = await setup();
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  await as(S);
  const pay = (await db.query(`insert into public.payments (project_id, label, amount) values ($1, 'Deposit', 5400.60) returning id`, [P])).rows[0].id;
  const chg = (await db.query(`insert into public.changes (project_id, title, raised_by) values ($1, 'Wider opening', $2) returning id`, [P, S])).rows[0].id;
  await db.query(`insert into public.openings (project_id, ref, system, qty) values ($1, 'W1', 'lift-slide', 2), ($1, 'W2', 'casement', 3)`, [P]);
  // Invites have no INSERT policy: they are written by a security-definer function, so the test writes as it does.
  await db.exec('reset role');
  await db.query(`insert into public.project_invites (project_id, email, role) values ($1, 'eng@x.com', 'engineer')`, [P]);
  await as(S);
  // The queue is service-role only (0021), so every read of it steps out of the staff session and back in.
  const kinds = async () => {
    await db.exec('reset role');
    const r = (await db.query('select kind from public.hubspot_events where project_id = $1', [P])).rows.map((x) => x.kind).sort();
    await as(S);
    return r;
  };
  assert.deepEqual(await kinds(), ['change_raised', 'openings', 'payment_due', 'team_invite']);
  // Two openings rows, one event: the note is rewritten, not repeated.
  await db.exec('reset role');
  assert.equal((await db.query(`select count(*)::int n from public.hubspot_events where project_id = $1 and kind = 'openings'`, [P])).rows[0].n, 1);
  await as(S);
  // Paying and deciding are separate events from recording and raising.
  await db.query('update public.payments set paid_at = now() where id = $1', [pay]);
  await as(A); // the architect decides a change the team raised, through decide_change (no direct updates allowed)
  await db.query(`select public.decide_change($1, 'approved', '')`, [chg]);
  await as(S);
  assert.deepEqual(await kinds(), ['change_decided', 'change_raised', 'openings', 'payment_due', 'payment_paid', 'team_invite']);
  // An edit after the note was written reopens that one event rather than adding another.
  await db.exec('reset role');
  await db.query(`update public.hubspot_events set sent_at = now(), note_id = '42' where kind = 'openings'`);
  await as(S);
  await db.query(`update public.openings set qty = 4 where project_id = $1 and ref = 'W1'`, [P]);
  await db.exec('reset role');
  const op = (await db.query(`select sent_at, note_id from public.hubspot_events where kind = 'openings'`)).rows;
  assert.equal(op.length, 1);
  assert.equal(op[0].sent_at, null, 'the openings event is reopened');
  assert.equal(op[0].note_id, '42', 'and keeps the note it already wrote');
  // A converted enquiry's reservation for the client (make_owner) is no invitation until its email goes out.
  const inv = (await db.query(`insert into public.project_invites (project_id, email, role, make_owner) values ($1, 'client@x.com', 'client', true) returning id`, [P])).rows[0].id;
  const invites = async () => (await db.query(`select count(*)::int n from public.hubspot_events where kind = 'team_invite' and source_id = $1`, [inv])).rows[0].n;
  assert.equal(await invites(), 0, 'no note for an invitation nobody sent');
  await db.query('update public.project_invites set emailed_at = now() where id = $1', [inv]);
  assert.equal(await invites(), 1, 'announced once the invitation email is sent');
  await db.query('update public.project_invites set emailed_at = null where id = $1', [inv]); // invite-email gives the claim back on failure
  await db.query('update public.project_invites set emailed_at = now() where id = $1', [inv]);
  assert.equal(await invites(), 1, 'a retried email does not announce it twice');
});

test('quotes and the firm details on them are for staff only', async () => {
  const { db, as, fails } = await setup();
  const q = { id: '66666666-6666-6666-6666-666666666666', reference: 'BP-2026-001', customerName: 'Jo' };
  await as(S);
  await db.query(`insert into public.quotes (id, reference, data) values ($1, $2, $3)`, [q.id, q.reference, JSON.stringify(q)]);
  await db.query(`insert into public.quote_settings (data) values ('{"accountName":"Brick and Pane"}')`);
  assert.equal((await db.query('select created_by from public.quotes')).rows[0].created_by, S);
  await fails(`insert into public.quote_settings (id, data) values (false, '{}')`);
  await fails(`insert into public.quotes (id, data) values (gen_random_uuid(), '[]')`);
  for (const who of [A, C]) {
    await as(who);
    assert.equal((await db.query('select * from public.quotes')).rows.length, 0);
    assert.equal((await db.query('select * from public.quote_settings')).rows.length, 0);
    await fails(`insert into public.quotes (id, data) values (gen_random_uuid(), '{}')`);
    await db.query(`update public.quotes set data = '{}'`); // RLS: touches nothing
    await db.query(`delete from public.quotes`);
  }
  await as(S);
  assert.equal((await db.query('select data->>\'customerName\' as n from public.quotes')).rows[0].n, 'Jo');
  await db.exec('reset role'); await db.exec('set role anon');
  await fails('select * from public.quotes');
});

// The portal writes quote_sends from the browser as `authenticated`, and migration 0026 grants INSERT on named
// columns only. A column the client sends but the grant omits makes Postgres refuse the whole table
// ("permission denied for table quote_sends"), which is what happened live on 10.11.2026 with an explicit id.
// So take the column list from the client itself rather than repeating it here.
test('quote sends: staff may insert exactly the columns the portal client sends', async () => {
  const { db, as } = await setup();
  const src = readFileSync(new URL('../../js/portal/store-supabase.js', import.meta.url), 'utf8');
  const at = src.indexOf(".from('quote_sends').insert({");
  assert.notEqual(at, -1, 'no insert into quote_sends in store-supabase.js');
  const open = src.indexOf('{', at);
  let depth = 0, end = open;
  while (end < src.length) { const c = src[end]; if (c === '{') depth++; else if (c === '}' && --depth === 0) break; end++; }
  const body = src.slice(open + 1, end);
  const cols = [];
  for (let i = 0, d = 0, key = ''; i <= body.length; i++) {
    const c = body[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    if (d === 0 && (c === ',' || i === body.length)) { const k = key.split(':')[0].trim(); if (k) cols.push(k); key = ''; }
    else key += c ?? '';
  }
  assert.ok(cols.length >= 10, `parsed too few columns: ${cols}`);
  const Q = '99999999-9999-9999-9999-999999999999';
  await as(S);
  await db.query(`insert into public.quotes (id, reference, data) values ($1, 'BP-2026-114', '{}')`, [Q]);
  const value = { quote_id: `'${Q}'::uuid`, hubspot_deal_id: "'538396856520'", reference: "'BP-2026-114'", revision: "'00'",
    kind: "'new'", total: '100', vat_rate: '0', pdf_path: `'${Q}/x.pdf'`, pdf_name: "'q.pdf'", snapshot: `'{}'::jsonb`, sent_on: 'current_date' };
  for (const c of cols) assert.ok(value[c] !== undefined, `client sends column "${c}", which migration 0026 does not grant to staff`);
  await db.query(`insert into public.quote_sends (${cols.join(', ')}) values (${cols.map((c) => value[c]).join(', ')})`);
  assert.equal((await db.query('select status from public.quotes where id = $1', [Q])).rows[0].status, 'sent');
});

test('quote sends: staff record them, the quote turns sent, the deal is pinned, sent quotes stay', async () => {
  const { db, as, fails } = await setup();
  const Q = '77777777-7777-7777-7777-777777777777', Q2 = '88888888-8888-8888-8888-888888888888';
  const send = (quote, rev, kind) => db.query(`insert into public.quote_sends (quote_id, hubspot_deal_id, reference, revision, kind, total, vat_rate, pdf_path, pdf_name, snapshot)
    values ($1::uuid, '501', 'BP-2026-001', $2, $3, 1200, 20, $4, 'x.pdf', '{"reference":"BP-2026-001"}') returning id, sent_by`, [quote, rev, kind, `${quote}/x.pdf`]);
  await as(S);
  await db.query(`insert into public.quotes (id, reference, data) values ($1, 'BP-2026-001', '{}'), ($2, 'BP-2026-002', '{}')`, [Q, Q2]);
  assert.equal((await db.query('select status from public.quotes where id = $1', [Q])).rows[0].status, 'draft');
  const first = (await send(Q, '00', 'new')).rows[0];
  assert.equal(first.sent_by, S);
  let row = (await db.query('select status, status_source, hubspot_deal_id from public.quotes where id = $1', [Q])).rows[0];
  assert.deepEqual(row, { status: 'sent', status_source: 'crm', hubspot_deal_id: '501' });
  // A revision, and a second independent quote on the same deal.
  await send(Q, '01', 'revision');
  await send(Q2, '00', 'new');
  assert.equal((await db.query(`select count(*)::int as n from public.quote_sends where hubspot_deal_id = '501'`)).rows[0].n, 3);
  // Accepted stays accepted when the quote is sent again.
  await db.query(`update public.quotes set status = 'accepted', status_source = 'crm' where id = $1`, [Q]);
  await send(Q, '01', 'resend');
  assert.equal((await db.query('select status from public.quotes where id = $1', [Q])).rows[0].status, 'accepted');
  // Staff cannot write HubSpot results, change or delete a send, or delete a sent quote.
  await fails(`insert into public.quote_sends (quote_id, hubspot_deal_id, reference, kind, total, pdf_path, snapshot, hubspot_note_id) values ($1, '501', 'x', 'new', 1, 'p', '{}', '1')`, [Q]);
  await fails(`update public.quote_sends set hubspot_note_id = '1'`);
  await fails(`delete from public.quote_sends`);
  await fails(`delete from public.quotes where id = $1`, [Q]);
  await fails(`insert into public.quote_sends (quote_id, hubspot_deal_id, reference, kind, total, pdf_path, snapshot) values ($1, 'abc', 'x', 'new', 1, 'p', '{}')`, [Q]);
  await fails(`select public.claim_quote_send($1)`, [first.id]);
  await fails(`update public.quotes set status = 'lost' where id = $1`, [Q]);
  for (const who of [A, C]) {
    await as(who);
    assert.equal((await db.query('select * from public.quote_sends')).rows.length, 0);
    await fails(`insert into public.quote_sends (quote_id, hubspot_deal_id, reference, kind, total, pdf_path, snapshot) values ($1, '501', 'x', 'new', 1, 'p', '{}')`, [Q]);
  }
  // The function's claim: one caller gets the row; a failed attempt can be retried at once; a sent one never again.
  await db.exec('reset role'); await db.exec('grant usage on schema public, storage to service_role; grant all on public.quote_sends to service_role; grant select on storage.buckets to service_role; set role service_role');
  assert.equal((await db.query('select * from public.claim_quote_send($1)', [first.id])).rows.length, 1);
  assert.equal((await db.query('select * from public.claim_quote_send($1)', [first.id])).rows.length, 0);
  await db.query(`update public.quote_sends set hubspot_error = '500 down' where id = $1`, [first.id]);
  const retry = (await db.query('select * from public.claim_quote_send($1)', [first.id])).rows[0];
  assert.equal(retry.hubspot_attempts, 2);
  assert.equal(retry.hubspot_error, null);
  await db.query(`update public.quote_sends set hubspot_note_id = '9', hubspot_error = 'pdf not attached' where id = $1`, [first.id]);
  assert.equal((await db.query('select * from public.claim_quote_send($1)', [first.id])).rows.length, 0);
  assert.equal((await db.query(`select * from storage.buckets where id = 'quote-pdfs'`)).rows[0].public, false);
});

// Costs (migration 0031): supplier quotes and the margin are the team's alone, and the sale behind the margin follows
// accepted quote > latest sent quote > the value typed in Commercial.
test('costs: supplier quotes and the margin are for staff only', async () => {
  const { db, as, fails } = await setup();
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  await db.query(`select public.invite_member($1, 'client@x.com', 'client')`, [P]);
  await as(S);
  const add = (supplier, amount, currency, fx, status = 'received') => db.query(
    `insert into public.supplier_quotes (project_id, supplier, category, amount, currency, fx_to_gbp, status) values ($1, $2, 'production', $3, $4, $5, $6) returning id`,
    [P, supplier, amount, currency, fx, status]);
  const w = (await add('Okna Polska', 40000, 'PLN', 0.195, 'accepted')).rows[0].id; // £7,800
  await add('Fitters Ltd', 1500, 'GBP', 1, 'accepted');
  await add('Other works', 3000, 'EUR', 0.85); // received: not counted
  await fails(`insert into public.supplier_quotes (project_id, supplier, amount, currency, fx_to_gbp) values ($1, 'x', 1, 'GBP', 1.2)`, [P]); // GBP rate is 1
  await fails(`insert into public.supplier_quotes (project_id, supplier, amount, currency) values ($1, 'x', 1, 'USD')`, [P]);
  await fails(`insert into public.supplier_quotes (project_id, supplier, amount, hubspot_deal_id) values ($1, 'x', 1, '501')`, [P]); // sync's column
  await fails(`update public.supplier_quotes set hubspot_deal_id = '501' where id = $1`, [w]);
  const margin = async () => (await db.query('select public.project_margin($1) m', [P])).rows[0].m;
  // No deal, no value: costs only, no margin.
  let m = await margin();
  assert.equal(Number(m.cost_gbp), 9300); assert.equal(m.accepted, 2); assert.equal(m.sale_gbp, null); assert.equal(m.margin_gbp, null);
  // The value typed in Commercial.
  await db.query('update public.project_internal set value_gbp = 12000 where project_id = $1', [P]);
  m = await margin();
  assert.equal(m.sale_source, 'value'); assert.equal(Number(m.margin_gbp), 2700); assert.equal(Number(m.margin_pct), 22.5);
  // A quote sent on the project's deal wins over the typed value, net of VAT.
  await db.query(`update public.project_internal set hubspot_deal_id = '501' where project_id = $1`, [P]);
  const Q = '12121212-1212-1212-1212-121212121212';
  await db.query(`insert into public.quotes (id, reference, data) values ($1, 'BP-2026-009', '{}')`, [Q]);
  await db.query(`insert into public.quote_sends (quote_id, hubspot_deal_id, reference, revision, kind, total, vat_rate, pdf_path, pdf_name, snapshot)
    values ($1, '501', 'BP-2026-009', '00', 'new', 18000, 20, 'p', 'x.pdf', '{}')`, [Q]); // £15,000 net
  m = await margin();
  assert.equal(m.sale_source, 'sent'); assert.equal(Number(m.sale_gbp), 15000); assert.equal(Number(m.margin_gbp), 5700);
  await db.query(`update public.quotes set status = 'accepted', status_source = 'crm' where id = $1`, [Q]);
  m = await margin();
  assert.equal(m.sale_source, 'accepted'); assert.equal(m.sale_refs, 'BP-2026-009');
  // Nobody else on the project sees a cost or the margin; anon not even the table.
  for (const who of [A, C, O]) {
    await as(who);
    assert.equal((await db.query('select * from public.supplier_quotes')).rows.length, 0);
    await fails(`insert into public.supplier_quotes (project_id, supplier, amount) values ($1, 'x', 1)`, [P]);
    await fails('select public.project_margin($1)', [P]);
  }
  await db.exec('reset role'); await db.exec('set role anon');
  await fails('select * from public.supplier_quotes');
});

// 0032: the HubSpot sync writing its own columns must not look like the team changing the quote, or every run would
// push it again; a change the team makes does.
test('costs: only edits by the team mark a supplier quote changed for HubSpot', async () => {
  const { db, as } = await setup();
  await as(A);
  const P = (await db.query(`insert into public.projects (name, owner_id) values ('Hartley', $1) returning id`, [A])).rows[0].id;
  await as(S);
  const id = (await db.query(`insert into public.supplier_quotes (project_id, supplier, amount) values ($1, 'Fitters Ltd', 900) returning id`, [P])).rows[0].id;
  const at = async () => (await db.query('select updated_at from public.supplier_quotes where id = $1', [id])).rows[0].updated_at.getTime();
  const t0 = await at();
  await db.exec('reset role');
  await db.query(`update public.supplier_quotes set hubspot_deal_id = '777', hubspot_status = 'received', hubspot_stage = '6408989925', hubspot_synced_at = now() + interval '1 second' where id = $1`, [id]);
  assert.equal(await at(), t0, 'sync columns leave updated_at alone');
  await as(S);
  await db.query(`update public.supplier_quotes set status = 'accepted' where id = $1`, [id]);
  assert.ok(await at() > t0, 'a status the team sets marks it changed');
});
