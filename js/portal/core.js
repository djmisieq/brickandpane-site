// Shared definitions and helpers for the project portal and the internal CRM.
import { tr, locale } from './i18n.js';

// Pipeline. `court` says who the ball is with: 'us' (Brick & Pane) or 'you' (the client).
export const STAGES = [
  { id: 'submitted', staff: 'New project. Assign an owner and confirm receipt to the client.', homeLabel: 'Request received', home: 'We have your request and will be in touch.', label: 'Received', phase: 'Quotation', court: 'us', client: 'We have your project and will review it.' },
  { id: 'in_review', staff: 'Check sizes, panel weights, compliance and interfaces, then price it.', homeLabel: 'Preparing your price', home: "We're checking your sizes and preparing your price.", label: 'Technical review', phase: 'Quotation', court: 'us', client: "We're checking sizes, panel weights, compliance and interfaces." },
  { id: 'clarification', staff: 'Waiting for the client to answer our questions in Messages.', homeLabel: 'A question for you', home: 'We need a quick answer before we can finish your price. See Messages.', label: 'Questions for you', staffLabel: 'Questions to client', phase: 'Quotation', court: 'you', client: 'We need a few answers before we can price accurately. See Messages.' },
  { id: 'quote_issued', staff: 'Quotation issued. Waiting for the client to accept or ask for changes.', homeLabel: 'Your quote is ready', home: 'Your quote is in Documents. Accept it there or ask us to change something.', label: 'Quote issued', phase: 'Quotation', court: 'you', client: 'Your quotation is in Documents. Accept it or ask for changes there.' },
  { id: 'accepted', staff: 'Order confirmed. Book the site survey.', homeLabel: 'Order confirmed', home: "Thank you for your order. We'll book a survey at your home.", label: 'Order confirmed', phase: 'Design', court: 'us', client: 'Thank you. We are booking your site survey.' },
  { id: 'survey', staff: 'Survey the openings and delivery route, then prepare shop drawings.', homeLabel: 'Home survey', home: "We measure the openings and check how we'll get the glass in.", label: 'Site survey', phase: 'Design', court: 'us', client: 'We survey the openings and the delivery route, then draw the shop drawings.' },
  { id: 'drawings', staff: 'Shop drawings issued. Waiting for client review and sign-off.', homeLabel: 'Approve your drawings', home: 'Your final drawings are ready. Please approve them in Documents.', label: 'Drawings for approval', phase: 'Design', court: 'you', client: 'Shop drawings are ready. Approve them or request changes in Documents.' },
  { id: 'production', staff: 'In production to the signed drawings. Confirm delivery and fitting dates.', homeLabel: 'Being made', home: 'Your doors and windows are being made to your approved drawings.', label: 'In production', phase: 'Delivery', court: 'us', client: 'Your doors and windows are being made to the signed drawings.' },
  { id: 'delivery', staff: 'Delivery booked. Confirm the lifting plan and access.', homeLabel: 'Delivery booked', home: 'Your delivery date is confirmed.', label: 'Delivery scheduled', phase: 'Delivery', court: 'us', client: 'Delivery date and lifting plan are confirmed.' },
  { id: 'installation', staff: 'Installation is under way on site.', homeLabel: 'Installation', home: 'Your doors and windows are being fitted.', label: 'Installation', phase: 'Delivery', court: 'us', client: 'Installation is under way on site.' },
  { id: 'handover', staff: 'Upload the O&M manual, declarations of performance and guarantee.', homeLabel: 'Finished — your documents', home: 'Your guarantee, certificates and care guide are in Documents.', label: 'Handover', phase: 'Delivery', court: 'us', client: 'O&M manual, declarations of performance and the guarantee are in Documents.' },
  { id: 'completed', staff: 'Complete. Schedule the first-season check-in.', homeLabel: 'Completed', home: "All done. We'll check in after the first season.", label: 'Completed', phase: 'Delivery', court: 'none', client: 'Project complete. We will check in after the first season.' },
];
export const SIDE_STAGES = [
  { id: 'on_hold', label: 'On hold', court: 'none', client: 'This project is paused.' },
  { id: 'closed', label: 'Closed', court: 'none', client: 'This project is closed.' },
];
export const ALL_STAGES = [...STAGES, ...SIDE_STAGES];
// Prospects: architects and companies we want to work with (migration 0014). Staff only.
export const PROSPECT_STAGES = [
  { id: 'to_contact', label: 'To contact' },
  { id: 'contacted', label: 'First contact made' },
  { id: 'talking', label: 'Talking / meeting' },
  { id: 'first_project', label: 'First enquiry or project' },
  { id: 'partner', label: 'Working together' },
  { id: 'not_now', label: 'Not now' },
];
export const PROSPECT_KINDS = { architect: 'Architect', developer: 'Developer', contractor: 'Builder / contractor', designer: 'Interior designer', other: 'Other' };
export const prospectStage = (id) => PROSPECT_STAGES.find((s) => s.id === id) || PROSPECT_STAGES[0];
// A follow-up date today or earlier on a prospect still in play.
export const prospectDue = (c) => !!c.next_at && !['partner', 'not_now'].includes(c.stage) && c.next_at <= new Date().toISOString().slice(0, 10);
export const PHASES = ['Quotation', 'Design', 'Delivery'];
export const stage = (id) => ALL_STAGES.find((s) => s.id === id) || ALL_STAGES[0];
export const audienceOf = (user) => (user?.role === 'staff' ? 'staff' : user?.account_type === 'homeowner' ? 'home' : 'trade');
export const stageLabel = (id, audience = 'trade') => { const s = stage(id); return tr(audience === 'home' && s.homeLabel ? s.homeLabel : audience === 'staff' && s.staffLabel ? s.staffLabel : s.label); };
export const stageText = (id, audience = 'trade') => { const s = stage(id); return tr(audience === 'home' && s.home ? s.home : s.client); };
export const ACCOUNT_TYPES = { architect: 'Architect / designer', developer: 'Developer / contractor', homeowner: 'Homeowner' };

