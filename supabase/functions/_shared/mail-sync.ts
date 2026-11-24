// Mail in the CRM, stage 1a: read the OVH Zimbra mailboxes and keep a copy (migration 0035). READ ONLY on the mail
// side: imap.ts can only EXAMINE and PEEK. contact@ is read whole (INBOX, Sent); chris@ and kate@ only for mail to or
// from an address the CRM knows (a client on a project, an invitation, an enquiry, a contact the team added): their
// headers are read first and the body of anything else is never downloaded.
import PostalMime from 'npm:postal-mime@4.1.4';
import { Imap, imapDate } from './imap.ts';

export const HOST = 'imap.mail.ovh.net';
export const OUR_DOMAIN = '@brickandpane.co.uk';
const CHUNK = 50;                       // UIDs looked at per round trip
const BODIES_PER_RUN = 25;              // mails downloaded per run, all folders together (CPU limit of a function)
const MAX_FETCH = 20 * 1024 * 1024;     // bigger: headers only, "open it in Zimbra"
const MAX_ATTACHMENT = 10 * 1024 * 1024; // the bucket's limit
const TIME_BUDGET = 100_000;            // ms; the cron calls again in 5 minutes

export type Account = { id: string; address: string; mode: 'all' | 'known'; folders: string[]; since: string; enabled: boolean };
type Addr = { address?: string; name?: string; group?: Addr[] };
// deno-lint-ignore no-explicit-any
type Db = any;

