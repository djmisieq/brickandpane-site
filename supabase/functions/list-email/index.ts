// Supabase Edge Function: "Email me this list" from the list panel on the public site.
// Sends the visitor their list of openings with a link that brings it back into the quote form.
// Deploy with JWT verification off (the site is public): supabase functions deploy list-email --no-verify-jwt
// Secrets: RESEND_API_KEY, MAIL_FROM, ALLOWED_ORIGIN (shared with contact-submit).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://brickandpane.co.uk').split(',').map((s) => s.trim());
const SITE = 'https://brickandpane.co.uk';

// Anyone can type someone else's address, so the email carries nothing the sender wrote: no notes, no references,
// only products, sizes, layout codes and glass from fixed lists. Limits: 3 an hour to one address, 10 an hour
// from one IP, 50 an hour in total. Addresses and IPs are kept only as salted hashes, for a day (migration 0013).
const LIMITS = { email: 3, ip: 10, all: 50 };
const SYSTEMS = ['lift-slide', 'sliding', 'bifold', 'hinged', 'windows', 'facades', 'rooflights'];
const FIELDS = ['ref', 'system', 'material', 'width_mm', 'height_mm', 'qty', 'config', 'glazing', 'note'];
const NAMES: Record<string, Record<string, string>> = {
  en: { 'lift-slide': 'Lift & slide', sliding: 'Slim sliding', bifold: 'Bi-fold', hinged: 'French / entrance door', windows: 'Windows', facades: 'Curtain walling', rooflights: 'Roof lantern / rooflight' },
  pl: { 'lift-slide': 'Podnoszono-przesuwne', sliding: 'Przesuwne slim', bifold: 'Harmonijkowe', hinged: 'Balkonowe / wejściowe', windows: 'Okna', facades: 'Fasada słupowo-ryglowa', rooflights: 'Latarnia dachowa / świetlik' },
};
const GLASS: Record<string, Record<string, string>> = {
  en: { d: 'double glazed', dl: 'double laminated', t: 'triple glazed', tl: 'triple laminated' },
  pl: { d: 'szyba podwójna', dl: 'szyba podwójna laminowana', t: 'szyba potrójna', tl: 'szyba potrójna laminowana' },
};
const MATERIALS: Record<string, Record<string, string>> = {
  en: { alu: 'aluminium', timber: 'timber', pvc: 'PVC', alutimber: 'timber-aluminium' },
  pl: { alu: 'aluminium', timber: 'drewno', pvc: 'PVC', alutimber: 'drewno-aluminium' },
};

// Layouts in words, a copy of js/layouts.js: the email never shows codes like '4C' or '4+1'.
const SLIDE: Record<string, [string, string]> = {
  '2A': ['2 panels, one slides', '2 skrzydła, jedno przesuwne'], '2B': ['2 panels, both slide', '2 skrzydła, oba przesuwne'],
  '3T': ['3 panels, opening to one side', '3 skrzydła, otwierane na jedną stronę'],
  '4C': ['4 panels, opening from the centre', '4 skrzydła, otwierane od środka'], '6C': ['6 panels, opening from the centre', '6 skrzydeł, otwierane od środka'],
};
const HINGED: Record<string, [string, string]> = { S: ['Single door', 'Drzwi jednoskrzydłowe'], D: ['Double (French) door', 'Drzwi dwuskrzydłowe'] };
const leaves = (n: number, pl: boolean) => (pl ? `${n} ${n >= 2 && n <= 4 ? 'skrzydła' : 'skrzydeł'}` : `${n} leaves`);
const layoutName = (system: string, config: string, pl: boolean) => {
  if (system === 'bifold') {
    const m = /^(\d)\+(\d)$/.exec(config);
    if (!m) return '';
    const [a, b] = [+m[1], +m[2]];
    if (!b) return pl ? `${leaves(a, true)}, wszystkie w lewo` : `${leaves(a, false)}, all fold left`;
    return pl ? `${leaves(a + b, true)}: ${a} w lewo, ${b} w prawo` : `${leaves(a + b, false)}: ${a} fold left, ${b} right`;
  }
  const row = system === 'hinged' ? HINGED[config] : ['lift-slide', 'sliding'].includes(system) ? SLIDE[config] : undefined;
  return row ? row[pl ? 1 : 0] : '';
};

