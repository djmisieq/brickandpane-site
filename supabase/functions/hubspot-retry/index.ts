// Supabase Edge Function: repeat HubSpot syncs that failed and alert the team when one never gets through.
// Called by pg_cron every 15 minutes (migration 0016). Looks only at the last 7 days of enquiries without a deal,
// not spam and not test ("TEST …" or "(TEST)", see isTestEnquiry). The backoff and the 5-attempt limit live in _shared/hubspot.ts (retryDue), so
// calling it more often changes nothing; that is also why it can run without JWT verification, like notify-email.
// Deploy: supabase functions deploy hubspot-retry --no-verify-jwt
// Secrets: HUBSPOT_TOKEN, RESEND_API_KEY, MAIL_FROM, optional HUBSPOT_ALERT_TO (default chris@ and kate@),
// plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided automatically). Logs only counts.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { isTestEnquiry, MAX_ATTEMPTS, retryDue, syncEnquiry } from '../_shared/hubspot.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ALERT_TO = (Deno.env.get('HUBSPOT_ALERT_TO') ?? 'chris@brickandpane.co.uk,kate@brickandpane.co.uk').split(',').map((s) => s.trim());
const PER_RUN = 10; // each sync is several HubSpot calls; keeps a run well inside the function time limit

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const mail = (subject: string, html: string) => !Deno.env.get('RESEND_API_KEY') || !Deno.env.get('MAIL_FROM') ? Promise.resolve(null) : fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to: ALERT_TO, subject, html }),
}).catch(() => null);

const COLS = 'id, ref, name, email, company, created_at, hubspot_attempts, hubspot_attempted_at, hubspot_error';
type Row = { id: string; ref: string; name: string; email: string; company: string | null; created_at: string; hubspot_attempts: number; hubspot_attempted_at: string | null; hubspot_error: string | null };
const pending = () => supabase.from('contact_requests').select(COLS)
  .is('hubspot_deal_id', null).is('hubspot_alerted_at', null).neq('status', 'spam')
  .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('created_at').limit(100);

Deno.serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!Deno.env.get('HUBSPOT_TOKEN')) return reply(200, { skipped: 'no token' });

  const { data, error } = await pending();
  if (error) return reply(500, { error: 'read' });
  const rows = (data as Row[]).filter((r) => !isTestEnquiry(r));
  const due = rows.filter((r) => retryDue(r)).slice(0, PER_RUN);
  for (const r of due) await syncEnquiry(supabase, r.id);

  // Out of attempts and still no deal: one email, then hubspot_alerted_at stops further runs from repeating it.
  let alerted = 0;
  const { data: after } = await pending();
  for (const r of ((after ?? []) as Row[]).filter((r) => !isTestEnquiry(r) && r.hubspot_attempts >= MAX_ATTEMPTS)) {
    const sent = await mail(`HubSpot sync failed · ${r.ref}`, `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#1c1b1a;max-width:620px">
        <p style="font-size:13px;color:#6f6a62;margin:0 0 12px">Website enquiry ${escape(r.ref)} · not in HubSpot after ${r.hubspot_attempts} attempts</p>
        <p style="font-size:15px;line-height:1.5">${escape(r.name)}${r.company ? `, ${escape(r.company)}` : ''} &lt;${escape(r.email)}&gt;</p>
        <p style="font-size:14px;color:#6f6a62">Last error: ${escape(r.hubspot_error ?? 'none recorded')}</p>
        <p style="font-size:15px;line-height:1.5">Please add the deal in HubSpot by hand and put <strong>${escape(r.ref)}</strong> in its
          <em>bp_enquiry_ref</em> field, so a later sync finds it instead of creating a second deal.
          The full enquiry is in the <a href="https://brickandpane.co.uk/admin.html#/enquiries">CRM</a>.</p>
      </div>`);
    if (sent?.ok) {
      await supabase.from('contact_requests').update({ hubspot_alerted_at: new Date().toISOString() }).eq('id', r.id);
      alerted++;
    }
  }
  console.log(JSON.stringify({ pending: rows.length, retried: due.length, alerted }));
  return reply(200, { pending: rows.length, retried: due.length, alerted });
});
