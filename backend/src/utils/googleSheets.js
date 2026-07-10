// Ye-Almaz — Live Google Sheets sync
// Keeps a spreadsheet in sync with the `cases` table: one row per case,
// upserted (not just appended) so status/price/scan-number changes made
// after creation (e.g. at Accept time) update the SAME row.
const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SHEET_ID   = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_TAB_NAME || 'Cases';

const HEADERS = [
  'Case #', 'Patient Name', 'Clinic', 'Work Type', 'Units',
  'Status', 'Payment Status', 'Amount (Br)', 'Due Date', 'Delivery Date',
  'Created At', 'Last Synced',
];

let sheetsClient = null;
function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY) return null;

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

const fmtDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';

function caseToRow(c) {
  return [
    c.caseNumber || '(no scan #)',
    c.patientName || '',
    c.clinic?.name || '',
    c.workType || '',
    c.units ?? '',
    c.status || '',
    c.paymentStatus || '',
    c.totalAmount ?? '',
    fmtDate(c.dueDate),
    fmtDate(c.deliveryDate),
    fmtDate(c.createdAt),
    new Date().toISOString(),
  ];
}

let headerEnsured = false;
async function ensureHeaderRow(sheets) {
  if (headerEnsured) return;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1:A1` });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
  headerEnsured = true;
}

// Upsert a case's row. Looks up the tracked row number first (fast path);
// falls back to appending a new row and recording it for next time.
async function upsertCaseRow(caseId) {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) return; // not configured — no-op

  const c = await prisma.case.findUnique({ where: { id: caseId }, include: { clinic: { select: { name: true } } } });
  if (!c) return;

  await ensureHeaderRow(sheets);
  const row = caseToRow(c);

  const tracked = await prisma.sheetSyncRow.findUnique({ where: { caseId } });
  if (tracked) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${tracked.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  } else {
    const append = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    const range = append.data.updates?.updatedRange; // e.g. "Cases!A5:L5"
    const match = range && range.match(/![A-Z]+(\d+)/);
    const rowNumber = match ? parseInt(match[1], 10) : null;
    if (rowNumber) {
      await prisma.sheetSyncRow.create({ data: { caseId, rowNumber } });
    }
  }
}

module.exports = { upsertCaseRow };
