// A spreadsheet-like table for the CRM (Excel audit 28.11.2026). No library, CSP 'self' only.
// A cell is a cursor, not a form: click selects, typing replaces, Enter/Tab saves and moves. Arrows, Shift+arrows,
// Ctrl+arrows, Home/End, PageUp/Down; Ctrl+C/Ctrl+V as TSV to and from Excel; Ctrl+D fills down; Delete clears;
// Ctrl+Z undoes the last change (a paste undoes as one). Header filters like Excel's AutoFilter, sort on several
// columns (Shift+click), a totals row, the sum of the selection in a status line, columns to hide, reorder and
// resize (kept in this browser). Saving is optimistic: a failed save puts the old value back and says why.
import { esc, fmtMoney, fmtDay, toast, $, $$ } from './core.js';
import { tr } from './i18n.js';

const STATES = new Map(); // grid id → selection, scroll, pending values, undo; survives a live redraw
let busy = false;
export const gridBusy = () => busy;
const pref = (id) => { try { return JSON.parse(localStorage.getItem(`bp-grid:${id}`)) || {}; } catch { return {}; } };
const keep = (id, v) => { try { localStorage.setItem(`bp-grid:${id}`, JSON.stringify(v)); } catch { /* private mode */ } };
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const isNum = (c) => ['number', 'money', 'pct', 'days'].includes(c.type);

// Values typed or pasted, read the way Excel writes them.
const PARSE = {
  text: (s) => String(s ?? '').trim(),
  number: (s) => { const t = String(s ?? '').replace(/[£%,\s]/g, ''); if (t === '') return null; const n = Number(t); if (!Number.isFinite(n)) throw new Error('number'); return n; },
  date: (s) => {
    const t = String(s ?? '').trim(); if (!t) return null;
    let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    if (/^\d{5}$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Number(t) * 864e5).toISOString().slice(0, 10); // Excel serial
    throw new Error('date');
  },
  select: (s, c) => { const f = fold(s); if (!f) return null; const o = c.options.find((x) => fold(x.label) === f || fold(x.value) === f) || c.options.find((x) => fold(x.label).startsWith(f)); if (!o) throw new Error('choice'); return o.value; },
};
PARSE.money = PARSE.number; PARSE.pct = PARSE.number; PARSE.days = PARSE.number;
const parse = (c, raw) => (c.parse ? c.parse(raw) : (PARSE[c.type] || PARSE.text)(raw, c));

// Excel's clipboard: tabs between cells, new lines between rows, quotes around cells with either.
export function parseTSV(text) {
  const rows = [[]]; let cell = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { rows.at(-1).push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; rows.at(-1).push(cell); cell = ''; rows.push([]); }
    else cell += ch;
  }
  rows.at(-1).push(cell);
  while (rows.length > 1 && rows.at(-1).every((x) => x === '')) rows.pop();
  return rows;
}

