// Demo store: same API as the Supabase store, kept in localStorage.
// Mirrors the database triggers (timeline, notifications) so the demo behaves like production.
// Open the client portal and the staff CRM in two tabs: changes appear live in both.
import { addWorkingDays, stage } from './core.js';

const KEY = 'bp-portal-demo-v1';
const SESSION = 'bp-portal-demo-session';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => new Date().toISOString();
const daysAgo = (d, h = 10) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 15, 0, 0); return x.toISOString(); };

const listeners = new Set();
const emit = () => listeners.forEach((cb) => cb());
addEventListener('storage', (e) => { if (e.key === KEY) emit(); });

let mem = null; // fallback when storage is unavailable
const load = () => {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { if (mem) return mem; }
  const s = seed(); save(s); return s;
};
const save = (s) => { mem = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* memory only */ } emit(); };
// Session is per tab, so one tab can be the architect and another the staff CRM.
let memSession = null;
const sessionId = () => { try { return sessionStorage.getItem(SESSION); } catch { return memSession; } };
const setSession = (id) => { try { id ? sessionStorage.setItem(SESSION, id) : sessionStorage.removeItem(SESSION); } catch { memSession = id; } emit(); };

function seed() {
  const anna = { id: 'u-anna', email: 'anna@example-studio.co.uk', full_name: 'Anna Clarke', company: 'Example Studio (demo)', phone: '', role: 'client', notify_email: true, notify_digest: false };
  const ravi = { id: 'u-ravi', email: 'ravi@example-homes.co.uk', full_name: 'Ravi Patel', company: 'Example Homes (demo)', phone: '', role: 'client', notify_email: true, notify_digest: false };
  const tom = { id: 'u-tom', email: 'tom@brickandpane.co.uk', full_name: 'Tom Reid', company: 'Brick & Pane', phone: '', role: 'staff', notify_email: true, notify_digest: false };
  const s = { users: [anna, ravi, tom], projects: [], members: [], openings: [], events: [], documents: [], approvals: [], messages: [], notifications: [], internal: {} };

  const mk = (p, owner, history, extra = {}) => {
    const id = uid();
    const created = history[0][1];
    const last = history[history.length - 1];
    s.projects.push({ id, ref: `BP-2026-${String(s.projects.length + 1).padStart(4, '0')}`, owner_id: owner.id, assignee_id: tom.id, stage: last[0], stage_changed_at: last[1], created_at: created, updated_at: last[1], next_step: '', due_at: null, riba_stage: '', building_type: '', systems: ['lift-slide'], start_window: '', brief: '', ...p });
    s.members.push({ project_id: id, user_id: owner.id, role: 'owner' });
    s.internal[id] = { value_gbp: extra.value ?? null, probability: extra.prob ?? null, notes: extra.notes ?? '' };
    let prev = null;
    history.forEach(([to, at, note, visible = true]) => { s.events.push({ id: uid(), project_id: id, from_stage: prev, to_stage: to, note, visible_to_client: visible, actor_id: prev ? tom.id : owner.id, created_at: at }); prev = to; });
    return id;
  };

  const p1 = mk({ name: 'Hartley Road rear extension', location: 'Hackney, E5', riba_stage: '4 Technical design', building_type: 'Extension to an existing house', start_window: '3–6 months', brief: 'Full-width lift & slide to the garden, flush threshold, triple glazing.', next_step: 'Review the quotation and accept it, or ask for changes.' }, anna, [
    ['submitted', daysAgo(9), 'Project received.'],
    ['in_review', daysAgo(9, 14), 'Tom Reid is your technical lead.'],
    ['clarification', daysAgo(8), 'Two questions on the threshold and the steel beam. See Messages.'],
    ['in_review', daysAgo(6), 'Thanks for the answers. Pricing now.'],
    ['quote_issued', daysAgo(4), 'Quotation Q1 is in Documents.'],
  ], { value: 38400, prob: 60, notes: 'Architect keen; client comparing with one other supplier. Follow up Friday.' });
  s.openings.push(
    { id: uid(), project_id: p1, ref: 'D01', system: 'lift-slide', width_mm: 5600, height_mm: 2700, config: '4C', glazing: 't', qty: 1, notes: 'Flush threshold to garden' },
    { id: uid(), project_id: p1, ref: 'W01', system: 'windows', width_mm: 1200, height_mm: 1400, config: '', glazing: 't', qty: 2, notes: 'Side return, tilt-turn' },
  );
  s.documents.push(
    { id: uid(), project_id: p1, kind: 'client_upload', title: 'Hartley Rd — GA plans & elevations.pdf', version: '', size_bytes: 4200000, visible_to_client: true, approval: 'none', uploaded_by: anna.id, created_at: daysAgo(9) },
    { id: uid(), project_id: p1, kind: 'quote', title: 'Quotation Q1 — Hartley Road', version: 'Q1', size_bytes: 380000, visible_to_client: true, approval: 'pending', uploaded_by: tom.id, created_at: daysAgo(4) },
  );
  s.messages.push(
    { id: uid(), project_id: p1, author_id: tom.id, body: 'Hi Anna, two questions before we price.\n1) Is the slab recess for a flush threshold possible, or should we allow a 15 mm upstand?\n2) Can your engineer design the beam to a 3 mm live-load deflection at the head?', internal: false, created_at: daysAgo(8) },
    { id: uid(), project_id: p1, author_id: anna.id, body: '1) Flush, the slab is being recast anyway. 2) Yes, engineer confirms 3 mm is achievable with a 254 UC.', internal: false, created_at: daysAgo(7) },
    { id: uid(), project_id: p1, author_id: tom.id, body: 'Perfect, thank you. Quotation to follow within two working days.', internal: false, created_at: daysAgo(6) },
    { id: uid(), project_id: p1, author_id: tom.id, body: 'Internal: discount headroom c. 5%. Do not offer yet.', internal: true, created_at: daysAgo(4) },
  );

  const p2 = mk({ name: 'Mews house, corner glazing', location: 'Belsize Park, NW3', riba_stage: '5 Manufacturing & construction', building_type: 'New-build house', start_window: 'Within 3 months', brief: 'Post-free corner lift & slide, pocket on one side.', next_step: 'Approve shop drawings Rev A, or request changes.' }, anna, [
    ['submitted', daysAgo(40)], ['in_review', daysAgo(39)], ['quote_issued', daysAgo(35), 'Quotation Q2 issued.'],
    ['accepted', daysAgo(28), 'Order confirmed. Thank you.'], ['survey', daysAgo(20), 'Survey booked for Tuesday 9:00.'], ['drawings', daysAgo(2), 'Shop drawings Rev A are ready for your approval.'],
  ], { value: 61200, prob: 100 });
  s.openings.push({ id: uid(), project_id: p2, ref: 'D01', system: 'lift-slide', width_mm: 4200, height_mm: 2900, config: '2A', glazing: 't', qty: 2, notes: 'Corner, no post' });
  s.documents.push(
    { id: uid(), project_id: p2, kind: 'quote', title: 'Quotation Q2 — accepted', version: 'Q2', size_bytes: 350000, visible_to_client: true, approval: 'approved', uploaded_by: tom.id, created_at: daysAgo(35) },
    { id: uid(), project_id: p2, kind: 'survey', title: 'Site survey report', version: '', size_bytes: 2100000, visible_to_client: true, approval: 'none', uploaded_by: tom.id, created_at: daysAgo(18) },
    { id: uid(), project_id: p2, kind: 'drawing', title: 'Shop drawings — corner slider', version: 'Rev A', size_bytes: 5200000, visible_to_client: true, approval: 'pending', uploaded_by: tom.id, created_at: daysAgo(2) },
  );

  const p3 = mk({ name: 'Garden room, Dulwich', location: 'SE21', riba_stage: '2 Concept', building_type: 'Extension to an existing house', start_window: '6–12 months', brief: 'Budget check for a 3-panel slider.', next_step: 'We’ll confirm receipt and assign a technical lead.', due_at: addWorkingDays(now(), 1) }, anna, [['submitted', daysAgo(0, 9), 'Project received.']], {});
  s.openings.push({ id: uid(), project_id: p3, ref: 'D01', system: 'lift-slide', width_mm: 4000, height_mm: 2400, config: '3T', glazing: 'd', qty: 1, notes: '' });

  const p4 = mk({ name: 'Northfield Terrace — 8 houses', location: 'Ealing, W13', riba_stage: '', building_type: 'New-build houses (8)', start_window: '6–12 months', brief: 'Rear sliders and windows for 8 houses. Budget needed for appraisal.', next_step: 'Budget price by Thursday.', due_at: daysAgo(1, 17) }, ravi, [['submitted', daysAgo(4)], ['in_review', daysAgo(3), 'Reviewing the schedule.']], { value: 142000, prob: 30 });
  s.openings.push({ id: uid(), project_id: p4, ref: 'Type A rear', system: 'lift-slide', width_mm: 3600, height_mm: 2400, config: '2A', glazing: 'd', qty: 8, notes: '' });

  const n = (u, p, type, title, body, at, read = false) => s.notifications.push({ id: uid(), user_id: u, project_id: p, type, title, body, created_at: at, read_at: read ? at : null });
  n(anna.id, p2, 'approval_request', 'Approval needed: Shop drawings — corner slider', 'Mews house, corner glazing', daysAgo(2));
  n(anna.id, p1, 'approval_request', 'Approval needed: Quotation Q1 — Hartley Road', 'Hartley Road rear extension', daysAgo(4), true);
  n(tom.id, p3, 'new_project', 'New project: Garden room, Dulwich', 'SE21', daysAgo(0, 9));
  return s;
}

