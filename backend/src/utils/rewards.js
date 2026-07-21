// Ye-Almaz — Reward-points claw-back helper
// Used when a case is cancelled or deleted before it was ever picked up —
// a clinic shouldn't keep the points it earned for submitting an order that
// never actually happened. Safe to call even if no points were ever awarded
// (e.g. the case wasn't submitted by a CLINIC-role user), and idempotent —
// calling it twice for the same case (e.g. cancelled, then later deleted)
// is a no-op the second time since the transaction rows are already gone.
const { invalidate } = require('../cache');

async function clawBackCasePoints(prisma, caseId, clinicId) {
  const txns = await prisma.rewardTransaction.findMany({ where: { caseId, type: 'EARN' } });
  const total = txns.reduce((sum, t) => sum + t.points, 0);

  if (total > 0) {
    await prisma.clinicPoints.update({
      where: { clinicId },
      data: { totalEarned: { decrement: total } },
    });
  }
  await prisma.rewardTransaction.deleteMany({ where: { caseId } });

  if (total > 0) await invalidate(`rewards:clinic:${clinicId}`);
}

module.exports = { clawBackCasePoints };
