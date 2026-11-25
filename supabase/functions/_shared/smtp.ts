// Sending mail from the CRM (mail stage 1b, owner 25.11.2026: "5 ok"). Only after a person approves it in the CRM:
// supabase/functions/mail-send checks a signed-in staff member and their tick before this is called.
// SMTP over TLS on 465 (OVH Zimbra; Supabase blocks 25 and 587). The same mailbox passwords as the read-only sync.
// Plain text, UTF-8, base64 body; a reply carries In-Reply-To and References so it stays in the client's thread.
export const SMTP_HOST = 'smtp.mail.ovh.net';
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (s: string) => { let bin = ''; for (const b of enc.encode(s)) bin += String.fromCharCode(b); return btoa(bin); };
// RFC 2047 for a header with non-ASCII (Polish names and subjects).
export const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addr = (a: string) => { const x = a.trim(); if (!/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(x)) throw new Error(`Not an email address: ${x.slice(0, 80)}`); return x; };
export type Mail = { from: string; fromName?: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string; inReplyTo?: string | null; references?: string; messageId: string; date?: Date };

export function buildMessage(m: Mail): string {
  const lines = [
    `From: ${m.fromName ? `${word(m.fromName)} ` : ''}<${addr(m.from)}>`,
    `To: ${m.to.map(addr).join(', ')}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.map(addr).join(', ')}`] : []),
    `Subject: ${word(m.subject.replace(/[\r\n]+/g, ' ').trim())}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${m.messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${[m.references, m.inReplyTo].filter(Boolean).join(' ').trim()}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    ...(b64(m.text.replace(/\r?\n/g, '\r\n')).match(/.{1,76}/g) ?? []),
  ];
  return lines.join('\r\n');
}
export const newMessageId = (from: string) => `<${crypto.randomUUID()}@${from.split('@')[1] || 'brickandpane.co.uk'}>`;

type Conn = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): void };
export class Smtp {
  private reader: ReadableStreamDefaultReader<Uint8Array>; private writer: WritableStreamDefaultWriter<Uint8Array>; private buf = '';
  constructor(private conn: Conn) { this.reader = conn.readable.getReader(); this.writer = conn.writable.getWriter(); }
  static async connect(host = SMTP_HOST, port = 465, open = (h: string, p: number) => Deno.connectTls({ hostname: h, port: p }) as Promise<Conn>) {
    const s = new Smtp(await open(host, port)); await s.expect(220); return s;
  }
  // One reply (multi-line "250-..." then "250 ..."), with a 30 s limit.
  async reply(): Promise<{ code: number; text: string }> {
    const text: string[] = [];
    for (;;) {
      let i: number;
      while ((i = this.buf.indexOf('\r\n')) < 0) {
        const t = setTimeout(() => this.reader.cancel('timeout').catch(() => {}), 30000);
        try { const { value, done } = await this.reader.read(); if (done || !value) throw new Error('SMTP connection closed'); this.buf += dec.decode(value); } finally { clearTimeout(t); }
      }
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2); text.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) return { code: Number(line.slice(0, 3)), text: text.join('\n') };
    }
  }
  async expect(code: number) { const r = await this.reply(); if (r.code !== code) throw new Error(`SMTP ${r.code}: ${r.text.slice(0, 200)}`); return r; }
  async cmd(line: string, code: number) { await this.writer.write(enc.encode(`${line}\r\n`)); return this.expect(code); }
  async send(user: string, pass: string, m: Mail) {
    await this.cmd('EHLO brickandpane.co.uk', 250);
    await this.cmd(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`, 235);
    await this.cmd(`MAIL FROM:<${addr(m.from)}>`, 250);
    for (const r of [...m.to, ...(m.cc ?? []), ...(m.bcc ?? [])]) await this.cmd(`RCPT TO:<${addr(r)}>`, 250);
    await this.cmd('DATA', 354);
    // Dot-stuffing: a line that starts with "." gets one more (base64 lines never do, headers might).
    const body = buildMessage(m).split('\r\n').map((l) => (l.startsWith('.') ? `.${l}` : l)).join('\r\n');
    await this.writer.write(enc.encode(`${body}\r\n.\r\n`)); await this.expect(250);
    try { await this.cmd('QUIT', 221); } catch { /* the mail is accepted */ }
    try { this.conn.close(); } catch { /* closed */ }
  }
}
