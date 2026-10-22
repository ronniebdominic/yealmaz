// Ye-Almaz — "attendance-only" staff: people (janitor, chef, ...) whose job title sits in the Support Staff
// department. They exist so HR can track their attendance and payroll, but they never log in and must never show
// up as workers in the lab/delivery tools. No schema change: the department of their staff role is the marker.
const ATTENDANCE_ONLY_DEPARTMENT = 'Support Staff';

// Prisma filter that leaves attendance-only people out of a User query (users with no staff role stay in).
const NOT_ATTENDANCE_ONLY = { NOT: { staffRole: { is: { department: ATTENDANCE_ONLY_DEPARTMENT } } } };

const isAttendanceOnly = (user) => user?.staffRole?.department === ATTENDANCE_ONLY_DEPARTMENT;

module.exports = { ATTENDANCE_ONLY_DEPARTMENT, NOT_ATTENDANCE_ONLY, isAttendanceOnly };
