// Demo store: same API as the Supabase store, kept in localStorage.
// Mirrors the database triggers (timeline, notifications) so the demo behaves like production.
// Open the client portal and the staff CRM in two tabs: changes appear live in both.
import { stage, decisionRights, MEMBER_ROLES } from './core.js';
import { netOf } from './cost-net.js';

const KEY = 'bp-portal-demo-v5'; // v5: a second staff member and the stage playbook (projects audit 26.11.2026)
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
// Quotes from the CRM's quote builder: their own key and no emit(), so typing a quote never redraws other tabs.
const QKEY = 'bp-portal-demo-quotes';
let qmem = null;
const qload = () => { try { const raw = localStorage.getItem(QKEY); if (raw) return JSON.parse(raw); } catch { if (qmem) return qmem; } return qmem || { quotes: [], firm: {} }; };
const qsave = (d) => { qmem = d; try { localStorage.setItem(QKEY, JSON.stringify(d)); } catch { /* memory only */ } };
// Session is per tab, so one tab can be the architect and another the staff CRM.
let memSession = null;
const sessionId = () => { try { return sessionStorage.getItem(SESSION); } catch { return memSession; } };
const setSession = (id) => { try { id ? sessionStorage.setItem(SESSION, id) : sessionStorage.removeItem(SESSION); } catch { memSession = id; } emit(); };

function seed() {
  const anna = { id: 'u-anna', email: 'anna@example-studio.co.uk', full_name: 'Anna Clarke', company: 'Example Studio (demo)', phone: '', role: 'client', account_type: 'architect', notify_email: true, notify_digest: false };
  const ravi = { id: 'u-ravi', email: 'ravi@example-homes.co.uk', full_name: 'Ravi Patel', company: 'Example Homes (demo)', phone: '', role: 'client', account_type: 'developer', notify_email: true, notify_digest: false };
  const sam = { id: 'u-sam', email: 'sam@example.com', full_name: 'Sam Taylor', company: '', phone: '', role: 'client', account_type: 'homeowner', notify_email: true, notify_digest: false };
  const tom = { id: 'u-tom', email: 'tom@brickandpane.co.uk', full_name: 'Tom Reid', company: 'Brick & Pane', phone: '', role: 'staff', notify_email: true, notify_digest: false };
  const kate = { id: 'u-kate', email: 'kate@brickandpane.co.uk', full_name: 'Kate Nowak', company: 'Brick & Pane', phone: '', role: 'staff', notify_email: true, notify_digest: false };
  const s = { users: [anna, ravi, sam, tom, kate], projects: [], members: [], openings: [], events: [], documents: [], approvals: [], messages: [], notifications: [], internal: {}, changes: [], payments: [], invites: [], requests: [] };
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
    ['in_review', daysAgo(9, 14), 'Review started.'],
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

  const p3 = mk({ name: 'Garden room, Dulwich', location: 'SE21', riba_stage: '2 Concept', building_type: 'Extension to an existing house', start_window: '6–12 months', brief: 'Budget check for a 3-panel slider.', next_step: 'We’ll confirm receipt.' }, anna, [['submitted', daysAgo(0, 9), 'Project received.']], {});
  s.openings.push({ id: uid(), project_id: p3, ref: 'D01', system: 'lift-slide', width_mm: 4000, height_mm: 2400, config: '3T', glazing: 'd', qty: 1, notes: '' });

  const p4 = mk({ name: 'Northfield Terrace — 8 houses', location: 'Ealing, W13', riba_stage: '', building_type: 'New-build houses (8)', start_window: '6–12 months', brief: 'Rear sliders and windows for 8 houses. Budget needed for appraisal.', next_step: 'Quotation to follow.', due_at: daysAgo(1, 17) }, ravi, [['submitted', daysAgo(4)], ['in_review', daysAgo(3), 'Reviewing the schedule.']], { value: 86000, prob: 30 });
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
    { id: uid(), project_id: p2, title: 'Handle finish: satin anodised → matt black', description: 'Client prefers black handles to match the kitchen. Same hardware range, finish only.', impact: 'No change to U-value, security or weather classes. Cost: no change. Programme: no change.', status: 'proposed', raised_by: tom.id, created_at: daysAgo(1), decided_by: null, decided_at: null, comment: '' },
    { id: uid(), project_id: p5, title: 'Glass: add laminated inner pane', description: 'Homeowner asked for extra security on the garden side.', impact: 'U-value unchanged. Security improved. Cost in the revised quotation. Programme: no change.', status: 'approved', raised_by: sam.id, created_at: daysAgo(35), decided_by: sam.id, decided_at: daysAgo(34), comment: 'Yes please.' },
  );
  const pp = s.projects.find((x) => x.id === p5); pp.delivery_at = daysAhead(12); pp.install_at = daysAhead(13);
  s.payments.push(
    { id: uid(), project_id: p5, label: 'Deposit', amount: 6984, due_date: daysAgo(38), paid_at: daysAgo(37) },
    { id: uid(), project_id: p5, label: 'On delivery', amount: 13968, due_date: daysAhead(12), paid_at: null },
    { id: uid(), project_id: p5, label: 'On completion', amount: 2328, due_date: daysAhead(14), paid_at: null },
  );
  const n = (u, p, type, title, body, at, read = false) => s.notifications.push({ id: uid(), user_id: u, project_id: p, type, title, body, created_at: at, read_at: read ? at : null });
  n(anna.id, p2, 'approval_request', 'Approval needed: Shop drawings — corner slider', 'Mews house, corner glazing', daysAgo(2));
  n(anna.id, p1, 'approval_request', 'Approval needed: Quotation Q1 — Hartley Road', 'Hartley Road rear extension', daysAgo(4), true);
  n(tom.id, p3, 'new_project', 'New project: Garden room, Dulwich', 'SE21', daysAgo(0, 9));
  // UX audit 27.11.2026 (B12): a delivery today and a survey tomorrow, so Today and the calendar show something.
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  s.bookings = [
    { id: uid(), project_id: p5, kind: 'delivery', starts_on: day(0), ends_on: day(0), crew_company_id: null, staff_id: tom.id, note: 'Morning slot, parking bay booked', created_by: tom.id, created_at: daysAgo(3) },
    { id: uid(), project_id: p3, kind: 'survey', starts_on: day(1), ends_on: day(1), crew_company_id: null, staff_id: tom.id, note: '', created_by: tom.id, created_at: daysAgo(1) },
  ];
  return s;
}

