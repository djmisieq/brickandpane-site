// The CRM's sheets (Excel audit 28.11.2026): projects as a spreadsheet with saved views, and the openings schedule
// of a project, pasted from an architect's Excel. Staff only (imported by admin.js and project.js).
import { store } from './store.js';
import { SYSTEMS, MATERIALS, stage, esc, stageBadge, isOverdue, estimatePanel, $, toast } from './core.js';
import { tr, LANG } from './i18n.js';
import { grid } from './grid.js';
import { stageDialog, dialog, head, bindClose } from './crm-quick.js';

const DAY = 864e5;
const WAITING = { client: 'the client', supplier: 'the supplier', subcontractor: LANG === 'pl' ? 'podwykonawcę' : 'the sub' + 'contractor', other: 'someone else' };
const days = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const clientName = (p) => (p.owner && p.owner.role !== 'staff' ? p.owner.company || p.owner.full_name || '' : '');

// Views built into the code, before any the team saves.
const BUILT_IN = [
  { id: 'all', name: 'All projects', state: { filters: {}, sort: [] } },
  { id: 'quoting', name: 'Quotes in play', state: { filters: { phase: { in: ['Quotation'] } }, sort: [{ f: 'value', dir: -1 }] } },
  { id: 'late', name: 'Overdue', state: { filters: { to_due: { max: -1 } }, sort: [{ f: 'to_due', dir: 1 }] } },
  { id: 'stuck', name: 'Stuck over 14 days', state: { filters: { in_stage: { min: 15 } }, sort: [{ f: 'in_stage', dir: -1 }] } },
];
let viewId = 'all';

