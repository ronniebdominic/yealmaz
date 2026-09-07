// Ye-Almaz — Telegram Bot Tool Registry
//
// Every tool the bot can call, read-only, calling straight into the same
// compute*/search*/get* functions the admin dashboard's own routes use
// (see dashboard.js, cases.js, payments.js) — in-process, no HTTP hop, no
// duplicated query logic, so the bot can never report a number that
// disagrees with what those endpoints themselves show.
//
// SINGLE AUDIT POINT: every handler below must call a compute*/search*/
// get* function — never anything that writes. This file has no `create`,
// `update`, `delete`, or `upsert` Prisma calls anywhere, and none of its
// imports write either — keep it that way.
const dashboard = require('../routes/dashboard');
const cases = require('../routes/cases');
const payments = require('../routes/payments');
const operations = require('./botOperations');
const insights = require('./botInsights');

// Trimming helpers — the underlying compute functions return the exact
// same NUMBERS the dashboard shows (never altered here), but some of them
// carry large rendering-only payloads (per-day sparkline buckets, full
// nested case lists behind an aggregate, every clinic in the system) that
// a local model's context window can't comfortably hold alongside a
// multi-round conversation. These trims only ever drop that kind of
// UI-only detail — they never change a total, a count, or an amount.

function trimAdminAnalytics(data) {
  return {
    kpi: data.kpi,
    monthlyTrendLast6Months: (data.monthlyTrend || []).slice(-6),
    topClinicsByRevenue: (data.revenueByClinic || []).slice(0, 10),
    topWorkTypesByRevenue: (data.revenueByWorkType || []).slice(0, 10),
    note: 'clinicList and the full per-clinic/work-type breakdown are omitted here — use search_cases or get_clinic_statement for clinic-specific detail.',
  };
}

function trimFinanceReport(data) {
  return {
    revenue: data.revenue,
    units: data.units,
    paid: data.paid,
    pending: data.pending,
    taxWithheld: data.taxWithheld,
    note: 'Individual payment records are omitted — use search_cases for specific case/clinic lookups.',
  };
}

// Only technicians who actually did something, ranked, capped.
//
// This previously returned every technician on the books — 35 rows, 17 of
// them all-zero — at ~1,725 tokens. At that size the model stopped reading
// the data and started confabulating it: asked for performance on a
// specific day it produced ten plausible-looking Ethiopian names with a
// smooth 47/45/42/41/40 scan sequence, none of which were real (the actual
// top three were Ashish Arun Sale 56, Dems Yisma Mengesha 33, Shewaye Guche
// Abreham 30). Padding a small model's context with irrelevant rows is not
// a neutral cost — it actively degrades fidelity to the rows that matter.
function trimLabPerformance(data) {
  const active = (data.techs || [])
    .filter(t => (t.totalScans || 0) > 0)
    .sort((a, b) => (b.totalScans || 0) - (a.totalScans || 0));

  return {
    range: data.range,
    totalLabScans: data.totalLabScans,
    unattributedScans: data.unattributedScans,
    techniciansWithActivity: active.length,
    techniciansWithNoActivity: (data.techs || []).length - active.length,
    // Ranked, so "who is best/most active" is the first row — no sorting or
    // comparing left for the model to get wrong.
    techs: active.slice(0, 15).map(t => ({
      name: t.name, totalScans: t.totalScans, uniqueCases: t.uniqueCases,
      busiestDept: t.busiestDept, activeDays: t.activeDays,
      avgPerActiveDay: t.avgPerActiveDay, shareOfTotalPercent: t.shareOfTotalPercent,
    })),
  };
}

// Same treatment as trimLabPerformance above — active agents only, ranked.
function trimDeliveryPerformance(data) {
  const active = (data.agents || [])
    .filter(a => (a.totalOrders || 0) > 0)
    .sort((a, b) => (b.totalOrders || 0) - (a.totalOrders || 0));

  return {
    range: data.range,
    totalLabOrders: data.totalLabOrders,
    unattributedOrders: data.unattributedOrders,
    agentsWithActivity: active.length,
    agents: active.slice(0, 15).map(a => ({
      name: a.name, totalPickups: a.totalPickups, totalDeliveries: a.totalDeliveries,
      totalOrders: a.totalOrders, uniqueClinics: a.uniqueClinics,
      activeDays: a.activeDays, shareOfTotalPercent: a.shareOfTotalPercent,
    })),
  };
}

function trimClinicBalances(data) {
  return (data || []).map(c => ({
    name: c.name, isExcluded: c.isExcluded,
    pendingCount: c.pendingCount, pendingAmount: c.pendingAmount,
  }));
}

