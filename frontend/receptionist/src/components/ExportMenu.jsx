// Shared export button: Excel + PDF.
// columns  = [{ header: string, value: (row) => string|number }]
// data     = pre-fetched array (use when data is already loaded)
// fetchData = async () => array (called on click — use for paginated/server-filtered data)
// filename = base name without extension (e.g. 'ready-orders-2026-06-20')
// title    = heading printed in the PDF and used as sheet name

import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const today = () => new Date().toISOString().slice(0, 10);

export default function ExportMenu({ data, fetchData, columns = [], filename = 'export', title = '' }) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const hasData = !!(fetchData || (data && data.length > 0));

  const resolveData = async () => {
    if (fetchData) return await fetchData();
    return data || [];
  };

  const buildRows = (rows) =>
    rows.map(row => columns.map(c => { const v = c.value(row); return v == null ? '' : v; }));

  // ── Excel ──────────────────────────────────────────────
  const exportExcel = async () => {
    setOpen(false);
    setLoading(true);
    try {
      const rows   = await resolveData();
      const headers = columns.map(c => c.header);
      const body    = buildRows(rows);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
      ws['!cols'] = headers.map((h, i) => ({
        wch: Math.min(Math.max(h.length, ...body.map(r => String(r[i] ?? '').length)) + 2, 40),
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, (title || 'Report').slice(0, 31));
      XLSX.writeFile(wb, `${filename}_${today()}.xlsx`);
    } finally {
      setLoading(false);
    }
  };

  // ── PDF ───────────────────────────────────────────────
  const exportPDF = async () => {
    setOpen(false);
    setLoading(true);
    try {
      const rows = await resolveData();
      const doc  = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      let y = 32;

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 86, 160);
      doc.text('Ye-Almaz Dental Laboratory', 36, y);
      y += 20;

      if (title) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(title, 36, y);
        y += 16;
      }

      doc.setFontSize(9);
      doc.setTextColor(130, 130, 130);
      doc.text(
        `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}   Records: ${rows.length}`,
        36, y
      );
      y += 20;

      autoTable(doc, {
        startY: y,
        head: [columns.map(c => c.header)],
        body: buildRows(rows).map(r => r.map(String)),
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [26, 86, 160], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 36, right: 36 },
      });

      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.text(`Page ${i} of ${totalPages}`, pageW - 70, doc.internal.pageSize.getHeight() - 18);
      }

      doc.save(`${filename}_${today()}.pdf`);
    } finally {
      setLoading(false);
    }
  };

  const menuItemStyle = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '10px 16px', fontSize: 13, border: 'none', background: 'none',
    cursor: 'pointer', color: 'var(--text-1)', textAlign: 'left',
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => !loading && setOpen(o => !o)}
        disabled={!hasData || loading}
        style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: !hasData ? 0.5 : 1 }}
        title={!hasData ? 'No data to export' : 'Export report'}
      >
        {loading ? '⏳' : '⬇'} Export
        {!loading && <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%', zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: 'var(--shadow)', minWidth: 160, overflow: 'hidden',
        }}>
          <button
            onClick={exportExcel}
            style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: 16 }}>📊</span>
            <div>
              <div style={{ fontWeight: 600 }}>Export Excel</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>.xlsx file</div>
            </div>
          </button>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <button
            onClick={exportPDF}
            style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: 16 }}>📄</span>
            <div>
              <div style={{ fontWeight: 600 }}>Export PDF</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>.pdf file</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
