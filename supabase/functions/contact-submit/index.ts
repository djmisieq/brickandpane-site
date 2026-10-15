// Supabase Edge Function: receive the public quote form (contact.html) as multipart/form-data.
// Saves the request to public.contact_requests, stores files in the private bucket "enquiries",
// emails the team and sends the sender a confirmation with their reference.
// Deploy with JWT verification off (the form is public): supabase functions deploy contact-submit --no-verify-jwt
// Secrets: RESEND_API_KEY, MAIL_FROM, ENQUIRY_TO (team inbox), ALLOWED_ORIGIN (e.g. https://brickandpane.co.uk),
// plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided automatically).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://brickandpane.co.uk').split(',').map((s) => s.trim());
const MAX_FILE = 50 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024, MAX_FILES = 20;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const safeName = (s: string) => s.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-120) || 'file';
const str = (f: FormData, k: string, max = 500) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null; };
const int = (f: FormData, k: string) => { const n = parseInt(str(f, k) ?? '', 10); return Number.isFinite(n) ? n : null; };

// Until Resend is set up (RESEND_API_KEY + MAIL_FROM) requests are only saved; staff see them in contact_requests.
const mail = (to: string | string[], subject: string, html: string, replyTo?: string) => !Deno.env.get('RESEND_API_KEY') || !Deno.env.get('MAIL_FROM') ? Promise.resolve(null) : fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'accept, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!ORIGINS.includes(origin)) return reply(403, { error: 'origin' });

  let f: FormData;
  try { f = await req.formData(); } catch { return reply(400, { error: 'form' }); }
  // Honeypot: bots fill the hidden "company_website" field. Pretend success, store nothing.
  if (str(f, 'company_website')) return reply(200, { ok: true });

  const name = str(f, 'name', 200), email = str(f, 'email', 320);
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(422, { error: 'name_email' });
  if (!str(f, 'consent')) return reply(422, { error: 'consent' });

  const files = f.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  const total = files.reduce((n, x) => n + x.size, 0);
  if (files.length > MAX_FILES || total > MAX_TOTAL || files.some((x) => x.size > MAX_FILE)) return reply(413, { error: 'files' });

  const link = str(f, 'files_link', 1000);
  const filesLink = link && /^https?:\/\/\S+$/i.test(link) ? link : null;

  const lang = (req.headers.get('referer') ?? '').includes('/pl/') ? 'pl' : 'en';
  const { data: row, error } = await supabase.from('contact_requests').insert({
    lang, name, email,
    role: str(f, 'role'), phone: str(f, 'phone', 60), company: str(f, 'company', 200), topic: str(f, 'topic'),
    systems: f.getAll('systems').map(String).slice(0, 20), material: f.getAll('material').map(String).slice(0, 10),
    location: str(f, 'location'), riba_stage: str(f, 'riba_stage'), building: str(f, 'building'), units: str(f, 'units'), start: str(f, 'start'),
    opening_width_mm: int(f, 'opening_width_mm'), opening_height_mm: int(f, 'opening_height_mm'),
    message: str(f, 'message', 10000), files_link: filesLink, consent_at: new Date().toISOString(),
  }).select('id, ref').single();
  if (error || !row) return reply(500, { error: 'save' });

  const paths: string[] = [];
  for (const file of files) {
    const path = `${row.id}/${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`;
    const up = await supabase.storage.from('enquiries').upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (!up.error) paths.push(path);
  }
  if (paths.length) await supabase.from('contact_requests').update({ files: paths }).eq('id', row.id);

  const fields = [['Role', str(f, 'role')], ['Company', str(f, 'company')], ['Phone', str(f, 'phone')], ['Topic', str(f, 'topic')],
    ['Systems', f.getAll('systems').join(', ')], ['Material', f.getAll('material').join(', ')], ['Location', str(f, 'location')],
    ['RIBA stage', str(f, 'riba_stage')], ['Building', str(f, 'building')], ['Units', str(f, 'units')], ['Start', str(f, 'start')],
    ['Opening', int(f, 'opening_width_mm') ? `${int(f, 'opening_width_mm')} × ${int(f, 'opening_height_mm') ?? '?'} mm` : null],
    ['Files', paths.length ? `${paths.length} in storage: enquiries/${row.id}/` : null], ['Files link', filesLink]].filter(([, v]) => v);
  const team = Deno.env.get('ENQUIRY_TO');
  if (team) {
    await mail(team.split(','), `${row.ref} · ${name}${str(f, 'location') ? ` · ${str(f, 'location')}` : ''}`, `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#1c1b1a;max-width:620px">
        <p style="font-size:13px;color:#6f6a62;margin:0 0 12px">New quote request · ${row.ref}</p>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">${escape(name)} &lt;${escape(email)}&gt;</h1>
        ${filesLink ? `<p style="font-size:15px;margin:0 0 12px"><strong>Large files:</strong> <a href="${escape(filesLink)}">${escape(filesLink)}</a> (links like this often expire within a week, download them early)</p>` : ''}
        <table style="font-size:14px;border-collapse:collapse">${fields.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#6f6a62">${k}</td><td style="padding:4px 0">${escape(String(v))}</td></tr>`).join('')}</table>
        ${str(f, 'message', 10000) ? `<p style="font-size:15px;line-height:1.5;white-space:pre-wrap;margin-top:16px">${escape(str(f, 'message', 10000)!)}</p>` : ''}
      </div>`, email);
  }
  const pl = lang === 'pl';
  await mail(email, pl ? `Otrzymaliśmy Twoje zapytanie · ${row.ref}` : `We've got your request · ${row.ref}`, `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#1c1b1a;max-width:560px">
      <p style="font-size:13px;color:#6f6a62;margin:0 0 16px">Brick &amp; Pane · ${row.ref}</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">${pl ? `Dziękujemy, ${escape(name)}.` : `Thank you, ${escape(name)}.`}</h1>
      <p style="font-size:15px;line-height:1.5">${pl
        ? 'Twoje zapytanie do nas dotarło. Jedna osoba poprowadzi je od pierwszej odpowiedzi do końca. Jeśli chcesz coś dodać, po prostu odpowiedz na tę wiadomość.'
        : 'Your request has reached us. One person will handle it from the first reply onwards. To add anything, just reply to this email.'}</p>
      ${paths.length ? `<p style="font-size:15px">${pl ? 'Załączone pliki' : 'Files received'}: ${paths.length}</p>` : ''}
      ${filesLink ? `<p style="font-size:15px">${pl ? 'Link do plików' : 'Files link'}: ${escape(filesLink)}</p>` : ''}
    </div>`, team?.split(',')[0]);

  return reply(200, { ok: true, ref: row.ref });
});