function trimTrustedPartnersSummary(data) {
  const rows = data || []; // already sorted by outstanding desc at the source
  const withOutstanding = rows.filter(c => (c.outstanding || 0) > 0);

  // Totals are computed HERE, not left to the model. "How much is
  // outstanding from Trusted Partners" is the single most-asked question,
  // and when this returned 25 rows of raw figures the model had to add
  // them up itself — which it did differently every time, returning
  // Br 10,075,000 / 12,115,000 / 11,570,000 / 10,045,000 across four runs
  // of the identical question. A headline total the model only has to read
  // out removes that entire class of error. It also cut this payload from
  // ~1,640 tokens to a few hundred: at full size, both models tested took
  // 140-200s on this question and then returned an EMPTY reply.
  const totals = {
    totalOutstanding: Math.round(withOutstanding.reduce((s, c) => s + (c.outstanding || 0), 0)),
    clinicsWithOutstanding: withOutstanding.length,
    totalOutstandingCases: withOutstanding.reduce((s, c) => s + (c.outstandingCount || 0), 0),
    totalPartners: rows.length,
    overdueBillCount: rows.filter(c => c.billOverdue && (c.outstanding || 0) > 0).length,
  };

  return {
    totals,
    // Top 10 by outstanding is enough to name who owes most; the total
    // above already covers "how much in total" without needing every row.
    topByOutstanding: withOutstanding.slice(0, 10).map(c => ({
      name: c.name, outstanding: Math.round(c.outstanding || 0),
      outstandingCount: c.outstandingCount, oldestAgeDays: c.oldestAgeDays,
      billOverdue: c.billOverdue || false,
    })),
  };
}

function trimClinicStatement(caseList) {
  return (caseList || []).map(c => ({
    caseNumber: c.caseNumber, patientName: c.patientName, workType: c.workType,
    units: c.units, deliveryDate: c.deliveryDate,
    amountOwed: (c.totalAmount || 0) - (c.payment?.amountReceived || 0),
    invoiceNumber: c.payment?.invoiceNumber || null,
  }));
}

function trimCaseDetail(c) {
  if (!c) return null;
  return {
    caseNumber: c.caseNumber, patientName: c.patientName, workType: c.workType,
    status: c.status, paymentStatus: c.paymentStatus, totalAmount: c.totalAmount,
    dueDate: c.dueDate, deliveryDate: c.deliveryDate, createdAt: c.createdAt,
    clinicName: c.clinic?.name || null,
    payment: c.payment ? {
      status: c.payment.status, amount: c.payment.amount,
      amountReceived: c.payment.amountReceived, verifiedAt: c.payment.verifiedAt,
    } : null,
    remakeOf: c.originalCase ? { caseNumber: c.originalCase.caseNumber, patientName: c.originalCase.patientName } : null,
    // Last 10 stages only — the full production history can run long;
    // this is enough for "what's happening with this case" style answers.
    recentStages: (c.stages || []).slice(-10).map(s => ({
      stage: s.stageName, by: s.scannedBy, at: s.scannedAt, notes: s.notes,
    })),
  };
}

