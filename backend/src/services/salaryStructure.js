// Ye-Almaz — Salary structure resolution + computation (Phase 2)
// Mirrors attendanceDaySummary.js's pattern: one place a structure's
// components turn into actual Br amounts for a payroll period, reused by
// payroll.js's run-creation and any future preview/estimate UI.

async function resolveActiveSalaryStructure(prisma, userId, date = new Date()) {
  const assignment = await prisma.employeeSalaryAssignment.findFirst({
    where: {
      userId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { structure: { include: { items: { include: { component: true } } } } },
  });
  return assignment?.structure || null;
}

/**
 * Turns a SalaryStructure's items into signed Br amounts for one employee's
 * payroll period. Only FIXED and PERCENT_OF_BASIC resolve without extra
 * period data; PER_OVERTIME_HOUR needs approvedOvertimeHours, PER_UNIT
 * needs unitsProduced — both passed in from whatever the caller already
 * fetched, so this function stays pure/DB-free.
 *
 * @returns {Array<{label, amount, componentId, category}>}
 */
function computeStructureLines({ structure, baseSalary, approvedOvertimeHours = 0, unitsProduced = 0 }) {
  if (!structure) return [];
  return structure.items.map(item => {
    const c = item.component;
    const rate = item.amount ?? c.defaultAmount;
    let amount;
    switch (c.calcType) {
      case 'PERCENT_OF_BASIC': amount = (baseSalary || 0) * (rate / 100); break;
      case 'PER_OVERTIME_HOUR': amount = rate * approvedOvertimeHours; break;
      case 'PER_UNIT': amount = rate * unitsProduced; break;
      case 'FIXED':
      default: amount = rate; break;
    }
    amount = Math.round((amount + Number.EPSILON) * 100) / 100;
    return {
      label: c.name,
      amount: c.category === 'DEDUCTION' ? -Math.abs(amount) : Math.abs(amount),
      componentId: c.id,
      category: c.category,
    };
  });
}

module.exports = { resolveActiveSalaryStructure, computeStructureLines };
