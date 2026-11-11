// Quotes ↔ HubSpot (migrations 0026, 0027; function hubspot-quotes). Owner decision 09.11.2026.
// CRM → HubSpot: a send (public.quote_sends) becomes one note on the deal, "Portal quote sent · <reference> rev <n>",
// with the total and the PDF the client got attached; a deal still at Enquiry moves to Quote sent (never backwards).
// HubSpot → CRM: staff pick the deal in the builder (search, contact details, PDFs/Word files already on the deal);
// every 15 min the deal's stage sets the status of its quotes. Unlike the portal event notes (hubspot.ts, "no
// amounts"), this note carries the total: the owner asked for it. The leads script owns bp_quote_* — never written.
// Pure parts are tested in hubspot-quotes.test.ts. Nothing personal is logged.
import { associate, create, escape, hs, HubSpotError, linked, SITE } from './hubspot.ts';

// ---------- pipeline (same ids as STAGE_OF_DEAL in hubspot.ts) ----------
export const DEAL_STAGE_LABEL: Record<string, string> = {
  appointmentscheduled: 'Enquiry',
  presentationscheduled: 'Quote sent',
  decisionmakerboughtin: 'Negotiation',
  '6335558846': 'Quote accepted',
  '6334870758': 'Survey',
  contractsent: 'Order placed',
  '6342532306': 'Production',
  '6342584520': 'Delivery',
  '6334870754': 'Installation',
  closedwon: 'Closed won',
  closedlost: 'Closed lost',
};
const ENQUIRY = 'appointmentscheduled';
const QUOTE_SENT = 'presentationscheduled';
// From Quote accepted on, the client has said yes to a quote on this deal.
export const ACCEPTED_STAGES = new Set(['6335558846', '6334870758', 'contractsent', '6342532306', '6342584520', '6334870754', 'closedwon']);
export const LOST_STAGE = 'closedlost';

// Sending moves only a deal that is still at Enquiry. A deal further on (negotiation, a revision after acceptance…)
// keeps its stage: the pipeline only goes forward from here.
export const stageAfterSend = (dealstage: string | null | undefined) => (dealstage === ENQUIRY ? QUOTE_SENT : null);

type QuoteState = { id: string; status: string; status_source: string | null };
// What a deal's stage means for its quotes. Statuses a person set in the CRM stay; statuses that came from HubSpot
// follow the deal both ways (a lost deal reopened makes its quotes "sent" again). With two or more live quotes on an
// accepted deal HubSpot can't say which one won: they stay "sent" and the CRM asks staff to choose (choose: true).
export function statusesFromStage(dealstage: string | null | undefined, quotes: QuoteState[]) {
  const live = quotes.filter((q) => q.status !== 'draft');
  const fromHub = (q: QuoteState) => q.status === 'sent' || q.status_source === 'hubspot';
  const open = live.filter(fromHub);
  const set = (status: string) => open.filter((q) => q.status !== status).map((q) => ({ id: q.id, status }));
  if (dealstage === LOST_STAGE) return { updates: set('declined'), choose: false };
  if (dealstage && ACCEPTED_STAGES.has(dealstage)) {
    // Staff already marked the winner in the CRM: the others are left as they are.
    if (live.some((q) => q.status === 'accepted' && q.status_source === 'crm')) return { updates: [], choose: false };
    if (open.length === 1) return { updates: set('accepted'), choose: false };
    return { updates: set('sent'), choose: open.length > 1 };
  }
  return { updates: set('sent'), choose: false };
}

// ---------- the note ----------
const money = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
const day = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const SCOPE: Record<string, string> = { included: 'Supply and installation', separate: 'Supply, installation quoted separately' };

export type Send = {
  id: string; quote_id: string; hubspot_deal_id: string; reference: string; revision: string; kind: 'new' | 'revision' | 'resend';
  total: number | string; vat_rate: number | string; pdf_path: string; pdf_name: string; sent_on: string; created_at: string;
  snapshot: { installMode?: string; validUntil?: string; products?: { qty?: number }[]; customerName?: string };
  sent_by: string | null; hubspot_file_id: string | null; hubspot_note_id: string | null;
};
export const notePrefix = 'Portal quote sent';
export const noteTitle = (s: Pick<Send, 'reference' | 'revision'>) => `${notePrefix} · ${s.reference} rev ${s.revision || '00'}`;

