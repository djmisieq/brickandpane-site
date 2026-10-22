// Supabase Edge Function: email a notification when a row is inserted into public.notifications.
// Called by the trigger in supabase/migrations/0006_notify_email_trigger.sql (pg_net) on every new notification.
// Deploy with: supabase functions deploy notify-email --no-verify-jwt
// Secrets: RESEND_API_KEY, MAIL_FROM (e.g. "Brick & Pane <projects@brickandpane.co.uk>"), PORTAL_URL,
// plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided automatically).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://brickandpane.co.uk/portal.html';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  // The caller only says which notification to send. Everything else is read from the database, so a forged
  // request cannot put its own text in an email, and each notification is emailed once, while it is fresh.
  const payload = await req.json().catch(() => ({}));
  if (payload.type !== 'INSERT' || typeof payload.record?.id !== 'string') return new Response('ignored', { status: 200 });
  const { data: n } = await supabase.from('notifications').select('*').eq('id', payload.record.id).maybeSingle();
  if (!n || n.emailed_at || Date.now() - new Date(n.created_at).getTime() > 10 * 60e3) return new Response('skipped', { status: 200 });

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

  // Claim the notification before sending: of two calls racing for the same id, only one gets the row back.
  const { data: claimed } = await supabase.from('notifications').update({ emailed_at: new Date().toISOString() })
    .eq('id', n.id).is('emailed_at', null).select('id');
  if (!claimed?.length) return new Response('skipped', { status: 200 });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to, subject: n.title, html }),
  });
  if (!res.ok) {
    await supabase.from('notifications').update({ emailed_at: null }).eq('id', n.id); // a retry may send it
    return new Response(`mail failed: ${await res.text()}`, { status: 502 });
  }
  return new Response('sent', { status: 200 });
});