export function grid(host, opt) {
  const st = STATES.get(opt.id) || { sel: null, anchor: null, scroll: [0, 0], pending: {}, undo: [], filters: {}, sort: [] };
  STATES.set(opt.id, st);
  if (opt.state) Object.assign(st, { filters: opt.state.filters || {}, sort: opt.state.sort || [] }), (opt.state = null);
  const p = pref(opt.id);
  if (opt.view) { p.hidden = opt.view.hidden ?? p.hidden; p.order = opt.view.order ?? p.order; }
  let all = opt.rows, rows = [], cols = [], editor = null;

  const raw = (row, c) => { const pd = st.pending[opt.rowId(row)]; return pd && c.field in pd ? pd[c.field] : c.get ? c.get(row) : row[c.field]; };
  const label = (c, v) => (c.options ? c.options.find((o) => o.value === v)?.label ?? '' : v);
  const show = (row, c) => {
    const v = raw(row, c);
    if (c.render) return c.render(row, v);
    if (v == null || v === '') return '<span class="g-empty">—</span>';
    if (c.type === 'money') return esc(fmtMoney(v));
    if (c.type === 'pct') return `${esc(String(v))}%`;
    if (c.type === 'date') return esc(fmtDay(`${String(v).slice(0, 10)}T12:00:00`));
    return esc(String(label(c, v)));
  };
  const text = (row, c) => { const v = raw(row, c); return c.type === 'date' ? String(v || '').slice(0, 10) : String(label(c, v) ?? ''); };

  // Filters: a set of allowed values (blank as ''), or a range for numbers and dates.
  const passes = (row, skip = null) => Object.entries(st.filters).every(([f, F]) => {
    if (f === skip) return true;
    const c = opt.columns.find((x) => x.field === f); if (!c) return true;
    const v = raw(row, c);
    if (F.in) return F.in.includes(v == null || v === '' ? '' : String(c.type === 'date' ? String(v).slice(0, 10) : label(c, v)));
    if (F.min != null && !(Number(v) >= F.min)) return false;
    if (F.max != null && !(Number(v) <= F.max)) return false;
    return true;
  });
  const cmp = (a, b) => {
    for (const { f, dir } of st.sort) {
      const c = opt.columns.find((x) => x.field === f); if (!c) continue;
      let x = raw(a, c), y = raw(b, c);
      const ex = x == null || x === '', ey = y == null || y === '';
      if (ex || ey) { if (ex && ey) continue; return ex ? 1 : -1; } // blanks last either way
      if (!isNum(c)) { x = fold(label(c, x)); y = fold(label(c, y)); }
      if (x < y) return -dir; if (x > y) return dir;
    }
    return 0;
  };
  function layout() {
    const order = p.order || [], hid = new Set(p.hidden ?? opt.columns.filter((c) => c.hidden).map((c) => c.field));
    cols = [...opt.columns].sort((a, b) => (order.indexOf(a.field) + 1 || 999 + opt.columns.indexOf(a)) - (order.indexOf(b.field) + 1 || 999 + opt.columns.indexOf(b)))
      .filter((c) => c.pin || !hid.has(c.field));
    const pin = cols.findIndex((c) => c.pin); if (pin > 0) cols.unshift(cols.splice(pin, 1)[0]);
    rows = all.filter(passes); if (st.sort.length) rows = [...rows].sort(cmp);
  }
  const total = (c, list = rows) => {
    if (!c.total) return null;
    const nums = list.map((r) => raw(r, c)).filter((v) => v != null && v !== '' && Number.isFinite(Number(v))).map(Number);
    if (c.total === 'count') return list.filter((r) => raw(r, c) != null && raw(r, c) !== '').length;
    if (!nums.length) return null;
    const s = nums.reduce((a, b) => a + b, 0);
    return c.total === 'avg' ? Math.round((s / nums.length) * 10) / 10 : s;
  };
  const fmtTotal = (c, v) => (v == null ? '' : c.type === 'money' ? fmtMoney(v) : c.type === 'pct' ? `${v}%` : String(v));

  function draw() {
    layout();
    const sortMark = (c) => { const i = st.sort.findIndex((s) => s.f === c.field); return i < 0 ? '' : `<span class="g-sort">${st.sort[i].dir > 0 ? '▲' : '▼'}${st.sort.length > 1 ? i + 1 : ''}</span>`; };
    const filtered = Object.keys(st.filters).length;
    host.innerHTML = `<div class="grid" data-grid="${esc(opt.id)}">
      <div class="grid-tools">
        <span class="grid-count">${esc(tr('{n} of {all} rows', { n: rows.length, all: all.length }))}</span>
        ${filtered ? `<span class="grid-chips">${Object.keys(st.filters).map((f) => `<button type="button" class="tag g-chip" data-g-unfilter="${esc(f)}" aria-label="${esc(tr('Remove the filter on {col}', { col: opt.columns.find((c) => c.field === f)?.label || f }))}">${esc(opt.columns.find((c) => c.field === f)?.label || f)} ×</button>`).join('')}<button type="button" class="linkish" data-g-unfilter="*">${tr('Clear all filters')}</button></span>` : ''}
        <span class="grid-tools-r">${opt.tools || ''}<button type="button" class="btn btn-sm btn-ghost" data-g-cols aria-haspopup="dialog">${tr('Columns')}</button></span>
      </div>
      <div class="grid-scroll"><table class="g-table" role="grid" aria-label="${esc(opt.label || '')}" aria-rowcount="${rows.length + 1}" aria-colcount="${cols.length}" aria-multiselectable="true">
        <colgroup>${cols.map((c) => `<col style="width:${p.w?.[c.field] || c.width || 140}px">`).join('')}</colgroup>
        <thead><tr aria-rowindex="1">${cols.map((c, i) => `<th role="columnheader" scope="col" aria-colindex="${i + 1}" data-f="${esc(c.field)}" aria-sort="${st.sort[0]?.f === c.field ? (st.sort[0].dir > 0 ? 'ascending' : 'descending') : 'none'}" class="${isNum(c) ? 'num' : ''}">
          <button type="button" class="g-th" data-g-sort="${esc(c.field)}" title="${esc(tr('Sort. Shift+click adds a level.'))}">${esc(c.label)}${sortMark(c)}</button><button type="button" class="g-filter${st.filters[c.field] ? ' is-on' : ''}" data-g-filter="${esc(c.field)}" aria-label="${esc(tr('Filter {col}', { col: c.label }))}">▾</button><span class="g-resize" data-g-resize="${esc(c.field)}" aria-hidden="true"></span></th>`).join('')}</tr></thead>
        <tbody>${rows.map((row, r) => `<tr aria-rowindex="${r + 2}" data-r="${r}" class="${opt.rowClass?.(row) || ''}">${cols.map((c, i) => {
          const tag = i === 0 ? 'th' : 'td';
          return `<${tag} role="${i === 0 ? 'rowheader' : 'gridcell'}" id="g-${esc(opt.id)}-${esc(opt.rowId(row))}-${esc(c.field)}" aria-colindex="${i + 1}" tabindex="-1" aria-selected="false"${c.editable === false || c.type === 'action' ? ' aria-readonly="true"' : ''} class="${isNum(c) ? 'num' : ''}${c.editable === false ? ' is-ro' : ''}${opt.cellClass ? ` ${opt.cellClass(row, c, raw(row, c)) || ''}` : ''}">${c.href ? `<a href="${esc(c.href(row))}" tabindex="-1">${show(row, c)}</a>` : show(row, c)}</${tag}>`;
        }).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr class="g-total">${cols.map((c, i) => `<td class="${isNum(c) ? 'num' : ''}">${i === 0 ? esc(tr('Total')) : esc(fmtTotal(c, total(c)))}</td>`).join('')}</tr></tfoot>
      </table>${rows.length ? '' : `<p class="note g-none">${tr(all.length ? 'No row matches the filters.' : 'Nothing here yet.')}</p>`}</div>
      <div class="grid-status" aria-live="polite"></div></div>`;
    const sc = $('.grid-scroll', host); [sc.scrollTop, sc.scrollLeft] = st.scroll;
    sc.addEventListener('scroll', () => { st.scroll = [sc.scrollTop, sc.scrollLeft]; }, { passive: true });
    if (!st.sel || st.sel.r >= rows.length) st.anchor = st.sel = { r: Math.min(st.sel?.r || 0, Math.max(0, rows.length - 1)), c: Math.min(st.sel?.c || 0, cols.length - 1) };
    if (st.anchor.r >= rows.length) st.anchor = { ...st.sel };
    paint(false); bind();
    opt.onDraw?.(host);
  }

  const tb = () => $('tbody', host);
  const td = (r, c) => tb()?.rows[r]?.cells[c];
  let painted = [];
  const range = () => ({ r0: Math.min(st.anchor.r, st.sel.r), r1: Math.max(st.anchor.r, st.sel.r), c0: Math.min(st.anchor.c, st.sel.c), c1: Math.max(st.anchor.c, st.sel.c) });
  function paint(scroll = true) {
    painted.forEach((el) => { el.classList.remove('is-sel', 'is-active'); el.setAttribute('aria-selected', 'false'); el.tabIndex = -1; });
    painted = [];
    if (!rows.length) return;
    const { r0, r1, c0, c1 } = range();
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) { const el = td(r, c); if (el) { el.classList.add('is-sel'); el.setAttribute('aria-selected', 'true'); painted.push(el); } }
    const a = td(st.sel.r, st.sel.c);
    if (a) { a.classList.add('is-active'); a.tabIndex = 0; painted.push(a); if (scroll) a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    requestAnimationFrame(status);
  }
  function status() {
    const out = $('.grid-status', host); if (!out) return;
    const { r0, r1, c0, c1 } = range(); const nums = [];
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) { const col = cols[c], v = rows[r] && raw(rows[r], col); if (col && isNum(col) && v != null && v !== '' && Number.isFinite(Number(v))) nums.push(Number(v)); }
    const money = cols.slice(c0, c1 + 1).some((c) => c.type === 'money');
    const f = (n) => (money ? fmtMoney(n) : String(Math.round(n * 100) / 100));
    out.textContent = nums.length > 1 ? `${tr('Sum')} ${f(nums.reduce((a, b) => a + b, 0))} · ${tr('Average')} ${f(nums.reduce((a, b) => a + b, 0) / nums.length)} · ${tr('Count')} ${nums.length}` : '';
  }
  const move = (dr, dc, extend = false) => {
    if (!rows.length) return;
    const r = Math.max(0, Math.min(rows.length - 1, st.sel.r + dr)), c = Math.max(0, Math.min(cols.length - 1, st.sel.c + dc));
    st.sel = { r, c }; if (!extend) st.anchor = { r, c };
    paint(); td(r, c)?.focus({ preventScroll: true });
  };

  async function save(changes, what, { record = true } = {}) {
    const batch = changes.map(({ r, c, value }) => ({ row: rows[r], rowId: opt.rowId(rows[r]), col: cols[c], value, old: raw(rows[r], cols[c]) })).filter((b) => b.value !== b.old && !(b.value == null && b.old === ''));
    if (!batch.length) return;
    batch.forEach((b) => { (st.pending[b.rowId] ||= {})[b.col.field] = b.value; });
    redrawCells(batch, 'is-saving');
    const res = await Promise.allSettled(batch.map((b) => opt.onSave(b.rowId, b.col.field, b.value, b.row)));
    const ok = [], bad = [];
    res.forEach((x, i) => {
      const b = batch[i];
      if (x.status === 'fulfilled') { ok.push(b); setTimeout(() => { if (st.pending[b.rowId]?.[b.col.field] === b.value) delete st.pending[b.rowId][b.col.field]; }, 6000); }
      else { delete st.pending[b.rowId][b.col.field]; bad.push([b, x.reason]); }
    });
    redrawCells(batch, null);
    bad.forEach(([b]) => { const el = cellOf(b); if (el) { el.classList.add('is-error'); setTimeout(() => el.classList.remove('is-error'), 2500); } });
    if (record && ok.length) { st.undo.push(ok.map((b) => ({ rowId: b.rowId, field: b.col.field, old: b.old, value: b.value }))); if (st.undo.length > 50) st.undo.shift(); }
    if (bad.length) toast(tr(bad[0][1]?.message || 'Not saved.'), { tone: 'error' });
    else if (what && ok.length > 1) toast(tr('{n} cells {what}.', { n: ok.length, what: tr(what) }), { tone: 'ok', undo: () => undo() });
    status();
  }
  const cellOf = (b) => { const r = rows.findIndex((x) => opt.rowId(x) === b.rowId), c = cols.findIndex((x) => x.field === b.col.field); return r < 0 || c < 0 ? null : td(r, c); };
  function redrawCells(batch, cls) {
    batch.forEach((b) => { const el = cellOf(b); if (!el) return; const row = rows.find((x) => opt.rowId(x) === b.rowId); el.innerHTML = b.col.href ? `<a href="${esc(b.col.href(row))}" tabindex="-1">${show(row, b.col)}</a>` : show(row, b.col); el.classList.toggle('is-saving', cls === 'is-saving'); });
  }
  function undo() {
    const last = st.undo.pop(); if (!last) { toast(tr('Nothing to undo.')); return; }
    const ch = last.map((u) => ({ r: rows.findIndex((x) => opt.rowId(x) === u.rowId), c: cols.findIndex((x) => x.field === u.field), value: u.old })).filter((x) => x.r >= 0 && x.c >= 0);
    save(ch, 'restored', { record: false });
  }

  function edit(initial) {
    if (!rows.length) return;
    const c = cols[st.sel.c], el = td(st.sel.r, st.sel.c), row = rows[st.sel.r];
    if (c.type === 'action') { c.onActivate?.(row); return; }
    if (c.editable === false || (c.canEdit && !c.canEdit(row))) { if (c.href) location.hash = c.href(row).replace(/^.*#/, '#'); return; }
    busy = true;
    editor = document.createElement(c.options ? 'select' : 'input'); // no id: the live redraw's keep/dirty never touches it
    if (c.options) { editor.innerHTML = `<option value="">—</option>${c.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}`; editor.value = raw(row, c) ?? ''; }
    else { editor.type = c.type === 'date' ? 'date' : 'text'; if (isNum(c)) editor.inputMode = 'decimal'; editor.value = initial ?? (c.type === 'date' ? String(raw(row, c) || '').slice(0, 10) : raw(row, c) ?? ''); }
    editor.className = 'g-editor'; editor.dataset.mode = initial === undefined ? 'edit' : 'type';
    editor.setAttribute('aria-label', c.label);
    el.append(editor); editor.focus();
    if (c.options && initial === undefined) try { editor.showPicker?.(); } catch { /* not allowed here */ }
    editor.addEventListener('blur', () => setTimeout(() => { if (editor && document.activeElement !== editor) commit(0, 0, false); }, 0));
  }
  function commit(dr, dc, focusNext = true) {
    if (!editor) return;
    const c = cols[st.sel.c]; let v;
    try { v = c.options ? (editor.value || null) : parse(c, editor.value); } catch { editor.classList.add('is-error'); toast(tr('That is not a valid {kind}.', { kind: tr(c.type === 'date' ? 'date' : isNum(c) ? 'number' : 'choice') }), { tone: 'error' }); return; }
    if (c.validate) { const msg = c.validate(v, rows[st.sel.r]); if (msg) { editor.classList.add('is-error'); toast(tr(msg), { tone: 'error' }); return; } }
    editor.remove(); editor = null; busy = false;
    save([{ r: st.sel.r, c: st.sel.c, value: v }]);
    if (focusNext) move(dr, dc);
  }
  function cancel() { editor?.remove(); editor = null; busy = false; td(st.sel.r, st.sel.c)?.focus(); }

  const ARROW = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  function onKey(e) {
    if (editor) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); }
      else if (e.key === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
      else if (editor.dataset.mode === 'type' && ARROW[e.key]) { e.preventDefault(); commit(...ARROW[e.key]); }
      e.stopPropagation(); return;
    }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k.toLowerCase() === 'k') return; // the palette stays global
    let handled = true;
    if (ARROW[k]) { const [dr, dc] = ARROW[k]; move(ctrl ? dr * rows.length : dr, ctrl ? dc * cols.length : dc, e.shiftKey); }
    else if (k === 'Tab') { if ((st.sel.c === cols.length - 1 && !e.shiftKey) || (st.sel.c === 0 && e.shiftKey)) handled = false; else move(0, e.shiftKey ? -1 : 1); }
    else if (k === 'Home') move(ctrl ? -rows.length : 0, -cols.length, e.shiftKey);
    else if (k === 'End') move(ctrl ? rows.length : 0, cols.length, e.shiftKey);
    else if (k === 'PageDown' || k === 'PageUp') move((k === 'PageDown' ? 1 : -1) * 15, 0, e.shiftKey);
    else if (k === 'Enter' || k === 'F2') edit();
    else if (k === 'Escape') { st.anchor = { ...st.sel }; paint(); }
    else if (ctrl && k.toLowerCase() === 'z') undo();
    else if (ctrl && k.toLowerCase() === 'a') { st.anchor = { r: 0, c: 0 }; st.sel = { r: rows.length - 1, c: cols.length - 1 }; paint(); }
    else if (ctrl && k.toLowerCase() === 'd') fillDown();
    else if (k === 'Delete' || k === 'Backspace') clearRange();
    else if (k.length === 1 && !ctrl && !e.altKey) { const c = cols[st.sel.c]; if (c.options || c.type === 'date') edit(); else edit(k); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  const editable = (c, row) => c.editable !== false && c.type !== 'action' && (!c.canEdit || c.canEdit(row));
  function fillDown() {
    const { r0, r1, c0, c1 } = range(), ch = [];
    for (let c = c0; c <= c1; c += 1) for (let r = r0 + 1; r <= r1; r += 1) if (editable(cols[c], rows[r])) ch.push({ r, c, value: raw(rows[r0], cols[c]) });
    save(ch, 'filled');
  }
  function clearRange() {
    const { r0, r1, c0, c1 } = range(), ch = [];
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) if (editable(cols[c], rows[r]) && !cols[c].required) ch.push({ r, c, value: null });
    save(ch, 'cleared');
  }
  function onPaste(e) {
    if (editor || !host.contains(document.activeElement) || !rows.length) return;
    e.preventDefault();
    const data = parseTSV(e.clipboardData.getData('text/plain') || ''); if (!data.length) return;
    const { r0, r1, c0, c1 } = range(), single = data.length === 1 && data[0].length === 1, ch = []; let skipped = 0;
    // More rows than the grid: the caller may add them (e.g. openings pasted from an architect's schedule).
    if (!single && opt.onAddRows && r0 + data.length > rows.length) { opt.onAddRows(data.slice(rows.length - r0), cols.slice(c0)); }
    const h = single ? r1 - r0 + 1 : data.length, w = single ? c1 - c0 + 1 : Math.max(...data.map((x) => x.length));
    for (let i = 0; i < h && r0 + i < rows.length; i += 1) for (let j = 0; j < w && c0 + j < cols.length; j += 1) {
      const c = cols[c0 + j], cell = single ? data[0][0] : data[i]?.[j] ?? '';
      if (!editable(c, rows[r0 + i])) { skipped += 1; continue; }
      try { ch.push({ r: r0 + i, c: c0 + j, value: c.options ? PARSE.select(cell, c) : parse(c, cell) }); } catch { skipped += 1; td(r0 + i, c0 + j)?.classList.add('is-error'); }
    }
    save(ch, skipped ? 'pasted (some skipped)' : 'pasted');
  }
  function onCopy(e) {
    if (editor || !host.contains(document.activeElement) || !rows.length) return;
    e.preventDefault();
    const { r0, r1, c0, c1 } = range(), q = (v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v), lines = [];
    for (let r = r0; r <= r1; r += 1) { const line = []; for (let c = c0; c <= c1; c += 1) line.push(q(text(rows[r], cols[c]))); lines.push(line.join('\t')); }
    e.clipboardData.setData('text/plain', lines.join('\r\n'));
    toast(tr('{n} cells copied.', { n: (r1 - r0 + 1) * (c1 - c0 + 1) }));
  }

  // Header: sort (Shift adds a level), AutoFilter popover, column width.
  function filterPop(field, anchor) {
    $('.g-pop', host)?.remove();
    const c = opt.columns.find((x) => x.field === field), F = st.filters[field] || {};
    const others = all.filter((row) => passes(row, field)); // values as Excel lists them: after the other filters
    const vals = [...new Set(others.map((row) => { const v = raw(row, c); return v == null || v === '' ? '' : String(c.type === 'date' ? String(v).slice(0, 10) : label(c, v)); }))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : isNum(c) ? Number(a) - Number(b) : a.localeCompare(b)));
    const pop = document.createElement('div'); pop.className = 'g-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', tr('Filter {col}', { col: c.label }));
    pop.innerHTML = `<div class="g-pop-sort"><button type="button" class="btn btn-sm btn-ghost" data-p-sort="1">${tr('Sort A→Z')}</button><button type="button" class="btn btn-sm btn-ghost" data-p-sort="-1">${tr('Sort Z→A')}</button></div>
      ${isNum(c) ? `<div class="g-pop-range"><label>${tr('From')} <input type="number" data-p-min value="${F.min ?? ''}"></label><label>${tr('To')} <input type="number" data-p-max value="${F.max ?? ''}"></label></div>` : ''}
      <input type="search" class="g-pop-q" placeholder="${esc(tr('Search the values'))}" aria-label="${esc(tr('Search the values'))}">
      <label class="g-pop-all"><input type="checkbox" data-p-all ${F.in ? '' : 'checked'}> ${tr('Select all')}</label>
      <ul class="g-pop-list">${vals.map((v) => `<li><label><input type="checkbox" value="${esc(v)}" ${!F.in || F.in.includes(v) ? 'checked' : ''}> ${v === '' ? `<em>${tr('(Blank)')}</em>` : esc(c.type === 'date' ? fmtDay(`${v}T12:00:00`) : isNum(c) && c.type === 'money' ? fmtMoney(v) : v)}</label></li>`).join('')}</ul>
      <div class="g-pop-acts"><button type="button" class="btn btn-sm" data-p-ok>${tr('Apply')}</button><button type="button" class="btn btn-sm btn-ghost" data-p-clear>${tr('Clear filter')}</button></div>`;
    openPop(pop);
    const r = anchor.getBoundingClientRect(), hr = host.querySelector('.grid').getBoundingClientRect();
    pop.style.left = `${Math.max(0, Math.min(r.left - hr.left, hr.width - 280))}px`; pop.style.top = `${r.bottom - hr.top + 4}px`;
    const boxes = () => $$('.g-pop-list input', pop);
    $('.g-pop-q', pop).addEventListener('input', (e) => { const f = fold(e.target.value); $$('.g-pop-list li', pop).forEach((li) => { li.hidden = f && !fold(li.textContent).includes(f); }); });
    $('[data-p-all]', pop).addEventListener('change', (e) => boxes().forEach((b) => { if (!b.closest('li').hidden) b.checked = e.target.checked; }));
    $$('[data-p-sort]', pop).forEach((b) => b.addEventListener('click', () => { st.sort = [{ f: field, dir: Number(b.dataset.pSort) }]; closePop(pop); changed(); }));
    $('[data-p-clear]', pop).addEventListener('click', () => { delete st.filters[field]; closePop(pop); changed(); });
    $('[data-p-ok]', pop).addEventListener('click', () => {
      const next = {}; const on = boxes().filter((b) => b.checked).map((b) => b.value);
      if (on.length < vals.length) next.in = on;
      const mn = $('[data-p-min]', pop)?.value, mx = $('[data-p-max]', pop)?.value;
      if (mn !== undefined && mn !== '') next.min = Number(mn); if (mx !== undefined && mx !== '') next.max = Number(mx);
      if (Object.keys(next).length) st.filters[field] = next; else delete st.filters[field];
      closePop(pop); changed();
    });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(pop); anchor.focus(); } });
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!pop.contains(ev.target)) { closePop(pop); document.removeEventListener('pointerdown', off); } }), 0);
    $('.g-pop-q', pop).focus();
  }
  function colsPop(anchor) {
    $('.g-pop', host)?.remove();
    const visible = new Set(cols.map((c) => c.field));
    const list = [...cols, ...opt.columns.filter((c) => !visible.has(c.field))];
    const pop = document.createElement('div'); pop.className = 'g-pop g-pop-cols'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', tr('Columns'));
    pop.innerHTML = `<ul class="g-pop-list">${list.map((c) => `<li data-f="${esc(c.field)}"><label><input type="checkbox" ${visible.has(c.field) ? 'checked' : ''} ${c.pin ? 'disabled' : ''}> ${esc(c.label)}</label><span class="g-move"><button type="button" class="q-icon" data-up aria-label="${esc(tr('Move {col} up', { col: c.label }))}">↑</button><button type="button" class="q-icon" data-down aria-label="${esc(tr('Move {col} down', { col: c.label }))}">↓</button></span></li>`).join('')}</ul>
      <div class="g-pop-acts"><button type="button" class="btn btn-sm" data-p-ok>${tr('Apply')}</button><button type="button" class="btn btn-sm btn-ghost" data-p-reset>${tr('Reset columns')}</button></div>`;
    openPop(pop);
    pop.style.right = '0'; pop.style.top = `${anchor.offsetTop + anchor.offsetHeight + 4}px`;
    $$('[data-up],[data-down]', pop).forEach((b) => b.addEventListener('click', () => { const li = b.closest('li'); if (b.dataset.up !== undefined) li.previousElementSibling?.before(li); else li.nextElementSibling?.after(li); }));
    $('[data-p-ok]', pop).addEventListener('click', () => {
      const lis = $$('li', pop); p.order = lis.map((li) => li.dataset.f); p.hidden = lis.filter((li) => !$('input', li).checked).map((li) => li.dataset.f);
      keep(opt.id, p); closePop(pop); changed();
    });
    $('[data-p-reset]', pop).addEventListener('click', () => { delete p.order; delete p.hidden; delete p.w; keep(opt.id, p); closePop(pop); changed(); });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(pop); anchor.focus(); } });
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!pop.contains(ev.target)) { closePop(pop); document.removeEventListener('pointerdown', off); } }), 0);
  }
  function changed() { draw(); opt.onState?.(api.state()); }
  // While a filter or column list is open, a live redraw waits (it would close it).
  function openPop(pop) { busy = true; host.querySelector('.grid').append(pop); }
  function closePop(pop) { pop.remove(); busy = false; }

  function bind() {
    const t = $('table', host); if (!t) return;
    t.addEventListener('keydown', onKey);
    t.addEventListener('dblclick', (e) => { if (e.target.closest('tbody td, tbody th')) { e.preventDefault(); edit(); } });
    t.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('tbody td, tbody th'); if (!cell || e.target.closest('.g-editor')) return;
      if (e.target.closest('a') && !e.shiftKey) { e.preventDefault(); }
      if (editor) commit(0, 0, false);
      const r = Number(cell.parentElement.dataset.r), c = cell.cellIndex;
      st.sel = { r, c }; if (!e.shiftKey) st.anchor = { r, c }; paint(false); cell.focus({ preventScroll: true });
      if (e.pointerType === 'touch') return;
      busy = true;
      const mv = (ev) => { const x = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('tbody td, tbody th'); if (x && t.contains(x)) { st.sel = { r: Number(x.parentElement.dataset.r), c: x.cellIndex }; paint(false); } };
      t.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', () => { t.removeEventListener('pointermove', mv); busy = false; }, { once: true });
    });
    // A link in the first cell still opens the record: a click without dragging, or Enter on a read-only cell.
    t.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && st.anchor.r === st.sel.r && st.anchor.c === st.sel.c) location.hash = a.getAttribute('href'); });
    $$('[data-g-sort]', host).forEach((b) => b.addEventListener('click', (e) => {
      const f = b.dataset.gSort, i = st.sort.findIndex((s) => s.f === f);
      if (e.shiftKey) { if (i >= 0) st.sort[i].dir *= -1; else if (st.sort.length < 4) st.sort.push({ f, dir: 1 }); }
      else st.sort = [{ f, dir: i === 0 && st.sort.length === 1 ? -st.sort[0].dir : 1 }];
      changed();
    }));
    $$('[data-g-filter]', host).forEach((b) => b.addEventListener('click', () => filterPop(b.dataset.gFilter, b)));
    $$('[data-g-unfilter]', host).forEach((b) => b.addEventListener('click', () => { if (b.dataset.gUnfilter === '*') st.filters = {}; else delete st.filters[b.dataset.gUnfilter]; changed(); }));
    $('[data-g-cols]', host)?.addEventListener('click', (e) => colsPop(e.currentTarget));
    $$('[data-g-resize]', host).forEach((h) => h.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); busy = true;
      const f = h.dataset.gResize, colEl = $$('col', host)[cols.findIndex((c) => c.field === f)], x0 = e.clientX, w0 = colEl.getBoundingClientRect().width || 140;
      const mv = (ev) => { colEl.style.width = `${Math.max(60, Math.min(600, w0 + ev.clientX - x0))}px`; };
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', () => { document.removeEventListener('pointermove', mv); busy = false; (p.w ||= {})[f] = parseInt(colEl.style.width, 10); keep(opt.id, p); }, { once: true });
    }));
    if (!st.docBound) { document.addEventListener('paste', (e) => st.api?.paste(e)); document.addEventListener('copy', (e) => st.api?.copy(e)); st.docBound = true; }
    st.api = { paste: onPaste, copy: onCopy };
  }

  const api = {
    update(next) { all = next; if (!editor) draw(); },
    // What a saved view keeps: filters, sort, hidden columns and their order.
    state: () => ({ filters: st.filters, sort: st.sort, hidden: p.hidden || [], order: p.order || cols.map((c) => c.field) }),
    setState(s) { st.filters = s.filters || {}; st.sort = s.sort || []; if (s.hidden) p.hidden = s.hidden; if (s.order) p.order = s.order; keep(opt.id, p); draw(); },
    rows: () => rows, columns: () => cols, text: (row, c) => text(row, c), raw: (row, c) => raw(row, c),
  };
  draw();
  return api;
}

// CSV of what a grid shows: its visible columns in their order, after filters and sort. Amounts as plain numbers.
export function gridCSV(g, name) {
  const cols = g.columns(), sep = document.documentElement.lang === 'pl' ? ';' : ',';
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = cols.map((c) => (c.type === 'money' ? `${c.label} (GBP)` : c.label));
  const lines = g.rows().map((row) => cols.map((c) => { const v = g.raw(row, c); return c.type === 'date' ? String(v || '').slice(0, 10) : isNum(c) ? (v ?? '') : g.text(row, c); }));
  const blob = new Blob([`﻿${[head, ...lines].map((r) => r.map(cell).join(sep)).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
