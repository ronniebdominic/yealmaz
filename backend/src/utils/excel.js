// Ye-Almaz — Excel (.xlsx) export helper (uses the already-bundled `xlsx` / SheetJS)
const XLSX = require('xlsx');

/**
 * Build an .xlsx buffer from rows.
 * @param {Array<object>} rows
 * @param {Array<{header: string, value: (row) => any}>} columns
 * @param {string} sheetName
 * @returns {Buffer}
 */
function buildWorkbookBuffer(rows, columns, sheetName = 'Sheet1') {
  const headers = columns.map(c => c.header);
  const data = (rows || []).map(row => {
    const o = {};
    for (const c of columns) o[c.header] = c.value(row);
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel caps sheet names at 31 chars
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Stream an .xlsx buffer as a download. */
function sendXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

module.exports = { buildWorkbookBuffer, sendXlsx };
