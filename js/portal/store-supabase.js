// Live store backed by Supabase (auth, Postgres with RLS, storage, realtime).
// Business rules (timeline, notifications, permissions) are enforced in the database —
// see supabase/migrations/0001_project_portal.sql. This file only reads and writes.
// supabase-js 2.45.4 comes from js/vendor (a script tag build.mjs adds to the portal pages), not from a CDN.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { useClient, syncList, leaveAccountList } from '../account-list.js';

const sb = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
useClient(sb);
const BUCKET = 'project-files';
// Network failures get one plain, translated message instead of the browser's "Failed to fetch".
const OFFLINE = /failed to fetch|networkerror|load failed|network request failed/i;
const ok = ({ data, error }) => {
  if (error) throw new Error(OFFLINE.test(error.message) ? 'We can’t reach the portal right now. Check your connection and try again.' : error.message);
  return data;
};
const listeners = new Set();
const emit = () => listeners.forEach((cb) => cb());
let channel = null;

const subscribe = () => {
  if (channel) return;
  channel = sb.channel('portal');
  // The CRM tables too (migrations 0049/0050), so a second person sees links, tasks, bookings and notes change.
  ['projects', 'stage_events', 'documents', 'messages', 'notifications', 'changes', 'payments', 'project_members', 'tasks', 'project_companies', 'project_people', 'project_internal', 'supplier_quotes', 'project_bookings', 'contact_requests', 'mail_messages', 'openings'].forEach((table) =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, emit));
  channel.subscribe();
};
// UX audit 27.11.2026: the signed-in user comes from the local session (no request per redraw); the first read of
// a page load still asks the server once, so a revoked session is noticed. Data access is checked by RLS either way.
let checked = false, meCache = null;
const authUser = async () => {
  if (!checked) { checked = true; return sb.auth.getUser(); }
  const { data: { session } } = await sb.auth.getSession();
  return { data: { user: session?.user ?? null } };
};
sb.auth.onAuthStateChange(() => { meCache = null; emit(); });

