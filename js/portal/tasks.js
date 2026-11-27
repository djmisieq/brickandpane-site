// Tasks and the conversation log (migration 0042, CRM audit phase 3). STAFF ONLY: imported by admin.js alone.
// A task is who does what by when, on a project or an enquiry. "Log a conversation" saves what was said as a done
// task and plans the next contact as an open one, so nothing lives only in someone's head.
import { store } from './store.js';
import { esc, fmtDay, $, $$, toast, softDelete } from './core.js';
import { tr } from './i18n.js';
import { linker, bindLinkers, picked } from './linker.js';

const KINDS = { task: 'Task', call: 'Call', email: 'Email', visit: 'Visit' };
const DAY = 86400000;
export const isoDay = (offset = 0) => { const d = new Date(Date.now() + offset * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Next working day: the default due date (audit: a due date as its own field, with a default).
const nextWorkday = () => { let n = 1; for (;;) { const d = new Date(Date.now() + n * DAY).getDay(); if (d !== 0 && d !== 6) return isoDay(n); n++; } };
export const taskLate = (t) => !t.done_at && t.due_on && t.due_on < isoDay(0);
export const taskDue = (t) => !t.done_at && t.due_on && t.due_on <= isoDay(0);

export async function loadTasks(where) { return store.listTasks ? store.listTasks(where).catch(() => null) : null; }

// opts.project: the project's ref and name, shown when the list mixes projects (My work).
export function item(t, staff, opts = {}) {
  const who = staff.find((s) => s.id === t.assignee_id)?.full_name;
  const staffOpts = staff.map((s) => `<option value="${esc(s.id)}" ${s.id === t.assignee_id ? 'selected' : ''}>${esc(s.full_name || s.email)}</option>`).join('');
  const when = t.done_at ? tr('done {date}', { date: fmtDay(t.done_at) }) : t.due_on ? (taskLate(t) ? tr('Overdue {date}', { date: fmtDay(t.due_on) }) : tr('Due {date}', { date: fmtDay(t.due_on) })) : '';
  return `<li class="task${t.done_at ? ' is-done' : ''}${taskLate(t) ? ' is-late' : !t.done_at && t.due_on === isoDay(0) ? ' is-today' : ''}" data-task="${esc(t.id)}">
    <label class="task-check"><input type="checkbox" data-task-done ${t.done_at ? 'checked' : ''} aria-label="${esc(tr('Done: {task}', { task: t.title }))}"><span><strong>${esc(t.title)}</strong>
      <span class="note">${esc(tr(KINDS[t.kind] || 'Task'))}${when ? ` · ${esc(when)}` : ''}${who ? ` · ${esc(who)}` : ''}</span>
      ${opts.project ? `<a class="note task-proj" href="${esc(opts.href)}">${esc(opts.project)}</a>` : ''}
      ${t.note ? `<span class="note task-note">${esc(t.note)}</span>` : ''}</span></label>
    <button type="button" class="q-icon" data-task-del aria-label="${esc(tr('Delete task: {task}', { task: t.title }))}" title="${esc(tr('Delete task'))}">×</button>
    ${t.done_at ? '' : `<details class="task-edit"><summary class="note">${tr('Change')}</summary><form class="task-form" data-task-edit novalidate>
      <div class="field"><label for="te-t-${esc(t.id)}">${tr('Task')}</label><input id="te-t-${esc(t.id)}" name="title" maxlength="300" value="${esc(t.title)}"></div>
      <div class="field-row"><div class="field"><label for="te-d-${esc(t.id)}">${tr('By')}</label><input id="te-d-${esc(t.id)}" name="due_on" type="date" value="${esc(t.due_on || '')}"></div>
        <div class="field"><label for="te-w-${esc(t.id)}">${tr('Who')}</label><select id="te-w-${esc(t.id)}" name="assignee_id"><option value="">${tr('Nobody yet')}</option>${staffOpts}</select></div></div>
      ${linker({ id: `te-p-${t.id}`, label: tr('Move to project'), kinds: ['project'], name: 'project', exclude: t.project_id ? [t.project_id] : [], placeholder: tr('Leave empty to keep it where it is') })}
      <button class="btn btn-sm" type="submit">${tr('Save')}</button></form></details>`}
  </li>`;
}

// where: { projectId } or { requestId }; uid: the box's id prefix (several boxes can be on one page).
export function tasksBox(list, staff, user, where, uid = 'tk') {
  if (list == null) return `<p class="hint">${tr('Tasks are not available right now.')}</p>`;
  const open = list.filter((t) => !t.done_at), done = list.filter((t) => t.done_at).slice(0, 5);
  const staffOpts = (sel) => staff.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.full_name || s.email)}</option>`).join('');
  return `<div class="tasks" data-tasks data-project="${esc(where.projectId || '')}" data-request="${esc(where.requestId || '')}">
    ${open.length ? `<ul class="task-list">${open.map((t) => item(t, staff)).join('')}</ul>` : `<p class="hint">${tr('No open tasks.')}</p>`}
    ${done.length ? `<details class="task-done"><summary class="note">${tr('Done recently')} (${done.length})</summary><ul class="task-list">${done.map((t) => item(t, staff)).join('')}</ul></details>` : ''}
    <form class="task-form" data-task-add novalidate>
      <div class="field"><label for="${uid}-title">${tr('New task')}</label><input id="${uid}-title" name="title" maxlength="300" placeholder="${esc(tr('e.g. Send the revised drawings'))}"></div>
      <div class="field-row">
        <div class="field"><label for="${uid}-due">${tr('By')}</label><input id="${uid}-due" name="due_on" type="date" value="${nextWorkday()}"></div>
        <div class="field"><label for="${uid}-who">${tr('Who')}</label><select id="${uid}-who" name="assignee_id">${staffOpts(user.id)}</select></div>
      </div>
      <button class="btn btn-sm" type="submit">${tr('Add task')}</button>
    </form>
    <form class="task-form" data-task-log novalidate>
      <h3 class="panel-h">${tr('Log a conversation')}</h3>
      <div class="field-row">
        <div class="field"><label for="${uid}-kind">${tr('How')}</label><select id="${uid}-kind" name="kind"><option value="call">${tr('Call')}</option><option value="email">${tr('Email')}</option><option value="visit">${tr('Visit')}</option></select></div>
      </div>
      <div class="field"><label for="${uid}-note">${tr('What was said')}</label><textarea id="${uid}-note" name="note" rows="2" maxlength="4000"></textarea></div>
      <label class="consent"><input type="checkbox" name="plan" checked> <span>${tr('Plan the next contact')}</span></label>
      <div class="field-row">
        <div class="field"><label for="${uid}-next">${tr('Next contact')}</label><input id="${uid}-next" name="next_title" maxlength="300" value="${esc(tr('Follow up'))}"></div>
        <div class="field"><label for="${uid}-ndue">${tr('On')}</label><input id="${uid}-ndue" name="next_due" type="date" value="${isoDay(3)}"></div>
      </div>
      <button class="btn btn-sm btn-ghost" type="submit">${tr('Save the conversation')}</button>
    </form>
  </div>`;
}

// The change form on a task: what, by when, who, and on which project (projects audit 26.11.2026).
export function bindTaskEdits(root) {
  bindLinkers(root);
  $$('[data-task-edit]', root).forEach((f) => { if (f.dataset.bound) return; f.dataset.bound = '1'; f.addEventListener('submit', async (e) => {
    e.preventDefault(); const title = f.title.value.trim(); if (!title) { f.title.focus(); toast(tr('Write what needs doing.')); return; }
    const to = picked(f, 'project'), patch = { title, due_on: f.due_on.value || null, assignee_id: f.assignee_id.value || null };
    if (to) Object.assign(patch, { project_id: to.id, request_id: null });
    try { await store.updateTask(f.closest('[data-task]').dataset.task, patch); toast(tr(to ? 'Task moved to the other project.' : 'Task saved.')); } catch (err) { toast(tr(err.message)); }
  }); });
}

export function bindTasks(root, user) {
  bindTaskEdits(root);
  $$('[data-tasks]', root).forEach((box) => {
    const where = { project_id: box.dataset.project || null, request_id: box.dataset.request || null };
    const add = $('[data-task-add]', box), log = $('[data-task-log]', box);
    add?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = add.title.value.trim(); if (!title) { add.title.focus(); toast(tr('Write what needs doing.')); return; }
      try { await store.addTask({ ...where, title, due_on: add.due_on.value || null, assignee_id: add.assignee_id.value || null }); toast(tr('Task added.')); } catch (err) { toast(tr(err.message)); }
    });
    log?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = log.note.value.trim(); if (!note) { log.note.focus(); toast(tr('Write what was said.')); return; }
      const kind = log.kind.value;
      try {
        await store.addTask({ ...where, kind, title: tr(`${KINDS[kind]} logged`), note, done: true, assignee_id: user.id });
        if (log.plan.checked) await store.addTask({ ...where, kind: 'task', title: log.next_title.value.trim() || tr('Follow up'), due_on: log.next_due.value || null, assignee_id: user.id });
        toast(tr(log.plan.checked ? 'Saved, next contact planned.' : 'Conversation saved.'));
      } catch (err) { toast(tr(err.message)); }
    });
    $$('[data-task-done]', box).forEach((c) => c.addEventListener('change', async () => {
      try { await store.setTaskDone(c.closest('[data-task]').dataset.task, c.checked); } catch (err) { c.checked = !c.checked; toast(tr(err.message)); }
    }));
    $$('[data-task-del]', box).forEach((b) => b.addEventListener('click', async () => {
      const row = b.closest('[data-task]'); softDelete(row, tr('Task deleted.'), () => store.deleteTask(row.dataset.task));
    }));
  });
}
