// Ye-Almaz — Leave day-count helper, shared by attendance.js's POST /leave
// (writes the matching ledger USED entry) and leave.js (balance/ledger
// endpoints). A holiday inside a leave span doesn't consume a leave day —
// the employee wasn't going to work that day anyway.
const { localDayKey } = require('./scanAttribution');

async function getLeaveDayCount(prisma, fromDate, toDate, dayPortion = 'FULL') {
  const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
  const to = new Date(toDate); to.setHours(0, 0, 0, 0);

  const holidays = await prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } });
  const holidayDays = new Set(holidays.map(h => localDayKey(h.date)));

  let count = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (!holidayDays.has(localDayKey(d))) count += 1;
  }
  if (dayPortion !== 'FULL' && count === 1) count = 0.5;
  return count;
}

module.exports = { getLeaveDayCount };
