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
// Supabase answers in English with its own wording: map the common cases to plain, translated messages.
const AUTH_ERRORS = [
  [/invalid login credentials/i, 'Invalid login credentials'],
  [/email not confirmed/i, 'Confirm your email address first: use the link we sent when you created the account.'],
  [/already registered|already exists/i, 'An account with that email already exists.'],
  [/email rate limit/i, 'We’ve sent too many emails in the last hour. Please try again later, or sign in with Google or Microsoft.'],
  [/rate limit|security purposes|too many/i, 'Too many attempts. Please wait a minute and try again.'],
  [/failed to fetch|network|load failed/i, 'We can’t reach the portal right now. Check your connection and try again.'],
  [/pwned|leaked|compromised/i, 'This password has appeared in a data leak. Please choose a different one.'],
  [/password.*(at least|short|characters|length)/i, 'Use at least 10 characters for your password.'],
];
const fail = (err) => { const hit = AUTH_ERRORS.find(([re]) => re.test(err?.message || '')); say(esc(tr(hit ? hit[1] : (err?.message || 'Something went wrong. Please try again.'))), true); };
// While a request is running the button is disabled, so a double click can't send two emails.
const busy = async (btn, fn) => { if (btn.disabled) return; btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
// Coming from the quote form: offer the same email address, so the enquiry shows up in the portal.
try { const e = JSON.parse(sessionStorage.getItem('bp-enquiry') || '{}').email; if (e) $$('input[type=email]', root).forEach((i) => { if (!i.value) i.value = e; }); } catch { /* ignore */ }

if (store.mode === 'demo') {
  $('[data-demo]', root).hidden = false;
  $$('[data-demo-login]', root).forEach((b) => b.addEventListener('click', async () => {
    await store.demoLogin(b.dataset.demoLogin);
    location.href = b.dataset.demoLogin === 'staff' ? 'admin.html' : (safeNext.startsWith('portal') ? safeNext : 'portal.html');
  }));
  $('[data-magic]', root).hidden = true;
}

// "Continue with Google / Microsoft": only providers switched on in Supabase get a button.
const PROVIDERS = {
  google: { label: 'Google', icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' },
  azure: { label: 'Microsoft', icon: '<svg viewBox="0 0 21 21" aria-hidden="true"><path fill="#F25022" d="M0 0h10v10H0z"/><path fill="#7FBA00" d="M11 0h10v10H11z"/><path fill="#00A4EF" d="M0 11h10v10H0z"/><path fill="#FFB900" d="M11 11h10v10H11z"/></svg>' },
};
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

$('[data-signin]', root).addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.currentTarget;
  busy($('button[type=submit]', f), async () => { try { await store.signIn(f.email.value.trim(), f.password.value); go(); } catch (err) { fail(err); } });
});

$('[data-magic]', root).addEventListener('click', (e) => {
  const email = $('[data-signin]', root).email.value.trim();
  if (!email) { say(tr('Enter your email first.'), true); return; }
  busy(e.currentTarget, async () => { try { await store.sendMagicLink(email, safeNext); say(tr('We’ve emailed a sign-in link to {email}.', { email: `<strong>${esc(email)}</strong>` })); } catch (err) { fail(err); } });
});

$('[data-signup]', root).addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.currentTarget;
  if (f.password.value.length < 10) { say(tr('Use at least 10 characters for your password.'), true); return; }
  busy($('button[type=submit]', f), async () => {
    try {
      const r = await store.signUp({ email: f.email.value.trim(), password: f.password.value, full_name: f.full_name.value.trim(), company: f.company.value.trim(), account_type: f.account_type.value, next: safeNext });
      if (r.needsConfirmation) say(tr('Check {email} for a link to confirm your account.', { email: `<strong>${esc(f.email.value.trim())}</strong>` }));
      else { toast(tr('Account created.')); go(); }
    } catch (err) { fail(err); }
  });
});

// The submit buttons start disabled in the HTML: a click before this script ran would post the password to the web host.
$('button[type=submit]', root).forEach((b) => { b.disabled = false; });

// Network calls last: the forms above already work (and never fall back to a native submit) while these load.
try {
  if (await store.getUser()) go();
} catch {
  say(tr('We can’t reach the portal right now. Check your connection and try again.'), true);
}
const enabled = store.mode === 'demo' ? [] : await store.authProviders();
if (enabled.length) {
  $$('[data-oauth]', root).forEach((slot) => {
    const signup = !!slot.closest('[data-signup]');
    slot.innerHTML = enabled.map((p) => `<button class="btn btn-oauth" type="button" data-provider="${p}">${PROVIDERS[p].icon}<span>${tr('Continue with {name}', { name: PROVIDERS[p].label })}</span></button>`).join('')
      + `<p class="oauth-or"><span>${signup ? tr('or create an account with email') : tr('or sign in with email')}</span></p>`;
    slot.hidden = false;
    $$('[data-provider]', slot).forEach((b) => b.addEventListener('click', async () => {
      // A new account made from the sign-up panel keeps the type chosen above the buttons.
      const type = signup ? $('[data-signup] input[name="account_type"]:checked', root)?.value : null;
      try { await store.signInWithProvider(b.dataset.provider, new URL(safeNext, location.href).href, type); } catch (err) { say(esc(tr(err.message)), true); }
    }));
  });
}
