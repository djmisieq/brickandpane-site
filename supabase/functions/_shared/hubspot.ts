// HubSpot CRM sync for website enquiries: one contact_requests row becomes a contact, a company (if given),
// a deal and a note with the full enquiry. contact-submit calls it in the background after saving the request,
// so the form never waits for HubSpot and never fails because of it.
// Secret: HUBSPOT_TOKEN (private app token); without it nothing happens. Properties it expects in HubSpot:
// contact bp_product_interest (multi-select), bp_segment; deal bp_enquiry_ref, bp_product_type, bp_material.
// The result goes to hubspot_* columns (migration 0015). Nothing personal is ever logged.

// Supabase Edge Runtime global (keeps the function alive for background work); declared for type checks.
declare global {
  const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
}

const API = 'https://api.hubapi.com';
const SITE = 'https://brickandpane.co.uk';

// ---------- mappings (pure, tested in hubspot.test.ts) ----------

// Form system → [contact bp_product_interest value, deal bp_product_type value].
const PRODUCTS: Record<string, [string, string]> = {
  windows: ['windows', 'Windows'],
  hinged: ['doors', 'Doors'],
  'lift-slide': ['sliding_bi_fold_doors', 'Sliding & bi-fold'],
  sliding: ['sliding_bi_fold_doors', 'Sliding & bi-fold'],
  bifold: ['sliding_bi_fold_doors', 'Sliding & bi-fold'],
  rooflights: ['roof_glazing_rooflights', 'Roof glazing'],
  facades: ['facades_curtain_walling', 'Facades & curtain walling'],
  unsure: ['other', 'Other'],
};
const MATERIALS: Record<string, string[]> = { alu: ['Aluminium'], timber: ['Timber'], pvc: ['PVC'], alutimber: ['Aluminium', 'Timber'], unsure: [] };
const FREE_MAIL = new Set(['gmail', 'googlemail', 'outlook', 'hotmail', 'live', 'yahoo', 'icloud', 'me', 'aol', 'btinternet', 'proton', 'protonmail']);
export const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;

export type Opening = { ref?: string; system?: string; material?: string; width_mm?: number | null; height_mm?: number | null; qty?: number; note?: string };
export type Enquiry = {
  id: string; ref: string; created_at: string; status: string; lang: string; role: string | null; name: string; email: string;
  phone: string | null; company: string | null; topic: string | null; systems: string[] | null; material: string[] | null;
  location: string | null; riba_stage: string | null; building: string | null; units: string | null; start: string | null;
  message: string | null; files: string[] | null; files_link: string | null; consent_at: string; openings: Opening[] | null;
  hubspot_deal_id: string | null;
};

const uniq = <T>(a: T[]) => [...new Set(a)];
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// Drops empty values: HubSpot rejects "" for dropdowns and there is no point in sending blanks.
const props = (o: Record<string, string | null | undefined>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '')) as Record<string, string>;

export const productsOf = (systems: string[] | null = [], openings: Opening[] | null = []) => {
  const keys = uniq([...(systems ?? []), ...(openings ?? []).map((o) => o.system ?? '')]).filter((k) => k in PRODUCTS);
  return { interest: uniq(keys.map((k) => PRODUCTS[k][0])), type: uniq(keys.map((k) => PRODUCTS[k][1])) };
};
export const materialsOf = (material: string[] | null = [], openings: Opening[] | null = []) =>
  uniq([...(material ?? []), ...(openings ?? []).map((o) => o.material ?? '')].flatMap((m) => MATERIALS[m] ?? []));
// Union of HubSpot multi-select values ("a;b").
export const mergeMulti = (current: string | null | undefined, add: string[]) =>
  uniq([...(current ?? '').split(';').map((s) => s.trim()).filter(Boolean), ...add]).join(';');
export const splitName = (name: string) => {
  const [firstname = '', ...rest] = name.trim().split(/\s+/);
  return { firstname, lastname: rest.join(' ') };
};
export const placeOf = (location: string | null) => {
  const l = location?.trim();
  return !l ? {} : POSTCODE.test(l) ? { zip: l } : { city: l };
};
// Email domain for matching a company, or null for free-mail addresses (gmail.com, hotmail.co.uk, …).
export const companyDomain = (email: string) => {
  const d = email.split('@').pop()!.trim().toLowerCase();
  return !d || FREE_MAIL.has(d.split('.')[0]) ? null : d;
};
export const dealName = (r: Pick<Enquiry, 'ref' | 'company' | 'name' | 'location'>) => [r.ref, r.company || r.name, r.location].filter(Boolean).join(' · ');

// The note carries the whole enquiry, so the team can work from HubSpot. File names and contents stay in Supabase.
export const noteBody = (r: Enquiry) => {
  const line = (k: string, v: string | null | undefined) => (v ? `${k}: ${escape(v)}<br>` : '');
  const openings = r.openings ?? [];
  return [
    `<p><strong>Website enquiry ${escape(r.ref)}</strong></p>`,
    `<p>${line('Role', r.role)}${line('Topic', r.topic)}${line('Location', r.location)}${line('RIBA stage', r.riba_stage)}${line('Building', r.building)}${line('Units', r.units)}${line('Start', r.start)}</p>`,
    openings.length ? `<table><tr><th>System</th><th>Material</th><th>W × H (mm)</th><th>Qty</th><th>Note</th></tr>${openings.map((o) =>
      `<tr><td>${escape(o.system ?? '')}</td><td>${escape(o.material ?? '')}</td><td>${o.width_mm ?? '?'} × ${o.height_mm ?? '?'}</td><td>${o.qty ?? 1}</td><td>${escape(o.note ?? '')}</td></tr>`).join('')}</table>` : '',
    r.message ? `<p>${escape(r.message).replace(/\r?\n/g, '<br>')}</p>` : '',
    `<p>Files uploaded: ${r.files?.length ?? 0}<br>${r.files_link ? `Files link: <a href="${escape(r.files_link)}">${escape(r.files_link)}</a><br>` : ''}Consent given: ${escape(r.consent_at)}</p>`,
    `<p><a href="${SITE}/admin.html">Open in the Brick &amp; Pane CRM</a></p>`,
  ].join('');
};

