// Supabase Edge Function: tell HubSpot about the portal. Called by the triggers in migration 0018 (pg_net) when an
// enquiry becomes a project, when such a project changes stage, and when an account's email is confirmed.
// The body names only a project_id or a profile_id; everything else is read from the database, and the work is
// idempotent, so a forged or repeated call changes nothing that a real one wouldn't. That is why it runs without
// JWT verification, like notify-email. Logic in _shared/hubspot.ts (linkProject, linkProfile).
// Deploy: supabase functions deploy hubspot-link --no-verify-jwt
// Secrets: HUBSPOT_TOKEN, plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided automatically). Logs only outcomes.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HubSpotError, linkProfile, linkProject } from '../_shared/hubspot.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  const { project_id, profile_id } = await req.json().catch(() => ({}));
  const kind = UUID.test(project_id ?? '') ? 'project' : UUID.test(profile_id ?? '') ? 'profile' : null;
  if (!kind) return reply(400, { error: 'id' });
  try {
    const result = kind === 'project' ? await linkProject(supabase, project_id) : await linkProfile(supabase, profile_id);
    console.log(JSON.stringify({ kind, result }));
    return reply(200, { result });
  } catch (e) {
    const status = e instanceof HubSpotError ? e.status : 0;
    console.log(JSON.stringify({ kind, result: 'error', status }));
    return reply(200, { result: 'error', status });
  }
});
