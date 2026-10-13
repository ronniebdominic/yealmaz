// Ye-Almaz — reward points a clinic earns when it submits a case through the app.
//
// Points scale with the work: rate x units (aligners: per tray). The first matching rule wins, so the
// order matters — "Zirconia Coping" must hit the coping rule, not the zirconia one. Work types that
// match no rule fall back to the flat "points per case" setting (Admin > Rewards).
//
// To change a rate, edit it here (this is the only place the rates live).

const RATES = [
  { key: 'coping',   label: 'Coping',                                      perUnit: 'unit', rate: 50,  test: (n) => /cop+ing/.test(n) },
  { key: 'aligner',  label: 'Aligner',                                     perUnit: 'tray', rate: 500, test: (n) => /aligner/.test(n) && !/setup/.test(n) },
  { key: 'emax',     label: 'E.max',                                       perUnit: 'unit', rate: 500, test: (n) => /e[\s.-]?max/.test(n) },
  { key: 'zirconia', label: 'Zirconia',                                    perUnit: 'unit', rate: 100, test: (n) => /zirconia/.test(n) },
  { key: 'pfm',      label: 'PFM',                                         perUnit: 'unit', rate: 50,  test: (n) => /\bpfm\b/.test(n) },
  { key: 'flexible', label: 'Flexible denture',                            perUnit: 'unit', rate: 15,  test: (n) => /flexible/.test(n) },
  { key: 'guards',   label: 'Retainer / mouth guard / bleaching tray',     perUnit: 'unit', rate: 10,  test: (n) => /retainer|night\s*guard|mouth\s*guard|bleaching/.test(n) },
];

// -> { points, rate, perUnit, label } for a work type that has a rate, otherwise null.
function pointsForWork(workType, units) {
  const name = String(workType || '').toLowerCase();
  const rule = RATES.find(r => r.test(name));
  if (!rule) return null;
  const qty = Math.max(parseInt(units, 10) || 1, 1);
  return { points: rule.rate * qty, rate: rule.rate, perUnit: rule.perUnit, label: rule.label, qty };
}

// The rates as shown to clinics and admins.
const listRates = () => RATES.map(({ key, label, perUnit, rate }) => ({ key, label, perUnit, rate }));

module.exports = { pointsForWork, listRates };
