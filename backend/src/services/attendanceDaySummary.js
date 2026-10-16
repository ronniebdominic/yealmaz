// Ye-Almaz — Attendance day-summary computation
//
// The one place a day's worth of raw AttendanceEvent punches gets turned
// into something a human/dashboard can read: status, hours worked, late/
// early-departure minutes, and the regular/overtime split. Three call sites
// share this — GET /api/attendance/summary (the workforce dashboard), GET
// /api/attendance/summary/range (an Employee Profile's Attendance tab), and
// POST /api/overtime/detect (auto-detection) — built once, reused three
// ways, so "how is a day's hours computed" never drifts between them.
//
// computeDaySummary() is a pure function (no DB access) so it's easy to
// reason about/test in isolation; resolveShiftForUserDate() is the one
// query it depends on, kept separate so callers can batch-fetch shifts
// themselves when summarizing many employees/days at once.

const { localDayKey } = require('../utils/scanAttribution');

// "End"-type events pair with an earlier "start"-type event — same
// convention as attendance.js's PAIR_START.
const PAIR_START = { CLOCK_OUT: 'CLOCK_IN', BREAK_END: 'BREAK_START' };

async function resolveShiftForUserDate(prisma, userId, date) {
  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      userId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { shift: true },
  });
  return assignment?.shift || null;
}

