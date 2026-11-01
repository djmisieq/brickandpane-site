// HubSpot CRM sync for website enquiries: one contact_requests row becomes a contact, a company (if known),
// a deal and a note with the full enquiry. contact-submit calls it in the background after saving the request,
// so the form never waits for HubSpot and never fails because of it; hubspot-retry repeats failed ones.
// Secret: HUBSPOT_TOKEN (private app token); without it nothing happens. Optional HUBSPOT_OWNER_ID (default Kate).
// Properties it expects in HubSpot: contact bp_product_interest (multi-select), bp_segment; deal bp_enquiry_ref,
// bp_product_type, bp_material, bp_source. Properties the leads script owns (bp_ball_*, bp_quote_*, bp_followup_*,
// bp_last_*, bp_overdue, bp_reply_task_id, bp_lost_reason) are never written here.
// The result goes to hubspot_* columns (migrations 0015, 0016). Nothing personal is ever logged.

// Supabase Edge Runtime global (keeps the function alive for background work); declared for type checks.
declare global {
  const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
}

const API = 'https://api.hubapi.com';
const SITE = 'https://brickandpane.co.uk';
// Website deals belong to Kate (owner decision 01.11.2026); a new contact gets her only if it has no owner yet.
const owner = () => Deno.env.get('HUBSPOT_OWNER_ID') ?? '39646197';

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
  const found = await search(token, 'contacts', 'email', r.email, ['firstname', 'lastname', 'phone', 'company', 'bp_product_interest', 'bp_segment', 'hubspot_owner_id']);
  if (found) {
    // An existing contact keeps what the team already has; the enquiry only fills gaps.
    const p = found.properties ?? {};
    const patch = props({
      firstname: p.firstname ? null : firstname, lastname: p.lastname ? null : lastname,
      phone: p.phone ? null : r.phone, company: p.company ? null : r.company, bp_segment: p.bp_segment ? null : r.role,
      hubspot_owner_id: p.hubspot_owner_id ? null : owner(),
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
      hubspot_owner_id: owner(),
    }));
  } catch (e) {
    // Search lags a few seconds behind writes, so a second enquiry right after the first can miss the new contact.
    const existing = e instanceof HubSpotError && e.status === 409 && e.message.match(/Existing ID: (\d+)/)?.[1];
    if (existing) return existing;
    throw e;
  }
};

// With a company name: match by email domain, then by name, else create. Without one: only attach to a company
// that already has this (non-free) email domain, e.g. a firm from the cold list. Never a company without a name.
const companyOf = async (token: string, r: Enquiry) => {
  const domain = companyDomain(r.email);
  const byDomain = domain ? await search(token, 'companies', 'domain', domain) : null;
  if (byDomain) return byDomain.id;
  if (!r.company) return null;
  const byName = await search(token, 'companies', 'name', r.company);
  return byName ? byName.id : await create(token, 'companies', props({ name: r.company, domain }));
};

// A deal the leads script opened from a cold-mail reply: open, no enquiry ref yet, created in the last 14 days.
// The enquiry joins it instead of starting a second deal. A deal with another ref is a separate project.
type DealRow = { id: string; properties: Record<string, string | null> };
export const pickOpenDeal = (deals: DealRow[], now = Date.now()) => deals
  .filter((d) => !d.properties.bp_enquiry_ref && d.properties.hs_is_closed !== 'true' && now - Date.parse(d.properties.createdate ?? '') <= 14 * 864e5)
  .sort((a, b) => Date.parse(b.properties.createdate!) - Date.parse(a.properties.createdate!))[0] ?? null;

const DEAL_PROPS = ['bp_enquiry_ref', 'hs_is_closed', 'createdate', 'bp_product_type', 'bp_material', 'bp_source'];
const linked = async (token: string, from: string, id: string, to: string, limit = 100): Promise<string[]> =>
  ((await hs(token, 'GET', `/crm/v4/objects/${from}/${id}/associations/${to}?limit=${limit}`)).results ?? []).map((a: { toObjectId: number | string }) => String(a.toObjectId));

