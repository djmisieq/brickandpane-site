// The comparable net of a supplier quote in £, as net_gbp computes it in the database (migration 0039): VAT taken out,
// the discount off, delivery on top. Shared by the CRM's costs panel and the demo store. Staff only.
export const netOf = (c) => (c.net_gbp != null ? Number(c.net_gbp)
  : Math.round(((Number(c.amount) * Number(c.fx_to_gbp ?? 1)) / (1 + (Number(c.vat_in_pct) || 0) / 100) * (1 - (Number(c.discount_pct) || 0) / 100) + (Number(c.delivery_gbp) || 0)) * 100) / 100);