export function quoteNote(s: Send, e: { previous?: Pick<Send, 'revision' | 'sent_on'> | null; who?: string | null; pdf?: string | null; others?: string[] } = {}) {
  const total = Number(s.total) || 0, vat = Number(s.vat_rate) || 0;
  const units = (s.snapshot.products ?? []).reduce((n, p) => n + (Number(p.qty) || 0), 0);
  const what = s.kind === 'revision'
    ? `Revision ${s.revision} of quote ${s.reference}${e.previous ? `, replacing revision ${e.previous.revision} sent on ${day(e.previous.sent_on)}` : ''}.`
    : s.kind === 'resend' ? `Quote ${s.reference}, revision ${s.revision}, sent again (no changes).` : `New quote ${s.reference}.`;
  const lines = [
    `<p><strong>${escape(noteTitle(s))}</strong></p>`,
    `<p>${escape(what)} Sent to the client on ${day(s.sent_on)}${e.who ? ` by ${escape(e.who)}` : ''}.</p>`,
    `<p>Total: <strong>${money(total)}</strong> ${vat > 0 ? `including VAT ${vat}%` : '(no VAT charged)'}<br>`
      + `${escape(SCOPE[s.snapshot.installMode ?? ''] ?? 'Supply only')} · ${units === 1 ? '1 unit' : `${units} units`}`
      + `${s.snapshot.validUntil ? ` · valid until ${day(s.snapshot.validUntil)}` : ''}</p>`,
    e.others?.length ? `<p>Other quotes on this deal: ${e.others.map(escape).join(', ')}.</p>` : '',
    e.pdf ? `<p>Attached: ${escape(e.pdf)}</p>` : '<p>The PDF could not be attached here; it is kept in the CRM.</p>',
    `<p><a href="${SITE}/admin.html#/quotes/${encodeURIComponent(s.quote_id)}">Open the quote in the Brick &amp; Pane CRM</a> (sign-in needed)</p>`,
  ];
  return lines.filter(Boolean).join('');
}

// ---------- HubSpot reads for the builder ----------
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any; storage: any };
type Row = { id: string; properties: Record<string, string | null> };
const DEAL_FIELDS = ['dealname', 'dealstage', 'pipeline', 'hs_is_closed', 'createdate', 'hs_lastmodifieddate', 'bp_enquiry_ref', 'bp_source', 'bp_portal_project_ref'];
const CONTACT_FIELDS = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', 'address', 'city', 'zip'];

const batchRead = async (token: string, object: string, ids: string[], properties: string[]): Promise<Row[]> => {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const page = await hs(token, 'POST', `/crm/v3/objects/${object}/batch/read`, { properties, inputs: ids.slice(i, i + 100).map((id) => ({ id })) });
    out.push(...(page?.results ?? []));
  }
  return out;
};
// First associated object of each id, e.g. the contact of each deal.
const firstLinked = async (token: string, from: string, to: string, ids: string[]) => {
  if (!ids.length) return new Map<string, string>();
  const res = await hs(token, 'POST', `/crm/v4/associations/${from}/${to}/batch/read`, { inputs: ids.map((id) => ({ id })) });
  return new Map<string, string>((res?.results ?? []).flatMap((r: { from: { id: string }; to: { toObjectId: number | string }[] }) =>
    r.to?.length ? [[String(r.from.id), String(r.to[0].toObjectId)]] : []));
};
const allLinked = async (token: string, from: string, to: string, ids: string[]) => {
  if (!ids.length) return [] as string[];
  const res = await hs(token, 'POST', `/crm/v4/associations/${from}/${to}/batch/read`, { inputs: ids.map((id) => ({ id })) });
  return [...new Set((res?.results ?? []).flatMap((r: { to: { toObjectId: number | string }[] }) => (r.to ?? []).map((t) => String(t.toObjectId))))] as string[];
};

let account: Promise<{ portalId: number; uiDomain: string } | null> | null = null;
const accountOf = (token: string) => (account ??= hs(token, 'GET', '/account-info/v3/details').catch(() => null));
export const dealUrl = (a: { portalId: number; uiDomain: string } | null, id: string) =>
  a ? `https://${a.uiDomain || 'app.hubspot.com'}/contacts/${a.portalId}/record/0-3/${id}` : null;

