// Ye-Almaz — Employee Profile Routes
// Identity/HR-record data, kept separate from attendance and payroll since
// it's conceptually distinct (who someone is, not when they worked or what
// they were paid). EmployeeProfile is 1:1 with User but never merged into
// it, so existing broad User queries elsewhere in the app never touch or
// risk exposing salary/bank data.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const uploadPhotoToCloudinary = (buffer, userId) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'yealmaz/employee-photos', public_id: `employee_${userId}_${Date.now()}` },
    (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
  );
  stream.end(buffer);
});

// Fields whose changes are worth a permanent EmploymentHistory row —
// position/status/manager are the ones that matter for "who reported to
// whom, and when did their role change" record-keeping. Everything else on
// EmployeeProfile (personal info, salary — salary changes are Phase 2's
// concern once Salary Structures exist) isn't tracked here.
const TRACKED_FIELDS = ['position', 'employmentStatus', 'managerId'];

// ── GET /api/employees ────────────────────────────────────
router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  const cacheKey = 'employees:all';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const users = await prisma.user.findMany({
      // Department/role logins ("Zirconia Fitting", "Finance Department", ...)
      // aren't real people — HR & Payroll only manages actual employees.
      where: { isSharedAccount: false },
      select: {
        id: true, name: true, email: true, role: true, phone: true, isActive: true, departments: true,
        employeeProfile: true,
      },
      orderBy: { name: 'asc' },
    });
    await appCache.set(cacheKey, users);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load employees.' });
  }
});

// ── GET /api/employees/:userId ────────────────────────────
// Single-employee detail for the Employee Profile page's Overview tab —
// full profile + resolved manager + direct-report count + active shift.
router.get('/:userId', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true, name: true, email: true, role: true, phone: true, isActive: true, departments: true,
        employeeProfile: { include: { manager: { select: { id: true, name: true, employeeProfile: { select: { position: true } } } } } },
      },
    });
    if (!user) return res.status(404).json({ error: 'Employee not found.' });

    const [directReportCount, activeShiftAssignment] = await Promise.all([
      prisma.employeeProfile.count({ where: { managerId: user.id } }),
      prisma.shiftAssignment.findFirst({
        where: { userId: user.id, effectiveTo: null },
        include: { shift: true },
      }),
    ]);

    res.json({
      ...user,
      directReportCount,
      activeShift: activeShiftAssignment?.shift || null,
    });
  } catch (err) {
    console.error('[employees detail]', err);
    res.status(500).json({ error: 'Could not load employee.' });
  }
});

// ── GET /api/employees/:userId/history ────────────────────
router.get('/:userId/history', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const history = await prisma.employmentHistory.findMany({
      where: { userId: req.params.userId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { effectiveDate: 'desc' },
    });
    res.json(history);
  } catch (err) {
    console.error('[employees history]', err);
    res.status(500).json({ error: 'Could not load employment history.' });
  }
});

// ── PATCH /api/employees/:userId/profile ──────────────────
router.patch('/:userId/profile', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Employee not found.' });
    const existing = await prisma.employeeProfile.findUnique({ where: { userId: req.params.userId } });

    const {
      employeeCode, position, hireDate, baseSalary, bankName, bankAccount, employmentStatus,
      photoUrl, preferredName, dateOfBirth, emergencyContactName, emergencyContactPhone, address,
      employmentType, confirmationDate, probationEndDate, noticePeriodDays, endDate, workLocation, managerId,
    } = req.body;

    const data = {};
    if (employeeCode !== undefined) data.employeeCode = employeeCode?.trim() || null;
    if (position !== undefined) data.position = position?.trim() || null;
    if (hireDate !== undefined) data.hireDate = hireDate ? new Date(hireDate) : null;
    if (baseSalary !== undefined) data.baseSalary = baseSalary === '' || baseSalary == null ? null : parseFloat(baseSalary);
    if (bankName !== undefined) data.bankName = bankName?.trim() || null;
    if (bankAccount !== undefined) data.bankAccount = bankAccount?.trim() || null;
    if (employmentStatus !== undefined) data.employmentStatus = employmentStatus;
    if (photoUrl !== undefined) data.photoUrl = photoUrl || null;
    if (preferredName !== undefined) data.preferredName = preferredName?.trim() || null;
    if (dateOfBirth !== undefined) data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (emergencyContactName !== undefined) data.emergencyContactName = emergencyContactName?.trim() || null;
    if (emergencyContactPhone !== undefined) data.emergencyContactPhone = emergencyContactPhone?.trim() || null;
    if (address !== undefined) data.address = address?.trim() || null;
    if (employmentType !== undefined) data.employmentType = employmentType || null;
    if (confirmationDate !== undefined) data.confirmationDate = confirmationDate ? new Date(confirmationDate) : null;
    if (probationEndDate !== undefined) data.probationEndDate = probationEndDate ? new Date(probationEndDate) : null;
    if (noticePeriodDays !== undefined) data.noticePeriodDays = noticePeriodDays === '' || noticePeriodDays == null ? null : parseInt(noticePeriodDays, 10);
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (workLocation !== undefined) data.workLocation = workLocation?.trim() || null;
    if (managerId !== undefined) data.managerId = managerId || null;

    const profile = await prisma.$transaction(async (tx) => {
      const saved = await tx.employeeProfile.upsert({
        where: { userId: req.params.userId },
        create: { userId: req.params.userId, ...data },
        update: data,
      });

      // Write an EmploymentHistory row for every TRACKED_FIELDS change —
      // comparing against the pre-update row, not the post-update one.
      for (const field of TRACKED_FIELDS) {
        if (data[field] === undefined) continue;
        const oldValue = existing ? existing[field] : null;
        const newValue = data[field];
        if (String(oldValue ?? '') === String(newValue ?? '')) continue;
        await tx.employmentHistory.create({
          data: {
            userId: req.params.userId, field,
            oldValue: oldValue == null ? null : String(oldValue),
            newValue: newValue == null ? null : String(newValue),
            changedById: req.user.id,
          },
        });
      }

      return saved;
    });

    await invalidate('employees:all', 'dashboard:hr-summary');
    res.json(profile);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') return res.status(409).json({ error: 'That employee code is already in use.' });
    res.status(500).json({ error: 'Could not save employee profile.' });
  }
});

// ── POST /api/employees/:userId/photo ─────────────────────
router.post('/:userId/photo', protect, restrict('HR_MANAGER', 'ADMIN'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Employee not found.' });

    const photoUrl = await uploadPhotoToCloudinary(req.file.buffer, req.params.userId);
    const profile = await prisma.employeeProfile.upsert({
      where: { userId: req.params.userId },
      create: { userId: req.params.userId, photoUrl },
      update: { photoUrl },
    });
    await invalidate('employees:all');
    res.json(profile);
  } catch (err) {
    console.error('[employees photo]', err);
    res.status(500).json({ error: 'Could not upload photo.' });
  }
});

module.exports = router;
