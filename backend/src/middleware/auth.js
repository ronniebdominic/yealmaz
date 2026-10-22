// Ye-Almaz — Auth Middleware
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { isAttendanceOnly } = require('../utils/attendanceOnly');

// A login token carries the role the person had when they logged in and stays valid for days. Trusting
// it alone meant a demoted or deactivated account kept its old access until the token expired. So every
// request re-reads the person's CURRENT role and active flag (cached for a few seconds, so this costs
// one small lookup per person per interval, not one per request).
const IDENTITY_TTL_MS = 15 * 1000;
const identityCache = new Map(); // id -> { at, role, isActive, departments }

async function currentIdentity(decoded) {
  const hit = identityCache.get(decoded.id);
  if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) return hit;

  let record;
  if (decoded.role === 'CLINIC') {
    const clinic = await prisma.clinic.findUnique({ where: { id: decoded.id }, select: { isActive: true } });
    record = clinic ? { role: 'CLINIC', isActive: clinic.isActive } : null;
  } else {
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { role: true, isActive: true, departments: true, staffRole: { select: { department: true } } } });
    record = user ? { role: user.role, isActive: user.isActive && !isAttendanceOnly(user), departments: user.departments } : null;
  }
  const entry = record ? { at: Date.now(), ...record } : { at: Date.now(), missing: true };
  identityCache.set(decoded.id, entry);
  if (identityCache.size > 5000) identityCache.clear(); // never let it grow without bound
  return entry;
}

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }

  try {
    const current = await currentIdentity(decoded);
    if (current.missing || current.isActive === false) {
      return res.status(401).json({ error: 'This account is no longer active. Please log in again or contact an admin.' });
    }
    // The database wins over whatever the token says.
    req.user = { ...decoded, role: current.role, ...(current.departments ? { departments: current.departments } : {}) };
  } catch (err) {
    // If the database can't be reached, fall back to the token rather than locking everyone out.
    console.error('[auth] could not re-check the account:', err.message);
    req.user = decoded; // { id, email, role, name }
  }
  next();
};

// Role-based access — pass one or more roles
// Usage: restrict('ADMIN', 'RECEPTIONIST')
const restrict = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. This action requires: ${roles.join(' or ')}`
      });
    }
    next();
  };
};

module.exports = { protect, restrict };