// ---------- trigger mirrors ----------
const notifyMembers = (s, pid, type, title, body) => s.members.filter((m) => m.project_id === pid)
  .forEach((m) => s.notifications.push({ id: uid(), user_id: m.user_id, project_id: pid, type, title, body, created_at: now(), read_at: null }));
const notifyStaff = (s, pid, type, title, body) => {
  const p = s.projects.find((x) => x.id === pid);
  const targets = p?.assignee_id ? [p.assignee_id] : s.users.filter((u) => u.role === 'staff').map((u) => u.id);
  targets.forEach((u) => s.notifications.push({ id: uid(), user_id: u, project_id: pid, type, title, body, created_at: now(), read_at: null }));
};

const me = (s) => s.users.find((u) => u.id === sessionId()) || null;
const canSee = (s, u, pid) => u && (u.role === 'staff' || s.members.some((m) => m.project_id === pid && m.user_id === u.id));
const need = (s) => { const u = me(s); if (!u) throw new Error('Please sign in.'); return u; };
const needStaff = (s) => { const u = need(s); if (u.role !== 'staff') throw new Error('Staff only.'); return u; };

export const store = {
  mode: 'demo',
  onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },

  async getUser() { return me(load()); },
  async demoLogin(role) { const s = load(); setSession(s.users.find((u) => u.role === (role === 'staff' ? 'staff' : 'client')).id); },
  async signIn(email) {
    const s = load(); const u = s.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) throw new Error('No demo account with that email. Create one, or use a demo account.');
    setSession(u.id);
  },
  async signUp({ email, full_name, company }) {
    const s = load();
    if (s.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with that email already exists.');
    const u = { id: uid(), email, full_name, company, phone: '', role: 'client', notify_email: true, notify_digest: false };
    s.users.push(u); save(s); setSession(u.id);
    return { needsConfirmation: false };
  },
  async sendMagicLink() { throw new Error('Magic links are not available in demo mode.'); },
  async signOut() { setSession(null); },
  async resetDemo() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } mem = null; load(); emit(); },

  async updateProfile(patch) {
    const s = load(); const u = need(s);
    const { role, id, email, ...safe } = patch; void role; void id; void email;
    Object.assign(s.users.find((x) => x.id === u.id), safe); save(s);
  },

  async listProjects() {
    const s = load(); const u = need(s);
    return s.projects.filter((p) => canSee(s, u, p.id))
      .map((p) => ({ ...p, owner: s.users.find((x) => x.id === p.owner_id), assignee: s.users.find((x) => x.id === p.assignee_id), internal: u.role === 'staff' ? s.internal[p.id] : undefined }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  async getProject(id) {
    const s = load(); const u = need(s);
    if (!canSee(s, u, id)) throw new Error('Project not found.');
    const staff = u.role === 'staff';
    const p = s.projects.find((x) => x.id === id);
    const byId = (uid2) => s.users.find((x) => x.id === uid2);
    return {
      project: { ...p, owner: byId(p.owner_id), assignee: byId(p.assignee_id) },
      openings: s.openings.filter((o) => o.project_id === id),
      events: s.events.filter((e) => e.project_id === id && (staff || e.visible_to_client)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => ({ ...e, actor: byId(e.actor_id) })),
      documents: s.documents.filter((d) => d.project_id === id && (staff || d.visible_to_client)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((d) => ({ ...d, uploader: byId(d.uploaded_by) })),
      approvals: s.approvals.filter((a) => a.project_id === id).map((a) => ({ ...a, actor: byId(a.actor_id) })),
      messages: s.messages.filter((m) => m.project_id === id && (staff || !m.internal)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({ ...m, author: byId(m.author_id) })),
      internal: staff ? s.internal[id] : undefined,
    };
  },

  async createProject(data, openings, files) {
    const s = load(); const u = need(s);
    const id = uid(); const t = now();
    const p = { id, ref: `BP-2026-${String(s.projects.length + 1).padStart(4, '0')}`, owner_id: u.id, assignee_id: null, stage: 'submitted', stage_changed_at: t, created_at: t, updated_at: t, next_step: 'We’ll confirm receipt and assign a technical lead.', due_at: addWorkingDays(t, 1), ...data };
    s.projects.push(p);
    s.members.push({ project_id: id, user_id: u.id, role: 'owner' });
    s.internal[id] = { value_gbp: null, probability: null, notes: '' };
    s.events.push({ id: uid(), project_id: id, from_stage: null, to_stage: 'submitted', note: 'Project received.', visible_to_client: true, actor_id: u.id, created_at: t });
    openings.forEach((o) => s.openings.push({ id: uid(), project_id: id, ...o }));
    files.forEach((f) => s.documents.push({ id: uid(), project_id: id, kind: 'client_upload', title: f.name, version: '', size_bytes: f.size, visible_to_client: true, approval: 'none', uploaded_by: u.id, created_at: t }));
    notifyStaff(s, id, 'new_project', `New project: ${p.name}`, `${p.ref} · ${p.location}`);
    save(s);
    return id;
  },

  async addMessage(pid, body, internal = false) {
    const s = load(); const u = need(s);
    if (!canSee(s, u, pid)) throw new Error('Project not found.');
    const isInternal = u.role === 'staff' && internal;
    s.messages.push({ id: uid(), project_id: pid, author_id: u.id, body, internal: isInternal, created_at: now() });
    const p = s.projects.find((x) => x.id === pid); p.updated_at = now();
    if (!isInternal) (u.role === 'staff' ? notifyMembers : notifyStaff)(s, pid, 'message', `${u.role === 'staff' ? 'New message' : 'Client message'}: ${p.name}`, body.slice(0, 200));
    save(s);
  },

  async uploadFiles(pid, files, meta = {}) {
    const s = load(); const u = need(s);
    if (!canSee(s, u, pid)) throw new Error('Project not found.');
    const staff = u.role === 'staff';
    const p = s.projects.find((x) => x.id === pid);
    files.forEach((f) => {
      const d = { id: uid(), project_id: pid, kind: staff ? (meta.kind || 'other') : 'client_upload', title: (staff && meta.title) || f.name, version: staff ? (meta.version || '') : '', size_bytes: f.size, visible_to_client: staff ? meta.visible !== false : true, approval: staff && meta.approval ? 'pending' : 'none', uploaded_by: u.id, created_at: now() };
      s.documents.push(d);
      if (staff && d.visible_to_client) notifyMembers(s, pid, d.approval === 'pending' ? 'approval_request' : 'document', `${d.approval === 'pending' ? 'Approval needed' : 'New document'}: ${d.title}`, p.name);
      if (!staff) notifyStaff(s, pid, 'document', `Client uploaded: ${d.title}`, p.name);
    });
    p.updated_at = now();
    save(s);
  },

  async decide(docId, decision, comment = '') {
    const s = load(); const u = need(s);
    const d = s.documents.find((x) => x.id === docId);
    if (!d || !canSee(s, u, d.project_id) || d.approval !== 'pending' || u.role === 'staff') throw new Error('This document is not awaiting your approval.');
    d.approval = decision;
    s.approvals.push({ id: uid(), document_id: docId, project_id: d.project_id, decision, comment, actor_id: u.id, created_at: now() });
    s.projects.find((x) => x.id === d.project_id).updated_at = now();
    notifyStaff(s, d.project_id, 'approval', `${decision === 'approved' ? 'Approved' : 'Changes requested'}: ${d.title}`, comment);
    save(s);
  },

  async setStage(pid, to, { note = '', visible = true, next_step, due_at } = {}) {
    const s = load(); const u = needStaff(s);
    const p = s.projects.find((x) => x.id === pid);
    const t = now();
    s.events.push({ id: uid(), project_id: pid, from_stage: p.stage, to_stage: to, note, visible_to_client: visible, actor_id: u.id, created_at: t });
    Object.assign(p, { stage: to, stage_changed_at: t, updated_at: t });
    if (next_step !== undefined) p.next_step = next_step;
    p.due_at = due_at !== undefined ? due_at : (stage(to).sla ? addWorkingDays(t, stage(to).sla) : null);
    if (visible) notifyMembers(s, pid, 'stage', `${p.name}: ${stage(to).label}`, note);
    save(s);
  },

  async updateProject(pid, patch) {
    const s = load(); needStaff(s);
    const p = s.projects.find((x) => x.id === pid);
    ['assignee_id', 'next_step', 'due_at'].forEach((k) => { if (k in patch) p[k] = patch[k]; });
    p.updated_at = now(); save(s);
  },
  async updateInternal(pid, patch) { const s = load(); needStaff(s); Object.assign(s.internal[pid], patch); save(s); },
  async listStaff() { return load().users.filter((u) => u.role === 'staff'); },

  async notifications() { const s = load(); const u = me(s); return u ? s.notifications.filter((n) => n.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50) : []; },
  async markRead(ids = 'all') {
    const s = load(); const u = need(s); const t = now();
    s.notifications.forEach((n) => { if (n.user_id === u.id && !n.read_at && (ids === 'all' || ids.includes(n.id))) n.read_at = t; });
    save(s);
  },
  async fileUrl() { return null; }, // demo: files are not stored
};
