// Sending from the CRM, pure parts and a talk with a fake server. Run: deno test supabase/functions/_shared/smtp.test.ts
import { deepStrictEqual as eq, ok, rejects } from 'node:assert/strict';
import { buildMessage, Smtp, word } from './smtp.ts';

const dec = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

Deno.test('a reply keeps the thread, Polish text survives, a bad address is refused', () => {
  const msg = buildMessage({ from: 'kate@brickandpane.co.uk', fromName: 'Kate · Brick & Pane', to: ['jo@example.com'], cc: ['chris@brickandpane.co.uk'], subject: 'Re: Wycena okien – Łódź',
    text: 'Dzień dobry,\nwycena w załączniku.', inReplyTo: '<a@x>', references: '<z@x>', messageId: '<m1@brickandpane.co.uk>', date: new Date('2026-11-25T10:00:00Z') });
  ok(msg.includes('To: jo@example.com\r\nCc: chris@brickandpane.co.uk'));
  ok(msg.includes('In-Reply-To: <a@x>\r\nReferences: <z@x> <a@x>'));
  ok(msg.includes(`Subject: ${word('Re: Wycena okien – Łódź')}`) && word('Re: Wycena okien – Łódź').startsWith('=?UTF-8?B?'));
  ok(msg.includes('Date: Wed, 25 Nov 2026 10:00:00 +0000'));
  const body = msg.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  eq(dec(body), 'Dzień dobry,\r\nwycena w załączniku.');
  let threw = false; try { buildMessage({ from: 'kate@brickandpane.co.uk', to: ['not an address'], subject: 'x', text: 'x', messageId: '<m@x>' }); } catch { threw = true; }
  ok(threw);
});

Deno.test('the SMTP conversation: login, recipients, data, and a refusal stops it', async () => {
  const fake = (answers: string[]) => {
    const sent: string[] = []; let q = [...answers];
    const readable = new ReadableStream<Uint8Array>({ pull(c) { const a = q.shift(); if (a === undefined) { c.close(); return; } c.enqueue(new TextEncoder().encode(a)); } });
    const writable = new WritableStream<Uint8Array>({ write(ch) { sent.push(new TextDecoder().decode(ch)); } });
    return { conn: { readable, writable, close() { q = []; } }, sent };
  };
  const good = fake(['220 hi\r\n', '250-ok\r\n250 AUTH PLAIN\r\n', '235 ok\r\n', '250 ok\r\n', '250 ok\r\n', '354 go\r\n', '250 queued\r\n', '221 bye\r\n']);
  const s = await Smtp.connect('h', 465, () => Promise.resolve(good.conn));
  await s.send('kate@brickandpane.co.uk', 'pw', { from: 'kate@brickandpane.co.uk', to: ['jo@example.com'], subject: 'Hello', text: '.dot line', messageId: '<m@x>' });
  ok(good.sent[1].startsWith('AUTH PLAIN '));
  ok(good.sent.some((l) => l === 'RCPT TO:<jo@example.com>\r\n'));
  ok(good.sent.some((l) => l.endsWith('\r\n.\r\n')));
  const bad = fake(['220 hi\r\n', '250 ok\r\n', '535 bad login\r\n']);
  const s2 = await Smtp.connect('h', 465, () => Promise.resolve(bad.conn));
  await rejects(s2.send('kate@brickandpane.co.uk', 'wrong', { from: 'kate@brickandpane.co.uk', to: ['jo@example.com'], subject: 'x', text: 'x', messageId: '<m@x>' }), /535/);
});
