// Supabase Edge Function: email a notification when a row is inserted into public.notifications.
// Wire it up with a Database Webhook (table: notifications, event: INSERT) pointing at this function.
// Secrets: RESEND_API_KEY, MAIL_FROM (e.g. "Brick & Pane <projects@brickandpane.co.uk>"), PORTAL_URL,
// plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided automatically).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://brickandpane.co.uk/portal.html';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  const payload = await req.json();
  const n = payload.record;
  if (!n || payload.type !== 'INSERT') return new Response('ignored', { status: 200 });

  const { data: profile } = await supabase.from('profiles').select('full_name, notify_email, role').eq('id', n.user_id).single();
  if (!profile?.notify_email) return new Response('opted out', { status: 200 });

  const { data: user } = await supabase.auth.admin.getUserById(n.user_id);
  const to = user?.user?.email;
  if (!to) return new Response('no email', { status: 200 });

  const base = profile.role === 'staff' ? PORTAL_URL.replace('portal.html', 'admin.html') : PORTAL_URL;
  const link = n.project_id ? `${base}#/p/${n.project_id}` : base;
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#1c1b1a;max-width:560px">
      <p style="font-size:13px;color:#6f6a62;margin:0 0 16px">Brick &amp; Pane · Project update</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">${escape(n.title)}</h1>
      ${n.body ? `<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escape(n.body)}</p>` : ''}
      <p><a href="${link}" style="display:inline-block;background:#8b3a26;color:#fff;padding:12px 18px;text-decoration:none">Open in your project portal</a></p>
      <p style="font-size:12px;color:#6f6a62;margin-top:24px">You can change email notifications in Settings in the portal.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to, subject: n.title, html }),
  });
  if (!res.ok) return new Response(`mail failed: ${await res.text()}`, { status: 502 });

  await supabase.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', n.id);
  return new Response('sent', { status: 200 });
});