export const secretName = (address: string) => `MAIL_PASSWORD_${address.split('@')[0].toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

export const flat = (list: Addr | Addr[] | undefined | null): { address: string; name: string }[] =>
  (Array.isArray(list) ? list : list ? [list] : []).flatMap((a) => a.group ? flat(a.group) : a.address ? [{ address: a.address.toLowerCase(), name: a.name ?? '' }] : []);

export const directionOf = (from: string, account: string) => {
  const f = from.toLowerCase();
  return f === account.toLowerCase() || f.endsWith(OUR_DOMAIN) ? 'out' : 'in';
};

// The addresses of a mail that are not ours: what "known" is checked against.
export const outsiders = (addrs: string[]) => [...new Set(addrs.map((a) => a.toLowerCase()).filter((a) => a.includes('@') && !a.endsWith(OUR_DOMAIN)))];

export type Known = { addrs: Set<string>; domains: string[] };
export const isKnown = (k: Known, addrs: string[]) => outsiders(addrs).some((a) => k.addrs.has(a) || k.domains.some((d) => a.endsWith(d)));

// Plain text of an HTML-only mail; the CRM shows text only (never the sender's markup).
export const htmlToText = (html: string) => html
  .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d|blockquote)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export const safeName = (name: string) => (name || 'attachment').normalize('NFKC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[^\w.\- ]+/g, '-').replace(/\.{2,}/g, '-').replace(/-{2,}/g, '-').replace(/^[-. ]+/, '').slice(0, 120) || 'attachment';

// What the CRM keeps of one mail.
export async function toRow(raw: Uint8Array, account: Account, folder: string, uidvalidity: number, uid: number, tooLarge: boolean) {
  const m = await PostalMime.parse(raw);
  const from = flat(m.from as Addr)[0] ?? { address: '', name: '' };
  return {
    parsed: m,
    row: {
      account_id: account.id, folder, uidvalidity, uid,
      message_id: m.messageId?.trim().slice(0, 500) || null,
      in_reply_to: m.inReplyTo?.trim().slice(0, 500) || null,
      refs: (m.references ?? '').slice(0, 4000),
      direction: directionOf(from.address, account.address),
      from_addr: from.address, from_name: from.name.slice(0, 200),
      to_addrs: flat(m.to as Addr[]).map((a) => a.address).slice(0, 100),
      cc_addrs: flat(m.cc as Addr[]).map((a) => a.address).slice(0, 100),
      subject: (m.subject ?? '').slice(0, 500),
      sent_at: m.date && !isNaN(Date.parse(m.date)) ? new Date(m.date).toISOString() : null,
      body_text: (m.text?.trim() || (m.html ? htmlToText(m.html) : '')).slice(0, 100_000) + (tooLarge ? '\n\n[Too large for the CRM: open it in Zimbra.]' : ''),
      too_large: tooLarge,
    },
  };
}

export async function loadKnown(supabase: Db): Promise<Known> {
  const { data, error } = await supabase.rpc('mail_project_addresses');
  if (error) throw new Error(`known addresses: ${error.message}`);
  const all = ((data ?? []) as { addr: string }[]).map((r) => (r.addr ?? '').toLowerCase()).filter(Boolean);
  return { addrs: new Set(all.filter((a) => !a.startsWith('@'))), domains: all.filter((a) => a.startsWith('@')) };
}

export async function syncMail(supabase: Db, connect: (host: string) => Promise<Imap> = (h) => Imap.connect(h)) {
  if (Deno.env.get('MAIL_SYNC') === 'off') return { skipped: 'off' };
  const started = Date.now();
  const counts = { accounts: 0, scanned: 0, saved: 0, skipped: 0, failed: 0, nopassword: 0 };
  const { data: accounts } = await supabase.from('mail_accounts').select('*').eq('enabled', true).order('created_at');
  let known: Known | null = null;
  let budget = BODIES_PER_RUN;

  for (const a of (accounts ?? []) as Account[]) {
    const pass = Deno.env.get(secretName(a.address));
    if (!pass) { counts.nopassword++; await supabase.from('mail_accounts').update({ last_error: `No password: set the secret ${secretName(a.address)}.` }).eq('id', a.id); continue; }
    if (a.mode === 'known' && !known) known = await loadKnown(supabase);
    let imap: Imap | null = null;
    try {
      imap = await connect(HOST);
      await imap.login(a.address, pass);
      counts.accounts++;
      for (const folder of a.folders) {
        const uidvalidity = await imap.examine(folder);
        const { data: st } = await supabase.from('mail_folder_state').select('*').eq('account_id', a.id).eq('folder', folder).maybeSingle();
        const fresh = !st || Number(st.uidvalidity) !== uidvalidity;
        let last = fresh ? 0 : Number(st.last_uid);
        const uids = (fresh ? await imap.search(`SINCE ${imapDate(new Date(a.since))}`) : await imap.search(`UID ${last + 1}:*`)).filter((u) => u > last);
        if (fresh) await supabase.from('mail_folder_state').upsert({ account_id: a.id, folder, uidvalidity, last_uid: 0 });
        let stop = false;
        for (let i = 0; i < uids.length && !stop; i += CHUNK) {
          const chunk = uids.slice(i, i + CHUNK);
          const heads = await imap.fetch(chunk, a.mode === 'known' ? 'RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC)]' : 'RFC822.SIZE');
          const byUid = new Map(heads.map((h) => [h.uid, h]));
          for (const uid of chunk) {
            const h = byUid.get(uid);
            counts.scanned++;
            let wanted = !!h;
            if (h && a.mode === 'known') {
              const hp = h.data ? await PostalMime.parse(h.data) : null;
              wanted = !!hp && isKnown(known!, [...flat(hp.from as Addr), ...flat(hp.to as Addr[]), ...flat(hp.cc as Addr[])].map((x) => x.address));
            }
            if (!wanted) { counts.skipped++; last = uid; continue; }
            if (budget <= 0 || Date.now() - started > TIME_BUDGET) { stop = true; break; }
            const big = h!.size > MAX_FETCH;
            const [body] = await imap.fetch([uid], big ? 'BODY.PEEK[HEADER]' : 'BODY.PEEK[]');
            if (body?.data) {
              const { parsed, row } = await toRow(body.data, a, folder, uidvalidity, uid, big);
              const dup = row.message_id ? (await supabase.from('mail_messages').select('id').eq('message_id', row.message_id).maybeSingle()).data : null;
              if (!dup) {
                const attachments = [];
                for (const att of parsed.attachments ?? []) {
                  if (att.disposition === 'inline' && att.contentId) continue; // logos and signatures in the body
                  const content = att.content as ArrayBuffer;
                  const size = content?.byteLength ?? 0;
                  const name = safeName(att.filename ?? '');
                  let path: string | null = null;
                  if (size && size <= MAX_ATTACHMENT) {
                    path = `${a.id}/${crypto.randomUUID()}/${name}`;
                    const up = await supabase.storage.from('mail-files').upload(path, new Blob([content]), { contentType: /^[\w.+-]+\/[\w.+-]+$/.test(att.mimeType ?? '') ? att.mimeType : 'application/octet-stream' });
                    if (up.error) path = null;
                  }
                  attachments.push({ name, type: att.mimeType ?? '', size, path });
                }
                const ins = await supabase.from('mail_messages').insert({ ...row, attachments });
                if (ins.error && ins.error.code !== '23505') throw new Error(`save: ${ins.error.message}`);
                if (!ins.error) counts.saved++;
              }
              budget--;
            }
            last = uid;
          }
          await supabase.from('mail_folder_state').update({ last_uid: last }).eq('account_id', a.id).eq('folder', folder);
        }
        if (stop) break;
      }
      await supabase.from('mail_accounts').update({ last_run_at: new Date().toISOString(), last_error: null }).eq('id', a.id);
    } catch (e) {
      counts.failed++;
      await supabase.from('mail_accounts').update({ last_run_at: new Date().toISOString(), last_error: String((e as Error)?.message ?? e).slice(0, 500) }).eq('id', a.id);
    } finally {
      await imap?.logout();
    }
    if (budget <= 0 || Date.now() - started > TIME_BUDGET) break;
  }
  return counts;
}

// One-off review (migration 0037): HEADERS ONLY of chris@ / kate@ mail with people the CRM does not know, written to
// the staff-only table mail_header_scan, never returned to the caller. Called page by page: { account, folder, after }
// → { next } (the last UID looked at, or null at the end). The body of these mails is never fetched.
const SCAN_PAGE = 300;
export async function scanHeaders(supabase: Db, req: { account: string; folder: string; after?: number }, connect: (host: string) => Promise<Imap> = (h) => Imap.connect(h)) {
  const { data: a } = await supabase.from('mail_accounts').select('*').eq('address', req.account).maybeSingle();
  if (!a || a.mode !== 'known' || !(a.folders as string[]).includes(req.folder)) return { error: 'account' };
  const pass = Deno.env.get(secretName(a.address));
  if (!pass) return { error: 'no password' };
  const known = await loadKnown(supabase);
  const imap = await connect(HOST);
  try {
    await imap.login(a.address, pass);
    await imap.examine(req.folder);
    const after = Number(req.after) || 0;
    const uids = (await imap.search(`SINCE ${imapDate(new Date(a.since))}`)).filter((u) => u > after).slice(0, SCAN_PAGE);
    let stored = 0;
    for (let i = 0; i < uids.length; i += 100) {
      const heads = await imap.fetch(uids.slice(i, i + 100), 'BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE)]');
      const rows = [];
      for (const h of heads) {
        if (!h.data) continue;
        const p = await PostalMime.parse(h.data);
        const from = flat(p.from as Addr)[0] ?? { address: '', name: '' };
        const to = [...flat(p.to as Addr[]), ...flat(p.cc as Addr[])].map((x) => x.address);
        if (isKnown(known, [from.address, ...to])) continue; // already in the CRM
        rows.push({ account: a.address, folder: req.folder, uid: h.uid, from_addr: from.address, from_name: from.name.slice(0, 200), to_addrs: to.slice(0, 50), subject: (p.subject ?? '').slice(0, 500), sent_at: p.date && !isNaN(Date.parse(p.date)) ? new Date(p.date).toISOString() : null });
      }
      if (rows.length) {
        const up = await supabase.from('mail_header_scan').upsert(rows);
        if (up.error) throw new Error(`scan: ${up.error.message}`);
        stored += rows.length;
      }
    }
    return { stored, next: uids.length === SCAN_PAGE ? uids[uids.length - 1] : null };
  } finally { await imap.logout(); }
}
