// Mail sync against a fake IMAP server and an in-memory database: read-only on the mailbox, private mail of chris@ /
// kate@ never downloaded, each mail kept once. Run: npx -y deno@2 test --node-modules-dir=auto supabase/functions/_shared/
import { deepStrictEqual as eq, ok as assert } from 'node:assert/strict';
import { Imap, imapDate, type Conn } from './imap.ts';
import { directionOf, flat, htmlToText, isKnown, outsiders, safeName, secretName, syncMail } from './mail-sync.ts';

const enc = new TextEncoder();
const mail = (from: string, to: string, subject: string, id: string, body = 'Hello') =>
  `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMessage-ID: <${id}>\r\nDate: Mon, 23 Nov 2026 10:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;

// A fake IMAP server: folders of {uid, raw}; answers in 7-byte pieces so literals cross chunk borders.
function fakeServer(folders: Record<string, { uid: number; raw: string }[]>, log: string[]) {
  let push!: (b: Uint8Array) => void;
  const readable = new ReadableStream<Uint8Array>({ start(c) { push = (b) => { for (let i = 0; i < b.length; i += 7) c.enqueue(b.slice(i, i + 7)); }; } });
  let current: { uid: number; raw: string }[] = [];
  const send = (s: string) => push(enc.encode(s));
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const line = new TextDecoder().decode(chunk).trim();
      const [tag, ...rest] = line.split(' ');
      const cmd = rest.join(' ');
      log.push(cmd.startsWith('LOGIN') ? 'LOGIN ***' : cmd);
      if (/^LOGIN/i.test(cmd)) return send(`${tag} OK logged in\r\n`);
      if (/^EXAMINE/i.test(cmd)) {
        const name = cmd.match(/"(.*)"/)![1];
        current = folders[name] ?? [];
        return send(`* ${current.length} EXISTS\r\n* OK [UIDVALIDITY 77] ok\r\n${tag} OK [READ-ONLY] done\r\n`);
      }
      if (/^UID SEARCH/i.test(cmd)) {
        const m = cmd.match(/UID (\d+):\*/);
        const from = m ? Number(m[1]) : 0;
        let uids = current.map((x) => x.uid).filter((u) => u >= from);
        if (m && !uids.length && current.length) uids = [current[current.length - 1].uid]; // n:* always matches the last
        return send(`* SEARCH ${uids.join(' ')}\r\n${tag} OK\r\n`);
      }
      if (/^UID FETCH/i.test(cmd)) {
        const ids = cmd.match(/^UID FETCH ([\d,]+)/i)![1].split(',').map(Number);
        let out = '';
        for (const [n, msg] of current.entries()) {
          if (!ids.includes(msg.uid)) continue;
          const head = msg.raw.split('\r\n\r\n')[0] + '\r\n\r\n';
          const part = /HEADER\.FIELDS/i.test(cmd) ? head.split('\r\n').filter((l) => /^(From|To|Cc):/i.test(l)).join('\r\n') + '\r\n\r\n'
            : /BODY\.PEEK\[HEADER\]/i.test(cmd) ? head : /BODY\.PEEK\[\]/i.test(cmd) ? msg.raw : null;
          const bytes = part === null ? null : enc.encode(part);
          out += `* ${n + 1} FETCH (UID ${msg.uid} RFC822.SIZE ${msg.raw.length}${bytes ? ` BODY[] {${bytes.length}}\r\n${part}` : ''})\r\n`;
        }
        return send(`${out}${tag} OK\r\n`);
      }
      if (/^LOGOUT/i.test(cmd)) return send(`* BYE\r\n${tag} OK\r\n`);
      send(`${tag} BAD unknown\r\n`);
    },
  });
  return { conn: { readable, writable, close() {} } as Conn, hello: () => send('* OK IMAP ready\r\n') };
}

// Enough of supabase-js for syncMail.
function fakeDb(known: string[]) {
  const t: Record<string, Record<string, unknown>[]> = {
    mail_accounts: [
      { id: 'a1', address: 'contact@brickandpane.co.uk', mode: 'all', folders: ['INBOX', 'Sent'], since: '2026-09-01', enabled: true, created_at: '1' },
      { id: 'a2', address: 'kate@brickandpane.co.uk', mode: 'known', folders: ['INBOX', 'Sent'], since: '2026-09-01', enabled: true, created_at: '2' },
    ],
    mail_folder_state: [], mail_messages: [],
  };
  const uploads: string[] = [];
  const q = (name: string) => {
    let rows = () => t[name];
    const filters: [string, unknown][] = [];
    const match = (r: Record<string, unknown>) => filters.every(([k, v]) => r[k] === v);
    let op: 'select' | 'update' = 'select'; let patch: Record<string, unknown> = {};
    const b = {
      select: () => b, order: () => b,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
      maybeSingle: async () => ({ data: rows().find(match) ?? null }),
      update: (p: Record<string, unknown>) => { op = 'update'; patch = p; return b; },
      upsert: async (r: Record<string, unknown>) => { const i = rows().findIndex((x) => x.account_id === r.account_id && x.folder === r.folder); if (i >= 0) rows()[i] = r; else rows().push(r); return { error: null }; },
      insert: async (r: Record<string, unknown>) => {
        if (r.message_id && rows().some((x) => x.message_id === r.message_id)) return { error: { code: '23505', message: 'dup' } };
        rows().push(r); return { error: null };
      },
      then: (res: (v: unknown) => void) => {
        if (op === 'update') { rows().filter(match).forEach((r) => Object.assign(r, patch)); return res({ error: null }); }
        res({ data: rows().filter(match) });
      },
    };
    rows = () => t[name];
    return b;
  };
  return {
    t, uploads,
    from: q,
    rpc: async (fn: string) => fn === 'mail_project_addresses' ? { data: known.map((addr) => ({ addr })) } : { error: { message: fn } },
    storage: { from: () => ({ upload: async (p: string) => { uploads.push(p); return { error: null }; } }) },
  };
}

Deno.test('helpers: secret names, addresses, direction, known, text from HTML, file names', () => {
  eq(secretName('contact@brickandpane.co.uk'), 'MAIL_PASSWORD_CONTACT');
  eq(flat([{ address: 'A@X.com', name: 'A' }, { name: 'team', group: [{ address: 'b@y.com' }] }]), [{ address: 'a@x.com', name: 'A' }, { address: 'b@y.com', name: '' }]);
  eq(directionOf('Kate@BrickAndPane.co.uk', 'contact@brickandpane.co.uk'), 'out');
  eq(directionOf('client@gmail.com', 'contact@brickandpane.co.uk'), 'in');
  eq(outsiders(['kate@brickandpane.co.uk', 'X@a.com', 'x@a.com']), ['x@a.com']);
  const k = { addrs: new Set(['client@gmail.com']), domains: ['@okna.pl'] };
  assert(isKnown(k, ['kate@brickandpane.co.uk', 'client@gmail.com']));
  assert(isKnown(k, ['jan@okna.pl']));
  assert(!isKnown(k, ['mum@gmail.com', 'kate@brickandpane.co.uk']));
  eq(htmlToText('<p>Hi&nbsp;Kate</p><script>x()</script><div>Line&amp;2</div>'), 'Hi Kate\nLine&2');
  eq(safeName('../../etc\u202e/passwd.pdf'), 'etc-passwd.pdf');
  eq(imapDate(new Date('2026-11-03T00:00:00Z')), '3-Nov-2026');
});

Deno.test('imap: only PEEK fetches are allowed', async () => {
  const log: string[] = [];
  const s = fakeServer({}, log);
  const imap = new Imap(s.conn);
  await imap.fetch([1], 'BODY[]').then(() => assert(false), (e) => eq(e.message, 'fetch must PEEK'));
  await imap.fetch([1], 'RFC822').then(() => assert(false), (e) => eq(e.message, 'fetch must PEEK'));
  eq(log, []);
});

Deno.test('sync: contact@ whole, kate@ only known people, read only, each mail once, resumes', async () => {
  const boxes: Record<string, Record<string, { uid: number; raw: string }[]>> = {
    'contact@brickandpane.co.uk': {
      INBOX: [{ uid: 1, raw: mail('Stranger <new@gmail.com>', 'contact@brickandpane.co.uk', 'Sash windows?', 'm1@x') },
              { uid: 2, raw: mail('Client <client@gmail.com>', 'contact@brickandpane.co.uk', 'Re: quote', 'm2@x') }],
      Sent: [],
    },
    'kate@brickandpane.co.uk': {
      INBOX: [{ uid: 5, raw: mail('Mum <mum@gmail.com>', 'kate@brickandpane.co.uk', 'Sunday lunch', 'p1@x', 'PRIVATE') },
              { uid: 6, raw: mail('Okna <jan@okna.pl>', 'kate@brickandpane.co.uk', 'Offer', 'm3@x') }],
      Sent: [{ uid: 9, raw: mail('Kate <kate@brickandpane.co.uk>', 'client@gmail.com', 'Re: quote', 'm2@x') }, // same mail as contact@ uid 2
             { uid: 10, raw: mail('Kate <kate@brickandpane.co.uk>', 'client@gmail.com', 'Drawings', 'm4@x') }],
    },
  };
  const env = { MAIL_PASSWORD_CONTACT: 'x', MAIL_PASSWORD_KATE: 'y' } as Record<string, string>;
  const get = Deno.env.get; Deno.env.get = (k: string) => env[k];
  try {
    const db = fakeDb(['client@gmail.com', '@okna.pl']);
    const logs: string[][] = [];
    const order = ['contact@brickandpane.co.uk', 'kate@brickandpane.co.uk'];
    let n = 0;
    const connect = async () => {
      const log: string[] = []; logs.push(log);
      const s = fakeServer(boxes[order[n++ % 2]], log);
      const imap = new Imap(s.conn); s.hello(); await imap.readResponse(); return imap;
    };
    const r = await syncMail(db, connect) as Record<string, number>;
    eq([r.saved, r.failed, r.nopassword], [4, 0, 0]); // m1, m2 (contact@), m3, m4 (kate@); m2 again from kate@ Sent is a duplicate
    const subjects = db.t.mail_messages.map((m) => m.subject).sort();
    eq(subjects, ['Drawings', 'Offer', 'Re: quote', 'Sash windows?']);
    assert(!db.t.mail_messages.some((m) => String(m.body_text).includes('PRIVATE')), 'private mail is not kept');
    const all = logs.flat();
    assert(!all.some((c) => /STORE|COPY|MOVE|EXPUNGE|APPEND|DELETE|SELECT |\bBODY\[/i.test(c)), `read-only commands: ${all.join(' | ')}`);
    const kate = logs[1].join('\n');
    assert(!/UID FETCH 5 \(UID BODY\.PEEK\[\]\)/.test(kate), 'the private mail body is never fetched');
    eq(db.t.mail_messages.find((m) => m.subject === 'Drawings')!.direction, 'out');
    // Next run: nothing new.
    const again = await syncMail(db, connect) as Record<string, number>;
    eq(again.saved, 0);
    eq(db.t.mail_folder_state.map((s) => `${s.account_id}/${s.folder}:${s.last_uid}`).sort(), ['a1/INBOX:2', 'a1/Sent:0', 'a2/INBOX:6', 'a2/Sent:10']);
  } finally { Deno.env.get = get; }
});