// Parses a Shift's "HH:mm" startTime/endTime against a specific calendar
// date, returning a real Date. Shifts spanning midnight aren't supported in
// Phase 1 (no lab department runs an overnight shift today) — endTime is
// always assumed to be later the same day.
function timeOnDate(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

const minutesBetween = (a, b) => (b.getTime() - a.getTime()) / 60000;

// Punches after this local hour (7 PM) are not counted towards the day.
const DAY_CUTOFF_HOUR = 19;

/**
 * @param {Object} args
 * @param {Date} args.date - the calendar day being summarized
 * @param {Array} args.events - that user's AttendanceEvent rows for this day (any order)
 * @param {Object|null} args.shift - the resolved Shift for this user/date, or null if unassigned
 * @param {Object|null} args.holiday - a Holiday row if this date is one, else null
 * @param {Object|null} args.leaveRecord - an approved LeaveRecord covering this date, else null
 * @param {Object|null} args.correction - an AttendanceCorrection for this user/date, else null
 */
function computeDaySummary({ date, events, shift, holiday, leaveRecord, correction }) {
  const sorted = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Company rule: a day is its FIRST punch (clock-in) and its LAST punch (clock-out), taken from
  // punches up to 7 PM local (Ethiopian) time. Everything in between — lunch runs, re-badges, extra
  // scans — is ignored, and so is anything after 7 PM. The punch TYPE is deliberately not trusted:
  // the fingerprint terminal often cannot say whether a scan was "in" or "out", so the bridge only
  // guesses by alternating. Position in the day is what decides, not the label.
  const cutoff = new Date(date);
  cutoff.setHours(DAY_CUTOFF_HOUR, 0, 0, 0);
  const punches = sorted.filter(e =>
    (e.type === 'CLOCK_IN' || e.type === 'CLOCK_OUT') && new Date(e.timestamp) <= cutoff);

  let clockIn = null, clockOut = null;
  // Which source produced the punch that became clockIn/clockOut — lets the
  // UI show a device/manual/kiosk/geofence badge without a second query.
  let clockInSource = null, clockOutSource = null;

  if (punches.length) {
    const first = punches[0];
    const last = punches[punches.length - 1];
    clockIn = new Date(first.timestamp);
    clockInSource = first.source;
    if (new Date(last.timestamp) > clockIn) {
      clockOut = new Date(last.timestamp);
      clockOutSource = last.source;
    }
  }

  let breakOpen = null;
  const breakSegments = [];
  for (const e of sorted) {
    const ts = new Date(e.timestamp);
    if (e.type === 'BREAK_START') {
      if (!breakOpen) breakOpen = ts;
    } else if (e.type === 'BREAK_END') {
      if (breakOpen) { breakSegments.push([breakOpen, ts]); breakOpen = null; }
    }
  }
  // Company policy (confirmed): a shift's configured span IS the working
  // hours, full stop — e.g. a 9-hour shift (09:00-18:00) means 9 paid hours,
  // lunch included in that span rather than added on top of it or carved out
  // of it. So working time is only ever reduced by a break actually PUNCHED
  // (Start Break/End Break) — there is no assumed/automatic lunch deduction.
  const breakMinutes = breakSegments.reduce((sum, [s, e]) => sum + minutesBetween(s, e), 0);
  let workingMinutes = clockIn && clockOut ? Math.max(0, minutesBetween(clockIn, clockOut) - breakMinutes) : 0;

  // Only one punch (or none usable) means the day has no end yet (today) or is missing a punch (a
  // past day). With two or more punches the last one is the clock-out.
  const hasOpenSegment = sorted.length > 0 && (!clockIn || !clockOut);

  // An approved correction overrides the raw-derived clock-in/out and
  // working-minutes for every downstream calculation — the raw events
  // themselves are untouched and returned separately by the route layer.
  let usedCorrection = false;
  if (correction && (correction.correctedClockIn || correction.correctedClockOut)) {
    usedCorrection = true;
    const ci = correction.correctedClockIn ? new Date(correction.correctedClockIn) : clockIn;
    const co = correction.correctedClockOut ? new Date(correction.correctedClockOut) : clockOut;
    clockIn = ci;
    clockOut = co;
    if (correction.correctedClockIn) clockInSource = 'CORRECTED';
    if (correction.correctedClockOut) clockOutSource = 'CORRECTED';
    if (ci && co) workingMinutes = Math.max(0, minutesBetween(ci, co) - breakMinutes);
  }

  const weekday = date.getDay(); // 0=Sun..6=Sat
  const isHoliday = !!holiday;
  const isNonWorkingDay = shift ? !shift.workingDays.includes(weekday) : false;

  let status;
  let late = false, lateMinutes = 0, earlyDepartureMinutes = 0;
  let regularHours = 0, overtimeHours = 0;

  if (leaveRecord && leaveRecord.dayPortion === 'FULL') {
    status = 'ON_LEAVE';
  } else if (isHoliday && (!shift || shift.holidayHandling === 'NO_WORK')) {
    status = 'HOLIDAY';
  } else if (isNonWorkingDay && !isHoliday) {
    status = 'OFF';
  } else if (leaveRecord && leaveRecord.dayPortion !== 'FULL') {
    status = 'HALF_DAY_LEAVE';
  } else if (sorted.length === 0) {
    status = 'ABSENT';
  } else if (hasOpenSegment) {
    status = localDayKey(date) === localDayKey(new Date()) ? 'IN_PROGRESS' : 'MISSING_PUNCH';
  } else {
    status = 'PRESENT';
  }

  // Lateness/early-departure/hours only make sense for a real working day
  // with a resolved shift and an actual clock-in.
  const computeHours = ['PRESENT', 'IN_PROGRESS', 'MISSING_PUNCH', 'HALF_DAY_LEAVE'].includes(status) || (isHoliday && clockIn);
  if (computeHours && shift && clockIn) {
    const shiftStart = timeOnDate(date, shift.startTime);
    const shiftEnd = timeOnDate(date, shift.endTime);
    const graceEnd = new Date(shiftStart.getTime() + (shift.gracePeriodMinutes + shift.lateThresholdMinutes) * 60000);
    if (clockIn > graceEnd) { late = true; lateMinutes = Math.round(minutesBetween(graceEnd, clockIn)); }

    if (clockOut) {
      const earlyCutoff = new Date(shiftEnd.getTime() - shift.earlyDepartureThresholdMinutes * 60000);
      if (clockOut < earlyCutoff) earlyDepartureMinutes = Math.round(minutesBetween(clockOut, earlyCutoff));
    }

    // Company policy (confirmed): a shift's configured span IS the expected
    // working hours, inclusive of lunch — a 9-hour shift (e.g. 09:00-18:00)
    // means 9 expected hours, full stop. breakMinutes is not subtracted here
    // (see the matching note on workingMinutes above); getting a shift's
    // expected hours right is purely its own startTime/endTime span
    // (HR > Shifts), not this calculation.
    const expectedMinutes = shift.overtimeThresholdMinutes ??
      Math.max(0, minutesBetween(shiftStart, shiftEnd));
    regularHours = Math.round(Math.min(workingMinutes, expectedMinutes) / 6) / 10;
    overtimeHours = Math.round(Math.max(0, workingMinutes - expectedMinutes) / 6) / 10;
  } else if (computeHours && clockIn) {
    // No shift assigned — still report raw hours worked, just no
    // lateness/overtime (nothing to measure them against).
    regularHours = Math.round(workingMinutes / 6) / 10;
  }

  return {
    date: localDayKey(date),
    status,
    late,
    lateMinutes,
    earlyDepartureMinutes,
    clockIn,
    clockOut,
    clockInSource,
    clockOutSource,
    breakMinutes: Math.round(breakMinutes),
    workingHours: Math.round(workingMinutes / 6) / 10,
    regularHours,
    overtimeHours,
    hasCorrection: usedCorrection,
    hasOpenSegment,
  };
}

module.exports = { resolveShiftForUserDate, computeDaySummary, PAIR_START };
