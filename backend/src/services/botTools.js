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

function trimLabPerformance(data) {
  return {
    range: data.range,
    unattributedScans: data.unattributedScans,
    totalLabScans: data.totalLabScans,
    techs: (data.techs || []).map(t => ({
      name: t.name, isActive: t.isActive, totalScans: t.totalScans,
      uniqueCases: t.uniqueCases, busiestDept: t.busiestDept,
      activeDays: t.activeDays, avgPerActiveDay: t.avgPerActiveDay,
      shareOfTotalPercent: t.shareOfTotalPercent, lastActiveAt: t.lastActiveAt,
    })),
  };
}

function trimDeliveryPerformance(data) {
  return {
    range: data.range,
    unattributedOrders: data.unattributedOrders,
    totalLabOrders: data.totalLabOrders,
    agents: (data.agents || []).map(a => ({
      name: a.name, isActive: a.isActive, totalPickups: a.totalPickups,
      totalDeliveries: a.totalDeliveries, totalOrders: a.totalOrders,
      uniqueClinics: a.uniqueClinics, activeDays: a.activeDays,
      avgPerActiveDay: a.avgPerActiveDay, shareOfTotalPercent: a.shareOfTotalPercent,
      lastActiveAt: a.lastActiveAt,
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
  // Already sorted by outstanding desc at the source.
  return (data || []).slice(0, 25).map(c => ({
    name: c.name, totalOrders: c.totalOrders, deliveredOrders: c.deliveredOrders,
    inProgress: c.inProgress, totalRevenue: c.totalRevenue, paymentsReceived: c.paymentsReceived,
    outstanding: c.outstanding, outstandingCount: c.outstandingCount, oldestAgeDays: c.oldestAgeDays,
    billingCycle: c.billingCycle, nextBillDate: c.nextBillDate, billOverdue: c.billOverdue,
  }));
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
        description: 'Business analytics over a date range: revenue, case/unit counts, turnaround time, on-time delivery %, top clinics and work types by revenue, remake stats. IMPORTANT: "deliveredCases" counts cases whose DELIVERY fell in the range regardless of when they were created; "deliveredOfCreated" counts, of the cases CREATED in the range, how many have since been delivered (whenever that happened). These are different questions — pick the one that matches what was actually asked, never assume they are the same number.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to start of this year if omitted.' },
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today if omitted.' },
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
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
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
        description: 'Per-lab-technician scan activity over a date range: total scans, unique cases, busiest department, active days, and each tech\'s share of the lab\'s total scan volume. Use for "who\'s the most active tech" / "how is [name] doing" style questions.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to start of this year.' },
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
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
            from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to start of this year.' },
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
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
        description: 'Per trusted-partner clinic: total orders, delivered/in-progress counts, total billed revenue, amount paid so far, outstanding amount + case count, how many days the oldest unpaid case has been outstanding, and their billing cycle/next bill date. This is the source for "how much is outstanding from Trusted Partners" style questions. Sorted by outstanding amount, highest first.',
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
        description: 'Look up specific cases by patient name, clinic name, case number, status, or date range. Returns up to 20 matching cases with their status, payment status, and amount. NOT for counting/totals across the whole business — use get_admin_analytics, get_dashboard_summary, or get_cases_by_status for those instead.',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Free-text match against patient name, case number, or clinic name.' },
            status: { type: 'string', description: 'Exact case status, e.g. DELIVERED, READY_TO_DISPATCH, SCANNING.' },
            paymentStatus: { type: 'string', description: 'Exact payment status: PENDING, PAYMENT_REQUESTED, SCREENSHOT_UPLOADED, VERIFIED, or REJECTED.' },
            clinicId: { type: 'string', description: 'Restrict to one clinic by id.' },
            dateFrom: { type: 'string', description: 'Only cases created on/after this date, YYYY-MM-DD.' },
            dateTo: { type: 'string', description: 'Only cases created on/before this date, YYYY-MM-DD.' },
            limit: { type: 'number', description: 'Max rows to return, default 15, hard-capped at 20.' },
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
        description: 'The exact list of unpaid delivered cases (and amount owed for each) for one specific trusted-partner clinic — the same data Finance\'s "Generate Bill" screen shows. Needs the clinic\'s id — look it up via get_trusted_partners_summary or search_cases first if you only have a name.',
        parameters: {
          type: 'object',
          properties: {
            clinicId: { type: 'string', description: 'The clinic\'s internal id.' },
            dateFrom: { type: 'string', description: 'Only cases delivered on/after this date, YYYY-MM-DD. Omit for all-time outstanding.' },
            dateTo: { type: 'string', description: 'Only cases delivered on/before this date, YYYY-MM-DD.' },
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
            area: { type: 'string', description: 'Which area: "inventory" (stock levels, low stock), "milling" (blanks used vs crowns produced, per technician), "goods_requests" (staff supply requests and what is pending), or "staff_rewards" (staff points leaderboard).' },
            from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to start of this year.' },
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
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
        description: 'Staff attendance and leave over a date range: days present per person, clock event counts, and any leave overlapping the range. Use for "who was in on [date]", "how many days has [name] worked", "who is on leave". Salary, payroll and performance reviews are NOT available.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to start of this year.' },
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
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
            from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to start of this year.' },
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
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
        description: 'The COMPLETE count of cases matching a filter, across the whole database with no row cap, optionally broken down by status, payment status or work type. Use this — not search_cases — whenever the question is "how many", "all", "every", or "total". search_cases only returns a limited page and must never be used to count.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Exact case status, e.g. DELIVERED, SCANNING, READY_TO_DISPATCH.' },
            paymentStatus: { type: 'string', description: 'PENDING, PAYMENT_REQUESTED, SCREENSHOT_UPLOADED, VERIFIED or REJECTED.' },
            clinicName: { type: 'string', description: 'Partial clinic name match.' },
            workType: { type: 'string', description: 'Partial work-type match, e.g. "Zirconia".' },
            dateFrom: { type: 'string', description: 'Only cases created on/after this date, YYYY-MM-DD.' },
            dateTo: { type: 'string', description: 'Only cases created on/before this date, YYYY-MM-DD.' },
            groupBy: { type: 'string', description: 'Optional breakdown: "status", "paymentStatus" or "workType".' },
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
        description: 'Pre-computed analysis of what needs attention: money at risk, ageing receivables, clinic/revenue concentration, remake rate, stalled cases, low stock, capacity concentration and revenue trend. Use for open-ended questions like "how is the business doing", "what should I worry about", "where are the opportunities", "any problems". Every finding is calculated in code — report the findings exactly as given and never add your own analysis, causes or recommendations on top.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to start of this year.' },
            to: { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
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
