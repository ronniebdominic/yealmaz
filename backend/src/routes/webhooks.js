// Ye-Almaz — Inbound Database Webhooks
// Public endpoints called by Postgres triggers (via pg_net), not by the app's
// own frontend. Protected by a shared secret header instead of user auth.
const express = require('express');
const { upsertCaseRow } = require('../utils/googleSheets');

const router = express.Router();

// ── POST /api/webhooks/case-sync ─────────────────────────
// Fired by a trigger on the `cases` table (INSERT + UPDATE) so the Google
// Sheet stays in sync with case data, including fields set after creation
// (scan number, price, status) at Accept time and beyond.
router.post('/case-sync', async (req, res) => {
  try {
    const secret = req.headers['x-webhook-secret'];
    if (!process.env.CASE_SYNC_WEBHOOK_SECRET || secret !== process.env.CASE_SYNC_WEBHOOK_SECRET) {
      return res.status(401).end();
    }

    const { record } = req.body || {};
    if (!record?.id) return res.status(400).end();

    // Ack immediately — the trigger doesn't need to wait on the Sheets API call,
    // and a slow Sheets response shouldn't hold up the Postgres transaction.
    res.status(200).end();

    await upsertCaseRow(record.id);
  } catch (err) {
    console.error('[case-sync webhook]', err.message);
  }
});

module.exports = router;
