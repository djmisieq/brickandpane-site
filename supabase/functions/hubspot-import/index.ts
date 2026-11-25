// One-off import from HubSpot into the CRM's own records (owner, 25.11.2026: "1 ok": read HubSpot once before it
// is dropped). READS HubSpot only (GET and search), never writes to it. In the CRM it only ADDS:
//   companies (each HubSpot company, by name; "supplier" when it sits on a Purchasing deal, otherwise "other"),
//   people (each contact with a name or email not yet in the CRM, under their first company),
//   project_companies (the companies on a deal whose project the CRM knows, as the client).
// Owner 25.11.2026 ("Wszystko", "Załóż projekty"): every company and contact comes across; a company on no deal is
// marked source "cold" (the campaign list). An open sales deal with no project becomes a project (owner and account
// manager Kate, as on the deals; no client; stage New, or Quote issued when the deal is at Quote sent). Lost deals and
// test deals are skipped. A second run adds nothing.
// HubSpot is switched off (HUBSPOT=off, 0040); this import uses the token on purpose, once.
// Call: POST {"mode":"dry"} to count, {"mode":"run"} to write, with header x-import-key = secret IMPORT_KEY.
// DONE 25.11.2026: run once (1080 companies, 1143 people, 13 projects made, 3 deals linked to existing projects);
// the IMPORT_KEY secret and the deployed function were removed straight after. Kept here as the record.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { hs } from '../_shared/hubspot.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PURCHASING = '4327288052';
type Obj = { id: string; properties: Record<string, string | null>; associations?: Record<string, { results: { id: string }[] }> };

async function all(token: string, type: string, properties: string[], assoc: string[] = []): Promise<Obj[]> {
  const out: Obj[] = []; let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ limit: '100', properties: properties.join(',') });
    if (assoc.length) q.set('associations', assoc.join(','));
    if (after) q.set('after', after);
    const res = await hs(token, 'GET', `/crm/v3/objects/${type}?${q}`);
    out.push(...(res?.results ?? []));
    after = res?.paging?.next?.after; if (!after) break;
  }
  return out;
}
const ids = (o: Obj, type: string) => (o.associations?.[type]?.results ?? []).map((r) => String(r.id));
const clip = (s: string | null | undefined, n: number) => String(s ?? '').trim().slice(0, n);