// Shop-style order tracker for homeowners: five milestones over the 12 stages.
export const MILESTONES = [
  { label: 'Quote', until: 'quote_issued' },
  { label: 'Order', until: 'drawings' },
  { label: 'Made', until: 'production' },
  { label: 'Delivered', until: 'delivery' },
  { label: 'Installed', until: 'completed' },
];
export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);

export const DOC_KINDS = {
  client_upload: 'Your upload', quote: 'Quotation', drawing: 'Shop drawing', survey: 'Survey',
  certificate: 'Certificate / DoP', om_manual: 'O&M manual', other: 'Document',
};
export const SYSTEMS = { 'lift-slide': 'Lift & slide', sliding: 'Slim sliding', bifold: 'Bi-fold', hinged: 'French / entrance', windows: 'Windows', facades: 'Curtain walling', rooflights: 'Roof lantern / rooflight' };
export const MATERIALS = { alu: 'Aluminium', timber: 'Timber', pvc: 'PVC', alutimber: 'Timber-aluminium' };

// ---------- formatting ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const fmtDate = (iso, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const opts = { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString(locale, opts);
};
export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
export const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return tr('just now');
  if (s < 3600) return tr('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return tr('{n} h ago', { n: Math.floor(s / 3600) });
  if (s < 86400 * 7) return tr('{n} d ago', { n: Math.floor(s / 86400) });
  return fmtDate(iso);
};
// Amounts entered by staff (payment schedule, quotation). Homeowners see them with VAT.
export const VAT = 0.2;
export const fmtGBP = (n) => `£${Math.round(n).toLocaleString('en-GB')}`;
export const incVat = (n) => Math.round((n * (1 + VAT)) / 100) * 100;
export const fmtMoney = (n) => (n == null || n === '' ? '—' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`);
export const fmtSize = (b) => (b == null ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export const addWorkingDays = (from, days) => {
  const d = new Date(from);
  let left = days;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
  return d.toISOString();
};
export const isOverdue = (p) => p.due_at && stage(p.stage).court === 'us' && new Date(p.due_at) < new Date();

// ---------- opening estimate (same assumptions as the public sizing tool) ----------
const PANELS = { '2A': 2, '3T': 3, '4C': 4, '6C': 6 };
const GLASS_MM = { d: 12, dl: 14.8, t: 16, tl: 18.8 };
export const estimatePanel = ({ width_mm: W, height_mm: H, config, glazing }) => {
  const n = PANELS[config]; const t = GLASS_MM[glazing];
  if (!n || !t || !W || !H) return null;
  const sashW = (W - 140 + (n - 1) * 70) / n;
  const kg = (Math.max(sashW - 140, 0) * Math.max(H - 150 - 140, 0) / 1e6) * t * 2.5 * 1.15;
  return { sashW: Math.round(sashW), kg: Math.round(kg / 5) * 5, over: kg > 400 || sashW > 3300 };
};

// ---------- tiny UI helpers ----------
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const toast = (msg) => {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('is-on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-on'), 3200);
};
export const stageBadge = (id, audience = 'trade') => {
  const s = stage(id);
  return `<span class="badge badge-${s.court}">${esc(stageLabel(id, audience))}</span>`;
};
export const tracker = (id) => {
  const i = stageIndex(id);
  const cur = i < 0 ? -1 : MILESTONES.findIndex((m) => stageIndex(m.until) >= i);
  const done = id === 'completed';
  return `<ol class="tracker" aria-label="${tr('Order progress')}">${MILESTONES.map((m, j) => `<li class="${done || j < cur ? 'is-done' : j === cur ? 'is-current' : ''}" ${j === cur && !done ? 'aria-current="step"' : ''}><span class="tracker-dot" aria-hidden="true"></span><span>${tr(m.label)}</span></li>`).join('')}</ol>`;
};
export const courtLabel = (id, viewer = 'client') => {
  const c = stage(id).court;
  if (c === 'none') return '';
  if (viewer !== 'staff') return tr(c === 'you' ? 'Waiting on you' : 'With Brick & Pane');
  return tr(c === 'you' ? 'Waiting on client' : 'With us');
};
export const progressBar = (id) => {
  const i = stageIndex(id);
  const pct = i < 0 ? 0 : Math.round(((i + 1) / STAGES.length) * 100);
  return `<div class="progress" role="img" aria-label="${tr('Stage {i} of {n}', { i: i + 1, n: STAGES.length })}"><span style="width:${pct}%"></span></div>`;
};

// ---------- project team & decision rights ----------
export const MEMBER_ROLES = { owner: 'Owner', architect: 'Architect', client: 'Client', contractor: 'Contractor', engineer: 'Engineer' };

// Who may decide on a document. Quotations bind the client, so an architect who owns the project
// may only accept on the client's behalf when no client is on the team (and must say so).
export function decisionRights(doc, user, members) {
  if (!user || user.role === 'staff') return { can: false, reason: 'staff' };
  const mine = members.find((m) => m.user_id === user.id);
  if (!mine) return { can: false, reason: 'not a member' };
  if (doc.kind === 'quote') {
    if (mine.role === 'client') return { can: true, onBehalf: false };
    if (mine.role === 'owner' && user.account_type !== 'architect') return { can: true, onBehalf: false };
    if (mine.role === 'owner' || mine.role === 'architect') {
      const client = members.find((m) => m.role === 'client');
      return client ? { can: false, reason: 'client', waitingFor: client } : { can: true, onBehalf: true };
    }
    return { can: false, reason: 'role' };
  }
  return ['owner', 'architect', 'client', 'engineer'].includes(mine.role) ? { can: true, onBehalf: false } : { can: false, reason: 'role' };
}
export const DECISION_LABELS = {
  quote: { approved: 'Accept quotation', changes_requested: 'Ask for changes', doneYes: 'Accepted', doneNo: 'Changes requested' },
  drawing: { approved: 'Reviewed — no comments', changes_requested: 'Reviewed — with comments', doneYes: 'Reviewed — no comments', doneNo: 'Reviewed — with comments' },
  default: { approved: 'Approve', changes_requested: 'Request changes', doneYes: 'Approved', doneNo: 'Changes requested' },
};
export const decisionLabels = (kind) => DECISION_LABELS[kind] || DECISION_LABELS.default;
export const CHANGE_STATUS = { proposed: 'Awaiting decision', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' };
