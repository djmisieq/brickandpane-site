// Demo store: same API as the Supabase store, kept in localStorage.
// Mirrors the database triggers (timeline, notifications) so the demo behaves like production.
// Open the client portal and the staff CRM in two tabs: changes appear live in both.
import { addWorkingDays, stage, decisionRights, MEMBER_ROLES } from './core.js';

const KEY = 'bp-portal-demo-v4';
const SESSION = 'bp-portal-demo-session';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => new Date().toISOString();
const daysAhead = (d, h = 9) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
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
  const anna = { id: 'u-anna', email: 'anna@example-studio.co.uk', full_name: 'Anna Clarke', company: 'Example Studio (demo)', phone: '', role: 'client', account_type: 'architect', notify_email: true, notify_digest: false };
  const ravi = { id: 'u-ravi', email: 'ravi@example-homes.co.uk', full_name: 'Ravi Patel', company: 'Example Homes (demo)', phone: '', role: 'client', account_type: 'developer', notify_email: true, notify_digest: false };
  const sam = { id: 'u-sam', email: 'sam@example.com', full_name: 'Sam Taylor', company: '', phone: '', role: 'client', account_type: 'homeowner', notify_email: true, notify_digest: false };
  const tom = { id: 'u-tom', email: 'tom@brickandpane.co.uk', full_name: 'Tom Reid', company: 'Brick & Pane', phone: '', role: 'staff', notify_email: true, notify_digest: false };
  const s = { users: [anna, ravi, sam, tom], projects: [], members: [], openings: [], events: [], documents: [], approvals: [], messages: [], notifications: [], internal: {}, changes: [], payments: [], invites: [], requests: [] };
  s.requests.push({ id: uid(), ref: 'BP-261018-3F2A', created_at: daysAgo(0, 8), status: 'new', lang: 'en', role: 'homeowner', name: 'Jo Bennett', email: 'jo@example.com', phone: '', company: '', topic: 'quote', systems: ['sliding'], material: ['alu'], location: 'Walthamstow, E17', riba_stage: '', building: '', units: '', start: '3–6 months', opening_width_mm: null, opening_height_mm: null, openings: [{ ref: 'D01', system: 'sliding', material: 'alu', width_mm: 3600, height_mm: 2200, qty: 1, note: '3 panels' }, { ref: 'W01', system: 'windows', material: '', width_mm: 1200, height_mm: 1400, qty: 2, note: 'Side return' }], message: 'Kitchen extension, would like a 3-panel slider to the garden.', files: [], files_link: null, consent_at: daysAgo(0, 8), project_id: null, staff_note: '' });

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
  ], { value: 23900, prob: 60, notes: 'Architect keen; client comparing with one other supplier. Follow up Friday.' });
  s.openings.push(
    { id: uid(), project_id: p1, ref: 'D01', system: 'lift-slide', width_mm: 5600, height_mm: 2700, config: '4C', glazing: 't', qty: 1, notes: 'Flush threshold to garden' },
    { id: uid(), project_id: p1, ref: 'W01', system: 'windows', width_mm: 1200, height_mm: 1400, config: '', glazing: 't', qty: 2, notes: 'Side return, tilt-turn' },
  );
  s.documents.push(
    { id: uid(), project_id: p1, kind: 'client_upload', title: 'Hartley Rd — GA plans & elevations.pdf', version: '', size_bytes: 4200000, visible_to_client: true, approval: 'none', uploaded_by: anna.id, created_at: daysAgo(9) },
    { id: uid(), project_id: p1, kind: 'quote', amount: 23900, title: 'Quotation Q1 — Hartley Road', version: 'Q1', size_bytes: 380000, visible_to_client: true, approval: 'pending', uploaded_by: tom.id, created_at: daysAgo(4) },
  );
  s.messages.push(
    { id: uid(), project_id: p1, author_id: tom.id, body: 'Hi Anna, two questions before we price.\n1) Is the slab recess for a flush threshold possible, or should we allow a 15 mm upstand?\n2) Can your engineer design the beam to a 3 mm live-load deflection at the head?', internal: false, created_at: daysAgo(8) },
    { id: uid(), project_id: p1, author_id: anna.id, body: '1) Flush, the slab is being recast anyway. 2) Yes, engineer confirms 3 mm is achievable with a 254 UC.', internal: false, created_at: daysAgo(7) },
    { id: uid(), project_id: p1, author_id: tom.id, body: 'Perfect, thank you. Quotation to follow.', internal: false, created_at: daysAgo(6) },
    { id: uid(), project_id: p1, author_id: tom.id, body: 'Internal: discount headroom c. 5%. Do not offer yet.', internal: true, created_at: daysAgo(4) },
  );

  const p2 = mk({ name: 'Mews house, corner glazing', location: 'Belsize Park, NW3', riba_stage: '5 Manufacturing & construction', building_type: 'New-build house', start_window: 'Within 3 months', brief: 'Post-free corner lift & slide, pocket on one side.', next_step: 'Approve shop drawings Rev A, or request changes.' }, anna, [
    ['submitted', daysAgo(40)], ['in_review', daysAgo(39)], ['quote_issued', daysAgo(35), 'Quotation Q2 issued.'],
    ['accepted', daysAgo(28), 'Order confirmed. Thank you.'], ['survey', daysAgo(20), 'Survey booked for Tuesday 9:00.'], ['drawings', daysAgo(2), 'Shop drawings Rev A are ready for your approval.'],
  ], { value: 33800, prob: 100 });
  s.openings.push({ id: uid(), project_id: p2, ref: 'D01', system: 'lift-slide', width_mm: 4200, height_mm: 2900, config: '2A', glazing: 't', qty: 2, notes: 'Corner, no post' });
  s.documents.push(
    { id: uid(), project_id: p2, kind: 'quote', amount: 33800, title: 'Quotation Q2 — accepted', version: 'Q2', size_bytes: 350000, visible_to_client: true, approval: 'approved', uploaded_by: tom.id, created_at: daysAgo(35) },
    { id: uid(), project_id: p2, kind: 'survey', title: 'Site survey report', version: '', size_bytes: 2100000, visible_to_client: true, approval: 'none', uploaded_by: tom.id, created_at: daysAgo(18) },
    { id: uid(), project_id: p2, kind: 'drawing', title: 'Shop drawings — corner slider', version: 'Rev A', size_bytes: 5200000, visible_to_client: true, approval: 'pending', uploaded_by: tom.id, created_at: daysAgo(2) },
  );

  const p3 = mk({ name: 'Garden room, Dulwich', location: 'SE21', riba_stage: '2 Concept', building_type: 'Extension to an existing house', start_window: '6–12 months', brief: 'Budget check for a 3-panel slider.', next_step: 'We’ll confirm receipt and assign a technical lead.', due_at: addWorkingDays(now(), 1) }, anna, [['submitted', daysAgo(0, 9), 'Project received.']], {});
  s.openings.push({ id: uid(), project_id: p3, ref: 'D01', system: 'lift-slide', width_mm: 4000, height_mm: 2400, config: '3T', glazing: 'd', qty: 1, notes: '' });

  const p4 = mk({ name: 'Northfield Terrace — 8 houses', location: 'Ealing, W13', riba_stage: '', building_type: 'New-build houses (8)', start_window: '6–12 months', brief: 'Rear sliders and windows for 8 houses. Budget needed for appraisal.', next_step: 'Budget price by Thursday.', due_at: daysAgo(1, 17) }, ravi, [['submitted', daysAgo(4)], ['in_review', daysAgo(3), 'Reviewing the schedule.']], { value: 86000, prob: 30 });
  s.openings.push({ id: uid(), project_id: p4, ref: 'Type A rear', system: 'lift-slide', width_mm: 3600, height_mm: 2400, config: '2A', glazing: 'd', qty: 8, notes: '' });

  const p5 = mk({ name: 'Kitchen extension doors', location: 'Walthamstow, E17', building_type: 'Extension to an existing house', start_window: 'Within 3 months', brief: 'Four-panel lift & slide to the garden.', next_step: 'We will confirm the delivery date.' }, sam, [
    ['submitted', daysAgo(46), 'Request received.'], ['in_review', daysAgo(45)], ['quote_issued', daysAgo(43), 'Your quote is in Documents.'],
    ['accepted', daysAgo(38), 'Thank you for your order.'], ['survey', daysAgo(33), 'Survey on Thursday at 10:00.'], ['drawings', daysAgo(27), 'Final drawings ready to approve.'],
    ['production', daysAgo(20), 'Approved — your doors are now being made.'],
  ], { value: 19400, prob: 100 });
  s.openings.push({ id: uid(), project_id: p5, ref: 'D01', system: 'lift-slide', width_mm: 4800, height_mm: 2400, config: '4C', glazing: 'd', qty: 1, notes: 'Flush threshold' });
  s.documents.push(
    { id: uid(), project_id: p5, kind: 'quote', amount: 19400, title: 'Quote — kitchen extension doors', version: 'Q1', size_bytes: 310000, visible_to_client: true, approval: 'approved', uploaded_by: tom.id, created_at: daysAgo(43) },
    { id: uid(), project_id: p5, kind: 'drawing', title: 'Final drawings', version: 'Rev A', size_bytes: 2400000, visible_to_client: true, approval: 'approved', uploaded_by: tom.id, created_at: daysAgo(27) },
  );
  s.changes.push(
    { id: uid(), project_id: p2, title: 'Handle finish: satin anodised → matt black', description: 'Client prefers black handles to match the kitchen. Same hardware range, finish only.', impact: 'No change to U-value, security (PAS 24) or weather classes. Cost: no change. Programme: no change.', status: 'proposed', raised_by: tom.id, created_at: daysAgo(1), decided_by: null, decided_at: null, comment: '' },
    { id: uid(), project_id: p5, title: 'Glass: add laminated inner pane', description: 'Homeowner asked for extra security on the garden side.', impact: 'U-value unchanged. Security improved. Cost +£420 + VAT. Programme: no change.', status: 'approved', raised_by: sam.id, created_at: daysAgo(35), decided_by: sam.id, decided_at: daysAgo(34), comment: 'Yes please.' },
  );
  const pp = s.projects.find((x) => x.id === p5); pp.delivery_at = daysAhead(12); pp.install_at = daysAhead(13);
  s.payments.push(
    { id: uid(), project_id: p5, label: 'Deposit (30%)', amount: 6984, due_date: daysAgo(38), paid_at: daysAgo(37) },
    { id: uid(), project_id: p5, label: 'On delivery (60%)', amount: 13968, due_date: daysAhead(12), paid_at: null },
    { id: uid(), project_id: p5, label: 'On completion (10%)', amount: 2328, due_date: daysAhead(14), paid_at: null },
  );
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
  async demoLogin(role) { const s = load(); const type = { homeowner: 'homeowner', developer: 'developer' }[role] || 'architect';
    const u = role === 'staff' ? s.users.find((x) => x.role === 'staff') : s.users.find((x) => x.role === 'client' && x.account_type === type); setSession(u.id); },
  async signIn(email) {
    const s = load(); const u = s.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) throw new Error('No demo account with that email. Create one, or use a demo account.');
    setSession(u.id);
  },
  async signUp({ email, full_name, company, account_type = 'architect' }) {
    const s = load();
    if (s.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with that email already exists.');
    const u = { id: uid(), email, full_name, company, phone: '', role: 'client', account_type, notify_email: true, notify_digest: false };
    s.users.push(u);
    s.invites.filter((i) => i.email === email.toLowerCase()).forEach((i) => s.members.push({ project_id: i.project_id, user_id: u.id, role: i.role }));
    s.invites = s.invites.filter((i) => i.email !== email.toLowerCase());
    save(s); setSession(u.id);
    return { needsConfirmation: false };
  },
  async authProviders() { return []; },
  async sendMagicLink() { throw new Error('Magic links are not available in demo mode.'); },
  async signOut() { setSession(null); },
  async resetDemo() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } mem = null; load(); emit(); },

  async updateProfile(patch) {
    const s = load(); const u = need(s);
    const { role, id, email, ...safe } = patch; void role; void id; void email;
    Object.assign(s.users.find((x) => x.id === u.id), safe); save(s);
  },

  async myEnquiries() {
    const u = me(load());
    if (u?.account_type !== 'homeowner') return [];
    return [{ id: 'demo-enquiry', ref: 'BP-261013-7A3C', created_at: new Date(Date.now() - 3 * 864e5).toISOString(), status: 'replied', topic: 'quote', systems: ['lift-slide'], project_id: null }];
  },
  async listRequests() {
    const s = load(); needStaff(s);
    return [...(s.requests || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async updateRequest(id, { status, staff_note }) {
    const s = load(); needStaff(s);
    Object.assign((s.requests || []).find((r) => r.id === id), { status, staff_note }); save(s);
  },
  async requestFileUrl() { return null; }, // demo: files are not stored
  // Mirrors convert_request() in migration 0008.
  async convertRequest(id) {
    const s = load(); const staff = needStaff(s);
    const r = (s.requests || []).find((x) => x.id === id);
    if (!r) throw new Error('Enquiry not found.');
    if (r.project_id) return r.project_id;
    const client = s.users.find((u) => u.email.toLowerCase() === r.email.toLowerCase() && u.role !== 'staff');
    const pid = uid(); const t = now();
    s.projects.push({ id: pid, ref: `BP-2026-${String(s.projects.length + 1).padStart(4, '0')}`, name: `${r.company || r.name}${r.location ? `, ${r.location}` : ''}`, owner_id: client?.id || staff.id, assignee_id: staff.id, stage: 'submitted', stage_changed_at: t, created_at: t, updated_at: t, next_step: 'We’ll confirm receipt and assign a technical lead.', due_at: addWorkingDays(t, 1), location: r.location || '', riba_stage: r.riba_stage || '', building_type: r.building || '', systems: (r.systems || []).filter((x) => x !== 'unsure'), start_window: r.start || '', brief: r.message || '' });
    if (client) s.members.push({ project_id: pid, user_id: client.id, role: 'owner' });
    else s.invites.push({ id: uid(), project_id: pid, email: r.email.toLowerCase(), role: 'owner', invited_by: staff.id, created_at: t });
    s.internal[pid] = { value_gbp: null, probability: null, notes: r.staff_note || '' };
    s.events.push({ id: uid(), project_id: pid, from_stage: null, to_stage: 'submitted', note: 'Project received.', visible_to_client: true, actor_id: staff.id, created_at: t });
    const list = r.openings?.length ? r.openings : r.opening_width_mm ? [{ ref: 'D01', system: (r.systems || []).find((x) => x !== 'unsure') || 'lift-slide', width_mm: r.opening_width_mm, height_mm: r.opening_height_mm }] : [];
    list.forEach((o) => s.openings.push({ id: uid(), project_id: pid, ref: o.ref || '', system: o.system || 'windows', material: ['alu', 'timber', 'pvc', 'alutimber'].includes(o.material) ? o.material : '', width_mm: o.width_mm ?? null, height_mm: o.height_mm ?? null, config: o.config || '', glazing: o.glazing || '', qty: o.qty || 1, notes: o.note || '' }));
    Object.assign(r, { status: 'converted', project_id: pid });
    save(s);
    return pid;
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
      members: s.members.filter((m) => m.project_id === id).map((m) => ({ ...m, user: byId(m.user_id) })),
      invites: s.invites.filter((i) => i.project_id === id),
      changes: (s.changes || []).filter((c) => c.project_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((c) => ({ ...c, raiser: byId(c.raised_by), decider: byId(c.decided_by) })),
      payments: (s.payments || []).filter((x) => x.project_id === id).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
    };
  },

  async inviteMember(pid, email, role) {
    const s = load(); const u = need(s);
    const mine = s.members.find((m) => m.project_id === pid && m.user_id === u.id);
    if (u.role !== 'staff' && mine?.role !== 'owner') throw new Error('Only the project owner can invite people.');
    if (!MEMBER_ROLES[role] || role === 'owner') throw new Error('Choose a role.');
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error('Enter a valid email.');
    const existing = s.users.find((x) => x.email.toLowerCase() === e);
    if (existing && s.members.some((m) => m.project_id === pid && m.user_id === existing.id)) throw new Error('Already on this project.');
    const p = s.projects.find((x) => x.id === pid);
    if (existing && existing.role !== 'staff') {
      s.members.push({ project_id: pid, user_id: existing.id, role });
      s.notifications.push({ id: uid(), user_id: existing.id, project_id: pid, type: 'invite', title: `You've been added to ${p.name}`, body: `As ${MEMBER_ROLES[role]}, by ${u.full_name}.`, created_at: now(), read_at: null });
    } else {
      s.invites.push({ id: uid(), project_id: pid, email: e, role, invited_by: u.id, created_at: now() });
    }
    save(s);
    return existing ? 'added' : 'invited';
  },

  async raiseChange(pid, { title, description, impact = '' }) {
    const s = load(); const u = need(s);
    if (!canSee(s, u, pid)) throw new Error('Project not found.');
    const p = s.projects.find((x) => x.id === pid);
    s.changes.push({ id: uid(), project_id: pid, title, description, impact, status: 'proposed', raised_by: u.id, created_at: now(), decided_by: null, decided_at: null, comment: '' });
    (u.role === 'staff' ? notifyMembers : notifyStaff)(s, pid, 'change', `Change ${u.role === 'staff' ? 'for your approval' : 'requested'}: ${title}`, p.name);
    p.updated_at = now(); save(s);
  },

  async decideChange(changeId, decision, comment = '') {
    const s = load(); const u = need(s);
    const c = s.changes.find((x) => x.id === changeId);
    if (!c || c.status !== 'proposed') throw new Error('This change is not awaiting a decision.');
    const mine = s.members.find((m) => m.project_id === c.project_id && m.user_id === u.id);
    // Changes proposed by Brick & Pane are decided by the client team; requests from the client team by Brick & Pane.
    const raiserIsStaff = s.users.find((x) => x.id === c.raised_by)?.role === 'staff';
    if (decision === 'withdrawn') {
      if (c.raised_by !== u.id) throw new Error('Only the person who raised a change can withdraw it.');
    } else if (u.role === 'staff') {
      if (raiserIsStaff) throw new Error('The client decides on changes you propose.');
    } else {
      if (!mine || mine.role === 'contractor') throw new Error('You can’t decide on changes for this project.');
      if (!raiserIsStaff) throw new Error('Brick & Pane responds to change requests from your team.');
    }
    Object.assign(c, { status: decision, decided_by: u.id, decided_at: now(), comment });
    const p = s.projects.find((x) => x.id === c.project_id);
    (u.role === 'staff' ? notifyMembers : notifyStaff)(s, c.project_id, 'change', `Change ${decision}: ${c.title}`, comment || p.name);
    p.updated_at = now(); save(s);
  },

  async addPayment(pid, { label, amount, due_date }) {
    const s = load(); needStaff(s);
    s.payments.push({ id: uid(), project_id: pid, label, amount: +amount, due_date, paid_at: null }); save(s);
  },
  async markPaid(paymentId) {
    const s = load(); needStaff(s);
    const x = s.payments.find((y) => y.id === paymentId); x.paid_at = x.paid_at ? null : now(); save(s);
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
      const d = { id: uid(), project_id: pid, amount: staff && meta.amount ? +meta.amount : null, kind: staff ? (meta.kind || 'other') : 'client_upload', title: (staff && meta.title) || f.name, version: staff ? (meta.version || '') : '', size_bytes: f.size, visible_to_client: staff ? meta.visible !== false : true, approval: staff && meta.approval ? 'pending' : 'none', uploaded_by: u.id, created_at: now() };
      s.documents.push(d);
      if (staff && d.visible_to_client) notifyMembers(s, pid, d.approval === 'pending' ? 'approval_request' : 'document', `${d.approval === 'pending' ? 'Approval needed' : 'New document'}: ${d.title}`, p.name);
      if (!staff) notifyStaff(s, pid, 'document', `Client uploaded: ${d.title}`, p.name);
    });
    p.updated_at = now();
    save(s);
  },

  async decide(docId, decision, comment = '', { onBehalf = false } = {}) {
    const s = load(); const u = need(s);
    const d = s.documents.find((x) => x.id === docId);
    if (!d || !canSee(s, u, d.project_id) || d.approval !== 'pending' || u.role === 'staff') throw new Error('This document is not awaiting your approval.');
    const rights = decisionRights(d, u, s.members.filter((m) => m.project_id === d.project_id));
    if (!rights.can) throw new Error(rights.reason === 'client' ? 'Your client needs to accept this quotation.' : 'You can’t decide on this document.');
    if (rights.onBehalf && decision === 'approved' && !onBehalf) throw new Error('Please confirm you have your client’s authority to accept.');
    d.approval = decision;
    s.approvals.push({ id: uid(), document_id: docId, project_id: d.project_id, decision, comment, on_behalf: !!(rights.onBehalf && onBehalf), actor_id: u.id, created_at: now() });
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
    ['assignee_id', 'next_step', 'due_at', 'delivery_at', 'install_at'].forEach((k) => { if (k in patch) p[k] = patch[k]; });
    if ('delivery_at' in patch || 'install_at' in patch) notifyMembers(s, pid, 'dates', `${p.name}: dates confirmed`, [p.delivery_at && `Delivery ${new Date(p.delivery_at).toDateString()}`, p.install_at && `Fitting ${new Date(p.install_at).toDateString()}`].filter(Boolean).join(' · '));
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
