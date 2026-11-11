// Costs ↔ HubSpot (migrations 0031–0033; plan: brickandpane-docs/docs/PLAN-KOSZTY.md). Both ways, every 15 minutes:
//   CRM → HubSpot  a supplier quote on a project with a client deal becomes a deal in the "Purchasing" pipeline,
//                  associated with the client deal (label "Purchase for sale") and the supplier's company (found by
//                  exact name, or made); its PDF
//                  goes on as a note; a status set in the CRM moves the deal's stage.
//   HubSpot → CRM  a stage moved in HubSpot sets the CRM status; a Purchasing deal the team made by hand on a client
//                  deal turns up in the CRM as a supplier quote.
// Costs never reach the client deal's notes, the client portal or anything the client reads.
// Pipeline, stage and association ids were set up by the leads bot on 11.11.2026.
import { escape, hs, HubSpotError } from './hubspot.ts';

export const PIPELINE = '4327288052';
export const STAGE = {
  requested: '6408989924', received: '6408989925', accepted: '6408989926',
  ordered: '6408989927', delivered: '6408989928', rejected: '6408989929',
} as const;
export const OWNER = '39646197'; // Kate, as on sales deals
const PURCHASE_FOR_SALE = { associationCategory: 'USER_DEFINED', associationTypeId: 1 };
const DEAL_TO_COMPANY = { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 };

export type CostStatus = 'received' | 'accepted' | 'rejected' | 'superseded';
export type Cost = {
  id: string; project_id: string; supplier: string; reference: string; category: string; amount: number | string;
  currency: string; fx_to_gbp: number | string; status: CostStatus; pdf_path: string | null; pdf_name: string;
  note: string; created_at: string; updated_at: string;
  hubspot_deal_id: string | null; hubspot_synced_at: string | null; hubspot_status: string | null; hubspot_stage: string | null;
  hubspot_note_id: string | null; hubspot_attempts: number; hubspot_company_id: string | null;
};

// The CRM has four statuses, HubSpot six stages. Ordered and Delivered are steps after Accepted that the CRM does
// not track, so they read as accepted and are never pushed back down to Accepted.
export const stageOf = (status: string): string =>
  status === 'accepted' ? STAGE.accepted : status === 'rejected' || status === 'superseded' ? STAGE.rejected : STAGE.received;
export const statusOf = (stage: string | null | undefined): CostStatus | null =>
  stage === STAGE.requested || stage === STAGE.received ? 'received'
    : stage === STAGE.accepted || stage === STAGE.ordered || stage === STAGE.delivered ? 'accepted'
    : stage === STAGE.rejected ? 'rejected' : null;

// Who moved last decides. The CRM moved if its status differs from what was last synced; HubSpot moved if the stage
// differs from the one last seen. Both at once (rare): the CRM wins, it is where the team typed it.
export type StageStep = { push: string } | { pull: CostStatus } | { seen: string } | null;
export const stageStep = (c: Pick<Cost, 'status' | 'hubspot_status' | 'hubspot_stage'>, stage: string | null): StageStep => {
  const crmMoved = c.status !== c.hubspot_status;
  if (crmMoved) {
    if (statusOf(stage) === (c.status === 'superseded' ? 'rejected' : c.status)) return stage ? { seen: stage } : null; // already there (e.g. Ordered for accepted)
    return { push: stageOf(c.status) };
  }
  if (stage && stage !== c.hubspot_stage) {
    const to = statusOf(stage);
    if (to && to !== c.status && !(c.status === 'superseded' && to === 'rejected')) return { pull: to };
    return { seen: stage };
  }
  return null;
};

const num = (n: number | string) => Number(n);
export const costDealName = (c: Pick<Cost, 'supplier' | 'reference'>, projectRef: string) =>
  [c.supplier, c.reference, projectRef].filter(Boolean).join(' · ').slice(0, 200);
