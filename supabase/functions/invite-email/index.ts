// Supabase Edge Function: email a client the invitation to the project made from their enquiry.
// Called by public.invite_email() (migration 0024, pg_net) when staff convert an enquiry with
// "Email the client an invitation" ticked. The caller only gives the invite id; the function sends only for an
// invite staff marked (send_email) and never emailed, so a forged call can at most send that one email, once.
// Deploy: supabase functions deploy invite-email --no-verify-jwt
// Secrets: RESEND_API_KEY, MAIL_FROM, PORTAL_URL (shared with notify-email).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://brickandpane.co.uk/portal.html';
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const TEXT = {
  en: {
    subject: (ref: string) => `Your project in the Brick & Pane portal · ${ref}`,
    hello: (name: string) => name ? `Hello ${name},` : 'Hello,',
    intro: (enq: string, ref: string) => `Thank you for your enquiry${enq ? ` ${enq}` : ''}. We’ve set it up as project ${ref} in our project portal, where you can follow its progress, see its documents and send us messages.`,
    how: (email: string) => `To see it, create an account with this email address: ${email}. If you sign in with Google or Microsoft, use the same address.`,
    button: 'Create your account',
    foot: 'You’re receiving this email because you sent us an enquiry at brickandpane.co.uk.',
  },
  pl: {
    subject: (ref: string) => `Twój projekt w portalu Brick & Pane · ${ref}`,
    hello: (name: string) => name ? `Dzień dobry ${name},` : 'Dzień dobry,',
    intro: (enq: string, ref: string) => `Dziękujemy za zapytanie${enq ? ` ${enq}` : ''}. Założyliśmy z niego projekt ${ref} w naszym portalu: zobaczysz tam jego postęp i dokumenty, możesz też pisać do nas wiadomości.`,
    how: (email: string) => `Aby go zobaczyć, załóż konto na ten adres e-mail: ${email}. Jeśli logujesz się przez Google lub Microsoft, użyj tego samego adresu.`,
    button: 'Załóż konto',
    foot: 'Ta wiadomość dotyczy zapytania wysłanego przez brickandpane.co.uk.',
  },
};

Deno.serve(async (req) => {
  const payload = await req.json().catch(() => ({}));
  if (typeof payload.invite_id !== 'string') return new Response('ignored', { status: 200 });
  const { data: inv } = await supabase.from('project_invites').select('id, project_id, email, send_email, emailed_at, created_at')
    .eq('id', payload.invite_id).maybeSingle();
  if (!inv || !inv.send_email || inv.emailed_at || Date.now() - new Date(inv.created_at).getTime() > 24 * 3600e3) return new Response('skipped', { status: 200 });

  const [{ data: project }, { data: enquiry }] = await Promise.all([
    supabase.from('projects').select('ref').eq('id', inv.project_id).single(),
    supabase.from('contact_requests').select('ref, name, lang').eq('project_id', inv.project_id).maybeSingle(),
  ]);
  if (!project) return new Response('no project', { status: 200 });
  const pl = enquiry?.lang === 'pl';
  const t = pl ? TEXT.pl : TEXT.en;
  const site = PORTAL_URL.replace(/portal\.html.*$/, '');
  const link = `${site}${pl ? 'pl/' : ''}login.html?signup=1&next=portal.html`;
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#1c1b1a;max-width:560px">
      <p style="font-size:13px;color:#6f6a62;margin:0 0 16px">Brick &amp; Pane</p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escape(t.hello(enquiry?.name ?? ''))}</p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escape(t.intro(enquiry?.ref ?? '', project.ref))}</p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escape(t.how(inv.email))}</p>
      <p><a href="${link}" style="display:inline-block;background:#8b3a26;color:#fff;padding:12px 18px;text-decoration:none">${t.button}</a></p>
      <p style="font-size:12px;color:#6f6a62;margin-top:24px">${t.foot}</p>
    </div>`;

  // Claim before sending: of two calls racing for the same invite, only one gets the row back.
  const { data: claimed } = await supabase.from('project_invites').update({ emailed_at: new Date().toISOString() })
    .eq('id', inv.id).is('emailed_at', null).select('id');
  if (!claimed?.length) return new Response('skipped', { status: 200 });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to: inv.email, subject: t.subject(project.ref), html }),
  });
  if (!res.ok) {
    await supabase.from('project_invites').update({ emailed_at: null }).eq('id', inv.id);
    return new Response(`mail failed: ${await res.text()}`, { status: 502 });
  }
  return new Response('sent', { status: 200 });
});
