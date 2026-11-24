// Supabase Edge Function: copies mail from the OVH Zimbra mailboxes into the CRM (migration 0035), READ ONLY on the
// mail side. Called by pg_cron every 5 minutes (migration 0036); the rules are in _shared/mail-sync.ts. Idempotent
// (a mail is kept once, by mailbox UID and by Message-ID), so it runs without JWT verification, like hubspot-costs.
// Deploy: supabase functions deploy mail-sync --no-verify-jwt
// Secrets: MAIL_PASSWORD_CONTACT, MAIL_PASSWORD_CHRIS, MAIL_PASSWORD_KATE (set by the owner; a mailbox without one is
// skipped), optional MAIL_SYNC=off to pause, plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided). Logs counts only.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { syncMail } from '../_shared/mail-sync.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const result = await syncMail(supabase);
    console.log(JSON.stringify(result));
    return reply(200, result);
  } catch (e) {
    console.log(JSON.stringify({ error: 'sync' }));
    return reply(200, { error: 'sync', message: String((e as Error)?.message ?? e).slice(0, 200) });
  }
});
