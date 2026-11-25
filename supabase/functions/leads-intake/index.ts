// The leads bot writes to our own CRM instead of HubSpot (CRM audit, phase 5; owner 25.11.2026). One POST, one action:
//   { action: "lookup", email?, domain?, name? }            → is this person or company already in the CRM, and are
//                                                             they a client (on a project)? Read before any outreach.
//   { action: "company", name, kind?, website?, email?, phone?, address?, source?, notes? }   → add, or fill blanks
//   { action: "person", full_name, email?, phone?, job_title?, company? }                    → add, or fill blanks
//   { action: "reply", email, name?, company?, subject?, message, campaign? }
//        a reply to the cold campaign: person and company recorded, and a task for the team on Today (due today,
//        Kate). Nothing is sent to anyone; the team answers from the CRM after checking it.
//   { action: "optout", email?, company? }      → do not contact again (UK GDPR; 0047). Lookup then says do_not_contact.
//   { action: "contacted", email, company? }   → we contacted them today (keeps them off the 12-month deletion).
// Only ADDS or fills empty fields; never deletes, never overwrites what the team typed. Header x-leads-key = secret
// LEADS_KEY (set by the owner, given to the bot); without it: 403. LEADS_INTAKE=off stops it.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const KINDS = ['architect', 'contractor', 'developer', 'supplier', 'homeowner', 'other'];
const SOURCES = ['website', 'email', 'phone', 'referral', 'repeat', 'cold', 'other'];
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const email = (v: unknown) => { const e = clip(v, 200).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; };
type Row = Record<string, unknown> & { id: string };

// Fill only what is empty: what the team typed stays.
async function fill(table: string, row: Row, patch: Record<string, string>) {
  const blanks = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v && !String(row[k] ?? '').trim()));
  if (Object.keys(blanks).length) await supabase.from(table).update(blanks).eq('id', row.id);
  return Object.keys(blanks);
}
async function company(b: Record<string, unknown>) {
  const name = clip(b.name, 200); if (!name) throw new Error('name');
  const kind = KINDS.includes(String(b.kind)) ? String(b.kind) : 'other';
  const { data: found } = await supabase.from('companies').select('*').ilike('name', name.replace(/[%_]/g, '\\$&')).eq('kind', kind).limit(1);
  const patch = { website: clip(b.website, 300), email: email(b.email), phone: clip(b.phone, 60), address: clip(b.address, 500), notes: clip(b.notes, 4000) };
  if (found?.length) return { id: found[0].id, created: false, filled: await fill('companies', found[0] as Row, patch) };
  const source = SOURCES.includes(String(b.source)) ? String(b.source) : null;
  const { data, error } = await supabase.from('companies').insert({ name, kind, source, ...patch }).select('id').single();
  if (error) throw error;
  return { id: data.id, created: true };
}
async function person(b: Record<string, unknown>, companyId: string | null = null) {
  const full_name = clip(b.full_name || b.name, 200), e = email(b.email);
  if (!full_name && !e) throw new Error('full_name or email');
  const { data: found } = e ? await supabase.from('people').select('*').ilike('email', e).limit(1) : { data: [] };
  const patch = { phone: clip(b.phone, 60), job_title: clip(b.job_title, 120), email: e };
  if (found?.length) {
    const filled = await fill('people', found[0] as Row, patch);
    if (companyId && !found[0].company_id) { await supabase.from('people').update({ company_id: companyId }).eq('id', found[0].id); filled.push('company_id'); }
    return { id: found[0].id, created: false, filled };
  }
  const { data, error } = await supabase.from('people').insert({ full_name: full_name || e.split('@')[0], company_id: companyId, ...patch }).select('id').single();
  if (error) throw error;
  return { id: data.id, created: true };
}