export type DealCard = {
  id: string; name: string; stage: string | null; stageLabel: string; closed: boolean; ref: string | null; created: string | null; url: string | null;
  source: DealSource; portal: string | null; test: boolean;
  contact: { name: string; email: string; phone: string; company: string; address: string; postcode: string } | null;
};
export const contactCard = (p: Record<string, string | null>) => ({
  name: [p.firstname, p.lastname].filter(Boolean).join(' ').trim(), email: p.email ?? '', phone: p.phone || p.mobilephone || '',
  company: p.company ?? '', address: [p.address, p.city].filter(Boolean).join('\n'), postcode: p.zip ?? '',
});
// Where the deal came from, as the leads bot writes bp_source (owner report 11.11.2026: the picker mixed cold-email
// deals with enquiries and nothing on the card told them apart).
export type DealSource = 'website' | 'cold' | 'email' | 'other' | null;
export const dealSource = (s: string | null | undefined): DealSource =>
  s === 'website_form' ? 'website' : s === 'cold_email' ? 'cold' : s === 'email' ? 'email' : s ? 'other' : null;
// The marker the leads script and hubspot-retry skip: a name starting with "TEST" or "(TEST)" anywhere.
export const isTestDeal = (name: string | null | undefined) => /^TEST\b|\(TEST\)/.test(name ?? '');
// Open deals first, test deals after real ones, then the newest.
export const sortDeals = <T extends { closed: boolean; created: string | null; test?: boolean }>(deals: T[]) =>
  [...deals].sort((a, b) => Number(a.closed) - Number(b.closed) || Number(!!a.test) - Number(!!b.test) || Date.parse(b.created ?? '') - Date.parse(a.created ?? ''));

async function cards(token: string, deals: Row[]): Promise<DealCard[]> {
  const ids = deals.map((d) => d.id);
  const contactOf = await firstLinked(token, 'deals', 'contacts', ids);
  const contacts = new Map((await batchRead(token, 'contacts', [...new Set(contactOf.values())], CONTACT_FIELDS)).map((c) => [c.id, c.properties]));
  const a = await accountOf(token);
  return sortDeals(deals.map((d) => {
    const p = d.properties, c = contacts.get(contactOf.get(d.id) ?? '');
    return {
      id: d.id, name: p.dealname ?? '', stage: p.dealstage ?? null, stageLabel: DEAL_STAGE_LABEL[p.dealstage ?? ''] ?? (p.dealstage ?? ''),
      closed: p.hs_is_closed === 'true', ref: p.bp_enquiry_ref ?? null, created: p.createdate ?? null, url: dealUrl(a, d.id),
      contact: c ? contactCard(c) : null,
      source: dealSource(p.bp_source), portal: p.bp_portal_project_ref ?? null, test: isTestDeal(p.dealname),
    };
  }));
}

// Free text: deal names, and contacts by name, email or phone (their deals). Empty: the 20 most recently changed open deals.
export async function searchDeals(token: string, q: string) {
  const text = q.trim().slice(0, 100);
  if (!text) {
    const res = await hs(token, 'POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' }] }],
      properties: DEAL_FIELDS, sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }], limit: 20,
    });
    return cards(token, res?.results ?? []);
  }
  const [byName, people] = await Promise.all([
    hs(token, 'POST', '/crm/v3/objects/deals/search', { query: text, properties: DEAL_FIELDS, limit: 10 }),
    hs(token, 'POST', '/crm/v3/objects/contacts/search', { query: text, properties: ['email'], limit: 5 }),
  ]);
  const fromPeople = await allLinked(token, 'contacts', 'deals', (people?.results ?? []).map((c: Row) => c.id));
  const known = new Set((byName?.results ?? []).map((d: Row) => d.id));
  const extra = fromPeople.filter((id) => !known.has(id)).slice(0, 10);
  const deals = [...(byName?.results ?? []), ...(extra.length ? await batchRead(token, 'deals', extra, DEAL_FIELDS) : [])];
  return (await cards(token, deals)).slice(0, 12);
}

export async function dealCard(token: string, id: string) {
  const [d] = await batchRead(token, 'deals', [id], DEAL_FIELDS);
  return d ? (await cards(token, [d]))[0] : null;
}