export async function projectSheet(host, projects, { staff, tasksOf }) {
  const [fields, saved] = await Promise.all([store.listFields ? store.listFields().catch(() => []) : [], store.listViews ? store.listViews('projects').catch(() => []) : []]);
  const people = staff.map((s) => ({ value: s.id, label: s.full_name || s.email }));
  const custom = fields.map((f) => ({
    field: `custom.${f.key}`, label: f.label, type: f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text',
    options: f.kind === 'select' ? f.options.map((o) => ({ value: o, label: o })) : undefined, get: (p) => p.internal?.custom?.[f.key] ?? null, width: 130,
  }));
  const columns = [
    { field: 'ref', label: tr('Ref'), pin: true, editable: false, width: 120, href: (p) => `#/p/${p.id}` },
    { field: 'name', label: tr('Project'), editable: false, width: 220, href: (p) => `#/p/${p.id}` },
    { field: 'client', label: tr('Client'), editable: false, get: clientName, width: 160 },
    { field: 'location', label: tr('Location'), editable: false, width: 140 },
    // The stage moves through its dialog: whether the client is told is a decision, never a cell edit.
    { field: 'stage', label: tr('Stage'), type: 'action', width: 160, get: (p) => tr(stage(p.stage).staffLabel || stage(p.stage).label), render: (p) => stageBadge(p.stage, 'staff'), onActivate: (p) => stageDialog(p) },
    { field: 'phase', label: tr('Phase'), editable: false, get: (p) => stage(p.stage).phase || '', render: (p) => esc(tr(stage(p.stage).phase || '—')), width: 110 },
    { field: 'assignee_id', label: tr('Account manager'), type: 'select', options: people, width: 150 },
    { field: 'waiting_on', label: tr('Waiting on'), type: 'select', options: Object.entries(WAITING).map(([value, l]) => ({ value, label: tr(l) })), get: (p) => p.internal?.waiting_on ?? null, width: 140 },
    { field: 'chase_on', label: tr('Chase on'), type: 'date', get: (p) => p.internal?.chase_on ?? null, width: 130 },
    { field: 'due_at', label: tr('Due'), type: 'date', get: (p) => p.due_at?.slice(0, 10) ?? null, width: 130 },
    { field: 'value', label: tr('Value'), type: 'money', get: (p) => p.internal?.value_gbp ?? null, total: 'sum', width: 120 },
    { field: 'probability', label: tr('Probability'), type: 'pct', get: (p) => p.internal?.probability ?? null, total: 'avg', width: 110, validate: (v) => (v != null && (v < 0 || v > 100) ? 'Probability is from 0 to 100.' : '') },
    { field: 'weighted', label: tr('Weighted'), type: 'money', editable: false, get: (p) => (p.internal?.value_gbp != null && p.internal?.probability != null ? Math.round(p.internal.value_gbp * p.internal.probability / 100) : null), total: 'sum', width: 120 },
    { field: 'in_stage', label: tr('Days in stage'), type: 'days', editable: false, get: (p) => days(p.stage_changed_at), total: 'avg', width: 110 },
    { field: 'to_due', label: tr('Days to due'), type: 'days', editable: false, get: (p) => (p.due_at ? Math.ceil((new Date(p.due_at) - Date.now()) / DAY) : null), width: 110 },
    { field: 'tasks', label: tr('Open tasks'), type: 'number', editable: false, get: (p) => tasksOf(p.id).length || null, total: 'sum', width: 100 },
    { field: 'source', label: tr('Source'), editable: false, hidden: true, get: (p) => p.internal?.source || '', width: 120 },
    { field: 'updated', label: tr('Updated'), type: 'date', editable: false, hidden: true, get: (p) => p.updated_at?.slice(0, 10), width: 120 },
    { field: 'created', label: tr('Created'), type: 'date', editable: false, hidden: true, get: (p) => p.created_at?.slice(0, 10), width: 120 },
    ...custom,
  ];
  const views = [...BUILT_IN.map((v) => ({ ...v, name: tr(v.name), builtIn: true })), ...saved];
  const onSave = async (id, field, v) => {
    const p = projects.find((x) => x.id === id);
    if (field === 'assignee_id') return store.updateProject(id, { assignee_id: v || null });
    if (field === 'due_at') return store.updateProject(id, { due_at: v ? new Date(`${v}T17:00:00`).toISOString() : null });
    if (field === 'value') return store.updateInternal(id, { value_gbp: v });
    if (field === 'probability') return store.updateInternal(id, { probability: v == null ? null : Math.round(v) });
    if (field === 'chase_on') return store.updateInternal(id, { chase_on: v || null });
    if (field === 'waiting_on') return store.updateInternal(id, { waiting_on: v || null, waiting_note: v ? p?.internal?.waiting_note || '' : '', waiting_since: v ? (p?.internal?.waiting_since || new Date().toISOString()) : null, chase_on: v ? p?.internal?.chase_on || null : null });
    if (field.startsWith('custom.')) { const next = { ...(p?.internal?.custom || {}), [field.slice(7)]: v }; if (p) (p.internal ||= {}).custom = next; return store.updateInternal(id, { custom: next }); }
    throw new Error('This column cannot be changed here.');
  };
  const view = views.find((v) => v.id === viewId) || views[0];
  const toolbar = `<label class="visually-hidden" for="sheet-view">${tr('View')}</label><select id="sheet-view" data-sheet-view>${views.map((v) => `<option value="${esc(v.id)}" ${v.id === view.id ? 'selected' : ''}>${esc(v.name)}${v.shared === false ? ` (${esc(tr('mine'))})` : ''}</option>`).join('')}</select>
    <button type="button" class="btn btn-sm btn-ghost" data-sheet-save>${tr('Save view')}</button>${view.builtIn ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-sheet-del>${tr('Delete view')}</button>`}`;
  const g = grid(host, {
    id: 'projects', label: tr('Projects'), rows: projects, rowId: (p) => p.id, columns, onSave, tools: toolbar,
    state: projectSheet.applied === viewId ? null : view.state,
    onDraw: () => bindTools(),
    rowClass: (p) => (isOverdue(p) ? 'is-overdue' : ''),
    cellClass: (p, c, v) => (c.field === 'to_due' && v != null && v < 0 ? 'cf-danger' : c.field === 'in_stage' && v > 14 && stage(p.stage).court === 'us' ? 'cf-warn' : ''),
  });
  projectSheet.applied = viewId;
  function bindTools() {
    $('[data-sheet-view]', host)?.addEventListener('change', (e) => { viewId = e.target.value; dispatchEvent(new HashChangeEvent('hashchange')); }); // redraw: the new view's filters apply
    $('[data-sheet-save]', host)?.addEventListener('click', () => saveViewDialog(g, view, () => { location.hash = '#/list'; dispatchEvent(new HashChangeEvent('hashchange')); }));
    $('[data-sheet-del]', host)?.addEventListener('click', async () => { try { await store.deleteView(view.id); viewId = 'all'; toast(tr('View deleted.'), { tone: 'ok' }); dispatchEvent(new HashChangeEvent('hashchange')); } catch (err) { toast(tr(err.message), { tone: 'error' }); } });
  }
  return g;
}

function saveViewDialog(g, current, done) {
  const d = dialog('qd-view', `${head(tr('Save view'))}<form class="qd-body" novalidate>
    <div class="field"><label for="sv-name">${tr('Name of the view')}</label><input id="sv-name" name="name" maxlength="80" required value="${current.builtIn ? '' : esc(current.name)}" placeholder="${esc(tr('e.g. Fittings this month'))}"></div>
    <label class="consent"><input type="checkbox" name="shared" checked> <span>${tr('The whole team sees it')}</span></label>
    <p class="hint">${tr('It keeps the filters, the sort, and which columns show in which order.')}</p>
    <div class="qd-acts"><button class="btn" type="submit">${tr('Save')}</button><button class="btn btn-ghost" type="button" data-close>${tr('Cancel')}</button></div></form>`);
  bindClose(d);
  $('form', d).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget, name = f.name.value.trim();
    if (!name) { f.name.focus(); return; }
    try { const v = await store.saveView({ id: current.builtIn || current.name !== name ? null : current.id, table_key: 'projects', name, shared: f.shared.checked, state: g.state() }); viewId = v?.id || viewId; d.close(); toast(tr('View saved.'), { tone: 'ok' }); done(); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
  });
}

// ---------- the openings schedule of a project ----------
const GLAZING = { d: 'Double', dl: 'Double, laminated', t: 'Triple', tl: 'Triple, laminated' };
const area = (o) => (o.width_mm && o.height_mm ? Math.round((o.width_mm * o.height_mm) / 1e4) / 100 : null);
export function openingsSheet(host, pid, openings, { locked = false } = {}) {
  const sys = Object.entries(SYSTEMS).map(([value, l]) => ({ value, label: tr(l) }));
  const mat = [{ value: '', label: tr('Not sure') }, ...Object.entries(MATERIALS).map(([value, l]) => ({ value, label: tr(l) }))];
  const sliding = (o) => ['lift-slide', 'sliding'].includes(o.system);
  const columns = [
    { field: 'ref', label: tr('Ref'), pin: true, width: 90, required: true, validate: (v) => (!v ? 'A reference is needed.' : String(v).length > 20 ? 'At most 20 characters.' : '') },
    { field: 'system', label: tr('Product'), type: 'select', options: sys, width: 170, required: true },
    { field: 'material', label: tr('Material'), type: 'select', options: mat, width: 140 },
    { field: 'width_mm', label: tr('Width (mm)'), type: 'number', width: 110, validate: (v) => (v != null && (v < 300 || v > 30000) ? 'Width is from 300 to 30000 mm.' : '') },
    { field: 'height_mm', label: tr('Height (mm)'), type: 'number', width: 110, validate: (v) => (v != null && (v < 300 || v > 6000) ? 'Height is from 300 to 6000 mm.' : '') },
    { field: 'config', label: tr('Layout'), width: 100 },
    { field: 'glazing', label: tr('Glazing'), type: 'select', options: Object.entries(GLAZING).map(([value, l]) => ({ value, label: tr(l) })), width: 150 },
    { field: 'qty', label: tr('Qty'), type: 'number', total: 'sum', width: 70, validate: (v) => (v == null || v < 1 || !Number.isInteger(v) ? 'Quantity is a whole number, 1 or more.' : '') },
    { field: 'm2', label: tr('m² each'), type: 'number', editable: false, get: area, width: 90 },
    { field: 'm2_all', label: tr('m² in all'), type: 'number', editable: false, get: (o) => (area(o) != null ? Math.round(area(o) * (o.qty || 1) * 100) / 100 : null), total: 'sum', width: 100 },
    { field: 'kg', label: tr('Panel kg'), type: 'number', editable: false, get: (o) => (sliding(o) ? estimatePanel(o)?.kg ?? null : null), width: 90 },
    { field: 'notes', label: tr('Notes (the client sees them)'), width: 220 },
  ].map((c) => (locked && c.editable !== false ? { ...c, editable: false } : c));
  const toRow = (cells, cols) => {
    const o = { ref: '', system: 'lift-slide', material: '', width_mm: null, height_mm: null, config: '', glazing: '', qty: 1, notes: '' };
    cols.forEach((c, i) => { const v = cells[i]; if (v == null || v === '' || c.editable === false) return; try { o[c.field] = c.options ? (c.options.find((x) => x.label.toLowerCase() === String(v).trim().toLowerCase() || x.value === String(v).trim())?.value ?? o[c.field]) : c.type === 'number' ? Number(String(v).replace(/[^\d.]/g, '')) || null : String(v).trim(); } catch { /* keep the default */ } });
    return o;
  };
  return grid(host, {
    id: `openings-${pid}`, label: tr('Openings'), rows: openings, rowId: (o) => o.id, columns,
    onSave: (id, field, v) => store.updateOpening(id, { [field]: v ?? (field === 'notes' || field === 'config' || field === 'glazing' || field === 'material' ? '' : null) }),
    // Rows pasted below the last one become new openings (an architect's schedule, straight from Excel).
    onAddRows: locked ? null : async (rowsIn, cols) => {
      const made = rowsIn.map((r) => toRow(r, cols)).filter((o) => o.ref || o.width_mm);
      if (!made.length) return;
      try { await store.addOpenings(pid, made); toast(tr('{n} openings added from the paste.', { n: made.length }), { tone: 'ok' }); } catch (err) { toast(tr(err.message), { tone: 'error' }); }
    },
    cellClass: (o, c) => (c.field === 'kg' && sliding(o) && estimatePanel(o)?.over ? 'cf-warn' : ''),
  });
}
