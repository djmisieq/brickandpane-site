// Supabase Edge Function: copy HubSpot deal stages to linked portal projects (HubSpot is the only source of the
// stage, owner decision 01.11.2026). Called by pg_cron every 15 minutes (migration 0020). Reads deals with
// bp_portal_project_id changed since the last run and moves a project only when its deal's stage changed; the
// mapping and the rules are in _shared/hubspot.ts (STAGE_OF_DEAL, stageMove, syncStages). Idempotent, so it runs
// without JWT verification, like hubspot-retry.
// Deploy: supabase functions deploy hubspot-stage-sync --no-verify-jwt
// Secrets: HUBSPOT_TOKEN, plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided automatically). Logs only counts.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HubSpotError, syncStages } from '../_shared/hubspot.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const result = await syncStages(supabase);
    console.log(JSON.stringify(result));
    return reply(200, result);
  } catch (e) {
    const status = e instanceof HubSpotError ? e.status : 0;
    console.log(JSON.stringify({ error: 'search', status }));
    return reply(200, { error: 'search', status });
  }
});
