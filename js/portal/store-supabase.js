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
  ['projects', 'stage_events', 'documents', 'messages', 'notifications', 'changes', 'payments', 'project_members'].forEach((table) =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, emit));
  channel.subscribe();
};
sb.auth.onAuthStateChange(() => emit());

const PROFILE = 'id, full_name, company, role, account_type';
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
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    restoreRoute();
    const p = ok(await sb.from('profiles').select('*').eq('id', user.id).single());
    // First sign-in through Google/Apple/Microsoft: apply the account type picked on the sign-up panel.
    let pending = null;
    try { pending = localStorage.getItem(PENDING_TYPE); localStorage.removeItem(PENDING_TYPE); } catch { /* ignore */ }
    if (['architect', 'developer', 'homeowner'].includes(pending) && pending !== p.account_type && Date.now() - new Date(user.created_at).getTime() < 15 * 60e3) {
      ok(await sb.from('profiles').update({ account_type: pending }).eq('id', user.id));
      p.account_type = pending;
    }
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
    const { data: { user } } = await sb.auth.getUser();
    const { full_name, company, phone, notify_email, notify_digest } = patch;
    ok(await sb.from('profiles').update({ full_name, company, phone, notify_email, notify_digest }).eq('id', user.id));
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
    return ok(await sb.from('quotes').select('data').order('updated_at', { ascending: false }).limit(500)).map((r) => r.data);
  },
  async saveQuote(q) {
    ok(await sb.from('quotes').upsert({ id: q.id, reference: q.reference, data: q, updated_at: new Date(q.updatedAt || Date.now()).toISOString() }));
  },
  async deleteQuote(id) { ok(await sb.from('quotes').delete().eq('id', id)); },
  async getQuoteSettings() { return ok(await sb.from('quote_settings').select('data').maybeSingle())?.data || {}; },
  async saveQuoteSettings(data) { ok(await sb.from('quote_settings').upsert({ id: true, data, updated_at: new Date().toISOString() })); },
  // Quotes ↔ HubSpot (migration 0026, function hubspot-quotes). Server fields sit beside the builder's JSON; without
  // the migration the Quotes tab works as before (hubspot: false).
  async quoteHub() {
    const [m, s] = await Promise.all([
      sb.from('quotes').select('id, hubspot_deal_id, hubspot_deal_name, hubspot_dealstage, status, status_source, status_at').limit(500),
      sb.from('quote_sends').select('id, quote_id, hubspot_deal_id, reference, revision, kind, total, vat_rate, pdf_path, pdf_name, snapshot, sent_on, created_at, hubspot_note_id, hubspot_error, hubspot_stage_moved, hubspot_attempts').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (m.error || s.error) return { hubspot: false, meta: [], sends: [] };
    return { hubspot: true, meta: m.data || [], sends: s.data || [] };
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
  async sendQuote({ quoteId, dealId, reference, revision, kind, total, vatRate, file, sentOn, snapshot }) {
    // The row's id is the database's to give: staff may insert only the columns granted in migration 0026,
    // so the PDF gets a name of its own instead of borrowing the id.
    const path = `${quoteId}/${crypto.randomUUID()}.pdf`;
    const name = file.name.slice(0, 200);
    ok(await sb.storage.from('quote-pdfs').upload(path, file, { contentType: 'application/pdf' }));
    const row = ok(await sb.from('quote_sends').insert({ quote_id: quoteId, hubspot_deal_id: dealId, reference, revision, kind, total, vat_rate: vatRate, pdf_path: path, pdf_name: name, snapshot, sent_on: sentOn }).select().single());
    let hub;
    try { hub = await this.hubspot('send', { send_id: row.id }); } catch (e) { hub = { result: 'error', hubspot_error: e.message }; }
    return { ...row, ...hub };
  },
  async retryQuoteSend(id) { return this.hubspot('send', { send_id: id }); },
  // Costs: supplier and subcontractor quotes on a project and the margin (migration 0031, staff only).
  async listCosts(pid) { return ok(await sb.from('supplier_quotes').select('*').eq('project_id', pid).order('created_at', { ascending: false })); },
  async projectMargin(pid) { return ok(await sb.rpc('project_margin', { pid })); },
  async addCost(pid, { supplier, reference = '', category, amount, quoted_on = null, valid_until = null, note = '', file = null }) {
    let pdf_path = null, pdf_name = '';
    if (file) {
      pdf_path = `${pid}/${crypto.randomUUID()}.pdf`; pdf_name = file.name.slice(0, 200);
      ok(await sb.storage.from('supplier-quotes').upload(pdf_path, file, { contentType: 'application/pdf' }));
    }
    ok(await sb.from('supplier_quotes').insert({ project_id: pid, supplier, reference, category, amount: Number(amount), currency: 'GBP', fx_to_gbp: 1, status: 'received', quoted_on, valid_until, pdf_path, pdf_name, note }));
    emit();
  },
  async setCostStatus(id, status) { ok(await sb.from('supplier_quotes').update({ status }).eq('id', id)); emit(); },
  async deleteCost(id) { ok(await sb.from('supplier_quotes').delete().eq('id', id)); emit(); },
  async costPdfUrl(path) { return ok(await sb.storage.from('supplier-quotes').createSignedUrl(path, 300))?.signedUrl; },
  async quotePdfUrl(path) { return ok(await sb.storage.from('quote-pdfs').createSignedUrl(path, 300))?.signedUrl; },
  // Staff inbox: requests from the public form, sent with or without an account (migration 0005, staff-only RLS).
  async listRequests() {
    return ok(await sb.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(200));
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
    const rows = ok(await sb.from('projects')
      .select(`*, owner:profiles!projects_owner_id_fkey(${PROFILE}), assignee:profiles!projects_assignee_id_fkey(${PROFILE})`)
      .order('updated_at', { ascending: false }));
    if (me?.role === 'staff') {
      const internal = ok(await sb.from('project_internal').select('*'));
      const map = Object.fromEntries(internal.map((i) => [i.project_id, i]));
      rows.forEach((r) => { r.internal = map[r.id]; });
    }
    return rows;
  },

  async getProject(id) {
    const me = await this.getUser();
    const [project, openings, events, documents, approvals, messages] = await Promise.all([
      sb.from('projects').select(`*, owner:profiles!projects_owner_id_fkey(${PROFILE}), assignee:profiles!projects_assignee_id_fkey(${PROFILE})`).eq('id', id).single().then(ok),
      sb.from('openings').select('*').eq('project_id', id).then(ok),
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
    const { data: { user } } = await sb.auth.getUser();
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
      }));
    }
    emit();
  },

  async decide(docId, decision, comment = '', { onBehalf = false } = {}) {
    const { data: { user } } = await sb.auth.getUser();
    const d = ok(await sb.from('documents').select('project_id').eq('id', docId).single());
    const { error } = await sb.from('approvals').insert({ document_id: docId, project_id: d.project_id, decision, comment, on_behalf: onBehalf, actor_id: user.id });
    if (error) throw new Error(error.code === '42501' ? 'You can’t decide on this document. If it’s a quotation, your client needs to accept it, or confirm you have their authority.' : error.message);
  },

  async inviteMember(pid, email, role) { return ok(await sb.rpc('invite_member', { p: pid, e: email.trim(), r: role })); },
  async raiseChange(pid, { title, description, impact = '' }) {
    const { data: { user } } = await sb.auth.getUser();
    ok(await sb.from('changes').insert({ project_id: pid, title, description, impact, raised_by: user.id }));
  },
  async decideChange(changeId, decision, comment = '') { ok(await sb.rpc('decide_change', { c: changeId, decision, note: comment })); },
  async addPayment(pid, { label, amount, due_date }) { ok(await sb.from('payments').insert({ project_id: pid, label, amount: Number(amount), due_date })); },
  async markPaid(paymentId) {
    const row = ok(await sb.from('payments').select('paid_at').eq('id', paymentId).single());
    ok(await sb.from('payments').update({ paid_at: row.paid_at ? null : new Date().toISOString() }).eq('id', paymentId));
  },

  async setStage(pid, to, { note = '', visible = true, next_step, due_at } = {}) {
    const { data: { user } } = await sb.auth.getUser();
    const p = ok(await sb.from('projects').select('stage').eq('id', pid).single());
    ok(await sb.from('stage_events').insert({ project_id: pid, from_stage: p.stage, to_stage: to, note, visible_to_client: visible, actor_id: user.id }));
    const patch = { due_at: due_at !== undefined ? due_at : null };
    if (next_step !== undefined) patch.next_step = next_step;
    ok(await sb.from('projects').update(patch).eq('id', pid));
  },

  async updateProject(pid, patch) {
    const allowed = {}; ['assignee_id', 'next_step', 'due_at', 'delivery_at', 'install_at'].forEach((k) => { if (k in patch) allowed[k] = patch[k]; });
    ok(await sb.from('projects').update(allowed).eq('id', pid));
  },
  async updateInternal(pid, patch) { ok(await sb.from('project_internal').update({ ...patch, updated_at: new Date().toISOString() }).eq('project_id', pid)); },
  async listStaff() { return ok(await sb.from('profiles').select(PROFILE).eq('role', 'staff')); },

  async notifications() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];
    return ok(await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50));
  },
  async markRead(ids = 'all') {
    const { data: { user } } = await sb.auth.getUser();
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
