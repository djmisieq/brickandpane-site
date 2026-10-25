// Cloudflare Turnstile. build.mjs adds <meta name="turnstile"> and the Cloudflare script only when it has a site key;
// without one every call here is a no-op, so the quote form and sign-in work exactly as before.
// Most visitors never see a challenge ("interaction-only"); the token goes to contact-submit or Supabase Auth.
const KEY = document.querySelector('meta[name="turnstile"]')?.content;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const loaded = async () => { for (let i = 0; i < 150 && !window.turnstile; i++) await sleep(100); return window.turnstile || null; };

// Renders a widget just before `anchor` (usually the submit button). token() waits up to ~20 s for a token.
// A widget rendered inside a hidden panel (the "Create account" tab) never gets a token, so it renders only once
// the box is shown, or at the latest when a token is asked for.
export const captcha = (anchor) => {
  if (!KEY || !anchor) return { token: async () => undefined, reset() {} };
  const box = document.createElement('div');
  box.className = 'captcha';
  anchor.before(box);
  let id = null;
  let started = null;
  const start = () => {
    started ||= loaded().then((ts) => {
      if (ts) id = ts.render(box, { sitekey: KEY, size: 'flexible', appearance: 'interaction-only', language: document.documentElement.lang || 'en' });
      return ts;
    });
    return started;
  };
  const seen = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { seen.disconnect(); start(); } }, { rootMargin: '2000px 0px' });
  seen.observe(box);
  return {
    async token() {
      seen.disconnect();
      const ts = await start();
      if (!ts || id === null) return undefined;
      for (let i = 0; i < 200; i++) { const v = ts.getResponse(id); if (v) return v; await sleep(100); }
      return undefined;
    },
    // A token works once: after every attempt, ask for a fresh one.
    reset() { if (started) started.then((ts) => { if (ts && id !== null) ts.reset(id); }); },
  };
};
