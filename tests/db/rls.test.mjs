// Database rules for the project portal, run against real Postgres (PGlite) with a minimal Supabase stub.
// Run: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = ['0001_project_portal.sql', '0002_accounts_estimates.sql', '0003_team_changes_payments.sql', '0004_materials.sql', '0005_contact_requests.sql', '0007_my_enquiries.sql', '0008_enquiry_openings_convert.sql']
  .map((f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8'));
const A = '11111111-1111-1111-1111-111111111111'; // architect (owner)
const C = '22222222-2222-2222-2222-222222222222'; // homeowner client
const S = '33333333-3333-3333-3333-333333333333'; // staff
const O = '55555555-5555-5555-5555-555555555555'; // unrelated client

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create publication supabase_realtime; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;`);
  for (const m of MIGRATIONS) await db.exec(m);
  await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
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