// PDF and Word files already on the deal (notes and logged emails): quotes sent before the CRM had a Quotes tab,
// or from someone's mailbox. Our own notes are left out (they are the CRM's sends). Missing scopes are reported,
// not thrown, so the rest still shows.
const DOC_EXT = new Set(['pdf', 'doc', 'docx']);
export const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
export async function dealFiles(token: string, dealId: string, ownNotes: Set<string>) {
  const missing: string[] = [];
  const objects = async (kind: 'note' | 'email', props: string[]) => {
    try {
      const ids = (await linked(token, 'deal', dealId, kind)).filter((id) => !ownNotes.has(id));
      return (await batchRead(token, `${kind}s`, ids, props)).map((r) => ({ ...r, kind }));
    } catch (e) {
      if (e instanceof HubSpotError && e.status === 403) { missing.push(kind === 'note' ? 'notes' : 'emails'); return []; }
      throw e;
    }
  };
  const items = [
    ...await objects('note', ['hs_note_body', 'hs_timestamp', 'hs_attachment_ids']),
    ...await objects('email', ['hs_email_subject', 'hs_timestamp', 'hs_attachment_ids', 'hs_email_direction']),
  ].filter((r) => r.properties.hs_attachment_ids);
  const want = items.flatMap((r) => String(r.properties.hs_attachment_ids).split(';').filter(Boolean).map((fid) => ({ fid, r }))).slice(0, 40);
  const files = [];
  for (const { fid, r } of want) {
    try {
      const f = await hs(token, 'GET', `/files/v3/files/${fid}`);
      const ext = String(f?.extension ?? '').toLowerCase();
      if (!DOC_EXT.has(ext)) continue;
      const title = r.kind === 'email' ? r.properties.hs_email_subject ?? '' : stripHtml(r.properties.hs_note_body ?? '');
      files.push({ id: String(f.id), name: `${f.name ?? 'file'}.${ext}`, ext, size: Number(f.size) || 0, at: r.properties.hs_timestamp ?? f.createdAt ?? null, source: r.kind, title: title.slice(0, 90) });
    } catch (e) {
      if (e instanceof HubSpotError && e.status === 403) { if (!missing.includes('files')) missing.push('files'); break; }
      if (!(e instanceof HubSpotError && e.status === 404)) throw e;
    }
  }
  files.sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''));
  return { files, missing };
}

export const fileUrl = async (token: string, fileId: string) => (await hs(token, 'GET', `/files/v3/files/${fileId}/signed-url?expirationSeconds=300`))?.url ?? null;

// ---------- sending one quote ----------
const uploadPdf = async (token: string, pdf: Blob, name: string) => {
  const form = new FormData();
  form.append('file', pdf, name);
  form.append('fileName', name.replace(/\.pdf$/i, ''));
  form.append('folderPath', '/brickandpane-quotes');
  form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false, duplicateValidationStrategy: 'NONE' }));
  const res = await fetch('https://api.hubapi.com/files/v3/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try { message = JSON.parse(text).message ?? text; } catch { /* plain text */ }
    throw new HubSpotError(res.status, message);
  }
  return String(JSON.parse(text).id);
};
export const pdfName = (s: Pick<Send, 'reference' | 'revision'>) => `Brick-and-Pane-${s.reference}-rev${s.revision || '00'}.pdf`.replace(/[^\w.-]+/g, '-');
const errText = (e: unknown) => e instanceof HubSpotError ? `${e.status} ${e.message}`.slice(0, 500) : (e as Error)?.name === 'TimeoutError' ? 'timeout' : String((e as Error)?.message ?? e).slice(0, 500);