const TOOLS = [
  {
    def: {
      type: 'function',
      function: {
        name: 'get_dashboard_summary',
        description: "Today/this-month headline numbers: total cases, active cases, pending pickups/payments, this month's vs last month's revenue, today's new/remake/redo/delivered cases, and cases ready to dispatch. Best first call for a general \"how are we doing\" question.",
        parameters: { type: 'object', properties: {} },
      },
    },
    handler: async () => (await dashboard.computeDashboardSummary()).stats,
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_admin_analytics',
        description: 'Business analytics over a date range: revenue, case/unit counts, turnaround time, on-time delivery %, top clinics and work types by revenue, remake stats. IMPORTANT: "deliveredCases" = cases DELIVERED in the range regardless of when created; "deliveredOfCreated" = of cases CREATED in the range, how many have since been delivered. Pick the one actually asked — never conflate them.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'YYYY-MM-DD, default start of this year.if omitted.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.if omitted.' },
            clinicId: { type: 'string', description: 'Optional — restrict to one clinic by id.' },
          },
        },
      },
    },
    handler: async (args) => trimAdminAnalytics(await dashboard.computeAdminAnalytics(args)),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_finance_report',
        description: 'Revenue (daily/month-to-date/year-to-date/custom range), units delivered, payments outstanding (count + amount, delivered cases only), and tax-withheld totals.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start date, YYYY-MM-DD, for the custom "range" figures. Defaults to start of this year.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.' },
          },
        },
      },
    },
    handler: async (args) => trimFinanceReport(await dashboard.computeFinanceReport(args)),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_lab_performance',
        description: 'STAFF PERFORMANCE/PRODUCTIVITY. Per-technician scan activity over a range: total scans, unique cases, busiest dept, active days, share of lab volume. Use for "how is staff performing", "best/most active tech", "how is [name] doing". For mere PRESENCE (attendance/leave), use get_staff_attendance instead.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'YYYY-MM-DD, default start of this year.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.' },
          },
        },
      },
    },
    handler: async (args) => trimLabPerformance(await dashboard.computeLabPerformance(args)),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_delivery_performance',
        description: 'Per-delivery-agent activity over a date range: pickups, deliveries, total orders, unique clinics served, and each agent\'s share of the lab\'s total order volume. Use for "who\'s the top delivery agent" style questions.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'YYYY-MM-DD, default start of this year.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.' },
          },
        },
      },
    },
    handler: async (args) => trimDeliveryPerformance(await dashboard.computeDeliveryPerformance(args)),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_clinic_balances',
        description: 'Every clinic (trusted partner or not) with an outstanding unpaid balance on delivered cases — pending case count and amount owed, per clinic.',
        parameters: { type: 'object', properties: {} },
      },
    },
    handler: async () => trimClinicBalances(await dashboard.computeClinicBalances()),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_trusted_partners_summary',
        description: 'Trusted-partner receivables. Returns "totals" (outstanding across ALL partner clinics, clinics owing, unpaid cases, overdue count) plus the top 10 clinics by amount owed. For "how much is outstanding from Trusted Partners", read totals.totalOutstanding directly — never sum the rows yourself, and never treat the top-10 as the full set.',
        parameters: { type: 'object', properties: {} },
      },
    },
    handler: async () => trimTrustedPartnersSummary(await dashboard.computeTrustedPartnersSummary()),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_cases_by_status',
        description: 'Count of cases currently at each pipeline status (e.g. how many are in Scanning, Quality Check, Ready to Dispatch, Delivered, etc. right now).',
        parameters: { type: 'object', properties: {} },
      },
    },
    handler: async () => dashboard.computeCasesByStatus(),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'search_cases',
        description: 'Look up cases by patient name, clinic, case number, status, or date range. Returns up to 20 matches with status, payment status, amount. NOT for counting/totals — use get_admin_analytics, get_dashboard_summary, or get_cases_by_status instead.',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Free-text: patient name, case #, or clinic name.' },
            status: { type: 'string', description: 'Exact status, e.g. DELIVERED, SCANNING.' },
            paymentStatus: { type: 'string', description: 'PENDING, PAYMENT_REQUESTED, SCREENSHOT_UPLOADED, VERIFIED, or REJECTED.' },
            clinicId: { type: 'string', description: 'Restrict to one clinic by id.' },
            dateFrom: { type: 'string', description: 'Created on/after, YYYY-MM-DD.' },
            dateTo: { type: 'string', description: 'Created on/before, YYYY-MM-DD.' },
            limit: { type: 'number', description: 'Max rows, default 15, capped at 20.' },
          },
        },
      },
    },
    handler: async (args) => cases.searchCasesForBot(args),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_case_detail',
        description: 'Full detail on one specific case, by its case number (e.g. "YDL26007199") or internal id — status, payment info, clinic, and its recent production-stage history. Use this for "what\'s the status of case X" style questions.',
        parameters: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: 'The case number (preferred, e.g. "YDL26007199") or internal id.' },
          },
          required: ['identifier'],
        },
      },
    },
    handler: async (args) => trimCaseDetail(await cases.getCaseDetailForBot(args?.identifier)),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_clinic_statement',
        description: 'Exact list of unpaid delivered cases + amount owed for one trusted-partner clinic — same data as Finance\'s "Generate Bill" screen. Needs clinic id — look it up via get_trusted_partners_summary or search_cases if you only have a name.',
        parameters: {
          type: 'object',
          properties: {
            clinicId: { type: 'string', description: 'The clinic\'s internal id.' },
            dateFrom: { type: 'string', description: 'Delivered on/after, YYYY-MM-DD. Omit for all-time outstanding.' },
            dateTo: { type: 'string', description: 'Delivered on/before, YYYY-MM-DD.' },
          },
          required: ['clinicId'],
        },
      },
    },
    handler: async (args) => trimClinicStatement(await payments.getClinicStatement(args?.clinicId, args)),
  },

  // ── Operations, people, audit trail and analysis ────────
  // These are deliberately CONSOLIDATED (an `area` enum rather than one
  // tool per domain). Tool definitions are always resident in the model's
  // context, and an 8B model's tool-selection accuracy degrades as the list
  // grows — a dozen extra narrow tools would cost accuracy on the existing
  // ones as well as context budget. One tool per question-shape, with the
  // domain as a parameter, keeps both manageable.
  {
    def: {
      type: 'function',
      function: {
        name: 'get_operations_report',
        description: 'Lab operations data outside the case pipeline. Use for questions about stock/supplies ("what are we low on"), milling blank-to-crown yield, staff goods requests waiting for approval, or staff reward points.',
        parameters: {
          type: 'object',
          properties: {
            area: { type: 'string', description: '"inventory" (stock/low-stock), "milling" (blanks vs crowns per tech), "goods_requests" (pending staff supply requests), or "staff_rewards" (points leaderboard).' },
            from: { type: 'string', description: 'YYYY-MM-DD, default start of this year.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.' },
          },
          required: ['area'],
        },
      },
    },
    handler: async (args) => operations.getOperationsReport(args || {}),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_staff_attendance',
        description: 'ATTENDANCE/LEAVE ONLY — presence, not performance. Days present, clock events, leave overlapping the range. Use for "who was in on [date]", "who is on leave/absent". NOT for performance — use get_lab_performance. Salary/payroll/reviews are NOT available.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'YYYY-MM-DD, default start of this year.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.' },
            name: { type: 'string', description: 'Optional — restrict to one employee by (partial) name.' },
          },
        },
      },
    },
    handler: async (args) => operations.getStaffAttendance(args || {}),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_case_history',
        description: 'The full audit trail for ONE case: every production stage scan in order, who scanned it, how long it sat at each step, delivery pickup/drop-off records, and staff comments. Use for "what happened to case X", "where did case X get stuck", "who handled case X". For the current status only, get_case_detail is lighter.',
        parameters: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: 'Case number (e.g. "YDL26007410") or internal id.' },
          },
          required: ['identifier'],
        },
      },
    },
    handler: async (args) => operations.getCaseHistory(args || {}),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_activity_log',
        description: 'Recent lab-wide activity log — what has been happening across the lab lately, newest first. Use for "what happened today", "recent activity", "who has been scanning". This is the business audit trail; application error/server logs are not available to this bot.',
        parameters: {
          type: 'object',
          properties: {
            area: { type: 'string', description: '"case_scans" (production stage scans, the default), "deliveries", "attendance", or "inventory".' },
            from: { type: 'string', description: 'YYYY-MM-DD, default start of this year.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.' },
            limit: { type: 'number', description: 'Max events to return, default 25, capped at 50.' },
          },
        },
      },
    },
    handler: async (args) => operations.getActivityLog(args || {}),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'count_cases',
        description: 'COMPLETE count of cases matching a filter, whole database, no row cap — optionally broken down by status/paymentStatus/workType. Use for "how many"/"all"/"every"/"total" — not search_cases, which only returns a limited page and must never be used to count.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Exact status, e.g. DELIVERED, SCANNING, READY_TO_DISPATCH.' },
            paymentStatus: { type: 'string', description: 'PENDING, PAYMENT_REQUESTED, SCREENSHOT_UPLOADED, VERIFIED or REJECTED.' },
            clinicName: { type: 'string', description: 'Partial clinic name match.' },
            workType: { type: 'string', description: 'Partial match, e.g. "Zirconia".' },
            dateFrom: { type: 'string', description: 'Created on/after, YYYY-MM-DD.' },
            dateTo: { type: 'string', description: 'Created on/before, YYYY-MM-DD.' },
            groupBy: { type: 'string', description: '"status", "paymentStatus" or "workType".' },
          },
        },
      },
    },
    handler: async (args) => operations.countCases(args || {}),
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'get_business_insights',
        description: 'Pre-computed analysis: money at risk, ageing receivables, clinic/revenue concentration, remake rate, stalled cases, low stock, capacity concentration, revenue trend. Use for "how\'s the business doing"/"what to worry about"/"opportunities"/"problems". Findings are calculated in code — report exactly as given, never add your own analysis or opinions on top.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'YYYY-MM-DD, default start of this year.' },
            to: { type: 'string', description: 'YYYY-MM-DD, default today.' },
          },
        },
      },
    },
    handler: async (args) => insights.computeBusinessInsights(args || {}),
  },
];

const toolDefinitions = TOOLS.map(t => t.def);
const toolHandlers = Object.fromEntries(TOOLS.map(t => [t.def.function.name, t.handler]));

module.exports = { toolDefinitions, toolHandlers };