Deno.serve(async (req) => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const key = Deno.env.get('LEADS_KEY');
  if (req.method !== 'POST' || !key || req.headers.get('x-leads-key') !== key) return reply(403, { error: 'forbidden' });
  if (Deno.env.get('LEADS_INTAKE') === 'off') return reply(200, { error: 'off' });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return reply(400, { error: 'json' });
  try {
    if (b.action === 'lookup') {
      const e = email(b.email), d = clip(b.domain || (e ? e.split('@')[1] : ''), 200).toLowerCase(), n = clip(b.name, 200);
      const { data: ppl } = e ? await supabase.from('people').select('id, full_name, company_id, profile_id, do_not_contact').ilike('email', e) : { data: [] };
      const coIds = new Set((ppl ?? []).map((p: { company_id: string | null }) => p.company_id).filter(Boolean));
      if (d) for (const c of (await supabase.from('companies').select('id').or(`website.ilike.%${d.replace(/[,()%_]/g, '')}%,email.ilike.%@${d.replace(/[,()%_]/g, '')}`)).data ?? []) coIds.add(c.id);
      if (n) for (const c of (await supabase.from('companies').select('id').ilike('name', n.replace(/[%_]/g, '\\$&'))).data ?? []) coIds.add(c.id);
      const { data: cos } = coIds.size ? await supabase.from('companies').select('id, name, kind, source, do_not_contact').in('id', [...coIds]) : { data: [] };
      const { data: links } = coIds.size ? await supabase.from('project_companies').select('company_id, role').in('company_id', [...coIds]) : { data: [] };
      const { data: req0 } = e ? await supabase.from('contact_requests').select('id').ilike('email', e).limit(1) : { data: [] };
      const client = (links ?? []).length > 0 || (ppl ?? []).some((p: { profile_id: string | null }) => p.profile_id) || (req0 ?? []).length > 0;
      const do_not_contact = (ppl ?? []).some((p: { do_not_contact: boolean }) => p.do_not_contact) || (cos ?? []).some((c: { do_not_contact: boolean }) => c.do_not_contact);
      return reply(200, { known: (ppl ?? []).length > 0 || (cos ?? []).length > 0, client, do_not_contact, people: ppl ?? [], companies: (cos ?? []).map((c: Row) => ({ ...c, projects: (links ?? []).filter((l: { company_id: string }) => l.company_id === c.id).length })) });
    }
    if (b.action === 'company') return reply(200, { result: 'ok', company: await company(b) });
    if (b.action === 'person') {
      const co = b.company ? await company({ name: b.company, source: b.source }) : null;
      return reply(200, { result: 'ok', person: await person(b, co?.id ?? null), company: co });
    }
    if (b.action === 'reply') {
      const message = clip(b.message, 4000); if (!message || !email(b.email)) return reply(400, { error: 'email and message' });
      const co = b.company ? await company({ name: b.company, source: 'cold' }) : null;
      const p = await person({ full_name: b.name, email: b.email }, co?.id ?? null);
      const { data: kate } = await supabase.from('profiles').select('id').eq('role', 'staff').eq('full_name', 'Kate').limit(1).maybeSingle();
      const today = new Date().toISOString().slice(0, 10);
      const who = [clip(b.name, 120), clip(b.company, 120)].filter(Boolean).join(', ') || email(b.email);
      const { error } = await supabase.from('tasks').insert({ title: clip(`Reply to the campaign: ${who}${b.subject ? ` (${clip(b.subject, 120)})` : ''}`, 300), kind: 'email', due_on: today, assignee_id: kate?.id ?? null,
        note: clip(`${email(b.email)}${b.campaign ? ` · campaign: ${clip(b.campaign, 120)}` : ''}\n\n${message}`, 4000) });
      if (error) throw error;
      return reply(200, { result: 'ok', person: p, company: co, task: 'on Today' });
    }
    if (b.action === 'optout' || b.action === 'contacted') {
      const e = email(b.email), name = clip(b.company, 200), now = new Date().toISOString();
      if (!e && !name) return reply(400, { error: 'email or company' });
      const patch = b.action === 'optout' ? { do_not_contact: true } : { last_contacted_at: now };
      let people = 0, companies = 0;
      if (e) { const { data } = await supabase.from('people').update(patch).ilike('email', e).select('id'); people = data?.length ?? 0; if (!people && b.action === 'optout') { await person({ email: e }); await supabase.from('people').update(patch).ilike('email', e); people = 1; } }
      if (name) { const { data } = await supabase.from('companies').update(patch).ilike('name', name.replace(/[%_]/g, '\\$&')).select('id'); companies = data?.length ?? 0; }
      return reply(200, { result: 'ok', people, companies });
    }
    return reply(400, { error: 'action: lookup, company, person, reply, optout or contacted' });
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 300);
    console.log(JSON.stringify({ error: 'intake', action: b.action, message }));
    return reply(200, { error: message });
  }
});