// Returns what happened (for the button and the count-only log). Safe to call twice: claim_quote_send lets one through.
export async function processSend(supabase: Db, sendId: string, maxAttempts = 5): Promise<string> {
  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return 'no token';
  const { data: claimed } = await supabase.rpc('claim_quote_send', { sid: sendId, max_attempts: maxAttempts });
  const s = (claimed as Send[] | null)?.[0];
  if (!s) return 'skipped';
  let pdfError: string | null = null;
  try {
    let fileId = s.hubspot_file_id;
    if (!fileId) {
      const { data: pdf, error } = await supabase.storage.from('quote-pdfs').download(s.pdf_path);
      if (error || !pdf) throw new Error('pdf missing in storage');
      try {
        fileId = await uploadPdf(token, pdf, pdfName(s));
        await supabase.from('quote_sends').update({ hubspot_file_id: fileId }).eq('id', s.id);
      } catch (e) {
        // A token without the "files" scope must not stop the note: the total still reaches the deal.
        if (!(e instanceof HubSpotError && e.status === 403)) throw e;
        pdfError = `pdf not attached: ${errText(e)}`;
      }
    }
    const { data: prev } = await supabase.from('quote_sends').select('revision, sent_on').eq('quote_id', s.quote_id)
      .lt('created_at', s.created_at).order('created_at', { ascending: false }).limit(1);
    const { data: others } = await supabase.from('quotes').select('reference, status').eq('hubspot_deal_id', s.hubspot_deal_id).neq('id', s.quote_id).neq('status', 'draft');
    const who = s.sent_by ? (await supabase.from('profiles').select('full_name').eq('id', s.sent_by).maybeSingle()).data?.full_name ?? null : null;
    const body = quoteNote(s, { previous: prev?.[0] ?? null, who, pdf: fileId ? pdfName(s) : null, others: (others ?? []).map((o: { reference: string; status: string }) => `${o.reference} (${o.status})`) });
    const note: Record<string, string> = { hs_timestamp: new Date(s.created_at).toISOString(), hs_note_body: body };
    if (fileId) note.hs_attachment_ids = fileId;
    const noteId = await create(token, 'notes', note);
    await associate(token, 'note', noteId, 'deal', s.hubspot_deal_id);
    await supabase.from('quote_sends').update({ hubspot_note_id: noteId, hubspot_synced_at: new Date().toISOString(), hubspot_error: pdfError }).eq('id', s.id);

    // After the note, so a failed stage change never repeats the note; it is retried by the next status sync.
    let moved = false;
    try {
      const [deal] = await batchRead(token, 'deals', [s.hubspot_deal_id], ['dealstage']);
      const to = stageAfterSend(deal?.properties.dealstage);
      if (to) { await hs(token, 'PATCH', `/crm/v3/objects/deals/${s.hubspot_deal_id}`, { properties: { dealstage: to } }); moved = true; }
      await supabase.from('quotes').update({ hubspot_dealstage: to ?? deal?.properties.dealstage ?? null }).eq('id', s.quote_id);
    } catch (e) {
      await supabase.from('quote_sends').update({ hubspot_error: `stage: ${errText(e)}` }).eq('id', s.id);
    }
    if (moved) await supabase.from('quote_sends').update({ hubspot_stage_moved: true }).eq('id', s.id);
    return pdfError ? 'sent without pdf' : 'sent';
  } catch (e) {
    await supabase.from('quote_sends').update({ hubspot_error: errText(e) }).eq('id', s.id);
    return 'error';
  }
}

// ---------- cron: retries and statuses ----------
export async function syncQuotes(supabase: Db) {
  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return { skipped: 'no token' };
  const out = { sent: 0, failed: 0, deals: 0, updated: 0 };
  const { data: pending } = await supabase.from('quote_sends').select('id').is('hubspot_note_id', null).lt('hubspot_attempts', 5)
    .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).lt('created_at', new Date(Date.now() - 2 * 60e3).toISOString()).order('created_at').limit(20);
  for (const p of pending ?? []) {
    const r = await processSend(supabase, p.id);
    if (r.startsWith('sent')) out.sent++; else if (r === 'error') out.failed++;
  }
  const { data: quotes } = await supabase.from('quotes').select('id, hubspot_deal_id, hubspot_dealstage, hubspot_deal_name, status, status_source')
    .not('hubspot_deal_id', 'is', null).neq('status', 'draft').limit(1000);
  const byDeal = new Map<string, { id: string; hubspot_dealstage: string | null; hubspot_deal_name: string | null; status: string; status_source: string | null }[]>();
  for (const q of quotes ?? []) byDeal.set(q.hubspot_deal_id, [...(byDeal.get(q.hubspot_deal_id) ?? []), q]);
  const deals = await batchRead(token, 'deals', [...byDeal.keys()], ['dealstage', 'dealname']);
  out.deals = deals.length;
  const now = new Date().toISOString();
  for (const d of deals) {
    const qs = byDeal.get(d.id) ?? [];
    const { updates } = statusesFromStage(d.properties.dealstage, qs);
    for (const u of updates) {
      await supabase.from('quotes').update({ status: u.status, status_source: 'hubspot', status_at: now }).eq('id', u.id);
      out.updated++;
    }
    const stale = qs.filter((q) => q.hubspot_dealstage !== d.properties.dealstage || q.hubspot_deal_name !== d.properties.dealname).map((q) => q.id);
    if (stale.length) await supabase.from('quotes').update({ hubspot_dealstage: d.properties.dealstage, hubspot_deal_name: d.properties.dealname }).in('id', stale);
  }
  return out;
}