// What the deal carries. Costs are in £ (owner, 11.11.2026: "wszędzie funty, nie mieszajmy"); amount × rate keeps
// the few early rows typed in PLN right, and the rate stays 1 for everything new.
export const costProperties = (c: Cost, projectRef: string): Record<string, string> => ({
  dealname: costDealName(c, projectRef),
  pipeline: PIPELINE,
  amount: (num(c.amount) * num(c.fx_to_gbp)).toFixed(2),
  bp_cost_currency: c.currency,
  bp_cost_fx_to_gbp: String(num(c.fx_to_gbp)),
  bp_cost_category: c.category,
  bp_supplier_quote_ref: c.reference || '',
  bp_portal_supplier_quote_id: c.id,
});
export const costNote = (c: Pick<Cost, 'supplier' | 'reference' | 'amount' | 'currency' | 'fx_to_gbp' | 'note'>, projectRef: string, pdf: string | null) => {
  const amount = `${num(c.amount).toFixed(2)} ${c.currency}${c.currency === 'GBP' ? '' : ` (rate to GBP ${num(c.fx_to_gbp)})`}`;
  return `<p><strong>${escape(`Portal supplier quote · ${projectRef} · ${c.supplier}${c.reference ? ` · ${c.reference}` : ''}`)}</strong></p>`
    + `<p>Net ${escape(amount)}. Internal: never shown to the client.</p>`
    + (c.note ? `<p>${escape(c.note)}</p>` : '')
    + (pdf ? '' : '<p>No PDF attached in the CRM.</p>');
};
// A Purchasing deal made in HubSpot, read into the CRM. Its amount is in £, like every cost.
export const costFromDeal = (p: Record<string, string | null>, company: string | null) => {
  const gbp = Number(p.amount) >= 0 && p.amount !== null && p.amount !== '' ? Number(p.amount) : 0;
  return {
    supplier: (company || p.dealname || 'Supplier (from HubSpot)').slice(0, 120),
    reference: (p.bp_supplier_quote_ref ?? '').slice(0, 60),
    category: ['production', 'transport', 'installation', 'other'].includes(p.bp_cost_category ?? '') ? p.bp_cost_category! : 'other',
    amount: gbp,
    currency: 'GBP',
    fx_to_gbp: 1,
    note: `From HubSpot deal “${(p.dealname ?? '').slice(0, 120)}”.`.slice(0, 2000),
  };
};

// ---------- talking to HubSpot ----------
// deno-lint-ignore no-explicit-any
type Db = any;
type Row = { id: string; properties: Record<string, string | null> };
const errText = (e: unknown) => e instanceof HubSpotError ? `${e.status} ${e.message}`.slice(0, 500) : String((e as Error)?.message ?? e).slice(0, 500);
const batchRead = async (token: string, ids: string[], properties: string[]): Promise<Row[]> => {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res = await hs(token, 'POST', '/crm/v3/objects/deals/batch/read', { properties, inputs: ids.slice(i, i + 100).map((id) => ({ id })) });
    out.push(...(res?.results ?? []));
  }
  return out;
};
const assoc = (token: string, fromType: string, from: string, toType: string, to: string, spec: unknown) =>
  hs(token, 'PUT', `/crm/v4/objects/${fromType}/${from}/associations/${toType}/${to}`, [spec]);
// The supplier's company: the oldest one with exactly this name, or a new one. A deal without its supplier's company
// was the one gap in the live test (11.11.2026).
const supplierCompany = async (token: string, name: string) => {
  const res = await hs(token, 'POST', '/crm/v3/objects/companies/search', { filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: name }] }], properties: ['name'], sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }], limit: 1 });
  if (res?.results?.length) return String(res.results[0].id);
  return String((await hs(token, 'POST', '/crm/v3/objects/companies', { properties: { name } })).id);
};
async function linkCompany(supabase: Db, token: string, c: Cost, dealId: string) {
  const company = await supplierCompany(token, c.supplier);
  await assoc(token, 'deals', dealId, 'companies', company, DEAL_TO_COMPANY);
  await supabase.from('supplier_quotes').update({ hubspot_company_id: company }).eq('id', c.id);
}
const uploadPdf = async (token: string, pdf: Blob, name: string) => {
  const form = new FormData();
  form.append('file', pdf, name);
  form.append('fileName', name.replace(/\.pdf$/i, ''));
  form.append('folderPath', '/brickandpane-supplier-quotes');
  form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false, duplicateValidationStrategy: 'NONE' }));
  const res = await fetch('https://api.hubapi.com/files/v3/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) { let m = text; try { m = JSON.parse(text).message ?? text; } catch { /* plain */ } throw new HubSpotError(res.status, m); }
  return String(JSON.parse(text).id);
};

