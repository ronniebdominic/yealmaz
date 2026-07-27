// Ye-Almaz — Inventory Management Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/inventory/items ──────────────────────────────
router.get('/items', protect, async (req, res) => {
  const { activeOnly } = req.query;
  const cacheKey = `inventory:items:${activeOnly ? 'active' : 'all'}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const items = await prisma.inventoryItem.findMany({
      where: activeOnly === 'true' ? { isActive: true } : {},
      orderBy: { name: 'asc' },
    });
    await appCache.set(cacheKey, items);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load inventory items.' });
  }
});

// ── POST /api/inventory/items ─────────────────────────────
router.post('/items', protect, restrict('INVENTORY_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, unit, quantityOnHand, reorderThreshold } = req.body;
    if (!name || !unit) return res.status(400).json({ error: 'name and unit are required.' });
    const item = await prisma.inventoryItem.create({
      data: {
        name: name.trim(),
        unit: unit.trim(),
        quantityOnHand: quantityOnHand ? parseInt(quantityOnHand) : 0,
        reorderThreshold: reorderThreshold != null && reorderThreshold !== '' ? parseInt(reorderThreshold) : null,
      },
    });
    await invalidate('inventory:items*', 'dashboard:inventory-summary');
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create inventory item.' });
  }
});

// ── PATCH /api/inventory/items/:id ────────────────────────
// Never accepts quantityOnHand directly — stock only ever moves through
// /adjust or request fulfillment, so InventoryTransaction stays the single
// source of truth for usage reporting.
router.patch('/items/:id', protect, restrict('INVENTORY_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, unit, reorderThreshold, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (unit !== undefined) data.unit = unit.trim();
    if (reorderThreshold !== undefined) data.reorderThreshold = reorderThreshold === '' || reorderThreshold == null ? null : parseInt(reorderThreshold);
    if (isActive !== undefined) data.isActive = isActive;
    const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data });
    await invalidate('inventory:items*', 'dashboard:inventory-summary');
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update inventory item.' });
  }
});

// ── POST /api/inventory/items/:id/adjust ──────────────────
router.post('/items/:id/adjust', protect, restrict('INVENTORY_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { type, quantity, note } = req.body;
    if (!['RESTOCK', 'ADJUSTMENT'].includes(type)) return res.status(400).json({ error: 'type must be RESTOCK or ADJUSTMENT.' });
    const qty = parseInt(quantity);
    if (!qty) return res.status(400).json({ error: 'quantity is required and must be non-zero.' });

    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    // RESTOCK is always a positive addition; ADJUSTMENT can move either way
    // (the manager enters the signed delta directly for a correction).
    const delta = type === 'RESTOCK' ? Math.abs(qty) : qty;
    const newQty = item.quantityOnHand + delta;
    if (newQty < 0) return res.status(400).json({ error: `Cannot go below zero (currently ${item.quantityOnHand}).` });

    const [, txn] = await prisma.$transaction([
      prisma.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: newQty } }),
      prisma.inventoryTransaction.create({
        data: { itemId: item.id, type, quantity: delta, performedById: req.user.id, note: note?.trim() || null },
      }),
    ]);

    await invalidate('inventory:items*', 'inventory:transactions*', 'dashboard:inventory-summary');
    res.status(201).json({ item: { ...item, quantityOnHand: newQty }, transaction: txn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not adjust stock.' });
  }
});

// ── POST /api/inventory/requests ──────────────────────────
router.post('/requests', protect, restrict('LAB_TECH', 'ADMIN'), async (req, res) => {
  try {
    const { itemId, quantityRequested, department, note } = req.body;
    if (!itemId || !quantityRequested || !department) {
      return res.status(400).json({ error: 'itemId, quantityRequested and department are required.' });
    }
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) return res.status(404).json({ error: 'Item not found or inactive.' });

    const request = await prisma.inventoryRequest.create({
      data: {
        itemId,
        requestedById: req.user.id,
        department,
        quantityRequested: parseInt(quantityRequested),
        requesterNote: note?.trim() || null,
      },
      include: { item: true, requestedBy: { select: { id: true, name: true } } },
    });

    await invalidate('inventory:requests*', 'dashboard:inventory-summary');

    const io = req.app.get('io');
    io.to('inventory_staff').emit('new_goods_request', {
      requestId: request.id,
      itemName: request.item.name,
      quantity: request.quantityRequested,
      requestedBy: request.requestedBy.name,
      department: request.department,
    });

    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit request.' });
  }
});

// ── GET /api/inventory/requests ───────────────────────────
router.get('/requests', protect, restrict('LAB_TECH', 'ADMIN', 'INVENTORY_MANAGER'), async (req, res) => {
  try {
    const { status, mine } = req.query;
    const where = {};
    if (status) where.status = status;
    if (mine === 'true') where.requestedById = req.user.id;
    // Lab techs (unless also viewing "mine") only see their own history —
    // the full queue is Inventory Manager/Admin territory.
    if (req.user.role === 'LAB_TECH') where.requestedById = req.user.id;

    const requests = await prisma.inventoryRequest.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, unit: true } },
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load requests.' });
  }
});

// ── PATCH /api/inventory/requests/:id ─────────────────────
// One action both approves and issues the stock atomically — there is no
// separate "approved but not yet handed over" state.
router.patch('/requests/:id', protect, restrict('INVENTORY_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { action, quantityApproved, reviewNote } = req.body;
    if (!['ACCEPT', 'REJECT'].includes(action)) return res.status(400).json({ error: 'action must be ACCEPT or REJECT.' });

    const request = await prisma.inventoryRequest.findUnique({ where: { id: req.params.id }, include: { item: true } });
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been reviewed.' });

    if (action === 'REJECT') {
      const updated = await prisma.inventoryRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED', reviewedById: req.user.id, reviewNote: reviewNote?.trim() || null },
      });
      await invalidate('inventory:requests*');
      return res.json(updated);
    }

    const approvedQty = quantityApproved != null ? parseInt(quantityApproved) : request.quantityRequested;
    if (!approvedQty || approvedQty <= 0) return res.status(400).json({ error: 'quantityApproved must be greater than zero.' });
    if (approvedQty > request.item.quantityOnHand) {
      return res.status(400).json({ error: `Not enough stock — only ${request.item.quantityOnHand} ${request.item.unit} on hand.` });
    }

    const [updated] = await prisma.$transaction([
      prisma.inventoryRequest.update({
        where: { id: request.id },
        data: {
          status: 'FULFILLED',
          quantityApproved: approvedQty,
          reviewedById: req.user.id,
          reviewNote: reviewNote?.trim() || null,
        },
      }),
      prisma.inventoryItem.update({
        where: { id: request.itemId },
        data: { quantityOnHand: { decrement: approvedQty } },
      }),
      prisma.inventoryTransaction.create({
        data: {
          itemId: request.itemId,
          type: 'ISSUED',
          quantity: -approvedQty,
          relatedRequestId: request.id,
          performedById: req.user.id,
          note: `Issued for request from ${request.department}`,
        },
      }),
    ]);

    await invalidate('inventory:items*', 'inventory:requests*', 'inventory:transactions*', 'dashboard:inventory-summary');
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not process request.' });
  }
});

// ── GET /api/inventory/transactions ───────────────────────
router.get('/transactions', protect, restrict('INVENTORY_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { itemId, type, from, to } = req.query;
    const where = {};
    if (itemId) where.itemId = itemId;
    if (type) where.type = type;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }
    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, unit: true } },
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load transaction history.' });
  }
});

// ── GET /api/inventory/summary ────────────────────────────
// Single shared endpoint feeding both InventoryDashboard.jsx's own KPIs
// and AdminDashboard.jsx's lightweight Inventory section.
router.get('/summary', protect, restrict('ADMIN', 'INVENTORY_MANAGER'), async (req, res) => {
  const cacheKey = 'dashboard:inventory-summary';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [lowStockItems, pendingRequestsCount, issuedTxns, topRequested, topMiller] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { isActive: true, reorderThreshold: { not: null } },
      }).then(items => items.filter(i => i.quantityOnHand <= i.reorderThreshold)),
      prisma.inventoryRequest.count({ where: { status: 'PENDING' } }),
      prisma.inventoryTransaction.findMany({
        where: { type: 'ISSUED', createdAt: { gte: since30d } },
        select: { quantity: true, itemId: true },
      }),
      prisma.inventoryRequest.groupBy({
        by: ['itemId'],
        where: { createdAt: { gte: since30d } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.staffPoints.findFirst({
        where: { totalEarned: { gt: 0 } },
        include: { user: { select: { name: true } } },
        orderBy: { totalEarned: 'desc' },
      }),
    ]);

    const itemIds = topRequested.map(r => r.itemId);
    const items = itemIds.length ? await prisma.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } }) : [];
    const itemNameMap = Object.fromEntries(items.map(i => [i.id, i.name]));

    const result = {
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.map(i => ({ id: i.id, name: i.name, quantityOnHand: i.quantityOnHand, reorderThreshold: i.reorderThreshold })),
      pendingRequestsCount,
      issuedLast30Days: issuedTxns.reduce((sum, t) => sum + Math.abs(t.quantity), 0),
      topRequestedItems: topRequested.map(r => ({ itemId: r.itemId, name: itemNameMap[r.itemId] || 'Unknown', requestCount: r._count.id })),
      topMillerName: topMiller?.user?.name || null,
      topMillerPoints: topMiller?.totalEarned || null,
    };

    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load inventory summary.' });
  }
});

module.exports = router;
