// Ye-Almaz — Telegram Bot: Deterministic Business Insights
//
// The "senior data analyst" layer — computed entirely in code, never by the
// model.
//
// WHY THIS EXISTS AS CODE RATHER THAN A PROMPT: the bot runs on a local
// 8B model, which was repeatedly observed inventing confident, plausible,
// wrong business analysis when asked open-ended questions (see the grounding
// guardrail in telegramBotAgent.js). Analysis the lab owner may make
// financial decisions on cannot come from that. So every finding below is a
// deterministic calculation over the same compute* functions the admin
// dashboard uses; the model's only job is to phrase findings it is handed.
// It cannot add a finding that isn't here, and the guardrail stops it
// answering at all without calling a tool first.
//
// NO HIDDEN BIAS: every threshold that promotes a finding to "high" or
// "medium" is a named constant below, and every finding carries the `basis`
// string explaining exactly how it was derived, so a number in a Telegram
// reply can always be traced back to its rule. Findings are observations
// with their arithmetic attached — deliberately not causal claims
// ("outstanding rose 30%", never "outstanding rose because collections
// slipped"), since cause isn't in the data.
//
// READ-ONLY, same audit rule as botTools.js/botOperations.js.
const { PrismaClient } = require('@prisma/client');
const dashboard = require('../routes/dashboard');

const prisma = new PrismaClient();

// ── Auditable thresholds ──────────────────────────────────
const T = {
  // A single clinic above this share of revenue or outstanding is a
  // concentration risk worth naming (one clinic leaving/not paying hurts).
  concentrationHighPct: 30,
  concentrationMediumPct: 20,
  // Unpaid delivered work older than this is money at real risk.
  agedReceivableHighDays: 90,
  agedReceivableMediumDays: 45,
  // Remakes are billed free or at 50%, so they are a direct margin cost.
  remakeRateHighPct: 8,
  remakeRateMediumPct: 5,
  onTimeDeliveryLowPct: 85,
  // A case still in production this long after intake is stalled, not slow.
  staleWipDays: 21,
  // One technician above this share of all scans is a single-point-of-
  // failure on capacity.
  techConcentrationPct: 25,
  trendDropMediumPct: 10,
  trendDropHighPct: 25,
};

function pct(part, whole) {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(1));
}

