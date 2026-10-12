// Ye-Almaz — apply a clinic's advance-payment balance to a case.
//
// Called when a case reaches delivery (and when payment is requested for a
// pay-per-case clinic). Takes min(balance, amount still owed), records it as
// an instalment through the same logic Finance uses for part payments, so a
// fully covered case ends up identical to one collected by hand (VERIFIED,
// invoice issued) and a partly covered one stays outstanding for the rest.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function applyWalletToCase(prisma, caseId, actor = { id: null, name: 'Advance balance' }) {
  const payments = require('../routes/payments'); // lazy: avoids a require cycle

  const result = await prisma.$transaction(async (tx) => {
    // Serialise concurrent deductions on this case (delivery, payment request, bulk pay can all fire at once).
    await tx.$queryRaw`SELECT id FROM payments WHERE "caseId" = ${caseId} FOR UPDATE`;
    const caseData = await tx.case.findUnique({ where: { id: caseId }, include: { payment: true } });
    if (!caseData) return { applied: 0 };

    const payStatus = caseData.payment?.status || caseData.paymentStatus || 'PENDING';
    // A receipt awaiting Finance's review or a settled case must not be paid twice.
    if (payStatus === 'VERIFIED' || payStatus === 'SCREENSHOT_UPLOADED') return { applied: 0 };

    const { remaining } = payments.balanceOf(caseData);
    if (remaining <= 0) return { applied: 0 };

    const wallet = await tx.clinicWallet.findUnique({ where: { clinicId: caseData.clinicId } });
    const available = wallet?.balance || 0;
    if (available <= 0) return { applied: 0 };

    const take = round2(Math.min(available, remaining));
    // Conditional decrement: if a concurrent deduction already spent it, bail out.
    const dec = await tx.clinicWallet.updateMany({
      where: { clinicId: caseData.clinicId, balance: { gte: take } },
      data: { balance: { decrement: take } },
    });
    if (dec.count === 0) return { applied: 0 };

    await tx.walletTransaction.create({
      data: {
        clinicId: caseData.clinicId, type: 'DEDUCTION', status: 'APPROVED', amount: take,
        caseId, note: `Applied to case ${caseData.caseNumber}`, approvedAt: new Date(),
      },
    });

    const result = await payments.recordInstallment(tx, caseData, actor, {
      credit: take, taxAmount: 0, reference: 'ADVANCE-BALANCE', notes: 'Paid from advance balance',
    });
    return { applied: take, complete: result.complete, remaining: result.remaining, clinicId: caseData.clinicId, caseNumber: caseData.caseNumber };
  });

  if (result.applied) {
    require('../utils/webpush').sendPushToClinic(prisma, result.clinicId, {
      title: '💳 Paid from Advance Balance',
      body: `Br ${result.applied.toLocaleString('en-US')} was deducted for case ${result.caseNumber}${result.complete ? '' : ` — Br ${result.remaining.toLocaleString('en-US')} still due`}.`,
      data: { caseId, type: 'wallet_deduction' },
    });
  }
  return result;
}

// Settle a clinic's delivered, unpaid cases oldest-first from its balance.
async function applyWalletToClinicOutstanding(prisma, clinicId, actor) {
  const cases = await prisma.case.findMany({
    where: { clinicId, status: 'DELIVERED', totalAmount: { gt: 0 }, paymentStatus: { in: ['PENDING', 'PAYMENT_REQUESTED', 'REJECTED'] } },
    orderBy: { deliveryDate: 'asc' },
    select: { id: true },
  });
  const results = [];
  for (const c of cases) {
    const r = await applyWalletToCase(prisma, c.id, actor);
    if (!r.applied) {
      const w = await prisma.clinicWallet.findUnique({ where: { clinicId } });
      if (!w || w.balance <= 0) break; // wallet is empty — stop
      continue; // this case couldn't take anything (e.g. a receipt is awaiting review) — try the next
    }
    results.push({ caseId: c.id, ...r });
  }
  return results;
}

// Never let a wallet problem fail the delivery/payment request that triggered it.
async function applyWalletSafely(prisma, caseId) {
  try { return await applyWalletToCase(prisma, caseId); }
  catch (err) { console.error('[wallet] auto-deduct failed for case', caseId, err.message); return { applied: 0 }; }
}

module.exports = { applyWalletToCase, applyWalletToClinicOutstanding, applyWalletSafely };