// The note with the PDF, once per quote. A token without the "files" scope still gets the note, without the file.
async function addNote(supabase: Db, token: string, c: Cost, dealId: string, projectRef: string) {
  let fileId: string | null = null;
  if (c.pdf_path) {
    const { data: pdf } = await supabase.storage.from('supplier-quotes').download(c.pdf_path);
    if (pdf) {
      try { fileId = await uploadPdf(token, pdf, (c.pdf_name || 'supplier-quote.pdf').replace(/[^\w.-]+/g, '-')); }
      catch (e) { if (!(e instanceof HubSpotError && e.status === 403)) throw e; }
    }
  }
  const note: Record<string, string> = { hs_timestamp: new Date(c.created_at).toISOString(), hs_note_body: costNote(c, projectRef, fileId) };
  if (fileId) note.hs_attachment_ids = fileId;
  const noteId = String((await hs(token, 'POST', '/crm/v3/objects/notes', { properties: note })).id);
  await hs(token, 'PUT', `/crm/v4/objects/notes/${noteId}/associations/default/deals/${dealId}`);
  return noteId;
}

const MAX_ATTEMPTS = 5;

export async function syncCosts(supabase: Db) {
  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return { skipped: 'no token' };
  if (Deno.env.get('HUBSPOT_COSTS') === 'off') return { skipped: 'off' };
  const counts = { created: 0, updated: 0, pushed: 0, pulled: 0, imported: 0, waiting: 0, failed: 0 };

  // Projects that have a client deal: the only ones a purchase can hang on.
  const { data: links } = await supabase.from('project_internal').select('project_id, hubspot_deal_id').not('hubspot_deal_id', 'is', null);
  const saleOf = new Map<string, string>(((links ?? []) as { project_id: string; hubspot_deal_id: string }[]).map((l) => [l.project_id, l.hubspot_deal_id]));
  const refs = new Map<string, string>();
  if (saleOf.size) {
    const { data: ps } = await supabase.from('projects').select('id, ref').in('id', [...saleOf.keys()]);
    for (const p of (ps ?? []) as { id: string; ref: string }[]) refs.set(p.id, p.ref);
  }

  // 1. CRM → HubSpot: new quotes, and quotes the team changed since the last sync.
  const { data: rows } = await supabase.from('supplier_quotes').select('*').lt('hubspot_attempts', MAX_ATTEMPTS).order('created_at').limit(200);
  const costs = (rows ?? []) as Cost[];
  for (const c of costs) {
    const sale = saleOf.get(c.project_id);
    if (!sale) { if (!c.hubspot_deal_id) counts.waiting++; continue; }
    // hubspot_synced_at holds the version HubSpot has (its updated_at), so an edit made while this run is busy with the
    // quote is newer than it and goes out next run instead of being lost.
    const dirty = !c.hubspot_deal_id || !c.hubspot_synced_at || c.updated_at > c.hubspot_synced_at;
    if (!dirty && c.hubspot_company_id) continue;
    const ref = refs.get(c.project_id) ?? '';
    try {
      const props = costProperties(c, ref);
      if (!c.hubspot_deal_id) {
        const stage = stageOf(c.status);
        const id = String((await hs(token, 'POST', '/crm/v3/objects/deals', { properties: { ...props, dealstage: stage, hubspot_owner_id: OWNER } })).id);
        // Saved before the rest, so a failure below never makes a second deal.
        await supabase.from('supplier_quotes').update({ hubspot_deal_id: id, hubspot_status: c.status, hubspot_stage: stage }).eq('id', c.id);
        await assoc(token, 'deals', id, 'deals', sale, PURCHASE_FOR_SALE);
        await linkCompany(supabase, token, c, id);
        const noteId = await addNote(supabase, token, c, id, ref);
        await supabase.from('supplier_quotes').update({ hubspot_note_id: noteId, hubspot_synced_at: c.updated_at, hubspot_error: null, hubspot_attempts: 0 }).eq('id', c.id);
        counts.created++;
      } else if (!dirty) {
        await linkCompany(supabase, token, c, c.hubspot_deal_id); // a deal from before the company link
      } else {
        if (!c.hubspot_company_id) await linkCompany(supabase, token, c, c.hubspot_deal_id);
        const [deal] = await batchRead(token, [c.hubspot_deal_id], ['dealstage']);
        const step = stageStep(c, deal?.properties.dealstage ?? null);
        const patch: Record<string, string> = { ...props };
        if (step && 'push' in step) patch.dealstage = step.push;
        await hs(token, 'PATCH', `/crm/v3/objects/deals/${c.hubspot_deal_id}`, { properties: patch });
        // A stage HubSpot moved is left unseen here, so step 2 below still pulls it into the CRM.
        const stage = step && 'push' in step ? step.push : step && 'seen' in step ? step.seen : c.hubspot_stage;
        await supabase.from('supplier_quotes').update({ hubspot_status: c.status, hubspot_stage: stage, hubspot_synced_at: c.updated_at, hubspot_error: null, hubspot_attempts: 0 }).eq('id', c.id);
        counts.updated++; if (step && 'push' in step) counts.pushed++;
      }
    } catch (e) {
      await supabase.from('supplier_quotes').update({ hubspot_error: errText(e), hubspot_attempts: (c.hubspot_attempts ?? 0) + 1 }).eq('id', c.id);
      counts.failed++;
    }
  }

  // 2. HubSpot → CRM: stages moved in HubSpot.
  const known = costs.filter((c) => c.hubspot_deal_id && saleOf.has(c.project_id));
  if (known.length) {
    const fresh = new Map((await supabase.from('supplier_quotes').select('id, status, hubspot_status, hubspot_stage').in('id', known.map((c) => c.id))).data?.map((r: Cost) => [r.id, r]) ?? []);
    const stages = new Map((await batchRead(token, known.map((c) => c.hubspot_deal_id!), ['dealstage'])).map((d) => [d.id, d.properties.dealstage]));
    for (const c of known) {
      const now = fresh.get(c.id) as Cost | undefined; if (!now) continue;
      const step = stageStep(now, stages.get(c.hubspot_deal_id!) ?? null);
      if (!step || 'push' in step) continue; // a CRM change is pushed by the next run's step 1
      const at = new Date().toISOString(); // the database sets it to the same instant as updated_at (0034)
      if ('pull' in step) {
        await supabase.from('supplier_quotes').update({ status: step.pull, hubspot_status: step.pull, hubspot_stage: stages.get(c.hubspot_deal_id!), hubspot_synced_at: at }).eq('id', c.id);
        counts.pulled++;
      } else await supabase.from('supplier_quotes').update({ hubspot_stage: step.seen }).eq('id', c.id);
    }
  }

  // 3. HubSpot → CRM: Purchasing deals made by hand on a client deal the CRM knows.
  const mine = new Set(costs.map((c) => c.hubspot_deal_id).filter(Boolean));
  for (const [projectId, sale] of saleOf) {
    try {
      const ids = ((await hs(token, 'GET', `/crm/v4/objects/deals/${sale}/associations/deals?limit=100`))?.results ?? []).map((a: { toObjectId: number | string }) => String(a.toObjectId)).filter((id: string) => !mine.has(id));
      if (!ids.length) continue;
      const deals = (await batchRead(token, ids, ['dealname', 'pipeline', 'dealstage', 'amount', 'bp_cost_currency', 'bp_cost_fx_to_gbp', 'bp_cost_category', 'bp_supplier_quote_ref', 'bp_portal_supplier_quote_id']))
        .filter((d) => d.properties.pipeline === PIPELINE && !d.properties.bp_portal_supplier_quote_id);
      for (const d of deals) {
        const { data: dup } = await supabase.from('supplier_quotes').select('id').eq('hubspot_deal_id', d.id).maybeSingle();
        if (dup) continue;
        const companies = ((await hs(token, 'GET', `/crm/v4/objects/deals/${d.id}/associations/companies?limit=1`))?.results ?? []).map((a: { toObjectId: number | string }) => String(a.toObjectId));
        const company = companies.length ? (await hs(token, 'GET', `/crm/v3/objects/companies/${companies[0]}?properties=name`))?.properties?.name ?? null : null;
        const status = statusOf(d.properties.dealstage) ?? 'received';
        const at = new Date().toISOString();
        const { data: row } = await supabase.from('supplier_quotes').insert({ project_id: projectId, ...costFromDeal(d.properties, company), status, hubspot_deal_id: d.id, hubspot_status: status, hubspot_stage: d.properties.dealstage, hubspot_company_id: companies[0] ?? null, hubspot_synced_at: at }).select('id').single();
        if (!row) continue;
        await hs(token, 'PATCH', `/crm/v3/objects/deals/${d.id}`, { properties: { bp_portal_supplier_quote_id: row.id } });
        counts.imported++;
      }
    } catch { counts.failed++; }
  }
  return counts;
}