type Opening ={ ref: string; system: string; material: string; width_mm: number | null; height_mm: number | null; qty: number; config: string; glazing: string };
const b64urlDecode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const b64urlEncode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// The same checks as decodeList in js/openings-list.js, stricter on free text.
const decode = (code: string): Opening[] => {
  let rows: unknown;
  try { rows = JSON.parse(b64urlDecode(code)); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
  const count: Record<string, number> = {};
  return rows.slice(0, 100).filter(Array.isArray).map((r) => Object.fromEntries(FIELDS.map((k, i) => [k, r[i]])))
    .filter((o) => SYSTEMS.includes(String(o.system)))
    .map((o) => {
      const p = o.system === 'windows' ? 'W' : ['facades', 'rooflights'].includes(o.system) ? 'G' : 'D';
      count[p] = (count[p] ?? 0) + 1;
      return {
        ref: `${p}${String(count[p]).padStart(2, '0')}`, system: String(o.system),
        material: String(o.material ?? '') in MATERIALS.en ? String(o.material) : '',
        width_mm: num(o.width_mm, 300, 30000), height_mm: num(o.height_mm, 300, 6000), qty: num(o.qty, 1, 999) ?? 1,
        config: /^[A-Za-z0-9+\-]{1,6}$/.test(String(o.config ?? '')) ? String(o.config) : '',
        glazing: String(o.glazing ?? '') in GLASS.en ? String(o.glazing) : '',
      };
    });
};
const encode = (list: Opening[]) => b64urlEncode(JSON.stringify(list.map((o) => FIELDS.map((k) => (k === 'note' ? '' : (o as Record<string, unknown>)[k] ?? '')))));

const hash = async (s: string) => {
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.slice(-32);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${s}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const recent = async (col?: 'email_hash' | 'ip_hash', value?: string) => {
  let q = supabase.from('list_emails').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 60 * 60e3).toISOString());
  if (col) q = q.eq(col, value!);
  const { count } = await q;
  return count ?? 0;
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'accept, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!ORIGINS.includes(origin)) return reply(403, { error: 'origin' });
  if (!Deno.env.get('RESEND_API_KEY') || !Deno.env.get('MAIL_FROM')) return reply(503, { error: 'mail' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: 'body' }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 320) : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(422, { error: 'email' });
  const list = decode(typeof body.list === 'string' ? body.list.slice(0, 20000) : '');
  if (!list.length) return reply(422, { error: 'list' });
  const lang = body.lang === 'pl' ? 'pl' : 'en';

  const email_hash = await hash(email);
  const ip_hash = await hash((req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown');
  const [byEmail, byIp, all] = await Promise.all([recent('email_hash', email_hash), recent('ip_hash', ip_hash), recent()]);
  if (byEmail >= LIMITS.email || byIp >= LIMITS.ip || all >= LIMITS.all) return reply(429, { error: 'rate' });
  await supabase.from('list_emails').insert({ email_hash, ip_hash });
  await supabase.from('list_emails').delete().lt('created_at', new Date(Date.now() - 24 * 60 * 60e3).toISOString());

  const pl = lang === 'pl';
  const link = `${SITE}${pl ? '/pl' : ''}/contact.html?list=${encode(list)}`;
  const cell = 'padding:6px 12px 6px 0;border-bottom:1px solid #e4e0d8;vertical-align:top';
  const rows = list.map((o) => {
    const detail = [layoutName(o.system, o.config, pl),GLASS[lang][o.glazing] ?? '', MATERIALS[lang][o.material] ?? ''].filter(Boolean).join(', ');
    return `<tr><td style="${cell};color:#6f6a62">${o.ref}</td><td style="${cell}">${NAMES[lang][o.system]}${detail ? `<br><span style="color:#6f6a62;font-size:13px">${detail}</span>` : ''}</td>
      <td style="${cell};white-space:nowrap">${o.width_mm ?? '?'} × ${o.height_mm ?? '?'} mm</td><td style="${cell};white-space:nowrap">× ${o.qty}</td></tr>`;
  }).join('');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MAIL_FROM'), to: email,
      subject: pl ? 'Twoja lista otworów · Brick & Pane' : 'Your list of openings · Brick & Pane',
      html: `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#1c1b1a;max-width:600px">
      <p style="font-size:13px;color:#6f6a62;margin:0 0 16px">Brick &amp; Pane</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">${pl ? 'Twoja lista otworów' : 'Your list of openings'}</h1>
      <table style="font-size:14px;border-collapse:collapse;width:100%">${rows}</table>
      <p style="font-size:15px;line-height:1.5;margin-top:20px"><a href="${link}" style="color:#1c1b1a;font-weight:600">${pl ? 'Otwórz tę listę w formularzu wyceny' : 'Open this list in the quote form'}</a></p>
      <p style="font-size:13px;line-height:1.5;color:#6f6a62;margin-top:20px">${pl
        ? 'Tę wiadomość wysłaliśmy, bo ktoś poprosił o nią na brickandpane.co.uk. Nie zapisujemy tego adresu.'
        : 'We sent this because someone asked for it on brickandpane.co.uk. We don’t keep this address.'}</p>
    </div>`,
    }),
  });
  return res.ok ? reply(200, { ok: true }) : reply(502, { error: 'send' });
});
