// Ye-Almaz — Audit log viewer (admin only)
const express = require('express');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../db');

// GET /api/audit?userId&module&method&q&from&to&page&limit
router.get('/', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { userId, module, method, q, from, to } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);

    const where = {
      ...(userId ? { userId } : {}),
      ...(module ? { module } : {}),
      ...(method ? { method } : {}),
      ...((from || to) ? { createdAt: {
        ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
      } } : {}),
      ...(q ? { OR: [
        { path: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { userName: { contains: q, mode: 'insensitive' } },
        { entityId: { contains: q } },
      ] } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    res.json({ rows, pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } });
  } catch (err) {
    console.error('[audit]', err);
    res.status(500).json({ error: 'Could not load the audit log.' });
  }
});

// Filter dropdown options: who has acted, and in which modules.
router.get('/filters', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const [users, modules] = await Promise.all([
      prisma.auditLog.groupBy({ by: ['userId', 'userName', 'userRole'], _count: { _all: true }, orderBy: { _count: { userId: 'desc' } } }),
      prisma.auditLog.groupBy({ by: ['module'], _count: { _all: true } }),
    ]);
    res.json({
      users: users.filter(u => u.userId).map(u => ({ id: u.userId, name: u.userName, role: u.userRole, count: u._count._all })),
      modules: modules.map(m => m.module).sort(),
    });
  } catch (err) {
    console.error('[audit filters]', err);
    res.status(500).json({ error: 'Could not load filters.' });
  }
});

module.exports = router;