Deno.serve(async (req) => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const key = Deno.env.get('IMPORT_KEY');
  if (req.method !== 'POST' || !key || req.headers.get('x-import-key') !== key) return reply(403, { error: 'forbidden' });
  const token = Deno.env.get('HUBSPOT_TOKEN'); if (!token) return reply(200, { error: 'no token' });
  const mode = (await req.json().catch(() => ({})))?.mode === 'run' ? 'run' : 'dry';
  try {
    const [companies, contacts, deals] = await Promise.all([
      all(token, 'companies', ['name', 'domain', 'phone', 'address', 'city', 'zip']),
      all(token, 'contacts', ['firstname', 'lastname', 'email', 'phone', 'jobtitle'], ['companies']),
      all(token, 'deals', ['dealname', 'pipeline', 'dealstage', 'amount', 'createdate', 'bp_source'], ['companies']),
    ]);
    const supplierCo = new Set(deals.filter((d) => d.properties.pipeline === PURCHASING).flatMap((d) => ids(d, 'companies')));
    const onDeal = new Set(deals.flatMap((d) => ids(d, 'companies')));
    const sales = deals.filter((d) => d.properties.pipeline !== PURCHASING);
    const { data: links } = await supabase.from('project_internal').select('project_id, hubspot_deal_id').not('hubspot_deal_id', 'is', null);
    const projectOf = new Map((links ?? []).map((l: { project_id: string; hubspot_deal_id: string }) => [String(l.hubspot_deal_id), l.project_id]));
    const { data: havePeople } = await supabase.from('people').select('email, full_name');
    const knownEmail = new Set((havePeople ?? []).map((p: { email: string }) => p.email.toLowerCase()).filter(Boolean));
    const { data: haveCos } = await supabase.from('companies').select('id, name, kind');
    const coKey = (name: string, kind: string) => `${name.trim().toLowerCase()}|${kind}`;
    const coId = new Map((haveCos ?? []).map((c: { id: string; name: string; kind: string }) => [coKey(c.name, c.kind), c.id]));

    const counts = { companies_new: 0, companies_known: 0, people_new: 0, people_known: 0, project_links: 0 };
    const hsToCrm = new Map<string, string>(); // HubSpot company id → CRM company id
    for (const c of companies) {
      const name = clip(c.properties.name || c.properties.domain, 200); if (!name) continue;
      const kind = supplierCo.has(c.id) ? 'supplier' : 'other', k = coKey(name, kind);
      if (coId.has(k)) { counts.companies_known++; hsToCrm.set(c.id, coId.get(k)!); continue; }
      counts.companies_new++;
      if (mode === 'run') {
        const address = [c.properties.address, c.properties.city, c.properties.zip].map((x) => clip(x, 200)).filter(Boolean).join(', ').slice(0, 500);
        const { data, error } = await supabase.from('companies').insert({ name, kind, source: onDeal.has(c.id) ? null : 'cold', website: clip(c.properties.domain, 300), phone: clip(c.properties.phone, 60), address, notes: `From HubSpot company ${c.id} (import 25.11.2026).` }).select('id').single();
        if (error) throw error;
        coId.set(k, data.id); hsToCrm.set(c.id, data.id);
      }
    }
    for (const p of contacts) {
      const email = clip(p.properties.email, 200).toLowerCase();
      const full_name = clip([p.properties.firstname, p.properties.lastname].filter(Boolean).join(' ') || email.split('@')[0], 200);
      if (!full_name) continue;
      if (email && knownEmail.has(email)) { counts.people_known++; continue; }
      counts.people_new++; if (email) knownEmail.add(email);
      if (mode === 'run') {
        const company_id = ids(p, 'companies').map((id) => hsToCrm.get(id)).find(Boolean) ?? null;
        const { error } = await supabase.from('people').insert({ full_name, email, phone: clip(p.properties.phone, 60), job_title: clip(p.properties.jobtitle, 120), company_id, notes: `From HubSpot contact ${p.id} (import 25.11.2026).` });
        if (error) throw error;
      }
    }
    const orphanDeals: { id: string; name: string; stage: string | null; amount: string | null; created: string | null }[] = [];
    for (const d of sales) {
      const pid = projectOf.get(d.id);
      if (!pid) { orphanDeals.push({ id: d.id, name: clip(d.properties.dealname, 200), stage: d.properties.dealstage, amount: d.properties.amount, created: d.properties.createdate }); }
      if (pid) for (const hc of ids(d, 'companies')) {
        const cid = hsToCrm.get(hc); if (!cid && mode === 'run') continue;
        counts.project_links++;
        if (mode === 'run') await supabase.from('project_companies').upsert({ project_id: pid, company_id: cid, role: 'client' }, { onConflict: 'project_id,company_id,role', ignoreDuplicates: true });
      }
    }
    // Open deals with no project become projects.
    const made: { deal: string; ref: string; name: string }[] = [];
    const open = orphanDeals.filter((d) => d.stage !== 'closedlost' && d.stage !== 'closedwon' && !/\(TEST\)/i.test(d.name));
    const { data: kate } = await supabase.from('profiles').select('id').eq('role', 'staff').eq('full_name', 'Kate').limit(1).maybeSingle();
    const srcOf = (s: string | null | undefined) => (s === 'website_form' ? 'website' : /cold/i.test(s ?? '') ? 'cold' : s === 'email' ? 'email' : null);
    if (mode === 'run' && open.length && !kate) throw new Error('No staff profile named Kate to own the projects.');
    // A client the CRM already has a project for (made by hand from the mail review: Kingsgate, JSA, JVB) gets its
    // company linked to those projects instead of a second project. Matched on the first word of the name.
    const { data: existing } = await supabase.from('projects').select('id, ref, name');
    const firstWord = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? '');
    const linked: { deal: string; to: string[] }[] = [];
    for (const o of open) {
      const d = sales.find((x) => x.id === o.id)!;
      const w = firstWord(o.name), same = w.length >= 3 ? (existing ?? []).filter((p: { name: string }) => firstWord(p.name) === w) : [];
      if (same.length) {
        linked.push({ deal: o.name, to: same.map((p: { ref: string }) => p.ref) });
        if (mode === 'run') for (const p of same) for (const hc of ids(d, 'companies')) { const cid = hsToCrm.get(hc); if (cid) await supabase.from('project_companies').upsert({ project_id: p.id, company_id: cid, role: 'client' }, { onConflict: 'project_id,company_id,role', ignoreDuplicates: true }); }
        continue;
      }
      if (mode !== 'run') { made.push({ deal: o.id, ref: '(new)', name: o.name }); continue; }
      const { data: p, error } = await supabase.from('projects').insert({ name: o.name.replace(/\s+–\s+enquiry$/i, '') || o.name, owner_id: kate!.id, assignee_id: kate!.id, next_step: '', due_at: null, brief: `From HubSpot deal ${o.id} (import 25.11.2026).` }).select('id, ref').single();
      if (error) throw error;
      await supabase.from('project_internal').update({ hubspot_deal_id: o.id, value_gbp: Number(o.amount) > 0 ? Number(o.amount) : null, source: srcOf(d.properties.bp_source) }).eq('project_id', p.id);
      if (o.stage === 'presentationscheduled') await supabase.from('stage_events').insert({ project_id: p.id, from_stage: 'submitted', to_stage: 'quote_issued', note: 'Quote sent (from HubSpot).', visible_to_client: false, actor_id: kate!.id });
      for (const hc of ids(d, 'companies')) { const cid = hsToCrm.get(hc); if (cid) await supabase.from('project_companies').upsert({ project_id: p.id, company_id: cid, role: 'client' }, { onConflict: 'project_id,company_id,role', ignoreDuplicates: true }); }
      made.push({ deal: o.id, ref: p.ref, name: o.name });
    }
    const result = { mode, projects_made: made, linked_to_existing: linked, hubspot: { companies: companies.length, contacts: contacts.length, sales_deals: sales.length, purchase_deals: deals.length - sales.length }, ...counts, deals_without_project: orphanDeals };
    console.log(JSON.stringify({ mode, ...counts, orphans: orphanDeals.length }));
    return reply(200, result);
  } catch (e) {
    console.log(JSON.stringify({ error: 'import', message: String((e as Error)?.message ?? e).slice(0, 300) }));
    return reply(200, { error: 'import', message: String((e as Error)?.message ?? e).slice(0, 300) });
  }
});
