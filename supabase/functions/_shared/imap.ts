// A small READ-ONLY IMAP client (RFC 3501) for mail-sync. It can log in, EXAMINE a folder (read-only by the protocol:
// the server refuses any change to it), search by UID and fetch with BODY.PEEK (never sets \Seen). There is no
// command here that stores, copies, moves, expunges or appends: the owner's condition for connecting the mailboxes.

export type Conn = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): void };
export type Fetched = { uid: number; size: number; data: Uint8Array | null };

const enc = new TextEncoder();
const latin1 = new TextDecoder('latin1');
const concat = (a: Uint8Array, b: Uint8Array) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// One server response: the text of its lines (literals cut out) and the literals, in order.
export type Untagged = { text: string; literals: Uint8Array[] };

export class Imap {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buf = new Uint8Array(0);
  private tag = 0;
  constructor(private conn: Conn, private timeoutMs = 30000) {
    this.reader = conn.readable.getReader();
    this.writer = conn.writable.getWriter();
  }

  static async connect(host: string, port = 993) {
    const c = await Deno.connectTls({ hostname: host, port });
    const imap = new Imap(c);
    const hello = await imap.readResponse();
    if (!/^\* (OK|PREAUTH)/i.test(hello.text)) throw new Error(`IMAP greeting: ${hello.text.slice(0, 120)}`);
    return imap;
  }

  private async chunk() {
    const t = setTimeout(() => this.reader.cancel('timeout').catch(() => {}), this.timeoutMs);
    try {
      const { value, done } = await this.reader.read();
      if (done || !value) throw new Error('IMAP connection closed');
      return value;
    } finally { clearTimeout(t); }
  }
  private async more() { this.buf = concat(this.buf, await this.chunk()); }
  private async line(): Promise<string> {
    for (;;) {
      const i = this.buf.findIndex((b, j) => b === 10 && this.buf[j - 1] === 13);
      if (i >= 0) { const l = latin1.decode(this.buf.subarray(0, i - 1)); this.buf = this.buf.slice(i + 1); return l; }
      await this.more();
    }
  }
  // A literal: read straight into one buffer (a 10 MB mail must not be copied chunk by chunk).
  private async bytes(n: number) {
    const out = new Uint8Array(n);
    let got = Math.min(n, this.buf.length);
    out.set(this.buf.subarray(0, got)); this.buf = this.buf.slice(got);
    while (got < n) {
      const c = await this.chunk();
      const take = Math.min(n - got, c.length);
      out.set(c.subarray(0, take), got); got += take;
      if (take < c.length) this.buf = c.slice(take);
    }
    return out;
  }
  // A whole response, following {n} literals.
  async readResponse(): Promise<Untagged> {
    let text = ''; const literals: Uint8Array[] = [];
    for (;;) {
      const l = await this.line();
      const m = l.match(/\{(\d+)\}$/);
      if (!m) { text += l; return { text, literals }; }
      text += l.slice(0, -m[0].length) + `{#${literals.length}}`;
      literals.push(await this.bytes(Number(m[1])));
    }
  }

  // Sends a command; returns the untagged responses. Throws on NO/BAD.
  async cmd(command: string): Promise<Untagged[]> {
    const t = `A${++this.tag}`;
    await this.writer.write(enc.encode(`${t} ${command}\r\n`));
    const out: Untagged[] = [];
    for (;;) {
      const r = await this.readResponse();
      if (r.text.startsWith(`${t} `)) {
        if (!/^\S+ OK/i.test(r.text)) throw new ImapError(command.split(' ')[0], r.text.slice(t.length + 1, t.length + 200));
        return out;
      }
      out.push(r);
    }
  }

  login(user: string, pass: string) { return this.cmd(`LOGIN ${quote(user)} ${quote(pass)}`); }

  // Read-only open. Returns UIDVALIDITY.
  async examine(folder: string) {
    const res = await this.cmd(`EXAMINE ${quote(folder)}`);
    const v = res.map((r) => r.text.match(/UIDVALIDITY (\d+)/i)).find(Boolean);
    if (!v) throw new ImapError('EXAMINE', 'no UIDVALIDITY');
    return Number(v[1]);
  }

  async search(criteria: string): Promise<number[]> {
    const res = await this.cmd(`UID SEARCH ${criteria}`);
    return res.filter((r) => /^\* SEARCH/i.test(r.text)).flatMap((r) => r.text.replace(/^\* SEARCH/i, '').trim().split(/\s+/).filter(Boolean).map(Number)).sort((a, b) => a - b);
  }

  // items is what goes into the FETCH, e.g. 'RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC)]'.
  // Anything that is not a PEEK would mark mail read, so it is refused here.
  async fetch(uids: number[], items: string): Promise<Fetched[]> {
    if (!uids.length) return [];
    if (/(^|[\s(])BODY\[/i.test(items) || /(^|[\s(])RFC822(\.TEXT)?(?=[\s)]|$)/i.test(items)) throw new Error('fetch must PEEK');
    const res = await this.cmd(`UID FETCH ${uids.join(',')} (UID ${items})`);
    return res.filter((r) => /^\* \d+ FETCH/i.test(r.text)).map((r) => {
      const uid = Number(r.text.match(/UID (\d+)/i)?.[1] ?? 0);
      const size = Number(r.text.match(/RFC822\.SIZE (\d+)/i)?.[1] ?? 0);
      return { uid, size, data: r.literals[0] ?? null };
    }).filter((f) => f.uid > 0);
  }

  async logout() {
    try { await this.cmd('LOGOUT'); } catch { /* closing anyway */ }
    try { this.conn.close(); } catch { /* closed */ }
  }
}

export class ImapError extends Error {
  constructor(public command: string, message: string) { super(`${command}: ${message}`); }
}

// IMAP SEARCH dates are like 1-Nov-2026.
export const imapDate = (d: Date) => `${d.getUTCDate()}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}-${d.getUTCFullYear()}`;
