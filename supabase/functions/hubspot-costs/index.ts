// Supabase Edge Function: supplier quotes (CRM "Costs & margin") ↔ deals in the HubSpot "Purchasing" pipeline, both
// ways. Called by pg_cron every 15 minutes (migration 0033); the rules are in _shared/hubspot-costs.ts (syncCosts).
// Idempotent (a deal id is saved before anything else is done with it), so it runs without JWT verification, like
// hubspot-stage-sync. Costs stay internal: nothing here writes to the client's deal notes or the client portal.
// Deploy: supabase functions deploy hubspot-costs --no-verify-jwt
// Secrets: HUBSPOT_TOKEN, optional HUBSPOT_COSTS=off to pause, plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (provided automatically). Logs only counts.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HubSpotError } from '../_shared/hubspot.ts';
import { syncCosts } from '../_shared/hubspot-costs.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const result = await syncCosts(supabase);
    console.log(JSON.stringify(result));
    return reply(200, result);
  } catch (e) {
    const status = e instanceof HubSpotError ? e.status : 0;
    console.log(JSON.stringify({ error: 'sync', status }));
    return reply(200, { error: 'sync', status });
  }
});
