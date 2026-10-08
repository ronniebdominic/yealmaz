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

  // Working time is the span from the day's FIRST CLOCK_IN to its LAST
  // CLOCK_OUT. IN/OUT pairs in between (lunch runs, re-badges) don't
  // subtract anything; only explicitly recorded breaks do.
  let clockIn = null, clockOut = null;
  // Which source produced the punch that became clockIn/clockOut — lets the
  // UI show a device/manual/kiosk/geofence badge without a second query.
  let clockInSource = null, clockOutSource = null;

  const firstIn = sorted.find(e => e.type === 'CLOCK_IN');
  if (firstIn) {
    clockIn = new Date(firstIn.timestamp);
    clockInSource = firstIn.source;
    const lastOut = [...sorted].reverse().find(e => e.type === 'CLOCK_OUT');
    if (lastOut && new Date(lastOut.timestamp) > clockIn) {
      clockOut = new Date(lastOut.timestamp);
      clockOutSource = lastOut.source;
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
  const punchedBreakMinutes = breakSegments.reduce((sum, [s, e]) => sum + minutesBetween(s, e), 0);

  // Lunch here is a standing benefit staff don't individually punch
  // Start Break/End Break for — it's just understood, not clocked. Without
  // this, a plain clock-in-to-clock-out span for a normal full day already
  // includes that hour, which then reads as WORKED time once compared
  // against the shift's (lunch-excluded) expected hours — inflating every
  // ordinary day by one phantom "overtime" hour nobody actually worked.
  // So: assume the shift's configured lunch was taken whenever nobody
  // punched an actual break AND the raw clocked span is long enough to
  // plausibly have contained one (>= 5 hours — long enough for a real lunch
  // to fall within it, short enough that a half-day leaver under 5 hours
  // isn't docked a lunch they plainly didn't take). A real punched break
  // always wins over this assumption and the two are never added together.
  const MIN_SPAN_FOR_ASSUMED_LUNCH_MINUTES = 5 * 60;
  const rawSpanMinutes = clockIn && clockOut ? minutesBetween(clockIn, clockOut) : 0;
  const assumedBreakMinutes = (punchedBreakMinutes === 0 && shift?.breakMinutes > 0 && rawSpanMinutes >= MIN_SPAN_FOR_ASSUMED_LUNCH_MINUTES)
    ? shift.breakMinutes : 0;
  const breakMinutes = punchedBreakMinutes || assumedBreakMinutes;
  let workingMinutes = clockIn && clockOut ? Math.max(0, minutesBetween(clockIn, clockOut) - breakMinutes) : 0;

  // No CLOCK_IN, or no CLOCK_OUT after it, means the day has no end yet
  // (today) or is missing a punch (a past day). Today, a CLOCK_IN after the
  // last CLOCK_OUT also means the person is presumably back on site.
  const lastType = sorted.length ? sorted[sorted.length - 1].type : null;
  const hasOpenSegment = sorted.length > 0 && (!clockIn || !clockOut ||
    (lastType === 'CLOCK_IN' && localDayKey(date) === localDayKey(new Date())));

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

    // Company policy: a 9-hour paid workday with a 1-hour office lunch
    // PROVIDED ON TOP of it — i.e. a 10-hour shift span (e.g. 8:00-18:00)
    // minus the 1-hour lunch nets the 9 paid hours. This is exactly the
    // formula below (span − breakMinutes); getting "9, not 8" right is a Shift
    // row's configured span, not this calculation — a shift must be set up
    // as a full 10-hour span (not 9) with breakMinutes: 60 for this to
    // net 9, since 9 span − 1h break would net only 8.
    const expectedMinutes = shift.overtimeThresholdMinutes ??
      Math.max(0, minutesBetween(shiftStart, shiftEnd) - shift.breakMinutes);
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
