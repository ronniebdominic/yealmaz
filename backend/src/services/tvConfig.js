// Ye-Almaz — settings for the lab TV: screens, timing, visibility, targets. Stored as one JSON row
// (TvConfig "default"); everything is clamped here so a bad save can never blank or crash the screen.
const SCREEN_IDS = ['command', 'employees', 'performance', 'pipeline', 'critical', 'achievements'];

const DEFAULT_CONFIG = {
  title: 'Live Production Command Center',
  autoRotate: true,
  screens: [
    { id: 'command', enabled: true, seconds: 30 },
    { id: 'employees', enabled: true, seconds: 35 },
    { id: 'performance', enabled: true, seconds: 30 },
    { id: 'pipeline', enabled: true, seconds: 30 },
    { id: 'critical', enabled: true, seconds: 20 },
    { id: 'achievements', enabled: true, seconds: 20 },
  ],
  transitionMs: 800,
  animationIntensity: 'normal', // 'off' | 'low' | 'normal'
  interstitialEvery: 0, // show the branded interstitial after every N full rotations; 0 = never
  interstitialSlogan: '', // empty = no slogan line; needs management approval before use
  visibleDepartments: [], // empty = all
  hiddenEmployeeIds: [],
  employeesPerPage: 12,
  performance: {
    periodDays: 7,
    minSample: 10, // fewer finished cases than this => "Not enough data" for rate metrics
    stageWeights: {}, // department code -> workload weight (default 1)
    dailyTargets: {}, // department code -> weighted units per day; no target => no ranking
    handlingTargetMinutes: {}, // department code -> expected minutes at the bench
  },
  alerts: {
    dueSoonHours: 24,
    bottleneckWaiting: 8, // cases waiting in one department before it is called a bottleneck
    staleStageHours: 24, // a case sitting this long in one department is flagged
    priorityMode: false, // jump to the Critical screen when something new turns critical
  },
  achievements: {
    milestones: [10, 25, 50], // completed cases in a day that earn a milestone
    recognitions: [], // [{ text }] entered by management
  },
};

const num = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const numMap = (obj, min, max) => {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (/^[A-Z0-9_]{2,20}$/.test(k) && Number.isFinite(n) && n >= min && n <= max) out[k] = n;
    }
  }
  return out;
};

function sanitizeConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_CONFIG;
  const inScreens = Array.isArray(input.screens) ? input.screens : [];
  const screens = [];
  for (const s of inScreens) {
    if (SCREEN_IDS.includes(s?.id) && !screens.some(x => x.id === s.id)) {
      const base = d.screens.find(x => x.id === s.id);
      screens.push({ id: s.id, enabled: s.enabled !== false, seconds: num(s.seconds, 5, 300, base.seconds) });
    }
  }
  for (const base of d.screens) if (!screens.some(x => x.id === base.id)) screens.push({ ...base }); // never lose a screen
  const p = input.performance || {}, a = input.alerts || {}, ach = input.achievements || {};
  return {
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 80) : d.title,
    autoRotate: input.autoRotate !== false,
    screens,
    transitionMs: num(input.transitionMs, 0, 3000, d.transitionMs),
    animationIntensity: ['off', 'low', 'normal'].includes(input.animationIntensity) ? input.animationIntensity : d.animationIntensity,
    interstitialEvery: Math.round(num(input.interstitialEvery, 0, 50, 0)),
    interstitialSlogan: typeof input.interstitialSlogan === 'string' ? input.interstitialSlogan.trim().slice(0, 120) : '',
    visibleDepartments: Array.isArray(input.visibleDepartments) ? input.visibleDepartments.filter(c => /^[A-Z0-9_]{2,20}$/.test(c)) : [],
    hiddenEmployeeIds: Array.isArray(input.hiddenEmployeeIds) ? input.hiddenEmployeeIds.filter(x => typeof x === 'string').slice(0, 500) : [],
    employeesPerPage: Math.round(num(input.employeesPerPage, 4, 40, d.employeesPerPage)),
    performance: {
      periodDays: Math.round(num(p.periodDays, 1, 14, d.performance.periodDays)),
      minSample: Math.round(num(p.minSample, 1, 200, d.performance.minSample)),
      stageWeights: numMap(p.stageWeights, 0.1, 20),
      dailyTargets: numMap(p.dailyTargets, 0.1, 1000),
      handlingTargetMinutes: numMap(p.handlingTargetMinutes, 1, 1440),
    },
    alerts: {
      dueSoonHours: num(a.dueSoonHours, 1, 240, d.alerts.dueSoonHours),
      bottleneckWaiting: Math.round(num(a.bottleneckWaiting, 1, 500, d.alerts.bottleneckWaiting)),
      staleStageHours: num(a.staleStageHours, 1, 720, d.alerts.staleStageHours),
      priorityMode: a.priorityMode === true,
    },
    achievements: {
      milestones: (Array.isArray(ach.milestones) ? ach.milestones : d.achievements.milestones)
        .map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 1000).slice(0, 10).sort((x, y) => x - y),
      recognitions: (Array.isArray(ach.recognitions) ? ach.recognitions : [])
        .filter(r => typeof r?.text === 'string' && r.text.trim()).slice(0, 20).map(r => ({ text: r.text.trim().slice(0, 160) })),
    },
  };
}

module.exports = { DEFAULT_CONFIG, SCREEN_IDS, sanitizeConfig };
