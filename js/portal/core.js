// Shared definitions and helpers for the project portal and the internal CRM.

// Pipeline. `court` says who the ball is with: 'us' (Brick & Pane) or 'you' (the client).
// `sla` is the promised turnaround in working days while the project sits in that stage.
export const STAGES = [
  { id: 'submitted', homeLabel: 'Request received', home: 'We have your request and will be in touch within one working day.', label: 'Received', phase: 'Quotation', court: 'us', sla: 1, client: 'We have your project and are assigning a technical lead.' },
  { id: 'in_review', homeLabel: 'Preparing your price', home: "We're checking your sizes and preparing your price.", label: 'Technical review', phase: 'Quotation', court: 'us', sla: 2, client: 'Your technical lead is checking sizes, panel weights, compliance and interfaces.' },
  { id: 'clarification', homeLabel: 'A question for you', home: 'We need a quick answer before we can finish your price. See Messages.', label: 'Questions for you', staffLabel: 'Questions to client', phase: 'Quotation', court: 'you', client: 'We need a few answers before we can price accurately. See Messages.' },
  { id: 'quote_issued', homeLabel: 'Your quote is ready', home: 'Your quote is in Documents. Accept it there or ask us to change something.', label: 'Quote issued', phase: 'Quotation', court: 'you', client: 'Your quotation is in Documents. Accept it or ask for changes there.' },
  { id: 'accepted', homeLabel: 'Order confirmed', home: "Thank you for your order. We'll book a survey at your home.", label: 'Order confirmed', phase: 'Design', court: 'us', sla: 5, client: 'Thank you. We are booking your site survey.' },
  { id: 'survey', homeLabel: 'Home survey', home: "We measure the openings and check how we'll get the glass in.", label: 'Site survey', phase: 'Design', court: 'us', sla: 5, client: 'We survey the openings and the delivery route, then draw the shop drawings.' },
  { id: 'drawings', homeLabel: 'Approve your drawings', home: 'Your final drawings are ready. Please approve them in Documents.', label: 'Drawings for approval', phase: 'Design', court: 'you', client: 'Shop drawings are ready. Approve them or request changes in Documents.' },
  { id: 'production', homeLabel: 'Being made', home: 'Your doors and windows are being made to your approved drawings.', label: 'In production', phase: 'Delivery', court: 'us', client: 'Your doors and windows are being made to the signed drawings.' },
  { id: 'delivery', homeLabel: 'Delivery booked', home: 'Your delivery date is confirmed.', label: 'Delivery scheduled', phase: 'Delivery', court: 'us', client: 'Delivery date and lifting plan are confirmed.' },
  { id: 'installation', homeLabel: 'Installation', home: 'Our team is fitting your doors and windows.', label: 'Installation', phase: 'Delivery', court: 'us', client: 'Our own team is installing on site.' },
  { id: 'handover', homeLabel: 'Finished — your documents', home: 'Your guarantee, certificates and care guide are in Documents.', label: 'Handover', phase: 'Delivery', court: 'us', client: 'O&M manual, declarations of performance and the guarantee are in Documents.' },
  { id: 'completed', homeLabel: 'Completed', home: "All done. We'll check in after the first season.", label: 'Completed', phase: 'Delivery', court: 'none', client: 'Project complete. We will check in after the first season.' },
];
export const SIDE_STAGES = [
  { id: 'on_hold', label: 'On hold', court: 'none', client: 'This project is paused.' },
  { id: 'closed', label: 'Closed', court: 'none', client: 'This project is closed.' },
];
export const ALL_STAGES = [...STAGES, ...SIDE_STAGES];
export const PHASES = ['Quotation', 'Design', 'Delivery'];
export const stage = (id) => ALL_STAGES.find((s) => s.id === id) || ALL_STAGES[0];
export const audienceOf = (user) => (user?.role === 'staff' ? 'staff' : user?.account_type === 'homeowner' ? 'home' : 'trade');
export const stageLabel = (id, audience = 'trade') => { const s = stage(id); return audience === 'home' && s.homeLabel ? s.homeLabel : audience === 'staff' && s.staffLabel ? s.staffLabel : s.label; };
export const stageText = (id, audience = 'trade') => { const s = stage(id); return audience === 'home' && s.home ? s.home : s.client; };
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
export const SYSTEMS = { 'lift-slide': 'Lift & slide', sliding: 'Slim sliding', bifold: 'Bi-fold', hinged: 'French / entrance', windows: 'Windows' };

// ---------- formatting ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const fmtDate = (iso, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const opts = { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-GB', opts);
};
export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
export const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(iso);
};
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
const GLASS_MM = { d: 12, dl: 14.8, t: 16 };
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
  return `<ol class="tracker" aria-label="Order progress">${MILESTONES.map((m, j) => `<li class="${done || j < cur ? 'is-done' : j === cur ? 'is-current' : ''}" ${j === cur && !done ? 'aria-current="step"' : ''}><span class="tracker-dot" aria-hidden="true"></span><span>${m.label}</span></li>`).join('')}</ol>`;
};
export const courtLabel = (id, viewer = 'client') => {
  const c = stage(id).court;
  if (c === 'none') return '';
  if (viewer !== 'staff') return c === 'you' ? 'Waiting on you' : 'With Brick & Pane';
  return c === 'you' ? 'Waiting on client' : 'With us';
};
export const progressBar = (id) => {
  const i = stageIndex(id);
  const pct = i < 0 ? 0 : Math.round(((i + 1) / STAGES.length) * 100);
  return `<div class="progress" role="img" aria-label="Stage ${i + 1} of ${STAGES.length}"><span style="width:${pct}%"></span></div>`;
};