// Explicit en-US grouping, never bare toLocaleString(): the server's own
// locale decides otherwise, and on this deployment that produced Indian
// lakh grouping ("Br 10,14,500" for 1,014,500) — badly misleading for Birr
// figures the owner reads off a phone.
function fmtBr(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function finding(severity, area, headline, metric, basis) {
  return { severity, area, headline, metric, basis };
}

async function computeBusinessInsights({ from, to } = {}) {
  const range = {
    from: from || new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA'),
    to: to || new Date().toLocaleDateString('en-CA'),
  };

  const [analytics, partners, labPerf, staleWip, awaitingVerification] = await Promise.all([
    dashboard.computeAdminAnalytics({ from: range.from, to: range.to }),
    dashboard.computeTrustedPartnersSummary(),
    dashboard.computeLabPerformance({ from: range.from, to: range.to }),
    prisma.case.count({
      where: {
        status: { notIn: ['DELIVERED', 'CANCELLED', 'REJECTED'] },
        createdAt: { lt: new Date(Date.now() - T.staleWipDays * 86400000) },
      },
    }),
    prisma.payment.count({ where: { status: 'SCREENSHOT_UPLOADED' } }),
  ]);

  const kpi = analytics?.kpi || {};
  const findings = [];

  // ── Receivables: total, ageing, and concentration ───────
  const totalOutstanding = (partners || []).reduce((s, c) => s + (c.outstanding || 0), 0);
  if (totalOutstanding > 0) {
    const aged = (partners || [])
      .filter(c => (c.outstanding || 0) > 0 && (c.oldestAgeDays || 0) >= T.agedReceivableMediumDays)
      .sort((a, b) => (b.oldestAgeDays || 0) - (a.oldestAgeDays || 0));

    if (aged.length) {
      const worst = aged[0];
      const agedTotal = aged.reduce((s, c) => s + c.outstanding, 0);
      findings.push(finding(
        worst.oldestAgeDays >= T.agedReceivableHighDays ? 'high' : 'medium',
        'receivables',
        `${aged.length} trusted partner(s) have unpaid delivered work older than ${T.agedReceivableMediumDays} days, totalling Br ${fmtBr(agedTotal)}. Oldest: ${worst.name} at ${worst.oldestAgeDays} days (Br ${fmtBr(worst.outstanding)}).`,
        { agedClinics: aged.length, agedAmount: Math.round(agedTotal), oldestClinic: worst.name, oldestAgeDays: worst.oldestAgeDays },
        `Clinics from trusted-partners-summary with outstanding > 0 and oldestAgeDays >= ${T.agedReceivableMediumDays}; "high" at >= ${T.agedReceivableHighDays} days.`,
      ));
    }

    const top = [...(partners || [])].sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0))[0];
    const topShare = pct(top?.outstanding || 0, totalOutstanding);
    if (topShare != null && topShare >= T.concentrationMediumPct) {
      findings.push(finding(
        topShare >= T.concentrationHighPct ? 'high' : 'medium',
        'receivables',
        `${topShare}% of all outstanding money (Br ${fmtBr(top.outstanding)} of Br ${fmtBr(totalOutstanding)}) sits with one clinic, ${top.name}.`,
        { clinic: top.name, outstanding: Math.round(top.outstanding), sharePct: topShare, totalOutstanding: Math.round(totalOutstanding) },
        `Largest single clinic's outstanding as a share of all clinics' outstanding; flagged at >= ${T.concentrationMediumPct}%, "high" at >= ${T.concentrationHighPct}%.`,
      ));
    }

    const overdueBills = (partners || []).filter(c => c.billOverdue && (c.outstanding || 0) > 0);
    if (overdueBills.length) {
      findings.push(finding(
        'high', 'receivables',
        `${overdueBills.length} trusted partner(s) are past their billing date with money owed: ${overdueBills.slice(0, 5).map(c => c.name).join(', ')}${overdueBills.length > 5 ? '…' : ''}.`,
        { clinics: overdueBills.length, amount: Math.round(overdueBills.reduce((s, c) => s + c.outstanding, 0)) },
        'Clinics where trusted-partners-summary reports billOverdue = true and outstanding > 0.',
      ));
    }
  }

  // ── Revenue concentration ───────────────────────────────
  const byClinic = analytics?.revenueByClinic || [];
  const revTotal = byClinic.reduce((s, c) => s + (c.revenue || 0), 0);
  if (byClinic.length && revTotal > 0) {
    const topClinic = byClinic[0];
    const share = pct(topClinic.revenue || 0, revTotal);
    if (share != null && share >= T.concentrationMediumPct) {
      findings.push(finding(
        share >= T.concentrationHighPct ? 'high' : 'medium',
        'revenue',
        `${share}% of revenue in this period came from one clinic, ${topClinic.name || topClinic.clinicName}.`,
        { clinic: topClinic.name || topClinic.clinicName, revenue: Math.round(topClinic.revenue), sharePct: share },
        `Top clinic's revenue as a share of total revenue over the requested range; flagged at >= ${T.concentrationMediumPct}%, "high" at >= ${T.concentrationHighPct}%.`,
      ));
    }
  }

  // ── Quality: remake rate ────────────────────────────────
  const remakeRate = pct(kpi.totalRemakes || 0, kpi.totalCases || 0);
  if (remakeRate != null && remakeRate >= T.remakeRateMediumPct) {
    findings.push(finding(
      remakeRate >= T.remakeRateHighPct ? 'high' : 'medium',
      'quality',
      `Remakes are ${remakeRate}% of cases in this period (${kpi.totalRemakes} of ${kpi.totalCases})${kpi.mostCommonRemakeReason ? `; most common reason: ${kpi.mostCommonRemakeReason}` : ''}. Remakes bill at Br 0 or 50%, so this is a direct margin cost.`,
      { remakes: kpi.totalRemakes, totalCases: kpi.totalCases, ratePct: remakeRate, topReason: kpi.mostCommonRemakeReason || null },
      `totalRemakes / totalCases from admin-analytics; flagged at >= ${T.remakeRateMediumPct}%, "high" at >= ${T.remakeRateHighPct}%.`,
    ));
  }

  // ── Delivery reliability ────────────────────────────────
  if (kpi.onTimeDeliveryPct != null && kpi.onTimeDeliveryPct < T.onTimeDeliveryLowPct) {
    findings.push(finding(
      'medium', 'delivery',
      `On-time delivery is ${kpi.onTimeDeliveryPct}% this period, below the ${T.onTimeDeliveryLowPct}% mark. Average turnaround is ${kpi.avgTurnaroundDays} days.`,
      { onTimePct: kpi.onTimeDeliveryPct, avgTurnaroundDays: kpi.avgTurnaroundDays },
      `admin-analytics onTimeDeliveryPct below ${T.onTimeDeliveryLowPct}%.`,
    ));
  }

  // ── Stalled work in progress ────────────────────────────
  if (staleWip > 0) {
    findings.push(finding(
      staleWip >= 25 ? 'high' : 'medium', 'production',
      `${staleWip} case(s) are still in production more than ${T.staleWipDays} days after intake — these are stalled, not merely slow.`,
      { staleCases: staleWip, thresholdDays: T.staleWipDays },
      `Cases with status not in DELIVERED/CANCELLED/REJECTED and createdAt older than ${T.staleWipDays} days, counted live.`,
    ));
  }

  // ── Payment workflow friction ───────────────────────────
  if (awaitingVerification > 0) {
    findings.push(finding(
      awaitingVerification >= 10 ? 'medium' : 'info', 'payments',
      `${awaitingVerification} payment(s) have a screenshot uploaded but are still unverified — money likely already received but not recorded as collected.`,
      { awaitingVerification },
      'Payments with status SCREENSHOT_UPLOADED, counted live.',
    ));
  }

  // ── Capacity concentration ──────────────────────────────
  const techs = (labPerf?.techs || []).filter(t => (t.totalScans || 0) > 0);
  if (techs.length > 1) {
    const topTech = [...techs].sort((a, b) => b.totalScans - a.totalScans)[0];
    if ((topTech.shareOfTotalPercent || 0) >= T.techConcentrationPct) {
      findings.push(finding(
        'medium', 'capacity',
        `${topTech.name} accounts for ${topTech.shareOfTotalPercent}% of all lab scans this period — capacity is concentrated on one person.`,
        { technician: topTech.name, sharePct: topTech.shareOfTotalPercent, scans: topTech.totalScans, activeTechs: techs.length },
        `Highest single technician share of total lab scans; flagged at >= ${T.techConcentrationPct}%.`,
      ));
    }
  }

  // ── Month-over-month movement ───────────────────────────
  // Compares only COMPLETE months. monthlyTrend's final bucket is the
  // calendar month containing the range end, so when the range runs to today
  // that bucket is a part-month. Comparing 16 days against a full 31 and
  // flagging it as a revenue collapse is a false alarm, not an insight — it
  // was doing exactly that (a "high" severity -31% on a half-finished
  // August) before this guard. The partial month is still reported, but as
  // a plainly-labelled part-month figure with no severity attached.
  const trend = analytics?.monthlyTrend || [];
  if (trend.length >= 2) {
    const rangeEnd = new Date(`${range.to}T00:00:00`);
    const lastDayOfEndMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 1, 0).getDate();
    const endsMidMonth = rangeEnd.getDate() < lastDayOfEndMonth;

    const complete = endsMidMonth ? trend.slice(0, -1) : trend;
    const partial = endsMidMonth ? trend[trend.length - 1] : null;

    if (complete.length >= 2) {
      const prev = complete[complete.length - 2];
      const curr = complete[complete.length - 1];
      if (prev?.revenue > 0) {
        const changePct = Number((((curr.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1));
        const dropped = changePct <= -T.trendDropMediumPct;
        if (dropped || changePct >= T.trendDropMediumPct) {
          findings.push(finding(
            dropped && changePct <= -T.trendDropHighPct ? 'high' : 'info',
            'revenue',
            `Revenue ${dropped ? 'fell' : 'rose'} ${Math.abs(changePct)}% from ${prev.month} (Br ${fmtBr(prev.revenue)}) to ${curr.month} (Br ${fmtBr(curr.revenue)}) — the two most recent complete months.`,
            { fromMonth: prev.month, toMonth: curr.month, fromRevenue: Math.round(prev.revenue), toRevenue: Math.round(curr.revenue), changePct },
            `Last two COMPLETE buckets of admin-analytics monthlyTrend (any part-month at the end is excluded from this comparison); reported at +/- ${T.trendDropMediumPct}%.`,
          ));
        }
      }
    }

    if (partial) {
      findings.push(finding(
        'info', 'revenue',
        `${partial.month} so far (part-month, ${rangeEnd.getDate()} of ${lastDayOfEndMonth} days): Br ${fmtBr(partial.revenue)}. Not comparable to a full month.`,
        { month: partial.month, revenueSoFar: Math.round(partial.revenue), daysElapsed: rangeEnd.getDate(), daysInMonth: lastDayOfEndMonth },
        'Final monthlyTrend bucket, reported as-is because the month is incomplete. Deliberately not compared against a full prior month.',
      ));
    }
  }

  // ── Inventory ───────────────────────────────────────────
  const lowStock = await prisma.inventoryItem.findMany({
    where: { isActive: true, reorderThreshold: { not: null } },
    select: { name: true, quantityOnHand: true, reorderThreshold: true, unit: true },
  });
  const below = lowStock.filter(i => i.quantityOnHand <= i.reorderThreshold);
  if (below.length) {
    findings.push(finding(
      'medium', 'inventory',
      `${below.length} inventory item(s) are at or below their reorder threshold: ${below.slice(0, 5).map(i => `${i.name} (${i.quantityOnHand} ${i.unit})`).join(', ')}${below.length > 5 ? '…' : ''}.`,
      { itemsBelowThreshold: below.length },
      'Active inventory items with a set reorderThreshold where quantityOnHand <= reorderThreshold.',
    ));
  }

  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    range,
    headlineNumbers: {
      revenue: kpi.totalRevenue, cases: kpi.totalCases, delivered: kpi.deliveredCases,
      outstandingAmount: kpi.outstandingAmount, outstandingCases: kpi.outstandingCount,
      avgTurnaroundDays: kpi.avgTurnaroundDays, onTimeDeliveryPct: kpi.onTimeDeliveryPct,
    },
    findingCount: findings.length,
    findings,
    noFindingsMeans: findings.length === 0
      ? 'No rule crossed its threshold for this period — this means nothing was flagged, not that the business has no issues.'
      : undefined,
    instruction: 'Report ONLY these findings. Do not add observations, causes, predictions or recommendations that are not stated here.',
  };
}

module.exports = { computeBusinessInsights, THRESHOLDS: T };
