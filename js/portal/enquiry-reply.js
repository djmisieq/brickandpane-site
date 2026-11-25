// The first answer to a website enquiry, from the CRM (audit 25.11.2026: the most important moment of a sale was a
// bare mailto link). STAFF ONLY. A template in the enquiry's language, edited by the person, sent through mail-send
// only after they tick that they checked it; the enquiry then counts as replied (replied_at, migration 0043).
// The templates promise nothing the company has not confirmed: they ask for what a price needs.
import { store } from './store.js';
import { esc, $, $$, toast } from './core.js';
import { tr } from './i18n.js';

const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const TEMPLATES = {
  needs: {
    label: 'What we need to price it',
    en: (r, me) => `Dear ${first(r.name) || 'Sir or Madam'},\n\nThank you for your enquiry (${r.ref}). To prepare the quotation we need:\n- the size of each opening (width × height)\n- photos or drawings\n- the site address or postcode\n- when you would like the work done\n\nKind regards,\n${me}\nBrick & Pane`,
    pl: (r, me) => `Dzień dobry${first(r.name) ? ` ${first(r.name)}` : ''},\n\ndziękujemy za zapytanie (${r.ref}). Do przygotowania wyceny potrzebujemy:\n- wymiarów każdego otworu (szerokość × wysokość)\n- zdjęć albo rysunków\n- adresu albo kodu pocztowego\n- kiedy prace miałyby się odbyć\n\nPozdrawiamy,\n${me}\nBrick & Pane`,
  },
  survey: {
    label: 'Arrange a visit to measure',
    en: (r, me) => `Dear ${first(r.name) || 'Sir or Madam'},\n\nThank you for your enquiry (${r.ref}). The next step is a visit to measure the openings. Which days suit you?\n\nKind regards,\n${me}\nBrick & Pane`,
    pl: (r, me) => `Dzień dobry${first(r.name) ? ` ${first(r.name)}` : ''},\n\ndziękujemy za zapytanie (${r.ref}). Następnym krokiem jest wizyta, na której zmierzymy otwory. Jakie dni Państwu odpowiadają?\n\nPozdrawiamy,\n${me}\nBrick & Pane`,
  },
  blank: {
    label: 'Blank, with greeting',
    en: (r, me) => `Dear ${first(r.name) || 'Sir or Madam'},\n\n\n\nKind regards,\n${me}\nBrick & Pane`,
    pl: (r, me) => `Dzień dobry${first(r.name) ? ` ${first(r.name)}` : ''},\n\n\n\nPozdrawiamy,\n${me}\nBrick & Pane`,
  },
};
const open = new Map(); // enquiry id → draft { template, lang, to, subject, text }

export function replyBox(r) {
  const d = open.get(r.id);
  if (!d) return `<div class="enq-reply" data-req-reply-box="${esc(r.id)}"><button type="button" class="btn btn-sm" data-req-reply>${tr('Reply by email')}</button></div>`;
  return `<div class="enq-reply" data-req-reply-box="${esc(r.id)}"><form class="ctl mail-compose" data-req-reply-form novalidate>
    <h3 class="panel-h">${tr('Reply by email')}</h3>
    <div class="field-row">
      <div class="field"><label for="rr-tpl-${esc(r.id)}">${tr('Template')}</label><select id="rr-tpl-${esc(r.id)}" name="template">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}" ${d.template === k ? 'selected' : ''}>${esc(tr(t.label))}</option>`).join('')}</select></div>
      <div class="field"><label for="rr-lang-${esc(r.id)}">${tr('Language')}</label><select id="rr-lang-${esc(r.id)}" name="lang"><option value="en" ${d.lang === 'en' ? 'selected' : ''}>English</option><option value="pl" ${d.lang === 'pl' ? 'selected' : ''}>Polski</option></select></div>
    </div>
    <div class="field"><label for="rr-to-${esc(r.id)}">${tr('To')}</label><input id="rr-to-${esc(r.id)}" name="to" value="${esc(d.to)}"></div>
    <div class="field"><label for="rr-subj-${esc(r.id)}">${tr('Subject')}</label><input id="rr-subj-${esc(r.id)}" name="subject" maxlength="300" value="${esc(d.subject)}"></div>
    <div class="field"><label for="rr-text-${esc(r.id)}">${tr('Message')}</label><textarea id="rr-text-${esc(r.id)}" name="text" rows="10">
${esc(d.text)}</textarea></div>
    <label class="consent"><input type="checkbox" name="copy_me" checked> <span>${tr('Put a copy in the mailbox it is sent from')}</span></label>
    <label class="consent mail-confirm"><input type="checkbox" name="confirm"> <span><strong>${tr('I checked the recipients and the text')}</strong></span></label>
    <div class="btn-row"><button class="btn btn-sm" type="submit">${tr('Send from contact@')}</button><button class="btn btn-sm btn-ghost" type="button" data-req-reply-cancel>${tr('Cancel')}</button></div>
  </form></div>`;
}

export function bindEnquiryReply(root, user, find, redraw) {
  const me = user.full_name || 'Brick & Pane';
  const fill = (r, template, lang) => { const t = TEMPLATES[template] || TEMPLATES.needs; return { template, lang, to: r.email, subject: lang === 'pl' ? `Zapytanie ${r.ref}` : `Your enquiry ${r.ref}`, text: t[lang === 'pl' ? 'pl' : 'en'](r, me) }; };
  $$('[data-req-reply]', root).forEach((b) => b.addEventListener('click', () => {
    const r = find(b.closest('[data-req-reply-box]').dataset.reqReplyBox); if (!r) return;
    open.set(r.id, fill(r, 'needs', r.lang === 'pl' ? 'pl' : 'en')); redraw(r.id);
  }));
  $$('[data-req-reply-form]', root).forEach((f) => {
    const id = f.closest('[data-req-reply-box]').dataset.reqReplyBox, r = find(id); if (!r) return;
    const keep = () => Object.assign(open.get(id), { to: f.to.value, subject: f.subject.value, text: f.text.value });
    f.addEventListener('input', keep);
    const swap = () => { open.set(id, fill(r, f.template.value, f.lang.value)); redraw(id); };
    f.template.addEventListener('change', swap); f.lang.addEventListener('change', swap);
    $('[data-req-reply-cancel]', f).addEventListener('click', () => { open.delete(id); redraw(id); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.confirm.checked) { f.confirm.focus(); toast(tr('Tick that you checked the recipients and the text.')); return; }
      if (!f.to.value.trim()) { f.to.focus(); toast(tr('Add a recipient.')); return; }
      const btn = $('button[type="submit"]', f); btn.disabled = true;
      try {
        await store.sendMail({ from: 'contact@brickandpane.co.uk', to: f.to.value, subject: f.subject.value, text: f.text.value, project_id: r.project_id || null, copy_me: f.copy_me.checked, confirm: true });
        open.delete(id);
        if (r.status === 'new') await store.updateRequest(id, { status: 'replied', staff_note: r.staff_note || '' });
        toast(tr('Sent. The enquiry is marked as replied.')); redraw(id);
      } catch (err) { btn.disabled = false; toast(tr(err.message)); }
    });
  });
}
