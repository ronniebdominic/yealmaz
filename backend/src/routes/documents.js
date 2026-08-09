// Ye-Almaz — Employee Documents (Phase 3)
// Same multer + cloudinary upload pattern already used in employees.js
// (photo) and expenses.js (receipt) — new files always bump `version`
// rather than overwriting, so older uploads for the same document name
// stay retrievable.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const uploadDoc = (buffer, userId) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'yealmaz/employee-documents', public_id: `doc_${userId}_${Date.now()}`, resource_type: 'auto' },
    (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
  );
  stream.end(buffer);
});

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, type } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (type) where.type = type;
    const docs = await prisma.employeeDocument.findMany({
      where, include: { user: { select: { id: true, name: true } }, uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  } catch (err) {
    console.error('[documents]', err);
    res.status(500).json({ error: 'Could not load documents.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { userId, type, name, expiryDate, note } = req.body || {};
    if (!userId || !name?.trim()) return res.status(400).json({ error: 'userId and name are required.' });

    const fileUrl = await uploadDoc(req.file.buffer, userId);
    const priorCount = await prisma.employeeDocument.count({ where: { userId, name: name.trim() } });

    const doc = await prisma.employeeDocument.create({
      data: {
        userId, type: type || 'OTHER', name: name.trim(), fileUrl, version: priorCount + 1,
        expiryDate: expiryDate ? new Date(expiryDate) : null, note: note?.trim() || null, uploadedById: req.user.id,
      },
    });
    await invalidate('documents:*');
    res.status(201).json(doc);
  } catch (err) {
    console.error('[documents upload]', err);
    res.status(500).json({ error: 'Could not upload document.' });
  }
});

module.exports = router;