// ---------- HubSpot API ----------

class HubSpotError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

// One retry on 429 and 5xx, after Retry-After (max 5 s) or 1 s.
const hs = async (token: string, method: string, path: string, body?: unknown) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await res.body?.cancel();
      const wait = Math.min(Number(res.headers.get('retry-after')) || 1, 5);
      await new Promise((ok) => setTimeout(ok, wait * 1000));
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try { message = JSON.parse(text).message ?? text; } catch { /* plain text body */ }
      throw new HubSpotError(res.status, message);
    }
    return text ? JSON.parse(text) : null;
  }
};
type Found = { id: string; properties: Record<string, string | null> } | null;
const search = async (token: string, object: string, propertyName: string, value: string, properties: string[] = []): Promise<Found> =>
  (await hs(token, 'POST', `/crm/v3/objects/${object}/search`, { filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }], properties, limit: 1 })).results?.[0] ?? null;
const create = async (token: string, object: string, properties: Record<string, string>) =>
  String((await hs(token, 'POST', `/crm/v3/objects/${object}`, { properties })).id);
const associate = (token: string, from: string, fromId: string, to: string, toId: string) =>
  hs(token, 'PUT', `/crm/v4/objects/${from}/${fromId}/associations/default/${to}/${toId}`);

const contactOf = async (token: string, r: Enquiry, interest: string[]) => {
  const { firstname, lastname } = splitName(r.name);
  const found = await search(token, 'contacts', 'email', r.email, ['firstname', 'lastname', 'phone', 'company', 'bp_product_interest', 'bp_segment']);
  if (found) {
    // An existing contact keeps what the team already has; the enquiry only fills gaps.
    const p = found.properties ?? {};
    const patch = props({
      firstname: p.firstname ? null : firstname, lastname: p.lastname ? null : lastname,
      phone: p.phone ? null : r.phone, company: p.company ? null : r.company, bp_segment: p.bp_segment ? null : r.role,
    });
    const merged = mergeMulti(p.bp_product_interest, interest);
    if (merged !== mergeMulti(p.bp_product_interest, [])) patch.bp_product_interest = merged;
    if (Object.keys(patch).length) await hs(token, 'PATCH', `/crm/v3/objects/contacts/${found.id}`, { properties: patch });
    return found.id;
  }
  try {
    return await create(token, 'contacts', props({
      firstname, lastname, email: r.email, phone: r.phone, company: r.company, ...placeOf(r.location),
      hs_language: r.lang, bp_segment: r.role, lifecyclestage: 'lead', hs_lead_status: 'NEW', bp_product_interest: interest.join(';'),
    }));
  } catch (e) {
    // Search lags a few seconds behind writes, so a second enquiry right after the first can miss the new contact.
    const existing = e instanceof HubSpotError && e.status === 409 && e.message.match(/Existing ID: (\d+)/)?.[1];
    if (existing) return existing;
    throw e;
  }
};

const companyOf = async (token: string, r: Enquiry) => {
  if (!r.company) return null;
  const domain = companyDomain(r.email);
  const found = (domain ? await search(token, 'companies', 'domain', domain) : null) ?? await search(token, 'companies', 'name', r.company);
  return found ? found.id : await create(token, 'companies', props({ name: r.company, domain }));
};

// Minimal shape of the supabase-js client used here (the service-role client from contact-submit).
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

export async function syncEnquiry(supabase: Db, id: string) {
  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return;
  const { data: r } = await supabase.from('contact_requests').select('*').eq('id', id).single() as { data: Enquiry | null };
  if (!r || r.hubspot_deal_id || r.status === 'spam') return;
  try {
    const products = productsOf(r.systems, r.openings);
    const contactId = await contactOf(token, r, products.interest);
    const companyId = await companyOf(token, r);
    if (companyId) await associate(token, 'contact', contactId, 'company', companyId);

    let dealId = (await search(token, 'deals', 'bp_enquiry_ref', r.ref))?.id;
    if (!dealId) {
      dealId = await create(token, 'deals', props({
        dealname: dealName(r), pipeline: 'default', dealstage: 'appointmentscheduled', bp_enquiry_ref: r.ref,
        bp_product_type: products.type.join(';'), bp_material: materialsOf(r.material, r.openings).join(';'),
      }));
      await associate(token, 'deal', dealId, 'contact', contactId);
      if (companyId) await associate(token, 'deal', dealId, 'company', companyId);
    }

    const noteId = await create(token, 'notes', { hs_timestamp: r.created_at, hs_note_body: noteBody(r) });
    await associate(token, 'note', noteId, 'contact', contactId);
    await associate(token, 'note', noteId, 'deal', dealId);

    await supabase.from('contact_requests').update({
      hubspot_contact_id: contactId, hubspot_deal_id: dealId, hubspot_synced_at: new Date().toISOString(), hubspot_error: null,
    }).eq('id', id);
  } catch (e) {
    const err = e as Error;
    const message = e instanceof HubSpotError ? `${e.status} ${e.message}` : err?.name === 'TimeoutError' ? 'timeout' : String(err?.message ?? e);
    try { await supabase.from('contact_requests').update({ hubspot_error: message.slice(0, 500) }).eq('id', id); } catch { /* never break the form */ }
  }
}