// ---------- trigger mirrors ----------
// crm_log (migration 0049): who changed which link or key fact.
const log = (s, project_id, entity, entity_id, field, old_val, new_val) => { s.crmLog ||= []; s.crmLog.push({ id: s.crmLog.length + 1, project_id, entity, entity_id, field, old_val: old_val == null ? null : String(old_val), new_val: new_val == null ? null : String(new_val), actor_id: sessionId(), created_at: now() }); };
const note = (s, user_id, project_id, type, title, body = '') => s.notifications.push({ id: uid(), user_id, project_id, type, title, body, created_at: now(), read_at: null });
// The stage playbook (migration 0050), the same starting list.
const PLAYBOOK = [['in_review', 'Check the drawings and the openings; list the questions for the client', 'task', 1], ['quote_issued', 'Follow up the quotation', 'call', 5], ['accepted', 'Book the survey with the client', 'call', 1], ['accepted', 'Send the deposit invoice', 'task', 1], ['survey', 'Enter the measured sizes and photos', 'task', 1], ['drawings', 'Send the shop drawings for approval', 'task', 2], ['production', 'Place the order with the supplier', 'task', 1], ['production', 'Enter the supplier’s confirmation and production date', 'task', 3], ['delivery', 'Confirm transport, access and unloading', 'call', 1], ['delivery', 'Book the fitting crew', 'task', 1], ['installation', 'Handover: openings checked, photos taken', 'visit', 0], ['handover', 'Send the O&M manual, warranty and final invoice', 'task', 2], ['completed', 'Aftercare call', 'call', 30]];
// The five automation rules of migration 0051, with the same defaults.
const RULES = [['enquiry_unanswered', 1], ['client_silent', 7], ['chase_date', 0], ['booking_confirm', 1], ['payment_late', 3]];
const rules = (s) => { if (!s.rules) s.rules = RULES.map(([id, days]) => ({ id, days, active: true })); return s.rules; };
const playbook = (s) => { if (!s.playbook) s.playbook = PLAYBOOK.map(([to_stage, title, kind, offset_days], i) => ({ id: `pb-${i + 1}`, to_stage, title, kind, offset_days, sort: i, active: true })); return s.playbook; };
const addWorkdays = (n) => { const d = new Date(); let left = Math.max(n, 0); while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) left--; } while (!(d.getDay() % 6)) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const taskFor = (s, t) => { // on_task_assigned: a task given to someone else tells them
  if (t.assignee_id && t.assignee_id !== sessionId() && !t.done_at) { const p = s.projects.find((x) => x.id === t.project_id); note(s, t.assignee_id, t.project_id, 'task', `Task for you: ${t.title}`, p ? `${p.ref} · ${p.name}` : ''); }
};
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
// Demo mail, added on first use so older saved demo data gets it too.
function demoMail(s) {
  if (s.mail) { s.mailContacts ||= []; return; }
  const anna = s.users.find((u) => u.id === 'u-anna')?.email || 'anna@example-studio.co.uk';
  const at = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const m = (id, direction, from_addr, from_name, to, subject, body, h, attachments = []) => ({ id, account: direction === 'out' ? 'kate@brickandpane.co.uk' : 'contact@brickandpane.co.uk', folder: direction === 'out' ? 'Sent' : 'INBOX', direction, from_addr, from_name, to_addrs: to, cc_addrs: [], subject, sent_at: at(h), body_text: body, attachments, too_large: false, message_id: id + '@demo', in_reply_to: null, dismissed: false, project_id: null });
  s.mail = [
    m('mail-1', 'in', anna, 'Anna Clarke', ['contact@brickandpane.co.uk'], 'Hartley Road: threshold detail', 'Hi Kate,\n\nCould the threshold be flush with the new patio? Drawing attached.\n\nAnna', 30, [{ name: 'threshold-detail.pdf', type: 'application/pdf', size: 240000, path: null }]),
    m('mail-2', 'out', 'kate@brickandpane.co.uk', 'Kate', [anna], 'Re: Hartley Road: threshold detail', 'Hi Anna,\n\nYes: a flush threshold with a drainage channel. We will add it to the quotation.\n\nKate', 26),
    m('mail-3', 'in', 'jan@okna-demo.pl', 'Jan (Okna demo)', ['contact@brickandpane.co.uk'], 'Offer for frames', 'Dear Sir,\n\nplease find our offer attached.', 5),
  ];
  s.mailContacts = [];
}
const needStaff = (s) => { const u = need(s); if (u.role !== 'staff') throw new Error('Staff only.'); return u; };
const demoDeals = () => [
  { id: '9001', name: 'BP-261018-3F2A · Jo Bennett · Walthamstow, E17', stage: 'appointmentscheduled', stageLabel: 'Enquiry', closed: false, ref: 'BP-261018-3F2A', created: daysAgo(20), url: null, source: 'website', portal: 'BP-2026-0001', test: false,
    contact: { name: 'Jo Bennett', email: 'jo@example.com', phone: '07700 900123', company: '', address: '12 Orford Road\nLondon', postcode: 'E17 9NJ' } },
  { id: '9002', name: 'Example Homes · Hackney flats', stage: 'decisionmakerboughtin', stageLabel: 'Negotiation', closed: false, ref: null, created: daysAgo(40), url: null, source: 'cold', portal: null, test: false,
    contact: { name: 'Ravi Patel', email: 'ravi@example-homes.co.uk', phone: '', company: 'Example Homes (demo)', address: '', postcode: '' } },
  { id: '9003', name: 'Sam Taylor · sash windows', stage: 'closedlost', stageLabel: 'Closed lost', closed: true, ref: null, created: daysAgo(90), url: null, source: 'email', portal: null, test: false,
    contact: { name: 'Sam Taylor', email: 'sam@example.com', phone: '', company: '', address: '', postcode: '' } },
];

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
  async setPassword() { need(load()); },
  async resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem(QKEY); } catch { /* ignore */ } mem = null; qmem = null; load(); emit(); },

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
  async listQuotes() { needStaff(load()); return [...qload().quotes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
  async saveQuote(q) {
    needStaff(load()); const d = qload(); const i = d.quotes.findIndex((x) => x.id === q.id);
    if (i < 0) d.quotes.push(q); else d.quotes[i] = q;
    if (q.projectId) { d.meta ||= {}; d.meta[q.id] = { status: 'draft', status_source: null, ...(d.meta[q.id] || {}), id: q.id, project_id: q.projectId }; }
    qsave(d);
  },
  async deleteQuote(id) { needStaff(load()); const d = qload(); d.quotes = d.quotes.filter((x) => x.id !== id); qsave(d); },
  async getQuoteSettings() { needStaff(load()); return qload().firm || {}; },
  async saveQuoteSettings(firm) { needStaff(load()); const d = qload(); d.firm = firm; qsave(d); },
  // HubSpot in demo mode: three made-up deals, files on one of them, sends kept in this browser (no PDF stored).
  async quoteHub() { needStaff(load()); const d = qload(); return { hubspot: true, demo: true, meta: Object.values(d.meta || {}), sends: [...(d.sends || [])].reverse() }; },
  async linkQuoteDeal(id, deal) {
    needStaff(load()); const d = qload(); d.meta ||= {};
    d.meta[id] = { status: 'draft', status_source: null, ...(d.meta[id] || {}), id, hubspot_deal_id: deal?.id ?? null, hubspot_deal_name: deal?.name ?? null, hubspot_dealstage: deal?.stage ?? null };
    qsave(d);
  },
  async setQuoteStatus(id, status) { needStaff(load()); const d = qload(); d.meta ||= {}; d.meta[id] = { ...(d.meta[id] || { id }), status, status_source: 'crm' }; qsave(d); },
  async hubspot(action, body = {}) {
    needStaff(load());
    const deals = demoDeals();
    if (action === 'search') { const q = String(body.q || '').toLowerCase().trim(); return { deals: deals.filter((x) => !q || `${x.name} ${x.contact?.name} ${x.contact?.email}`.toLowerCase().includes(q)) }; }
    if (action === 'deal') {
      const deal = deals.find((x) => x.id === body.deal_id) || null;
      return { deal, missing: [], files: deal?.id === '9001' ? [{ id: 'f-demo', name: 'Bennett-estimate-Grok.pdf', ext: 'pdf', size: 182000, at: daysAgo(12), source: 'email', title: 'Your estimate from Brick & Pane' }] : [] };
    }
    if (action === 'file') return { url: null };
    if (action === 'send') return { result: 'sent', hubspot_note_id: 'demo-note', hubspot_error: null };
    throw new Error('action');
  },
  async sendQuote({ quoteId, dealId = null, projectId = null, reference, revision, kind, total, vatRate, file, sentOn, snapshot }) {
    needStaff(load()); const d = qload(); d.sends ||= []; d.meta ||= {};
    const row = { id: uid(), quote_id: quoteId, hubspot_deal_id: dealId, project_id: projectId, reference, revision, kind, total, vat_rate: vatRate, pdf_path: '', pdf_name: file.name, snapshot, sent_on: sentOn, created_at: now(), hubspot_note_id: dealId ? 'demo-note' : null, hubspot_error: null, hubspot_stage_moved: false, hubspot_attempts: 1 };
    d.sends.push(row);
    const m = d.meta[quoteId] || { id: quoteId };
    const deal = demoDeals().find((x) => x.id === dealId);
    const moved = (m.hubspot_dealstage ?? deal?.stage) === 'appointmentscheduled';
    row.hubspot_stage_moved = moved;
    d.meta[quoteId] = { ...m, hubspot_deal_id: dealId ?? m.hubspot_deal_id ?? null, project_id: projectId ?? m.project_id ?? null, hubspot_dealstage: moved ? 'presentationscheduled' : (m.hubspot_dealstage ?? deal?.stage ?? null), status: ['accepted', 'declined'].includes(m.status) ? m.status : 'sent', status_source: ['accepted', 'declined'].includes(m.status) ? m.status_source : 'crm' };
    qsave(d);
    return { ...row, result: dealId ? 'sent' : 'no deal' };
  },
  async retryQuoteSend() { return { result: 'sent', hubspot_note_id: 'demo-note', hubspot_error: null }; },
  async quotePdfUrl() { return null; },
  // Costs in demo mode: kept with the projects in this browser, no PDF stored. Demo projects have no HubSpot deal,
  // so the sale behind the margin is the Commercial value (the live order is in project_margin, migration 0031).
  async listCosts(pid) { const s = load(); needStaff(s); return (s.costs || []).filter((c) => c.project_id === pid).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
  async projectMargin(pid) {
    const s = load(); needStaff(s);
    const acc = (s.costs || []).filter((c) => c.project_id === pid && c.status === 'accepted');
    const cost = Math.round(acc.reduce((n, c) => n + netOf(c), 0) * 100) / 100;
    const sale = s.internal[pid]?.value_gbp ?? null;
    return { sale_gbp: sale, sale_source: sale == null ? null : 'value', sale_refs: null, cost_gbp: cost, accepted: acc.length,
      margin_gbp: sale == null ? null : Math.round((sale - cost) * 100) / 100, margin_pct: sale ? Math.round((sale - cost) / sale * 1000) / 10 : null };
  },
  async addCost(pid, { supplier, reference = '', category, amount, quoted_on = null, valid_until = null, note = '', file = null, status = 'received', ...more }) {
    const s = load(); needStaff(s); s.costs ||= []; // more: the comparison fields of 0039
    const { vat_in_pct = 0, delivery_gbp = 0, lead_days = null, variant = '', requested_on = null } = more;
    s.costs.push({ id: uid(), project_id: pid, supplier, reference, category, amount: +amount, currency: 'GBP', fx_to_gbp: 1, status, quoted_on, valid_until, pdf_path: null, pdf_name: file?.name || '', note, ...more, vat_in_pct, delivery_gbp, lead_days, variant, requested_on, created_at: now() });
    save(s);
  },
  async updateCost(id, pid, { file = null, ...fields }) {
    const s = load(); needStaff(s); const c = (s.costs || []).find((x) => x.id === id);
    if (c) { Object.assign(c, fields, { amount: +fields.amount }, file ? { pdf_name: file.name } : {}); save(s); }
  },
  async moveCost(id, pid) { const s = load(); needStaff(s); const c = (s.costs || []).find((x) => x.id === id); if (c && c.project_id !== pid) { log(s, pid, 'supplier_quote', id, 'project_id', c.project_id, pid); log(s, c.project_id, 'supplier_quote', id, 'project_id', c.project_id, pid); c.project_id = pid; save(s); } },
  async setCostStatus(id, status) { const s = load(); needStaff(s); const c = (s.costs || []).find((x) => x.id === id); if (c) { c.status = status; save(s); } },
  async deleteCost(id) { const s = load(); needStaff(s); s.costs = (s.costs || []).filter((x) => x.id !== id); save(s); },
  async costPdfUrl() { return null; },
  // Tasks in demo mode: kept with the projects in this browser (live order in migration 0042).
  async listTasks({ projectId = null, requestId = null, open = false } = {}) {
    const s = load(); needStaff(s);
    return (s.tasks || []).filter((t) => (!projectId || t.project_id === projectId) && (!requestId || t.request_id === requestId) && (!open || !t.done_at))
      .sort((a, b) => (!!a.done_at - !!b.done_at) || String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')) || b.created_at.localeCompare(a.created_at));
  },
  async addTask({ title, kind = 'task', note: text = '', due_on = null, assignee_id = null, project_id = null, request_id = null, done = false }) {
    const s = load(); needStaff(s); s.tasks ||= []; const me = needStaff(s).id;
    const t = { id: uid(), title, kind, note: text, due_on, assignee_id, project_id, request_id, done_at: done ? now() : null, done_by: done ? me : null, created_by: me, created_at: now(), updated_at: now() };
    s.tasks.push(t); taskFor(s, t);
    save(s);
  },
  async updateTask(id, patch) {
    const s = load(); needStaff(s); const t = (s.tasks || []).find((x) => x.id === id); if (!t) return;
    const before = { ...t };
    ['title', 'note', 'due_on', 'assignee_id', 'project_id', 'request_id'].forEach((k) => { if (k in patch) t[k] = patch[k]; });
    if (t.project_id !== before.project_id) { log(s, t.project_id, 'task', id, 'project_id', before.project_id, t.project_id); if (before.project_id && t.project_id) log(s, before.project_id, 'task', id, 'project_id', before.project_id, t.project_id); }
    if (t.assignee_id !== before.assignee_id) { log(s, t.project_id, 'task', id, 'assignee_id', before.assignee_id, t.assignee_id); taskFor(s, t); }
    t.updated_at = now(); save(s);
  },
  async setTaskDone(id, done) { const s = load(); needStaff(s); const t = (s.tasks || []).find((x) => x.id === id); if (t) { t.done_at = done ? now() : null; t.done_by = done ? (needStaff(s).id) : null; save(s); } },
  // The owner's dashboard in demo mode: the same figures as owner_dashboard (migration 0043), from this browser's data.
  async ownerDashboard(days = 90) {
    const s = load(); needStaff(s);
    const since = Date.now() - days * 864e5, t = (x) => new Date(x).getTime(), med = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return Math.round((b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) * 10) / 10; };
    const reached = (pid, st) => s.events.filter((e) => e.project_id === pid && e.to_stage === st).map((e) => t(e.created_at)).sort()[0] ?? null;
    const enq = (s.requests || []).filter((r) => t(r.created_at) >= since && r.status !== 'spam');
    const won = s.projects.filter((p) => (reached(p.id, 'accepted') ?? 0) >= since);
    const lost = s.projects.filter((p) => (reached(p.id, 'closed') ?? 0) >= since && reached(p.id, 'accepted') == null);
    const fresh = s.projects.filter((p) => t(p.created_at) >= since);
    const bySrc = {}; fresh.forEach((p) => { const k = s.internal[p.id]?.source || 'unknown'; bySrc[k] = (bySrc[k] || 0) + 1; });
    const lostBy = {}; lost.forEach((p) => { const k = (s.internal[p.id]?.lost_reason || '').trim() || '—'; lostBy[k] = (lostBy[k] || 0) + 1; });
    const quoted = s.projects.map((p) => ({ p, at: reached(p.id, 'quote_issued') })).filter((x) => x.at);
    const pays = s.payments || [], sum = (a) => Math.round(a.reduce((n, x) => n + Number(x.amount), 0) * 100) / 100;
    const months = {}; pays.filter((x) => x.paid_at && t(x.paid_at) >= Date.now() - 183 * 864e5).forEach((x) => { const k = x.paid_at.slice(0, 7); months[k] = (months[k] || 0) + Number(x.amount); });
    const staff = s.users.filter((u) => u.role === 'staff');
    return {
      days, enquiries: enq.length, enquiries_by_source: Object.entries(bySrc).map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n),
      projects_new: fresh.length, quoted: quoted.filter((x) => t(x.p.created_at) >= since).length,
      won: won.length, won_value: won.reduce((n, p) => n + (Number(s.internal[p.id]?.value_gbp) || 0), 0),
      lost: lost.length, lost_reasons: Object.entries(lostBy).map(([reason, n]) => ({ reason, n })),
      reply_hours_median: med(enq.filter((r) => r.replied_at).map((r) => (t(r.replied_at) - t(r.created_at)) / 36e5)), replied_known: enq.filter((r) => r.replied_at).length,
      unanswered: (s.requests || []).filter((r) => r.status === 'new').length,
      quote_days_median: med(quoted.filter((x) => x.at >= since).map((x) => (x.at - t(x.p.created_at)) / 864e5)),
      in_play: [], in_play_value: 0, margin: { projects: 0, sale: 0, cost: 0, low: [] },
      paid: sum(pays.filter((x) => x.paid_at && t(x.paid_at) >= since)), due_30: sum(pays.filter((x) => !x.paid_at && x.due_date && t(x.due_date) >= Date.now() && t(x.due_date) < Date.now() + 30 * 864e5)),
      overdue: sum(pays.filter((x) => !x.paid_at && x.due_date && t(x.due_date) < Date.now())),
      paid_by_month: Object.entries(months).sort().map(([month, gbp]) => ({ month, gbp })),
      workload: staff.map((u) => ({ id: u.id, name: u.full_name, projects: s.projects.filter((p) => p.assignee_id === u.id && !['completed', 'closed', 'on_hold'].includes(p.stage)).length, tasks: (s.tasks || []).filter((x) => x.assignee_id === u.id && !x.done_at).length })),
    };
  },
  // Companies and people in demo mode (live: migration 0044).
  async listCompanies() { const s = load(); needStaff(s); return [...(s.companies || [])].sort((a, b) => a.name.localeCompare(b.name)); },
  async listPeople() { const s = load(); needStaff(s); return [...(s.people || [])].sort((a, b) => a.full_name.localeCompare(b.full_name)); },
  async getCompany(id) {
    const s = load(); needStaff(s); const company = (s.companies || []).find((c) => c.id === id) || null;
    const projects = (s.projectCompanies || []).filter((l) => l.company_id === id).map((l) => ({ ...s.projects.find((p) => p.id === l.project_id), role: l.role })).filter((p) => p.id);
    return { company, people: (s.people || []).filter((p) => p.company_id === id), projects, quotes: (s.costs || []).filter((c) => c.company_id === id) };
  },
  async saveCompany({ id = null, ...c }) {
    const s = load(); needStaff(s); s.companies ||= [];
    const key = (x) => `${x.name.trim().toLowerCase()}|${x.kind}`;
    if (s.companies.some((x) => x.id !== id && key(x) === key({ kind: 'other', ...c }))) throw new Error('A company with this name and kind already exists.');
    let row = id && s.companies.find((x) => x.id === id);
    if (row) Object.assign(row, c, { updated_at: now() }); else { row = { id: uid(), kind: 'other', website: '', email: '', phone: '', address: '', notes: '', ...c, created_at: now(), updated_at: now() }; s.companies.push(row); }
    save(s); return row;
  },
  async deleteCompany(id) {
    const s = load(); needStaff(s); s.companies = (s.companies || []).filter((c) => c.id !== id);
    (s.people || []).forEach((p) => { if (p.company_id === id) p.company_id = null; }); s.projectCompanies = (s.projectCompanies || []).filter((l) => l.company_id !== id); save(s);
  },
  async savePerson({ id = null, ...p }) {
    const s = load(); needStaff(s); s.people ||= []; let row = id && s.people.find((x) => x.id === id);
    if (row) Object.assign(row, p); else { row = { id: uid(), job_title: '', email: '', phone: '', notes: '', ...p, created_at: now() }; s.people.push(row); }
    save(s); return row;
  },
  async deletePerson(id) { const s = load(); needStaff(s); s.people = (s.people || []).filter((p) => p.id !== id); save(s); },
  async projectCompanies(pid) { const s = load(); needStaff(s); return (s.projectCompanies || []).filter((l) => l.project_id === pid).map((l) => ({ role: l.role, company: (s.companies || []).find((c) => c.id === l.company_id) })).filter((x) => x.company); },
  async linkCompany(pid, companyId, role) {
    const s = load(); needStaff(s); s.projectCompanies ||= [];
    if (s.projectCompanies.some((l) => l.project_id === pid && l.company_id === companyId && l.role === role)) throw new Error('This company is already on the project in that role.');
    s.projectCompanies.push({ project_id: pid, company_id: companyId, role, created_at: now() }); log(s, pid, 'company', companyId, 'added', null, role); save(s);
  },
  async unlinkCompany(pid, companyId, role) { const s = load(); needStaff(s); s.projectCompanies = (s.projectCompanies || []).filter((l) => !(l.project_id === pid && l.company_id === companyId && l.role === role)); log(s, pid, 'company', companyId, 'removed', role, null); save(s); },
  async setCompanyRole(pid, companyId, from, to) {
    const s = load(); needStaff(s); const l = (s.projectCompanies || []).find((x) => x.project_id === pid && x.company_id === companyId && x.role === from); if (!l || from === to) return;
    if (s.projectCompanies.some((x) => x.project_id === pid && x.company_id === companyId && x.role === to)) throw new Error('This company is already on the project in that role.');
    l.role = to; log(s, pid, 'company', companyId, 'role', from, to); save(s);
  },
  // People on a project (migration 0049): one of them the main contact.
  async projectPeople(pid) { const s = load(); needStaff(s); return (s.projectPeople || []).filter((l) => l.project_id === pid).map((l) => ({ role: l.role, is_main: l.is_main, person: (s.people || []).find((p) => p.id === l.person_id) })).filter((x) => x.person); },
  async linkPerson(pid, personId, role = 'contact', isMain = false) {
    const s = load(); needStaff(s); s.projectPeople ||= [];
    if (s.projectPeople.some((l) => l.project_id === pid && l.person_id === personId)) throw new Error('This person is already on the project.');
    if (isMain) s.projectPeople.forEach((l) => { if (l.project_id === pid) l.is_main = false; });
    s.projectPeople.push({ project_id: pid, person_id: personId, role, is_main: !!isMain, created_at: now() }); log(s, pid, 'person', personId, 'added', null, role); save(s);
  },
  async updatePersonLink(pid, personId, { role, is_main }) {
    const s = load(); needStaff(s); const l = (s.projectPeople || []).find((x) => x.project_id === pid && x.person_id === personId); if (!l) return;
    if (is_main) s.projectPeople.forEach((x) => { if (x.project_id === pid) x.is_main = false; });
    if (role && role !== l.role) { log(s, pid, 'person', personId, 'role', l.role, role); l.role = role; }
    if (is_main !== undefined) l.is_main = !!is_main; save(s);
  },
  async unlinkPerson(pid, personId) { const s = load(); needStaff(s); const l = (s.projectPeople || []).find((x) => x.project_id === pid && x.person_id === personId); s.projectPeople = (s.projectPeople || []).filter((x) => x !== l); if (l) log(s, pid, 'person', personId, 'removed', l.role, null); save(s); },
  async personProjects(personId) { const s = load(); needStaff(s); return (s.projectPeople || []).filter((l) => l.person_id === personId).map((l) => ({ role: l.role, is_main: l.is_main, project: s.projects.find((p) => p.id === l.project_id) })).filter((x) => x.project); },
  async crmLog({ projectId = null, entity = null, entityId = null } = {}) {
    const s = load(); needStaff(s);
    return (s.crmLog || []).filter((l) => (!projectId || l.project_id === projectId) && (!entity || l.entity === entity) && (!entityId || l.entity_id === entityId))
      .map((l) => ({ ...l, actor: s.users.find((u) => u.id === l.actor_id) })).sort((a, b) => b.id - a.id).slice(0, 300);
  },
  // attach_enquiry (migration 0049): the enquiry joins an existing project; no new project.
  async attachEnquiry(rid, pid) {
    const s = load(); const u = needStaff(s); const r = (s.requests || []).find((x) => x.id === rid);
    if (!r) throw new Error('Enquiry not found.'); if (r.project_id) throw new Error('This enquiry is already on a project.');
    const p = s.projects.find((x) => x.id === pid); if (!p) throw new Error('Project not found.');
    const n = s.openings.filter((o) => o.project_id === pid).length;
    (r.openings || []).forEach((o, i) => s.openings.push({ id: uid(), project_id: pid, ref: o.ref || `E${String(n + i + 1).padStart(2, '0')}`, system: o.system || 'windows', material: ['alu', 'timber', 'pvc', 'alutimber'].includes(o.material) ? o.material : '', width_mm: o.width_mm ?? null, height_mm: o.height_mm ?? null, config: o.config || '', glazing: o.glazing || '', qty: o.qty || 1, notes: o.note || '' }));
    (s.tasks || []).forEach((t) => { if (t.request_id === rid) { t.project_id = pid; t.request_id = null; } });
    if (r.message || r.staff_note) s.messages.push({ id: uid(), project_id: pid, author_id: u.id, body: `Enquiry ${r.ref || ''} added to this project.${r.message ? `\n\n${r.message}` : ''}${r.staff_note ? `\n\nNote: ${r.staff_note}` : ''}`, internal: true, created_at: now() });
    const email = r.email.toLowerCase();
    const isStaff = s.users.some((x) => x.email.toLowerCase() === email && x.role === 'staff');
    const member = s.members.some((m) => m.project_id === pid && s.users.find((x) => x.id === m.user_id)?.email.toLowerCase() === email);
    if (!isStaff && !member && !s.invites.some((i) => i.project_id === pid && i.email === email)) s.invites.push({ id: uid(), project_id: pid, email, role: 'client', invited_by: u.id, created_at: now() });
    log(s, pid, 'enquiry', rid, 'project_id', null, pid);
    Object.assign(r, { status: 'converted', project_id: pid }); save(s); return pid;
  },
  async linkEnquiryContact(rid, companyId, personId) { const s = load(); needStaff(s); const r = (s.requests || []).find((x) => x.id === rid); if (!r) throw new Error('Enquiry not found.'); Object.assign(r, { company_id: companyId, person_id: personId }); save(s); },
  async mergeCompanies(keep, drop) {
    const s = load(); needStaff(s); if (keep === drop) throw new Error('Choose two different companies.');
    const k = (s.companies || []).find((c) => c.id === keep), d = (s.companies || []).find((c) => c.id === drop); if (!k || !d) throw new Error('Company not found.');
    (s.people || []).forEach((p) => { if (p.company_id === drop) p.company_id = keep; });
    (s.costs || []).forEach((c) => { if (c.company_id === drop) c.company_id = keep; });
    (s.requests || []).forEach((r) => { if (r.company_id === drop) r.company_id = keep; });
    s.projectCompanies = (s.projectCompanies || []).map((l) => (l.company_id === drop ? { ...l, company_id: keep } : l)).filter((l, i, a) => a.findIndex((x) => x.project_id === l.project_id && x.company_id === l.company_id && x.role === l.role) === i);
    ['website', 'email', 'phone', 'address'].forEach((f) => { if (!k[f]) k[f] = d[f] || ''; });
    if (d.notes && d.notes !== k.notes) k.notes = [k.notes, d.notes].filter(Boolean).join('\n');
    k.do_not_contact = !!(k.do_not_contact || d.do_not_contact); if (k.source === 'cold' && d.source && d.source !== 'cold') k.source = d.source;
    s.companies = s.companies.filter((c) => c.id !== drop); log(s, null, 'company', keep, 'merged', d.name, k.name); save(s);
  },
  async mergePeople(keep, drop) {
    const s = load(); needStaff(s); if (keep === drop) throw new Error('Choose two different people.');
    const k = (s.people || []).find((p) => p.id === keep), d = (s.people || []).find((p) => p.id === drop); if (!k || !d) throw new Error('Person not found.');
    s.projectPeople = (s.projectPeople || []).map((l) => (l.person_id === drop ? { ...l, person_id: keep } : l)).filter((l, i, a) => a.findIndex((x) => x.project_id === l.project_id && x.person_id === l.person_id) === i);
    (s.requests || []).forEach((r) => { if (r.person_id === drop) r.person_id = keep; });
    ['job_title', 'email', 'phone'].forEach((f) => { if (!k[f]) k[f] = d[f] || ''; }); if (!k.company_id) k.company_id = d.company_id || null;
    k.do_not_contact = !!(k.do_not_contact || d.do_not_contact);
    s.people = s.people.filter((p) => p.id !== drop); log(s, null, 'person', keep, 'merged', d.full_name, k.full_name); save(s);
  },
  // Bookings (migration 0050): surveys, deliveries, fitting and service visits for the calendar.
  async listBookings({ from = null, to = null, projectId = null } = {}) {
    const s = load(); needStaff(s);
    return (s.bookings || []).filter((b) => (!projectId || b.project_id === projectId) && (!from || b.ends_on >= from) && (!to || b.starts_on <= to)).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  },
  async saveBooking({ id = null, ...b }) {
    const s = load(); needStaff(s); s.bookings ||= [];
    const row = { kind: b.kind || 'install', starts_on: b.starts_on, ends_on: b.ends_on || b.starts_on, crew_company_id: b.crew_company_id || null, staff_id: b.staff_id || null, note: b.note || '' };
    if (!row.starts_on || row.ends_on < row.starts_on) throw new Error('The end date cannot be before the start.');
    const old = id && s.bookings.find((x) => x.id === id);
    if (old) { Object.assign(old, row, { updated_at: now() }); log(s, old.project_id, 'booking', id, 'starts_on', null, row.starts_on); }
    else { const nb = { id: uid(), project_id: b.project_id, ...row, created_by: sessionId(), created_at: now() }; s.bookings.push(nb); log(s, b.project_id, 'booking', nb.id, 'added', null, `${row.kind} · ${row.starts_on}`); }
    save(s);
  },
  async deleteBooking(id) { const s = load(); needStaff(s); const b = (s.bookings || []).find((x) => x.id === id); s.bookings = (s.bookings || []).filter((x) => x.id !== id); if (b) log(s, b.project_id, 'booking', id, 'removed', `${b.kind} · ${b.starts_on}`, null); save(s); },
  async listPlaybook() { const s = load(); needStaff(s); return [...playbook(s)]; }, // read only: saving here would redraw the page
  // Automation rules (migration 0051): the same five rules as run_rules(), run here when someone asks.
  async listRules() { const s = load(); needStaff(s); return rules(s).map((r) => ({ ...r })); },
  async saveRule(id, patch) {
    const s = load(); needStaff(s); const r = rules(s).find((x) => x.id === id); if (!r) return;
    if ('days' in patch) { const d = Number(patch.days); if (!Number.isInteger(d) || d < 0 || d > 365) throw new Error('Days must be a whole number from 0 to 365.'); r.days = d; }
    if ('active' in patch) r.active = !!patch.active;
    save(s);
  },
  async ruleRuns() { const s = load(); needStaff(s); return [...(s.ruleRuns || [])]; },
  async runRules() {
    const s = load(); const me = needStaff(s).id; s.tasks ||= []; s.ruleRuns ||= [];
    const on = (id) => rules(s).find((r) => r.id === id && r.active);
    const ago = (iso, d) => iso && Date.now() - new Date(iso).getTime() > d * 864e5;
    const today = new Date().toISOString().slice(0, 10), plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
    const done = (rule, obj, cycle = '') => s.ruleRuns.some((x) => x.rule_id === rule && x.object_id === obj && x.cycle === cycle);
    let n = 0;
    const make = (rule, obj, cycle, t) => { const task = { id: uid(), kind: 'task', note: '', due_on: today, assignee_id: null, project_id: null, request_id: null, done_at: null, done_by: null, created_by: null, created_at: now(), updated_at: now(), rule_id: rule, ...t }; s.tasks.push(task); taskFor(s, task); s.ruleRuns.push({ rule_id: rule, object_id: obj, cycle, task_id: task.id, created_at: now() }); n += 1; };
    let r = on('enquiry_unanswered');
    if (r) s.requests.filter((q) => q.status === 'new' && ago(q.created_at, r.days) && !ago(q.created_at, 30) && !done(r.id, q.id)).forEach((q) => make(r.id, q.id, '', { title: `Reply to the enquiry from ${q.name || 'the website'}${q.company ? `, ${q.company}` : ''}`, kind: 'email', request_id: q.id }));
    r = on('client_silent');
    if (r) s.projects.filter((p) => ['clarification', 'quote_issued', 'drawings'].includes(p.stage) && !s.internal[p.id]?.waiting_on && ago(p.stage_changed_at, Math.max(1, r.days)) && !ago(p.stage_changed_at, 60) && !done(r.id, p.id, p.stage_changed_at.slice(0, 10)))
      .forEach((p) => make(r.id, p.id, p.stage_changed_at.slice(0, 10), { title: `Chase the client: no answer for ${r.days} days`, kind: 'call', project_id: p.id, assignee_id: p.assignee_id }));
    r = on('chase_date');
    if (r) s.projects.filter((p) => { const i = s.internal[p.id]; return i?.waiting_on && i.chase_on && i.chase_on <= today && !['completed', 'closed', 'on_hold'].includes(p.stage) && !done(r.id, p.id, i.chase_on); })
      .forEach((p) => { const i = s.internal[p.id]; make(r.id, p.id, i.chase_on, { title: `Chase ${({ client: 'the client', supplier: 'the supplier' })[i.waiting_on] || 'them'}`, kind: 'call', due_on: i.chase_on, project_id: p.id, assignee_id: p.assignee_id }); });
    r = on('booking_confirm');
    if (r) (s.bookings || []).filter((b) => ['survey', 'delivery', 'install'].includes(b.kind) && b.starts_on >= today && b.starts_on <= plus(r.days) && !done(r.id, b.id, b.starts_on))
      .forEach((b) => { const p = s.projects.find((x) => x.id === b.project_id); make(r.id, b.id, b.starts_on, { title: `Confirm the ${b.kind === 'install' ? 'fitting' : b.kind} on ${b.starts_on} with the client and the crew`, kind: 'call', project_id: b.project_id, assignee_id: b.staff_id || p?.assignee_id || null }); });
    r = on('payment_late');
    if (r) (s.payments || []).filter((y) => !y.paid_at && y.due_date && ago(y.due_date, r.days) && !ago(y.due_date, 60) && !done(r.id, y.id))
      .forEach((y) => { const p = s.projects.find((x) => x.id === y.project_id); make(r.id, y.id, '', { title: `Payment reminder: ${y.label}`, kind: 'email', project_id: y.project_id, assignee_id: p?.assignee_id || null }); });
    if (n) save(s);
    return n;
  },
  async savePlaybook({ id = null, ...b }) { const s = load(); needStaff(s); const list = playbook(s); const row = id && list.find((x) => x.id === id); if (row) Object.assign(row, b); else list.push({ id: uid(), kind: 'task', offset_days: 1, sort: list.length, active: true, ...b }); save(s); },
  async deletePlaybook(id) { const s = load(); needStaff(s); s.playbook = playbook(s).filter((x) => x.id !== id); save(s); },
  async deleteTask(id) { const s = load(); needStaff(s); s.tasks = (s.tasks || []).filter((x) => x.id !== id); save(s); },
  // Mail in demo mode: a few made-up mails, matched to projects the way mail_list does it (migration 0035).
  async listMail({ pid = null, unassigned = false } = {}) {
    const s = load(); needStaff(s); demoMail(s);
    const addrs = (m) => [m.from_addr, ...m.to_addrs, ...m.cc_addrs].map((a) => a.toLowerCase());
    const known = [
      ...s.members.map((mb) => ({ addr: s.users.find((u) => u.id === mb.user_id && u.role !== 'staff')?.email, pid: mb.project_id })),
      ...s.invites.map((i) => ({ addr: i.email, pid: i.project_id })),
      ...(s.requests || []).filter((r) => r.project_id).map((r) => ({ addr: r.email, pid: r.project_id })),
      ...s.mailContacts.filter((c) => c.project_id).map((c) => ({ addr: c.match, pid: c.project_id })),
    ].filter((k) => k.addr).map((k) => ({ ...k, addr: k.addr.toLowerCase() }));
    const words = s.mailKeywords || [];
    return s.mail.map((m) => ({ ...m, projects: m.project_id ? [m.project_id] : [...new Set([...known.filter((k) => addrs(m).some((a) => a === k.addr || (k.addr.startsWith('@') && a.endsWith(k.addr)))).map((k) => k.pid), ...words.filter((w) => m.subject.toLowerCase().includes(w.keyword.toLowerCase())).map((w) => w.project_id)])] }))
      .filter((m) => (!pid || m.projects.includes(pid)) && (!unassigned || (!m.projects.length && !m.dismissed)))
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  },
  // Sending in demo mode: nothing leaves the browser; the mail is filed on the project like a sent one.
  async sendMail({ from, to, cc = '', subject, text, reply_to = null, project_id = null, confirm }) {
    const s = load(); const u = needStaff(s); demoMail(s);
    if (confirm !== true) throw new Error('Tick that you checked the recipients and the text.');
    const list = (v) => String(v || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    s.mail.unshift({ id: uid(), account: from, folder: 'CRM', direction: 'out', from_addr: from, from_name: u.full_name, to_addrs: list(to), cc_addrs: list(cc), subject, body_text: text, sent_at: now(), attachments: [], project_id, in_reply_to: reply_to, dismissed: false });
    save(s); return { result: 'sent' };
  },
  async mailAccounts() { return [{ address: 'contact@brickandpane.co.uk', mode: 'all', last_run_at: now(), last_error: null }, { address: 'kate@brickandpane.co.uk', mode: 'known', last_run_at: now(), last_error: null }]; },
  async assignMail(id, project_id) { const s = load(); needStaff(s); demoMail(s); const m = s.mail.find((x) => x.id === id); if (m) { if (m.project_id !== project_id) { log(s, project_id, 'mail', id, 'project_id', m.project_id, project_id); if (m.project_id) log(s, m.project_id, 'mail', id, 'project_id', m.project_id, project_id); } m.project_id = project_id; save(s); } },
  async dismissMail(id) { const s = load(); needStaff(s); demoMail(s); const m = s.mail.find((x) => x.id === id); if (m) { m.dismissed = true; save(s); } },
  async listMailContacts() { const s = load(); needStaff(s); demoMail(s); return [...s.mailContacts]; },
  async addMailContact(c) { const s = load(); needStaff(s); demoMail(s); if (s.mailContacts.some((x) => x.match === c.match)) throw new Error('That contact is already there.'); s.mailContacts.push({ id: uid(), ...c, created_at: now() }); save(s); },
  async deleteMailContact(id) { const s = load(); needStaff(s); s.mailContacts = (s.mailContacts || []).filter((x) => x.id !== id); save(s); },
  async listMailKeywords(pid) { const s = load(); needStaff(s); return (s.mailKeywords || []).filter((k) => k.project_id === pid); },
  async addMailKeyword(pid, keyword) { const s = load(); needStaff(s); s.mailKeywords ||= []; if (s.mailKeywords.some((k) => k.project_id === pid && k.keyword.toLowerCase() === keyword.toLowerCase())) throw new Error('That keyword is already there.'); s.mailKeywords.push({ id: uid(), project_id: pid, keyword }); save(s); },
  async deleteMailKeyword(id) { const s = load(); needStaff(s); s.mailKeywords = (s.mailKeywords || []).filter((k) => k.id !== id); save(s); },
  async mailFileUrl() { return null; },
  async listRequests() {
    const s = load(); needStaff(s);
    return [...(s.requests || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async updateRequest(id, { status, staff_note }) {
    const s = load(); needStaff(s);
    const r0 = (s.requests || []).find((r) => r.id === id); if (r0 && r0.status === 'new' && status !== 'new' && !r0.replied_at) r0.replied_at = now(); Object.assign(r0, { status, staff_note }); save(s);
  },
  async requestFileUrl() { return null; }, // demo: files are not stored
  // Mirrors convert_request() / convert_enquiry() in migrations 0008 and 0024 (demo sends no email).
  async convertRequest(id) {
    const s = load(); const staff = needStaff(s);
    const r = (s.requests || []).find((x) => x.id === id);
    if (!r) throw new Error('Enquiry not found.');
    if (r.project_id) return { project_id: r.project_id, client: 'linked', emailed: false };
    const client = s.users.find((u) => u.email.toLowerCase() === r.email.toLowerCase() && u.role !== 'staff');
    const staffEmail = s.users.some((u) => u.email.toLowerCase() === r.email.toLowerCase() && u.role === 'staff');
    const pid = uid(); const t = now();
    s.projects.push({ id: pid, ref: `BP-2026-${String(s.projects.length + 1).padStart(4, '0')}`, name: `${r.company || r.name}${r.location ? `, ${r.location}` : ''}`, owner_id: client?.id || staff.id, assignee_id: staff.id, stage: 'submitted', stage_changed_at: t, created_at: t, updated_at: t, next_step: 'We’ll confirm receipt.', location: r.location || '', riba_stage: r.riba_stage || '', building_type: r.building || '', systems: (r.systems || []).filter((x) => x !== 'unsure'), start_window: r.start || '', brief: r.message || '' });
    if (client) s.members.push({ project_id: pid, user_id: client.id, role: 'owner' });
    else if (!staffEmail) s.invites.push({ id: uid(), project_id: pid, email: r.email.toLowerCase(), role: 'owner', invited_by: staff.id, created_at: t });
    s.internal[pid] = { value_gbp: null, probability: null, notes: r.staff_note || '' };
    s.events.push({ id: uid(), project_id: pid, from_stage: null, to_stage: 'submitted', note: 'Project received.', visible_to_client: true, actor_id: staff.id, created_at: t });
    const list = r.openings?.length ? r.openings : r.opening_width_mm ? [{ ref: 'D01', system: (r.systems || []).find((x) => x !== 'unsure') || 'lift-slide', width_mm: r.opening_width_mm, height_mm: r.opening_height_mm }] : [];
    list.forEach((o) => s.openings.push({ id: uid(), project_id: pid, ref: o.ref || '', system: o.system || 'windows', material: ['alu', 'timber', 'pvc', 'alutimber'].includes(o.material) ? o.material : '', width_mm: o.width_mm ?? null, height_mm: o.height_mm ?? null, config: o.config || '', glazing: o.glazing || '', qty: o.qty || 1, notes: o.note || '' }));
    Object.assign(r, { status: 'converted', project_id: pid });
    save(s);
    return { project_id: pid, client: client ? 'linked' : staffEmail ? 'staff' : 'invited', emailed: false };
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
    const p = { id, ref: `BP-2026-${String(s.projects.length + 1).padStart(4, '0')}`, owner_id: u.id, assignee_id: null, stage: 'submitted', stage_changed_at: t, created_at: t, updated_at: t, next_step: 'We’ll confirm receipt.', ...data };
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
    // on_internal_mention (0050): "@Kate" in an internal note reaches Kate.
    if (isInternal) s.users.filter((x) => x.role === 'staff' && x.id !== u.id && x.full_name && new RegExp(`(^|[^\\w])@${x.full_name.split(' ')[0].replace(/[^\w]/g, '')}(\\W|$)`, 'i').test(body))
      .forEach((x) => note(s, x.id, pid, 'mention', `You were mentioned: ${p.ref} · ${p.name}`, body.slice(0, 200)));
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

  async setStage(pid, to, { note: text = '', visible = true, next_step, due_at } = {}) {
    const s = load(); const u = needStaff(s);
    const p = s.projects.find((x) => x.id === pid);
    const t = now();
    s.events.push({ id: uid(), project_id: pid, from_stage: p.stage, to_stage: to, note: text, visible_to_client: visible, actor_id: u.id, created_at: t });
    // on_stage_playbook (0050): the stage's tasks, once per project, for the account manager.
    s.tasks ||= []; const who = p.assignee_id || u.id;
    playbook(s).filter((b) => b.active && b.to_stage === to && !s.tasks.some((x) => x.project_id === pid && x.template_id === b.id)).forEach((b) => {
      const tk = { id: uid(), title: b.title, kind: b.kind, note: '', due_on: addWorkdays(b.offset_days), assignee_id: who, project_id: pid, request_id: null, template_id: b.id, done_at: null, done_by: null, created_by: u.id, created_at: t, updated_at: t };
      s.tasks.push(tk); taskFor(s, tk);
    });
    if (due_at !== undefined && (due_at || null) !== (p.due_at || null)) log(s, pid, 'project', pid, 'due_at', p.due_at, due_at);
    Object.assign(p, { stage: to, stage_changed_at: t, updated_at: t });
    if (next_step !== undefined) p.next_step = next_step;
    p.due_at = due_at !== undefined ? due_at : null;
    if (visible) notifyMembers(s, pid, 'stage', `${p.name}: ${stage(to).label}`, text);
    save(s);
  },

  async updateProject(pid, patch) {
    const s = load(); needStaff(s);
    const p = s.projects.find((x) => x.id === pid);
    ['assignee_id', 'due_at', 'delivery_at', 'install_at'].forEach((k) => { if (k in patch && (patch[k] || null) !== (p[k] || null)) log(s, pid, 'project', pid, k, p[k], patch[k]); });
    // on_assignee_change (0050): the new account manager hears that the project is theirs.
    if ('assignee_id' in patch && patch.assignee_id && patch.assignee_id !== p.assignee_id && patch.assignee_id !== sessionId()) note(s, patch.assignee_id, pid, 'assigned', `You now look after: ${p.name}`, p.ref);
    ['assignee_id', 'next_step', 'due_at', 'delivery_at', 'install_at'].forEach((k) => { if (k in patch) p[k] = patch[k]; });
    if ('delivery_at' in patch || 'install_at' in patch) notifyMembers(s, pid, 'dates', `${p.name}: dates updated`, [p.delivery_at && `Delivery ${new Date(p.delivery_at).toDateString()}`, p.install_at && `Fitting ${new Date(p.install_at).toDateString()}`].filter(Boolean).join(' · '));
    p.updated_at = now(); save(s);
  },
  async updateInternal(pid, patch) {
    const s = load(); needStaff(s); const i = s.internal[pid] ||= {};
    ['waiting_on', 'value_gbp', 'probability'].forEach((k) => { if (k in patch && (patch[k] ?? null) !== (i[k] ?? null)) log(s, pid, 'project', pid, k, i[k], patch[k]); });
    Object.assign(i, patch); save(s);
  },
  async listStaff() { return load().users.filter((u) => u.role === 'staff'); },

  async notifications() { const s = load(); const u = me(s); return u ? s.notifications.filter((n) => n.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50) : []; },
  async markRead(ids = 'all') {
    const s = load(); const u = need(s); const t = now();
    s.notifications.forEach((n) => { if (n.user_id === u.id && !n.read_at && (ids === 'all' || ids.includes(n.id))) n.read_at = t; });
    save(s);
  },
  async fileUrl() { return null; }, // demo: files are not stored
  // UX audit U3 (migration 0053): snoozed notifications, mail dealt with, the team's own project fields.
  async snoozeNote(id, until) { const s = load(); const u = need(s); const n = s.notifications.find((x) => x.id === id && x.user_id === u.id); if (n) { n.snooze_until = until; save(s); } },
  async markMailHandled(id, on = true) { const s = load(); const u = needStaff(s); demoMail(s); const m = s.mail.find((x) => x.id === id); if (m) { m.handled_at = on ? now() : null; m.handled_by = on ? u.id : null; save(s); } },
  async listFields() { const s = load(); needStaff(s); return [...(s.fields || [])].sort((a, b) => a.sort - b.sort); },
  async saveField(f) {
    const s = load(); needStaff(s); s.fields ||= [];
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(f.key || '')) throw new Error('A field needs a short name of letters.');
    const row = { key: f.key, label: f.label, kind: f.kind || 'text', options: f.options || [], sort: f.sort || 0 };
    const i = s.fields.findIndex((x) => x.key === f.key); if (i >= 0) s.fields[i] = row; else s.fields.push(row); save(s);
  },
  async deleteField(key) { const s = load(); needStaff(s); s.fields = (s.fields || []).filter((x) => x.key !== key); save(s); },
};
