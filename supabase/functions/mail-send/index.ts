// Sends one mail written in the CRM (mail stage 1b; migration 0045). The person must be signed in as staff and must
// have ticked that they checked the recipients and the text: that tick is the human approval, nothing is sent
// without it, and nothing is ever sent on a schedule. SMTP 465 with the mailbox's own password (the same secrets as
// the read-only sync). The sent mail is filed in mail_messages (folder "CRM") so it shows on the project; with
// "copy to the mailbox" a Bcc lands in that mailbox too (the sync keeps it once, by Message-ID).
// Secrets: MAIL_PASSWORD_<BOX> (as mail-sync), optional MAIL_SEND=off to stop all sending.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { newMessageId, Smtp } from '../_shared/smtp.ts';
import { secretName } from '../_shared/mail-sync.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://brickandpane.co.uk').split(',').map((s) => s.trim());
const PER_HOUR = 30;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (Deno.env.get('MAIL_SEND') === 'off') return reply(200, { error: 'Sending from the CRM is switched off.' });
  // Who is asking: a signed-in staff member only.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await supabase.auth.getUser(jwt);
  const uid = u?.user?.id;
  const { data: prof } = uid ? await supabase.from('profiles').select('role, full_name').eq('id', uid).maybeSingle() : { data: null };
  if (!uid || prof?.role !== 'staff') return reply(403, { error: 'Staff only.' });

  const b = await req.json().catch(() => null);
  const list = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\s]+/)).map((x) => String(x).trim()).filter(Boolean);
  const to = list(b?.to), cc = list(b?.cc), subject = String(b?.subject ?? '').trim(), text = String(b?.text ?? '');
  if (b?.confirm !== true) return reply(400, { error: 'Tick that you checked the recipients and the text.' });
  if (!to.length || to.length + cc.length > 10) return reply(400, { error: 'One to ten recipients.' });
  if (!subject || subject.length > 300) return reply(400, { error: 'Write a subject (up to 300 characters).' });
  if (!text.trim() || text.length > 50000) return reply(400, { error: 'Write the message.' });
  const { data: acct } = await supabase.from('mail_accounts').select('id, address').eq('address', String(b?.from ?? '').toLowerCase()).eq('enabled', true).maybeSingle();
  if (!acct) return reply(400, { error: 'Choose a mailbox of the company.' });
  const pass = Deno.env.get(secretName(acct.address));
  if (!pass) return reply(200, { error: `No password for ${acct.address}: set the secret ${secretName(acct.address)}.` });
  const { count } = await supabase.from('mail_outbox').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 3600e3).toISOString());
  if ((count ?? 0) >= PER_HOUR) return reply(429, { error: `More than ${PER_HOUR} mails in an hour: wait a little.` });

  let inReplyTo: string | null = null, refs = '';
  if (b?.reply_to) {
    const { data: m } = await supabase.from('mail_messages').select('message_id, refs').eq('id', b.reply_to).maybeSingle();
    inReplyTo = m?.message_id ?? null; refs = m?.refs ?? '';
  }
  const project_id = b?.project_id || null, messageId = newMessageId(acct.address);
  const log = { account: acct.address, to_addrs: to, cc_addrs: cc, subject, body_text: text, reply_to: b?.reply_to || null, project_id, approved_by: uid, message_id: messageId };
  try {
    const smtp = await Smtp.connect();
    await smtp.send(acct.address, pass, { from: acct.address, fromName: `${prof.full_name ? `${prof.full_name} · ` : ''}Brick & Pane`, to, cc, bcc: b?.copy_me ? [acct.address] : [], subject, text, inReplyTo, references: refs, messageId });
  } catch (e) {
    const error = String((e as Error)?.message ?? e).replace(/AUTH PLAIN \S+/g, 'AUTH PLAIN ***').slice(0, 300);
    await supabase.from('mail_outbox').insert({ ...log, status: 'failed', error });
    console.log(JSON.stringify({ result: 'failed', account: acct.address }));
    return reply(200, { error: `Not sent: ${error}` });
  }
  const now = new Date().toISOString();
  await supabase.from('mail_outbox').insert({ ...log, status: 'sent' });
  await supabase.from('mail_messages').insert({ account_id: acct.id, folder: 'CRM', uidvalidity: 0, uid: Date.now(), message_id: messageId, in_reply_to: inReplyTo, refs: [refs, inReplyTo].filter(Boolean).join(' ').trim(),
    direction: 'out', from_addr: acct.address, from_name: prof.full_name || '', to_addrs: to, cc_addrs: cc, subject, sent_at: now, body_text: text, project_id });
  console.log(JSON.stringify({ result: 'sent', account: acct.address, recipients: to.length + cc.length }));
  return reply(200, { result: 'sent', message_id: messageId });
});
