// Supabase Edge Function: turn queued portal events (a client's message, an accepted quotation, a client's upload,
// a document the team adds) into one note each on the project's HubSpot deal. Called by pg_cron every 15 minutes
// (migration 0022); the triggers that queue events are in 0021. Logic in _shared/hubspot.ts (eventNote, sendEvents).
// Each event is sent once (sent_at), so it runs without JWT verification, like hubspot-retry.
// Deploy: supabase functions deploy hubspot-events --no-verify-jwt
// Secrets: HUBSPOT_TOKEN, optional HUBSPOT_EVENTS=off to pause, plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (provided automatically). Logs only counts.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { sendEvents } from '../_shared/hubspot.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  const result = await sendEvents(supabase).catch(() => ({ error: 'read' }));
  console.log(JSON.stringify(result));
  return reply(200, result);
});
