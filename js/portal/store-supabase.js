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
  ['projects', 'stage_events', 'documents', 'messages', 'notifications', 'changes', 'payments', 'project_members', 'prospects'].forEach((table) =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, emit));
  channel.subscribe();
};
sb.auth.onAuthStateChange(() => emit());

const PROFILE = 'id, full_name, company, role, account_type';
const PENDING_TYPE = 'bp-oauth-account-type';
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
  async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
  async signUp({ email, password, full_name, company, account_type = 'architect', next = 'portal.html' }) {
    const data = ok(await sb.auth.signUp({ email, password, options: { data: { full_name, company, account_type }, emailRedirectTo: new URL(next, location.href).href } }));
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
    ok(await sb.auth.signInWithOAuth({ provider, options: { redirectTo, ...(provider === 'azure' ? { scopes: 'email' } : {}) } }));
  },
  async sendMagicLink(email, next = 'portal.html') { ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL(next, location.href).href } })); },
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
  // Staff inbox: requests from the public form, sent with or without an account (migration 0005, staff-only RLS).
  async listRequests() {
    return ok(await sb.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(200));
  },
  async updateRequest(id, { status, staff_note }) {
    ok(await sb.from('contact_requests').update({ status, staff_note }).eq('id', id));
    emit();
  },
  // Prospects: companies we want to work with (migration 0014, staff-only RLS).
  async listProspects() {
    return ok(await sb.from('prospects').select('*').order('updated_at', { ascending: false }).limit(1000));
  },
  async saveProspect(id, patch) {
    const row = id
      ? ok(await sb.from('prospects').update(patch).eq('id', id).select('id').single())
      : ok(await sb.from('prospects').insert(patch).select('id').single());
    emit();
    return row.id;
  },
  async addProspectNote(id, text, stage = null) {
    const { data: { user } } = await sb.auth.getUser();
    const me = ok(await sb.from('profiles').select('full_name').eq('id', user.id).single());
    const { log } = ok(await sb.from('prospects').select('log').eq('id', id).single());
    ok(await sb.from('prospects').update({ log: [{ at: new Date().toISOString(), by: me.full_name || '', text, ...(stage ? { stage } : {}) }, ...(log || [])] }).eq('id', id));
    emit();
  },
  async deleteProspect(id) {
    ok(await sb.from('prospects').delete().eq('id', id));
    emit();
  },
  // Staff only: creates the project with the enquiry's openings (migration 0008) and returns its id.
  async convertRequest(id) {
    const pid = ok(await sb.rpc('convert_request', { r: id }));
    emit();
    return pid;
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
