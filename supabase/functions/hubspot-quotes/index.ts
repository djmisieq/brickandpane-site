// Supabase Edge Function: the CRM's Quotes tab ↔ HubSpot (migrations 0026, 0027). Logic in _shared/hubspot-quotes.ts.
// Actions (POST JSON { action, ... }):
//   search { q }        staff: deals by name, or by the contact's name, email or phone (empty q: recent open deals)
//   deal { deal_id }    staff: one deal with its contact, plus PDF/Word files already on it (quotes sent outside the CRM)
//   file { file_id }    staff: a 5-minute link to one of those files
//   send { send_id }    staff: send one recorded quote_sends row to HubSpot now (the note, the PDF, the stage)
//   sync                anyone (pg_cron every 15 min): retry sends that failed, and take quote statuses from deal stages
// Staff actions check the caller's JWT and role here; sync only repeats idempotent work, so the function is deployed
// without gateway JWT verification, like hubspot-events.
// Deploy: supabase functions deploy hubspot-quotes --no-verify-jwt
// Secrets: HUBSPOT_TOKEN (needs crm.objects.deals.read/write, contacts.read, and "files" for the PDF; notes on deals
// as for hubspot-events). Optional HUBSPOT_QUOTES=off to pause. Logs only actions and counts.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HubSpotError } from '../_shared/hubspot.ts';
import { dealCard, dealFiles, fileUrl, processSend, searchDeals, syncQuotes } from '../_shared/hubspot-quotes.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ORIGINS = new Set(['https://brickandpane.co.uk', 'https://www.brickandpane.co.uk', 'http://127.0.0.1:4173', 'http://localhost:4173']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^\d{1,20}$/;

const isStaff = async (req: Request) => {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return false;
  const { data } = await supabase.auth.getUser(jwt);
  if (!data?.user) return false;
  const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return p?.role === 'staff';
};

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  const cors: Record<string, string> = ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
    : {};
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  if (Deno.env.get('HUBSPOT_QUOTES') === 'off') return reply(200, { error: 'off' });

  if (action === 'sync') {
    const result = await syncQuotes(supabase).catch(() => ({ error: 'sync' }));
    console.log(JSON.stringify({ action, ...result }));
    return reply(200, result);
  }
  if (!['search', 'deal', 'file', 'send'].includes(action)) return reply(400, { error: 'action' });
  if (!(await isStaff(req))) return reply(401, { error: 'staff only' });
  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return reply(200, { error: 'no token' });

  try {
    if (action === 'search') return reply(200, { deals: await searchDeals(token, String(body.q ?? '')) });
    if (action === 'deal') {
      if (!ID.test(String(body.deal_id ?? ''))) return reply(400, { error: 'deal_id' });
      const { data: own } = await supabase.from('quote_sends').select('hubspot_note_id').eq('hubspot_deal_id', String(body.deal_id)).not('hubspot_note_id', 'is', null);
      const [deal, files] = await Promise.all([
        dealCard(token, String(body.deal_id)),
        dealFiles(token, String(body.deal_id), new Set((own ?? []).map((r: { hubspot_note_id: string }) => r.hubspot_note_id))),
      ]);
      return reply(200, { deal, ...files });
    }
    if (action === 'file') {
      if (!ID.test(String(body.file_id ?? ''))) return reply(400, { error: 'file_id' });
      return reply(200, { url: await fileUrl(token, String(body.file_id)) });
    }
    if (!UUID.test(String(body.send_id ?? ''))) return reply(400, { error: 'send_id' });
    const result = await processSend(supabase, String(body.send_id), 20); // Retry by a person: more tries than the cron
    const { data: row } = await supabase.from('quote_sends').select('hubspot_note_id, hubspot_error, hubspot_stage_moved').eq('id', body.send_id).maybeSingle();
    console.log(JSON.stringify({ action, result }));
    return reply(200, { result, ...(row ?? {}) });
  } catch (e) {
    const status = e instanceof HubSpotError ? e.status : 0;
    console.log(JSON.stringify({ action, result: 'error', status }));
    return reply(200, { error: status === 403 ? 'scope' : 'hubspot', status });
  }
});
