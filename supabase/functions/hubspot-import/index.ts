// One-off import from HubSpot into the CRM's own records (owner, 25.11.2026: "1 ok": read HubSpot once before it
// is dropped). READS HubSpot only (GET and search), never writes to it. In the CRM it only ADDS:
//   companies (each HubSpot company, by name; "supplier" when it sits on a Purchasing deal, otherwise "other"),
//   people (each contact with a name or email not yet in the CRM, under their first company),
//   project_companies (the companies on a deal whose project the CRM knows, as the client).
// Deals with no project in the CRM are listed in the answer for the owner to decide; no project is made.
// HubSpot is switched off (HUBSPOT=off, 0040); this import uses the token on purpose, once.
// Call: POST {"mode":"dry"} to count, {"mode":"run"} to write, with header x-import-key = secret IMPORT_KEY.
// Remove the IMPORT_KEY secret after the run, and this function with it.
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
      all(token, 'deals', ['dealname', 'pipeline', 'dealstage', 'amount', 'createdate'], ['companies']),
    ]);
    const supplierCo = new Set(deals.filter((d) => d.properties.pipeline === PURCHASING).flatMap((d) => ids(d, 'companies')));
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
        const { data, error } = await supabase.from('companies').insert({ name, kind, website: clip(c.properties.domain, 300), phone: clip(c.properties.phone, 60), address, notes: `From HubSpot company ${c.id} (import 25.11.2026).` }).select('id').single();
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
      if (!pid) { orphanDeals.push({ id: d.id, name: clip(d.properties.dealname, 200), stage: d.properties.dealstage, amount: d.properties.amount, created: d.properties.createdate }); continue; }
      for (const hc of ids(d, 'companies')) {
        const cid = hsToCrm.get(hc); if (!cid && mode === 'run') continue;
        counts.project_links++;
        if (mode === 'run') await supabase.from('project_companies').upsert({ project_id: pid, company_id: cid, role: 'client' }, { onConflict: 'project_id,company_id,role', ignoreDuplicates: true });
      }
    }
    const result = { mode, hubspot: { companies: companies.length, contacts: contacts.length, sales_deals: sales.length, purchase_deals: deals.length - sales.length }, ...counts, deals_without_project: orphanDeals };
    console.log(JSON.stringify({ mode, ...counts, orphans: orphanDeals.length }));
    return reply(200, result);
  } catch (e) {
    console.log(JSON.stringify({ error: 'import', message: String((e as Error)?.message ?? e).slice(0, 300) }));
    return reply(200, { error: 'import', message: String((e as Error)?.message ?? e).slice(0, 300) });
  }
});