const PROFILE = 'id, full_name, company, role, account_type';
// The API returns at most 1000 rows per request (audit 26.11.2026: 1080 companies and 1147 people were cut off):
// long lists are read in pages until a short page comes back.
const every = async (make, size = 1000) => {
  const out = [];
  for (let from = 0; ; from += size) { const rows = ok(await make().range(from, from + size - 1)) || []; out.push(...rows); if (rows.length < size || from > 50000) return out; }
};
const PENDING_TYPE = 'bp-oauth-account-type';
// Supabase sends people back (OAuth, magic link, email confirmation) with the session in the URL fragment, so the
// address it returns to must not have one: admin.html#/enquiries + #access_token=… is never read and the sign-in is lost.
// The page's own fragment (its route) waits in localStorage and is put back once the session is in.
const RETURN = 'bp-auth-return';
const authUrl = (next) => {
  const u = new URL(next, location.href);
  try { if (u.hash.length > 1) localStorage.setItem(RETURN, JSON.stringify({ path: u.pathname, hash: u.hash, at: Date.now() })); else localStorage.removeItem(RETURN); } catch { /* ignore */ }
  u.hash = '';
  return u.href;
};
const restoreRoute = () => {
  try {
    const r = JSON.parse(localStorage.getItem(RETURN) || 'null');
    if (!r) return;
    if (Date.now() - r.at > 60 * 60e3) { localStorage.removeItem(RETURN); return; }
    if (r.path !== location.pathname) return;
    localStorage.removeItem(RETURN);
    if (!location.hash && /^#\/[\w/-]*$/.test(r.hash)) history.replaceState(history.state, '', r.hash);
  } catch { /* ignore */ }
};
const safeName = (n) => n.replace(/[^\w.\- ]+/g, '_').slice(-120);

async function upload(pid, file) {
  const path = `${pid}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
  // The bucket accepts drawings, photos, office files and archives only (migration 0011).
  if (error) throw new Error(/mime|type/i.test(error.message) ? 'This file type isn’t accepted. Send PDF, images, DWG/DXF, Office files or ZIP.' : error.message);
  return path;
}

export const store = {
  mode: 'live',
  onChange(cb) { listeners.add(cb); subscribe(); return () => listeners.delete(cb); },

  async getUser() {
    const { data: { user } } = await authUser();
    if (!user) return null;
    restoreRoute();
    if (meCache && meCache.id === user.id && Date.now() - meCache.at < 300e3) return { ...meCache.p };
    const p = ok(await sb.from('profiles').select('*').eq('id', user.id).single());
    // First sign-in through Google/Apple/Microsoft: apply the account type picked on the sign-up panel.
    let pending = null;
    try { pending = localStorage.getItem(PENDING_TYPE); localStorage.removeItem(PENDING_TYPE); } catch { /* ignore */ }
    if (['architect', 'developer', 'homeowner'].includes(pending) && pending !== p.account_type && Date.now() - new Date(user.created_at).getTime() < 15 * 60e3) {
      ok(await sb.from('profiles').update({ account_type: pending }).eq('id', user.id));
      p.account_type = pending;
    }
    meCache = { id: user.id, at: Date.now(), p: { ...p, email: user.email } };
    return { ...p, email: user.email };
  },
  // captchaToken: Turnstile token, required once captcha is switched on in Supabase (Auth → Attack Protection).
  async signIn(email, password, captchaToken) { ok(await sb.auth.signInWithPassword({ email, password, options: { captchaToken } })); },
  async signUp({ email, password, full_name, company, account_type = 'architect', next = 'portal.html', captchaToken }) {
    const data = ok(await sb.auth.signUp({ email, password, options: { captchaToken, data: { full_name, company, account_type }, emailRedirectTo: authUrl(next) } }));
    return { needsConfirmation: !data.session };
  },
  // Providers switched on in Supabase (Authentication → Sign In / Providers), read from the public auth settings.
  async authProviders() {
    try {
      const s = await (await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })).json();
      return ['google', 'azure'].filter((p) => s.external?.[p]);
    } catch { return []; }
  },
  async signInWithProvider(provider, redirectTo, accountType) {
    try { if (accountType) localStorage.setItem(PENDING_TYPE, accountType); else localStorage.removeItem(PENDING_TYPE); } catch { /* ignore */ }
    ok(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: authUrl(redirectTo), ...(provider === 'azure' ? { scopes: 'email' } : {}) } }));
  },
  async sendMagicLink(email, next = 'portal.html', captchaToken) { ok(await sb.auth.signInWithOtp({ email, options: { captchaToken, emailRedirectTo: authUrl(next) } })); },
  async signOut() { await leaveAccountList(); await sb.auth.signOut(); },
  // The list of openings kept on the account (migration 0012) meets the one in this browser.
  syncList: () => syncList().catch(() => 0),
  async setPassword(password) { ok(await sb.auth.updateUser({ password })); },

  async updateProfile(patch) {
    const { data: { user } } = await authUser();
    const { full_name, company, phone, notify_email, notify_digest } = patch;
    ok(await sb.from('profiles').update({ full_name, company, phone, notify_email, notify_digest }).eq('id', user.id)); meCache = null;
  },

  // Quote requests sent through the public form with this account's confirmed email (migration 0007).
  // A missing function (migration not applied yet) must not break the dashboard.
  async myEnquiries() {
    const { data, error } = await sb.rpc('my_enquiries');
    if (error?.code === 'PGRST202') return []; // function not deployed
    return ok({ data: data || [], error }); // any other failure shows as an error, not as "no enquiries"
  },
  // Quote builder (admin.html#/quotes, migration 0025, staff-only RLS). The quote is one JSON document; the builder
  // saves it a moment after typing stops. No emit(): nothing else on the page depends on quotes.
  async listQuotes() {
    // In pages (audit 28.11.2026: past 500 the oldest quotations vanished, and their numbers could be handed out again).
    return (await every(() => sb.from('quotes').select('data').order('updated_at', { ascending: false }).order('id'), 200)).map((r) => r.data);
  },
  async saveQuote(q) {
    // project_id only when the quote names one: never clear a link made on the server (0038 backfill).
    // "No project" chosen in the builder (projectId '') unpins it (projects audit 26.11.2026: it could not be unpinned).
    ok(await sb.from('quotes').upsert({ id: q.id, reference: q.reference, data: q, updated_at: new Date(q.updatedAt || Date.now()).toISOString(), ...(q.projectId ? { project_id: q.projectId } : q.projectId === '' ? { project_id: null } : {}) }));
  },
  async deleteQuote(id) { ok(await sb.from('quotes').delete().eq('id', id)); },
  async getQuoteSettings() { return ok(await sb.from('quote_settings').select('data').maybeSingle())?.data || {}; },
  async saveQuoteSettings(data) { ok(await sb.from('quote_settings').upsert({ id: true, data, updated_at: new Date().toISOString() })); },
  // Quotes ↔ HubSpot (migration 0026, function hubspot-quotes). Server fields sit beside the builder's JSON; without
  // the migration the Quotes tab works as before (hubspot: false).
  async quoteHub() {
    const [m, s] = await Promise.all([
      sb.from('quotes').select('id, project_id, hubspot_deal_id, hubspot_deal_name, hubspot_dealstage, status, status_source, status_at').limit(500),
      sb.from('quote_sends').select('id, quote_id, project_id, hubspot_deal_id, reference, revision, kind, total, vat_rate, pdf_path, pdf_name, snapshot, sent_on, created_at, hubspot_note_id, hubspot_error, hubspot_stage_moved, hubspot_attempts').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (m.error || s.error) return { hubspot: false, meta: [], sends: [] };
    // HubSpot is off (owner, 25.11.2026): quotes hang on a project and are sent from the CRM only.
    return { hubspot: false, meta: m.data || [], sends: s.data || [] };
  },
  async linkQuoteDeal(id, deal) {
    ok(await sb.from('quotes').update({ hubspot_deal_id: deal?.id ?? null, hubspot_deal_name: deal?.name ?? null, hubspot_dealstage: deal?.stage ?? null }).eq('id', id));
  },
  async setQuoteStatus(id, status) {
    ok(await sb.from('quotes').update({ status, status_source: 'crm', status_at: new Date().toISOString() }).eq('id', id));
  },
  async hubspot(action, body = {}) {
    const { data, error } = await sb.functions.invoke('hubspot-quotes', { body: { action, ...body } });
    if (error) throw new Error(error.message || 'HubSpot is not reachable.');
    if (data?.error) throw Object.assign(new Error(data.error), { code: data.error });
    return data;
  },
  // Stores the PDF, records the send (the trigger marks the quote sent) and asks HubSpot right away; if that call
  // fails, the cron retries within 15 minutes.
  async sendQuote({ quoteId, dealId = null, projectId = null, reference, revision, kind, total, vatRate, file, sentOn, snapshot }) {
    // The row's id is the database's to give: staff may insert only the columns granted in migration 0026,
    // so the PDF gets a name of its own instead of borrowing the id.
    const path = `${quoteId}/${crypto.randomUUID()}.pdf`;
    const name = file.name.slice(0, 200);
    ok(await sb.storage.from('quote-pdfs').upload(path, file, { contentType: 'application/pdf' }));
    const row = ok(await sb.from('quote_sends').insert({ quote_id: quoteId, hubspot_deal_id: dealId, project_id: projectId, reference, revision, kind, total, vat_rate: vatRate, pdf_path: path, pdf_name: name, snapshot, sent_on: sentOn }).select().single());
    // Without a deal (0038) there is nothing to tell HubSpot.
    if (!dealId) return { ...row, result: 'no deal' };
    let hub;
    try { hub = await this.hubspot('send', { send_id: row.id }); } catch (e) { hub = { result: 'error', hubspot_error: e.message }; }
    return { ...row, ...hub };
  },
  async retryQuoteSend(id) { return this.hubspot('send', { send_id: id }); },
  // Costs: supplier and subcontractor quotes on a project and the margin (migration 0031, staff only).
  async listCosts(pid) { return ok(await sb.from('supplier_quotes').select('*').eq('project_id', pid).order('created_at', { ascending: false })); },
  async projectMargin(pid) { return ok(await sb.rpc('project_margin', { pid })); },
  // Comparison fields since 0039: VAT inside the amount, discount, delivery on top, lead time, variant; "requested" = asked, no price.
  async addCost(pid, { supplier, reference = '', category, amount, quoted_on = null, valid_until = null, note = '', file = null, vat_in_pct = 0, delivery_gbp = 0, discount_pct = 0, lead_days = null, variant = '', status = 'received', requested_on = null, company_id = null }) {
    const pdf = file ? await this.costPdf(pid, file) : { pdf_path: null, pdf_name: '' };
    ok(await sb.from('supplier_quotes').insert({ project_id: pid, supplier, reference, category, amount: Number(amount), currency: 'GBP', fx_to_gbp: 1, status, quoted_on, valid_until, ...pdf, note, vat_in_pct, delivery_gbp, discount_pct, lead_days, variant, requested_on, company_id }));
    emit();
  },
  // The price for a supplier we asked: the same row, now with its numbers.
  async updateCost(id, pid, { supplier, reference = '', category, amount, valid_until = null, note = '', file = null, vat_in_pct = 0, delivery_gbp = 0, discount_pct = 0, lead_days = null, variant = '', status = 'received', company_id = null }) {
    const pdf = file ? await this.costPdf(pid, file) : {};
    ok(await sb.from('supplier_quotes').update({ supplier, reference, category, amount: Number(amount), status, valid_until, ...pdf, note, vat_in_pct, delivery_gbp, discount_pct, lead_days, variant, ...(company_id ? { company_id } : {}) }).eq('id', id));
    emit();
  },
  async costPdf(pid, file) {
    const pdf_path = `${pid}/${crypto.randomUUID()}.pdf`;
    ok(await sb.storage.from('supplier-quotes').upload(pdf_path, file, { contentType: 'application/pdf' }));
    return { pdf_path, pdf_name: file.name.slice(0, 200) };
  },
  async setCostStatus(id, status) { ok(await sb.from('supplier_quotes').update({ status }).eq('id', id)); emit(); },
  // Orders to suppliers (0056): the number comes from the database; the confirmation and promised date are logged.
  async placeOrder(id) { const po = ok(await sb.rpc('place_order', { sq: id })); emit(); return po; },
  async updateCostOrder(id, { confirmed_on = null, eta = null }) { ok(await sb.from('supplier_quotes').update({ confirmed_on, eta }).eq('id', id)); emit(); },
  async nextQuoteReference() { return ok(await sb.rpc('next_quote_reference')); },
  async deleteCost(id) { ok(await sb.from('supplier_quotes').delete().eq('id', id)); emit(); },
  async costPdfUrl(path) { return ok(await sb.storage.from('supplier-quotes').createSignedUrl(path, 300))?.signedUrl; },
  // Tasks and the conversation log (migration 0042, CRM audit phase 3; staff only).
  async listTasks({ projectId = null, requestId = null, open = false } = {}) {
    // Every open task, in pages; of the done ones the latest 300 (audit 28.11.2026: open tasks past 300 were cut).
    const base = (done) => {
      let q = sb.from('tasks').select('*');
      if (projectId) q = q.eq('project_id', projectId);
      if (requestId) q = q.eq('request_id', requestId);
      return done ? q.not('done_at', 'is', null).order('done_at', { ascending: false }).limit(300) : q.is('done_at', null).order('due_on', { ascending: true, nullsFirst: false }).order('id');
    };
    const openRows = await every(() => base(false));
    return open ? openRows : [...openRows, ...(ok(await base(true)) || [])];
  },
  async addTask({ title, kind = 'task', note = '', due_on = null, assignee_id = null, project_id = null, request_id = null, done = false }) {
    const me = (await authUser()).data.user?.id ?? null;
    ok(await sb.from('tasks').insert({ title, kind, note, due_on, assignee_id, project_id, request_id, done_at: done ? new Date().toISOString() : null, done_by: done ? me : null }));
    emit();
  },
  async setTaskDone(id, done) {
    const me = (await authUser()).data.user?.id ?? null;
    ok(await sb.from('tasks').update({ done_at: done ? new Date().toISOString() : null, done_by: done ? me : null }).eq('id', id)); emit();
  },
  // The owner's dashboard: every figure from one function (migration 0043, staff only).
  async ownerDashboard(days = 90) { return ok(await sb.rpc('owner_dashboard', { days })); },
  async search(q) { return ok(await sb.rpc('crm_search', { q, lim: 30 })) || []; },
  // The pipeline report (top-CRM audit 28.11.2026): every stage change and every instalment, in pages; staff only.
  async stageHistory() { return every(() => sb.from('stage_events').select('project_id, to_stage, created_at').order('created_at').order('id')); },
  async allPayments() { return every(() => sb.from('payments').select('project_id, amount, due_date, paid_at').order('id')); },
  // Companies and people (migration 0044, CRM audit phase 5; staff only).
  async listCompanies() { return every(() => sb.from('companies').select('*').order('name').order('id')); },
  async listPeople() { return every(() => sb.from('people').select('*').order('full_name').order('id')); },
  async getCompany(id) {
    const [c, people, links, quotes] = await Promise.all([
      sb.from('companies').select('*').eq('id', id).maybeSingle(), sb.from('people').select('*').eq('company_id', id).order('full_name'),
      sb.from('project_companies').select('role, project:projects(id, ref, name, stage)').eq('company_id', id),
      sb.from('supplier_quotes').select('id, project_id, supplier, reference, amount, net_gbp, status, created_at').eq('company_id', id).order('created_at', { ascending: false }),
    ]);
    return { company: ok(c), people: ok(people) || [], projects: (ok(links) || []).filter((l) => l.project).map((l) => ({ ...l.project, role: l.role })), quotes: ok(quotes) || [] };
  },
  async saveCompany({ id = null, ...c }) {
    const row = id ? ok(await sb.from('companies').update(c).eq('id', id).select().single()) : ok(await sb.from('companies').insert(c).select().single());
    emit(); return row;
  },
  async deleteCompany(id) { ok(await sb.from('companies').delete().eq('id', id)); emit(); },
  async savePerson({ id = null, ...p }) { const row = id ? ok(await sb.from('people').update(p).eq('id', id).select().single()) : ok(await sb.from('people').insert(p).select().single()); emit(); return row; },
  async deletePerson(id) { ok(await sb.from('people').delete().eq('id', id)); emit(); },
  async projectCompanies(pid) { return (ok(await sb.from('project_companies').select('role, company:companies(*)').eq('project_id', pid)) || []).filter((x) => x.company); },
  async linkCompany(pid, companyId, role) { ok(await sb.from('project_companies').insert({ project_id: pid, company_id: companyId, role })); emit(); },
  async unlinkCompany(pid, companyId, role) { ok(await sb.from('project_companies').delete().eq('project_id', pid).eq('company_id', companyId).eq('role', role)); emit(); },
  async deleteTask(id) { ok(await sb.from('tasks').delete().eq('id', id)); emit(); },
  // Projects audit 26.11.2026 (migrations 0049/0050): moving things between projects, people on a project, the log,
  // an enquiry joining a project, merging duplicates, bookings and the stage playbook.
  async updateTask(id, patch) { const allowed = {}; ['title', 'note', 'due_on', 'assignee_id', 'project_id', 'request_id'].forEach((k) => { if (k in patch) allowed[k] = patch[k]; }); ok(await sb.from('tasks').update(allowed).eq('id', id)); emit(); },
  async moveCost(id, pid) { ok(await sb.from('supplier_quotes').update({ project_id: pid }).eq('id', id)); emit(); },
  // On site (0058): one checklist item at a time; handover records (staff only).
  async tickChecklist(id, item, done) { const out = ok(await sb.rpc('tick_checklist', { task: id, item, done })); emit(); return out; },
  async listHandovers(pid) { return ok(await sb.from('handover_records').select('*').eq('project_id', pid).order('created_at', { ascending: false })) || []; },
  async saveHandover(pid, rec) {
    const row = ok(await sb.from('handover_records').insert({ project_id: pid, checks: rec.checks, snags: rec.snags, notes: rec.notes || '', signed_name: rec.signed_name || '', signature: rec.signature || null, signed_on: rec.signed_on || null }).select().single());
    emit(); return row;
  },
  async setCompanyRole(pid, companyId, from, to) { ok(await sb.from('project_companies').update({ role: to }).eq('project_id', pid).eq('company_id', companyId).eq('role', from)); emit(); },
  async projectPeople(pid) { return (ok(await sb.from('project_people').select('role, is_main, person:people(*)').eq('project_id', pid)) || []).filter((x) => x.person); },
  async linkPerson(pid, personId, role = 'contact', isMain = false) {
    if (isMain) ok(await sb.from('project_people').update({ is_main: false }).eq('project_id', pid));
    ok(await sb.from('project_people').insert({ project_id: pid, person_id: personId, role, is_main: isMain })); emit();
  },
  async updatePersonLink(pid, personId, { role, is_main }) {
    if (is_main) ok(await sb.from('project_people').update({ is_main: false }).eq('project_id', pid).neq('person_id', personId));
    const patch = {}; if (role) patch.role = role; if (is_main !== undefined) patch.is_main = !!is_main;
    ok(await sb.from('project_people').update(patch).eq('project_id', pid).eq('person_id', personId)); emit();
  },
  async unlinkPerson(pid, personId) { ok(await sb.from('project_people').delete().eq('project_id', pid).eq('person_id', personId)); emit(); },
  async personProjects(personId) { return (ok(await sb.from('project_people').select('role, is_main, project:projects(id, ref, name, stage)').eq('person_id', personId)) || []).filter((x) => x.project); },
  async crmLog({ projectId = null, entity = null, entityId = null } = {}) {
    let q = sb.from('crm_log').select(`*, actor:profiles(${PROFILE})`).order('created_at', { ascending: false }).limit(300);
    if (projectId) q = q.eq('project_id', projectId); if (entity) q = q.eq('entity', entity); if (entityId) q = q.eq('entity_id', entityId);
    return ok(await q) || [];
  },
  async attachEnquiry(rid, pid) { const r = ok(await sb.rpc('attach_enquiry', { r: rid, pid })); emit(); return r; },
  async linkEnquiryContact(rid, companyId, personId) { ok(await sb.rpc('link_enquiry_contact', { r: rid, co: companyId, pe: personId })); emit(); },
  async mergeCompanies(keep, drop) { ok(await sb.rpc('merge_companies', { keep, drop_id: drop })); emit(); },
  async mergePeople(keep, drop) { ok(await sb.rpc('merge_people', { keep, drop_id: drop })); emit(); },
  async listBookings({ from = null, to = null, projectId = null } = {}) {
    let q = sb.from('project_bookings').select('*').order('starts_on');
    if (projectId) q = q.eq('project_id', projectId); if (from) q = q.gte('ends_on', from); if (to) q = q.lte('starts_on', to);
    return ok(await q) || [];
  },
  async saveBooking({ id = null, ...b }) {
    const row = { kind: b.kind, starts_on: b.starts_on, ends_on: b.ends_on || b.starts_on, crew_company_id: b.crew_company_id || null, staff_id: b.staff_id || null, note: b.note || '' };
    if (id) ok(await sb.from('project_bookings').update(row).eq('id', id)); else ok(await sb.from('project_bookings').insert({ ...row, project_id: b.project_id }));
    emit();
  },
  async deleteBooking(id) { ok(await sb.from('project_bookings').delete().eq('id', id)); emit(); },
  async listPlaybook() { return ok(await sb.from('stage_playbook').select('*').order('to_stage').order('sort')) || []; },
  // Automation rules (migration 0051). Before the migration is applied the view says so instead of failing.
  async listRules() { const { data, error } = await sb.from('automation_rules').select('*').order('id'); if (error) { if (error.code === '42P01' || error.code === 'PGRST205') return null; ok({ error }); } return data || []; },
  async saveRule(id, patch) { const p = {}; if ('active' in patch) p.active = !!patch.active; if ('days' in patch) p.days = Number(patch.days); p.updated_at = new Date().toISOString(); ok(await sb.from('automation_rules').update(p).eq('id', id)); },
  async ruleRuns() { return ok(await sb.from('automation_runs').select('rule_id, object_id, cycle, task_id, created_at').gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(500)) || []; },
  async runRules() { const n = ok(await sb.rpc('run_rules')); emit(); return n; },
  async savePlaybook({ id = null, ...b }) { if (id) ok(await sb.from('stage_playbook').update(b).eq('id', id)); else ok(await sb.from('stage_playbook').insert(b)); emit(); },
  async deletePlaybook(id) { ok(await sb.from('stage_playbook').delete().eq('id', id)); emit(); },
  // Mail: a read-only copy of the Zimbra mailboxes (migration 0035, staff only).
  // Mail marked as dealt with (0053) comes from the table itself, so mail_list keeps its shape.
  async listMail({ pid = null, unassigned = false } = {}) {
    const [rows, done] = await Promise.all([sb.rpc('mail_list', { pid, unassigned, lim: 200 }).then(ok), sb.from('mail_messages').select('id, handled_at').not('handled_at', 'is', null).limit(2000).then(({ data }) => data || [])]);
    const at = new Map(done.map((m) => [m.id, m.handled_at]));
    return (rows || []).map((m) => ({ ...m, handled_at: at.get(m.id) || null }));
  },
  // Sheets (migration 0054): saved views and the openings schedule.
  async listViews(table) { const { data, error } = await sb.from('crm_views').select('*').eq('table_key', table).order('name'); if (error) return []; return data || []; },
  async saveView({ id = null, table_key, name, shared = true, state }) { const row = { table_key, name, shared, state, updated_at: new Date().toISOString() }; const res = id ? ok(await sb.from('crm_views').update(row).eq('id', id).select().single()) : ok(await sb.from('crm_views').insert(row).select().single()); return res; },
  async deleteView(id) { ok(await sb.from('crm_views').delete().eq('id', id)); },
  async updateOpening(id, patch) { const allowed = {}; ['ref', 'system', 'material', 'width_mm', 'height_mm', 'config', 'glazing', 'qty', 'notes', 'sort'].forEach((k) => { if (k in patch) allowed[k] = patch[k]; }); ok(await sb.from('openings').update(allowed).eq('id', id)); emit(); },
  async addOpenings(pid, list) {
    const { data: last } = await sb.from('openings').select('sort').eq('project_id', pid).order('sort', { ascending: false }).limit(1);
    let n = last?.[0]?.sort || 0;
    ok(await sb.from('openings').insert(list.map((o) => ({ project_id: pid, ref: o.ref || '', system: o.system || 'lift-slide', material: o.material || '', width_mm: o.width_mm, height_mm: o.height_mm, config: o.config || '', glazing: o.glazing || '', qty: o.qty || 1, notes: o.notes || '', sort: (n += 1) }))));
    emit();
  },
  async deleteOpening(id) { ok(await sb.from('openings').delete().eq('id', id)); emit(); },
  async markMailHandled(id, on = true) { const { data: { user } } = await authUser(); ok(await sb.from('mail_messages').update({ handled_at: on ? new Date().toISOString() : null, handled_by: on ? user.id : null }).eq('id', id)); emit(); },
  // Notifications put off until later (0053).
  async snoozeNote(id, until) { ok(await sb.from('notifications').update({ snooze_until: until }).eq('id', id)); emit(); },
  // The team's own project fields (0053).
  async listFields() { const { data, error } = await sb.from('project_fields').select('*').order('sort').order('created_at'); if (error) return []; return data || []; },
  async saveField(f) { ok(await sb.from('project_fields').upsert({ key: f.key, label: f.label, kind: f.kind || 'text', options: f.options || [], sort: f.sort || 0 })); emit(); },
  async deleteField(key) { ok(await sb.from('project_fields').delete().eq('key', key)); emit(); },
  // A reply from the CRM (migration 0045): the mail-send function checks the person is staff and that they ticked it.
  async sendMail(payload) {
    const { data, error } = await sb.functions.invoke('mail-send', { body: payload });
    if (error) { let msg = error.message; try { msg = (await error.context?.json())?.error || msg; } catch { /* plain */ } throw new Error(msg); }
    if (data?.error) throw new Error(data.error);
    emit(); return data;
  },
  async mailAccounts() { return ok(await sb.from('mail_accounts').select('address, mode, last_run_at, last_error').order('created_at')); },
  async assignMail(id, project_id) { ok(await sb.from('mail_messages').update({ project_id }).eq('id', id)); emit(); },
  async dismissMail(id) { ok(await sb.from('mail_messages').update({ dismissed: true }).eq('id', id)); emit(); },
  async listMailContacts() { return ok(await sb.from('mail_contacts').select('*').order('match')); },
  async addMailContact({ match, kind, label, project_id }) { ok(await sb.from('mail_contacts').insert({ match, kind, label, project_id })); emit(); },
  async deleteMailContact(id) { ok(await sb.from('mail_contacts').delete().eq('id', id)); emit(); },
  async listMailKeywords(pid) { return ok(await sb.from('mail_keywords').select('id, keyword').eq('project_id', pid).order('keyword')); },
  async addMailKeyword(pid, keyword) { ok(await sb.from('mail_keywords').insert({ project_id: pid, keyword })); emit(); },
  async deleteMailKeyword(id) { ok(await sb.from('mail_keywords').delete().eq('id', id)); emit(); },
  async mailFileUrl(path) { return ok(await sb.storage.from('mail-files').createSignedUrl(path, 300))?.signedUrl; },
  async quotePdfUrl(path) { return ok(await sb.storage.from('quote-pdfs').createSignedUrl(path, 300))?.signedUrl; },
  // Staff inbox: requests from the public form, sent with or without an account (migration 0005, staff-only RLS).
  async listRequests() {
    return every(() => sb.from('contact_requests').select('*').order('created_at', { ascending: false }).order('id'));
  },
  async updateRequest(id, { status, staff_note }) {
    ok(await sb.from('contact_requests').update({ status, staff_note }).eq('id', id));
    emit();
  },
  // Staff only: creates the project with the enquiry's openings and, if asked, emails the client an invitation
  // (convert_enquiry, migration 0024). Returns { project_id, client: linked|invited|staff|none, emailed }.
  async convertRequest(id, { invite = false } = {}) {
    const res = ok(await sb.rpc('convert_enquiry', { r: id, send_invite: invite }));
    emit();
    return res;
  },
  async requestFileUrl(path) {
    const data = ok(await sb.storage.from('enquiries').createSignedUrl(path, 300));
    return data.signedUrl;
  },
  async listProjects() {
    const me = await this.getUser();
    // In pages, as companies and people are (audit 28.11.2026: past 1000 projects the list was cut without a word).
    const rows = await every(() => sb.from('projects')
      .select(`*, owner:profiles!projects_owner_id_fkey(${PROFILE}), assignee:profiles!projects_assignee_id_fkey(${PROFILE})`)
      .order('updated_at', { ascending: false }).order('id'));
    if (me?.role === 'staff') {
      const internal = await every(() => sb.from('project_internal').select('*').order('project_id'));
      const map = Object.fromEntries(internal.map((i) => [i.project_id, i]));
      rows.forEach((r) => { r.internal = map[r.id]; });
    }
    return rows;
  },

  async getProject(id) {
    const me = await this.getUser();
    const [project, openings, events, documents, approvals, messages] = await Promise.all([
      sb.from('projects').select(`*, owner:profiles!projects_owner_id_fkey(${PROFILE}), assignee:profiles!projects_assignee_id_fkey(${PROFILE})`).eq('id', id).single().then(ok),
      sb.from('openings').select('*').eq('project_id', id).order('sort').order('ref').then(ok),
      sb.from('stage_events').select(`*, actor:profiles(${PROFILE})`).eq('project_id', id).order('created_at').then(ok),
      sb.from('documents').select(`*, uploader:profiles(${PROFILE})`).eq('project_id', id).order('created_at', { ascending: false }).then(ok),
      sb.from('approvals').select(`*, actor:profiles(${PROFILE})`).eq('project_id', id).then(ok),
      sb.from('messages').select(`*, author:profiles(${PROFILE})`).eq('project_id', id).order('created_at').then(ok),
    ]);
    const [members, changes, payments, invites] = await Promise.all([
      sb.from('project_members').select(`*, user:profiles(${PROFILE})`).eq('project_id', id).then(ok),
      sb.from('changes').select(`*, raiser:profiles!changes_raised_by_fkey(${PROFILE}), decider:profiles!changes_decided_by_fkey(${PROFILE})`).eq('project_id', id).order('created_at', { ascending: false }).then(ok),
      sb.from('payments').select('*').eq('project_id', id).order('due_date').then(ok),
      sb.from('project_invites').select('*').eq('project_id', id).then(ok),
    ]);
    const internal = me?.role === 'staff' ? ok(await sb.from('project_internal').select('*').eq('project_id', id).maybeSingle()) : undefined;
    return { project, openings, events, documents, approvals, messages, internal, members, changes, payments, invites };
  },

  async createProject(data, openings, files) {
    // Project and openings in one transaction (create_project, migration 0011): a rejected opening leaves nothing behind.
    const id = ok(await sb.rpc('create_project', { p: data, ops: openings }));
    if (files.length) {
      try { await this.uploadFiles(id, files); } catch (err) { err.projectId = id; throw err; }
    }
    emit();
    return id;
  },

  async addMessage(pid, body, internal = false) {
    const { data: { user } } = await authUser();
    ok(await sb.from('messages').insert({ project_id: pid, author_id: user.id, body, internal }));
    emit(); // shows the message even when realtime is blocked
  },

  async uploadFiles(pid, files, meta = {}) {
    const me = await this.getUser();
    const staff = me.role === 'staff';
    for (const f of files) {
      const storage_path = await upload(pid, f);
      ok(await sb.from('documents').insert({
        project_id: pid, storage_path, size_bytes: f.size, uploaded_by: me.id,
        kind: staff ? (meta.kind || 'other') : 'client_upload',
        title: (staff && meta.title) || f.name,
        version: staff ? (meta.version || '') : '',
        visible_to_client: staff ? meta.visible !== false : true,
        approval: staff && meta.approval ? 'pending' : 'none',
        amount: staff && meta.amount ? Number(meta.amount) : null,
        ...(staff && meta.quote_id ? { quote_id: meta.quote_id } : {}),
      }));
    }
    emit();
  },

  async decide(docId, decision, comment = '', { onBehalf = false } = {}) {
    const { data: { user } } = await authUser();
    const d = ok(await sb.from('documents').select('project_id').eq('id', docId).single());
    const { error } = await sb.from('approvals').insert({ document_id: docId, project_id: d.project_id, decision, comment, on_behalf: onBehalf, actor_id: user.id });
    if (error) throw new Error(error.code === '42501' ? 'You can’t decide on this document. If it’s a quotation, your client needs to accept it, or confirm you have their authority.' : error.message);
  },

  async inviteMember(pid, email, role) { return ok(await sb.rpc('invite_member', { p: pid, e: email.trim(), r: role })); },
  async raiseChange(pid, { title, description, impact = '' }) {
    const { data: { user } } = await authUser();
    ok(await sb.from('changes').insert({ project_id: pid, title, description, impact, raised_by: user.id }));
  },
  async decideChange(changeId, decision, comment = '') { ok(await sb.rpc('decide_change', { c: changeId, decision, note: comment })); },
  async addPayment(pid, { label, amount, due_date }) { ok(await sb.from('payments').insert({ project_id: pid, label, amount: Number(amount), due_date })); },
  // Money in (0055): the date a person enters, by whom; undoing it needs a reason. Both are in the project's history.
  async markPaid(paymentId, { paid_on, note = '' } = {}) { ok(await sb.rpc('mark_paid', { pay: paymentId, paid_on, note })); emit(); },
  async voidPayment(paymentId, reason) { ok(await sb.rpc('void_payment', { pay: paymentId, reason })); emit(); },

  // One transaction from the stage the row really has (set_stage, migration 0049): two people at once cannot
  // write a wrong "from" stage into the history.
  async setStage(pid, to, { note = '', visible = true, next_step, due_at } = {}) {
    // A stage change that says nothing about the date keeps it (audit 28.11.2026: sending a quotation cleared it).
    if (due_at === undefined) due_at = ok(await sb.from('projects').select('due_at').eq('id', pid).single())?.due_at ?? null;
    ok(await sb.rpc('set_stage', { pid, to_stage: to, note, visible, next_step: next_step === undefined ? null : next_step, due_at: due_at !== undefined ? due_at : null }));
    emit();
  },

  async updateProject(pid, patch) {
    const allowed = {}; ['assignee_id', 'next_step', 'due_at', 'delivery_at', 'install_at'].forEach((k) => { if (k in patch) allowed[k] = patch[k]; });
    ok(await sb.from('projects').update(allowed).eq('id', pid)); emit();
  },
  async updateInternal(pid, patch) { ok(await sb.from('project_internal').update({ ...patch, updated_at: new Date().toISOString() }).eq('project_id', pid)); emit(); },
  async listStaff() { return ok(await sb.from('profiles').select(PROFILE).eq('role', 'staff')); },

  async notifications() {
    const { data: { user } } = await authUser();
    if (!user) return [];
    return ok(await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50));
  },
  async markRead(ids = 'all') {
    const { data: { user } } = await authUser();
    let q = sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
    if (ids !== 'all') q = q.in('id', ids);
    ok(await q);
  },
  async fileUrl(doc) {
    if (!doc.storage_path) return null;
    const data = ok(await sb.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300));
    return data.signedUrl;
  },
};

// Offline queue (UX audit U3). Without a connection, these changes are kept in this browser and sent, in order,
// as soon as it is back; the page shows how many are waiting. Only simple, staff-side changes are queued:
// tasks, notes and messages, the facts of a project. Nothing else is attempted offline.
const QUEUE_KEY = 'bp-crm-queue';
const QUEUED = ['addTask', 'setTaskDone', 'updateTask', 'addMessage', 'updateInternal', 'updateProject'];
const readQ = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } };
const writeQ = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* private mode: nothing kept */ } };
const real = {};
QUEUED.forEach((name) => {
  real[name] = store[name].bind(store);
  store[name] = async (...args) => {
    if (navigator.onLine === false) { writeQ([...readQ(), { name, args, at: new Date().toISOString() }]); dispatchEvent(new Event('bp-queue')); return null; }
    return real[name](...args);
  };
});
store.queued = () => readQ().length;
let flushing = false;
store.flushQueue = async () => {
  if (flushing || navigator.onLine === false) return 0;
  flushing = true; let sent = 0, failed = 0;
  try {
    for (let q = readQ(); q.length; q = readQ()) {
      const [job, ...rest] = q;
      try { await real[job.name](...job.args); sent += 1; } catch (err) { failed += 1; console.warn('Queued change not saved', job.name, err.message); }
      writeQ(rest);
    }
  } finally { flushing = false; dispatchEvent(new CustomEvent('bp-queue', { detail: { sent, failed } })); }
  if (sent) emit();
  return sent;
};
addEventListener('online', () => store.flushQueue());
if (navigator.onLine !== false && readQ().length) setTimeout(() => store.flushQueue(), 1500);
