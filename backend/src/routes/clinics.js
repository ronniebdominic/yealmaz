const express  = require('express');
const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const QRCode    = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

const ONBOARDING_TOKEN_TTL_DAYS = 14;

// The form is served by the staff web app. Prefer an explicit override, then the
// site the admin is actually using (Origin header), then the first FRONTEND_URL
// entry (it can be a comma-separated CORS allowlist).
const onboardingBaseUrl = (req) => {
  const raw = process.env.ONBOARDING_BASE_URL || req.get('origin') || process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${raw.split(',')[0].trim().replace(/\/$/, '')}/onboard`;
};

router.get('/', protect, async (req, res) => {
  const cacheKey = 'clinics';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, phone: true, address: true },
      orderBy: { name: 'asc' }
    });
    await appCache.set(cacheKey, clinics);
    res.json(clinics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch clinics.' });
  }
});

// ── GET /api/clinics/all — active clinics list for admin ──
router.get('/all', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: {
        id: true, code: true, name: true, station: true,
        zoneId: true, zone: { select: { id: true, name: true } },
        email: true, phone: true, address: true,
        isActive: true, isExcluded: true, createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(clinics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch clinics.' });
  }
});

// ── POST /api/clinics — create clinic (admin only) ───────
router.post('/', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, code, station, zoneId, email, phone, address, password, isExcluded } = req.body;

    if (!name?.trim())     return res.status(400).json({ error: 'Clinic name is required.' });
    if (!password?.trim()) return res.status(400).json({ error: 'Password is required.' });

    // Check for duplicate email
    if (email) {
      const exists = await prisma.clinic.findUnique({ where: { email } });
      if (exists) return res.status(409).json({ error: 'A clinic with this email already exists.' });
    }

    // Check for duplicate code
    if (code) {
      const exists = await prisma.clinic.findUnique({ where: { code } });
      if (exists) return res.status(409).json({ error: 'A clinic with this code already exists.' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const clinic = await prisma.clinic.create({
      data: {
        name:       name.trim(),
        code:       code?.trim()    || null,
        station:    station?.trim() || null,
        zoneId:     zoneId || null,
        email:      email?.trim()   || null,
        phone:      phone?.trim()   || null,
        address:    address?.trim() || null,
        password:   hashed,
        isExcluded: isExcluded ?? false,
      },
      select: {
        id: true, code: true, name: true, station: true,
        zoneId: true, zone: { select: { id: true, name: true } },
        email: true, phone: true, address: true,
        isActive: true, isExcluded: true, createdAt: true,
      },
    });

    // Bust the clinics list cache
    await appCache.del('clinics');

    res.status(201).json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create clinic.' });
  }
});

// ── PATCH /api/clinics/:id — update clinic (admin only) ──
router.patch('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, code, station, zoneId, email, phone, address, isActive, isExcluded, password } = req.body;

    const updateData = {};
    if (name     !== undefined) updateData.name       = name.trim();
    if (code     !== undefined) updateData.code       = code?.trim()    || null;
    if (station  !== undefined) updateData.station    = station?.trim() || null;
    if (zoneId   !== undefined) updateData.zoneId     = zoneId || null;
    if (email    !== undefined) updateData.email      = email?.trim()   || null;
    if (phone    !== undefined) updateData.phone      = phone?.trim()   || null;
    if (address  !== undefined) updateData.address    = address?.trim() || null;
    if (isActive    !== undefined) updateData.isActive    = isActive;
    if (isExcluded  !== undefined) updateData.isExcluded  = isExcluded;
    if (password?.trim()) updateData.password = await bcrypt.hash(password.trim(), 10);

    const clinic = await prisma.clinic.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true, code: true, name: true, station: true,
        zoneId: true, zone: { select: { id: true, name: true } },
        email: true, phone: true, address: true,
        isActive: true, isExcluded: true, createdAt: true,
      },
    });

    await appCache.del('clinics');
    res.json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update clinic.' });
  }
});

// ── PATCH /api/clinics/:id/billing ───────────────────────
// Finance sets the billing cycle for a trusted-partner clinic.
// cycle: NONE | WEEKLY | FORTNIGHTLY | MONTHLY | CUSTOM
// anchor: day-of-week (0=Sun..6=Sat) for WEEKLY/FORTNIGHTLY, day-of-month (1-28) for MONTHLY
router.patch('/:id/billing', protect, restrict('ADMIN', 'FINANCE'), async (req, res) => {
  try {
    const { billingCycle, billingAnchor, markBilled } = req.body;

    const VALID = ['NONE', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'CUSTOM'];
    if (billingCycle !== undefined && !VALID.includes(billingCycle)) {
      return res.status(400).json({ error: `billingCycle must be one of: ${VALID.join(', ')}.` });
    }

    const data = {};
    if (billingCycle !== undefined)  data.billingCycle  = billingCycle;
    if (billingAnchor !== undefined) data.billingAnchor = billingAnchor === null || billingAnchor === '' ? null : parseInt(billingAnchor);
    if (markBilled)                  data.lastBilledAt  = new Date();

    const clinic = await prisma.clinic.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, billingCycle: true, billingAnchor: true, lastBilledAt: true },
    });

    await appCache.del('clinics');
    res.json(clinic);
  } catch (err) {
    console.error('[clinics/:id/billing]', err);
    res.status(500).json({ error: 'Could not update billing cycle.' });
  }
});

// Server-side counterpart of the frontend's generatePassword() in
// utils/adminForms.jsx — same shape (12 chars, upper/lower/digit, no
// ambiguous chars), used wherever we must generate a password without a
// browser round-trip.
function generatePassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const pass = [pick(upper), pick(lower), pick(digits)];
  for (let i = pass.length; i < length; i++) pass.push(pick(all));
  for (let i = pass.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pass[i], pass[j]] = [pass[j], pass[i]];
  }
  return pass.join('');
}

// ── POST /api/clinics/:id/credentials-card — business-card QR (admin) ──
// Resets the clinic's password to a freshly generated one and returns it
// once, plus a QR that encodes the login email/password so it can be
// printed onto a wallet/business-card-sized handout. Works for brand-new
// AND existing clinics — unlike onboarding-link, this doesn't require the
// clinic owner to do anything: admin hands them a card that already works.
router.post('/:id/credentials-card', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const clinic = await prisma.clinic.findUnique({ where: { id: req.params.id } });
    if (!clinic) return res.status(404).json({ error: 'Clinic not found.' });
    if (!clinic.email) return res.status(400).json({ error: 'This clinic has no email on file — add one before printing a credentials card.' });

    const password = generatePassword();
    const hashed = await bcrypt.hash(password, 10);

    const updated = await prisma.clinic.update({
      where: { id: clinic.id },
      data: { password: hashed, isActive: true },
      select: { id: true, name: true, code: true, email: true },
    });

    const qrPayload = `Ye-Almaz Clinic Login\nEmail: ${updated.email}\nPassword: ${password}`;
    const qrCodeUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0B1120', light: '#FFFFFF' } });

    await appCache.del('clinics');
    res.json({ clinic: updated, password, qrCodeUrl });
  } catch (err) {
    console.error('[clinics credentials-card]', err);
    res.status(500).json({ error: 'Could not generate credentials card.' });
  }
});

// ── POST /api/clinics/:id/onboarding-link — generate onboarding QR (admin) ──
// Issues a fresh single-use token the clinic owner can use, without logging
// in, to fill in their own details and set their own password. Returns the
// link plus a ready-to-print QR code image.
router.post('/:id/onboarding-link', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const clinic = await prisma.clinic.findUnique({ where: { id: req.params.id } });
    if (!clinic) return res.status(404).json({ error: 'Clinic not found.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ONBOARDING_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { onboardingToken: token, onboardingTokenExpiresAt: expiresAt },
    });

    const url = `${onboardingBaseUrl(req)}/${token}`;
    const qrCodeUrl = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#1A56A0', light: '#FFFFFF' } });

    res.json({ url, qrCodeUrl, expiresAt, clinic: { id: clinic.id, name: clinic.name, code: clinic.code } });
  } catch (err) {
    console.error('[clinics onboarding-link]', err);
    res.status(500).json({ error: 'Could not generate onboarding link.' });
  }
});

// ── GET /api/clinics/onboarding/:token — public, for the intake form ──
router.get('/onboarding/:token', async (req, res) => {
  try {
    const clinic = await prisma.clinic.findUnique({ where: { onboardingToken: req.params.token } });
    if (!clinic) return res.status(404).json({ error: 'This onboarding link is invalid.' });
    if (!clinic.onboardingTokenExpiresAt || clinic.onboardingTokenExpiresAt < new Date()) {
      return res.status(410).json({ error: 'This onboarding link has expired. Please ask Ye-Almaz to send a new one.' });
    }

    res.json({
      name: clinic.name, code: clinic.code, station: clinic.station,
      email: clinic.email, phone: clinic.phone, address: clinic.address,
      alreadyOnboarded: !!clinic.onboardedAt,
    });
  } catch (err) {
    console.error('[clinics onboarding get]', err);
    res.status(500).json({ error: 'Could not load onboarding link.' });
  }
});

// ── POST /api/clinics/onboarding/:token — public, submits the intake form ──
router.post('/onboarding/:token', async (req, res) => {
  try {
    const clinic = await prisma.clinic.findUnique({ where: { onboardingToken: req.params.token } });
    if (!clinic) return res.status(404).json({ error: 'This onboarding link is invalid.' });
    if (!clinic.onboardingTokenExpiresAt || clinic.onboardingTokenExpiresAt < new Date()) {
      return res.status(410).json({ error: 'This onboarding link has expired. Please ask Ye-Almaz to send a new one.' });
    }

    const { name, station, email, phone, address, password } = req.body || {};
    if (!name?.trim())     return res.status(400).json({ error: 'Clinic name is required.' });
    if (!password?.trim() || password.trim().length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    if (email?.trim()) {
      const exists = await prisma.clinic.findFirst({ where: { email: email.trim(), NOT: { id: clinic.id } } });
      if (exists) return res.status(409).json({ error: 'A clinic with this email already exists.' });
    }

    const hashed = await bcrypt.hash(password.trim(), 10);

    const updated = await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        name:    name.trim(),
        station: station?.trim() || null,
        email:   email?.trim()   || null,
        phone:   phone?.trim()   || null,
        address: address?.trim() || null,
        password: hashed,
        isActive: true,
        onboardedAt: new Date(),
        onboardingToken: null,
        onboardingTokenExpiresAt: null,
      },
      select: { id: true, name: true, code: true, email: true },
    });

    await appCache.del('clinics');
    res.json({ ok: true, clinic: updated });
  } catch (err) {
    console.error('[clinics onboarding submit]', err);
    res.status(500).json({ error: 'Could not complete onboarding.' });
  }
});

module.exports = router;