// Returns the deal and whether it still needs the enquiry note, so a retry never adds a second one.
const dealOf = async (token: string, r: Enquiry, contactId: string, products: { type: string[] }) => {
  const type = products.type.join(';'), material = materialsOf(r.material, r.openings).join(';');
  const byRef = await search(token, 'deals', 'bp_enquiry_ref', r.ref);
  if (byRef) return { id: byRef.id, note: !(await linked(token, 'deal', byRef.id, 'note', 1)).length };
  const ids = await linked(token, 'contact', contactId, 'deal');
  const open = ids.length ? pickOpenDeal((await hs(token, 'POST', '/crm/v3/objects/deals/batch/read', { properties: DEAL_PROPS, inputs: ids.map((id) => ({ id })) })).results ?? []) : null;
  if (open) {
    const p = open.properties;
    await hs(token, 'PATCH', `/crm/v3/objects/deals/${open.id}`, { properties: props({
      bp_enquiry_ref: r.ref, bp_product_type: p.bp_product_type ? null : type, bp_material: p.bp_material ? null : material, bp_source: p.bp_source ? null : 'website_form',
    }) });
    return { id: open.id, note: true };
  }
  const id = await create(token, 'deals', props({
    dealname: dealName(r), pipeline: 'default', dealstage: 'appointmentscheduled', bp_enquiry_ref: r.ref, bp_source: 'website_form',
    hubspot_owner_id: owner(), bp_product_type: type, bp_material: material,
  }));
  return { id, note: true };
};

// Minimal shape of the supabase-js client used here (the service-role client from contact-submit).
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

// Retries (hubspot-retry, every 15 min): attempt 1 is the form itself, then 15, 30, 60 and 120 min after the
// previous one. After the 5th failure the team gets one email. Test enquiries (name or company "TEST …") are skipped.
export const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [15, 30, 60, 120];
type Attempts = { created_at: string; hubspot_attempts: number; hubspot_attempted_at: string | null };
export const retryDue = (r: Attempts, now = Date.now()) => {
  if (r.hubspot_attempts >= MAX_ATTEMPTS) return false;
  // Never attempted (no token at the time, or the form's call died): wait 10 min so it can't race the form.
  const wait = r.hubspot_attempts ? BACKOFF_MIN[r.hubspot_attempts - 1] : 10;
  return now - Date.parse(r.hubspot_attempted_at ?? r.created_at) >= wait * 60e3;
};
export const isTestEnquiry = (r: { name?: string | null; company?: string | null }) => /^TEST\b/.test(r.name ?? '') || /^TEST\b/.test(r.company ?? '');

export async function syncEnquiry(supabase: Db, id: string) {
  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return;
  const { data: r } = await supabase.from('contact_requests').select('*').eq('id', id).single() as { data: (Enquiry & Attempts) | null };
  if (!r || r.hubspot_deal_id || r.status === 'spam') return;
  await supabase.from('contact_requests').update({ hubspot_attempts: (r.hubspot_attempts ?? 0) + 1, hubspot_attempted_at: new Date().toISOString() }).eq('id', id);
  try {
    const products = productsOf(r.systems, r.openings);
    const contactId = await contactOf(token, r, products.interest);
    const companyId = await companyOf(token, r);
    if (companyId) await associate(token, 'contact', contactId, 'company', companyId);

    // Associations are idempotent, so they are (re)made on every attempt.
    const deal = await dealOf(token, r, contactId, products);
    await associate(token, 'deal', deal.id, 'contact', contactId);
    if (companyId) await associate(token, 'deal', deal.id, 'company', companyId);
    const dealId = deal.id;

    if (deal.note) {
      const noteId = await create(token, 'notes', { hs_timestamp: r.created_at, hs_note_body: noteBody(r) });
      await associate(token, 'note', noteId, 'contact', contactId);
      await associate(token, 'note', noteId, 'deal', dealId);
    }

    await supabase.from('contact_requests').update({
      hubspot_contact_id: contactId, hubspot_deal_id: dealId, hubspot_synced_at: new Date().toISOString(), hubspot_error: null,
    }).eq('id', id);
  } catch (e) {
    const err = e as Error;
    const message = e instanceof HubSpotError ? `${e.status} ${e.message}` : err?.name === 'TimeoutError' ? 'timeout' : String(err?.message ?? e);
    try { await supabase.from('contact_requests').update({ hubspot_error: message.slice(0, 500) }).eq('id', id); } catch { /* never break the form */ }
  }
}
