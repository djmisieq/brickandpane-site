// Sign in / create account for the project portal.
import { store } from './store.js';
import { $, $$, toast, esc } from './core.js';
import { tr } from './i18n.js';

const next = new URLSearchParams(location.search).get('next') || 'portal.html';
const safeNext = /^(portal|admin)\.html/.test(next) ? next : 'portal.html';
const go = () => { location.href = safeNext; };

const root = $('#auth');
const status = $('[data-auth-status]', root);
const say = (msg, bad = false) => { status.hidden = false; status.classList.toggle('is-error', bad); status.innerHTML = msg; status.focus(); };

if (await store.getUser()) go();

if (store.mode === 'demo') {
  $('[data-demo]', root).hidden = false;
  $$('[data-demo-login]', root).forEach((b) => b.addEventListener('click', async () => {
    await store.demoLogin(b.dataset.demoLogin);
    location.href = b.dataset.demoLogin === 'staff' ? 'admin.html' : (safeNext.startsWith('portal') ? safeNext : 'portal.html');
  }));
  $('[data-magic]', root).hidden = true;
}

$$('[data-auth-tab]', root).forEach((b) => b.addEventListener('click', () => {
  $$('[data-auth-tab]', root).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $$('[data-auth-panel]', root).forEach((p) => { p.hidden = p.dataset.authPanel !== b.dataset.authTab; });
  status.hidden = true;
}));

// ?signup=homeowner|architect|developer opens account creation with that type preselected.
const preset = new URLSearchParams(location.search).get('signup');
if (preset) {
  $('[data-auth-tab="signup"]', root).click();
  const r = $(`[data-signup] input[name="account_type"][value="${CSS.escape(preset)}"]`, root);
  if (r) r.checked = true;
}

$('[data-signin]', root).addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.currentTarget;
  try { await store.signIn(f.email.value.trim(), f.password.value); go(); } catch (err) { say(esc(tr(err.message)), true); }
});

$('[data-magic]', root).addEventListener('click', async () => {
  const email = $('[data-signin]', root).email.value.trim();
  if (!email) { say(tr('Enter your email first.'), true); return; }
  try { await store.sendMagicLink(email); say(tr('We’ve emailed a sign-in link to {email}.', { email: `<strong>${esc(email)}</strong>` })); } catch (err) { say(esc(tr(err.message)), true); }
});

$('[data-signup]', root).addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.currentTarget;
  if (f.password.value.length < 10) { say(tr('Use at least 10 characters for your password.'), true); return; }
  try {
    const r = await store.signUp({ email: f.email.value.trim(), password: f.password.value, full_name: f.full_name.value.trim(), company: f.company.value.trim(), account_type: f.account_type.value });
    if (r.needsConfirmation) say(tr('Check {email} for a link to confirm your account.', { email: `<strong>${esc(f.email.value.trim())}</strong>` }));
    else { toast(tr('Account created.')); go(); }
  } catch (err) { say(esc(tr(err.message)), true); }
});
