// Door layouts in plain words. The short codes ('4C', '4+1') stay in data, forms and the CSV import only:
// a visitor never sees them. supabase/functions/list-email keeps a copy of these names for the email.
const SLIDE = {
  '2A': ['2 panels, one slides', '2 skrzydła, jedno przesuwne'],
  '2B': ['2 panels, both slide', '2 skrzydła, oba przesuwne'],
  '3T': ['3 panels, opening to one side', '3 skrzydła, otwierane na jedną stronę'],
  '4C': ['4 panels, opening from the centre', '4 skrzydła, otwierane od środka'],
  '6C': ['6 panels, opening from the centre', '6 skrzydeł, otwierane od środka'],
};
const HINGED = { S: ['Single door', 'Drzwi jednoskrzydłowe'], D: ['Double (French) door', 'Drzwi dwuskrzydłowe'] };
const leaves = (n, pl) => (pl ? `${n} ${n >= 2 && n <= 4 ? 'skrzydła' : 'skrzydeł'}` : `${n} leaves`);

// "4+1" → "5 leaves: 4 fold left, 1 right"; "5+0" → "5 leaves, all fold left" (left and right as on the drawing).
export const layoutName = (system, config, pl = false) => {
  const i = pl ? 1 : 0;
  if (system === 'bifold') {
    const m = /^(\d)\+(\d)$/.exec(config || '');
    if (!m) return '';
    const [a, b] = [+m[1], +m[2]];
    if (!b) return pl ? `${leaves(a, true)}, wszystkie w lewo` : `${leaves(a)}, all fold left`;
    return pl ? `${leaves(a + b, true)}: ${a} w lewo, ${b} w prawo` : `${leaves(a + b)}: ${a} fold left, ${b} right`;
  }
  if (system === 'hinged') return HINGED[config]?.[i] || '';
  return ['lift-slide', 'sliding'].includes(system) ? SLIDE[config]?.[i] || '' : '';
};
