// Ye-Almaz — HR Reports (More → Reports). One flexible backend endpoint
// (GET /api/reports/:type) per report type — preview on screen, download
// as .xlsx built server-side (same buildWorkbookBuffer/sendXlsx
// infrastructure payments.js/cases.js already use).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdFileDownload, MdVisibility } from 'react-icons/md';
import { inputStyle } from '../../../utils/adminForms';

export default function ReportsPanel() {
  const [type, setType] = useState('');
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: types = [] } = useQuery({ queryKey: ['hr', 'report-types'], queryFn: () => api.get('/reports/types').then(r => r.data) });

  const loadPreview = async () => {
    if (!type) { toast.error('Pick a report type'); return; }
    setLoadingPreview(true);
    try {
      const res = await api.get(`/reports/${type}`, { params: { from, to, format: 'json' } });
      setPreview(res.data);
    } catch (err) { toast.error(err.response?.data?.error || 'Could not load preview'); }
    finally { setLoadingPreview(false); }
  };

  const download = async () => {
    if (!type) { toast.error('Pick a report type'); return; }
    setDownloading(true);
    try {
      const res = await api.get(`/reports/${type}`, { params: { from, to }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `${type}-report-${from}-to-${to}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error('Could not download report'); }
    finally { setDownloading(false); }
  };

  const columns = preview && preview.length > 0 ? Object.keys(preview[0]).filter(k => !k.startsWith('_')) : [];

  return (
    <div className="card">
      <div className="card-header"><div className="card-title">HR Reports</div></div>
      <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>REPORT</div>
          <select style={inputStyle} value={type} onChange={e => { setType(e.target.value); setPreview(null); }}>
            <option value="">— Select report —</option>
            {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>FROM</div>
          <input type="date" style={{ ...inputStyle, width: 150 }} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>TO</div>
          <input type="date" style={{ ...inputStyle, width: 150 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadPreview} disabled={loadingPreview} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdVisibility size={14} /> {loadingPreview ? 'Loading…' : 'Preview'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={download} disabled={downloading} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdFileDownload size={14} /> {downloading ? 'Downloading…' : 'Download Excel'}
        </button>
      </div>

      {preview && (
        <div className="table-wrap">
          <table>
            <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {preview.length === 0 ? (
                <tr><td colSpan={columns.length || 1} className="empty-state">No data for this range</td></tr>
              ) : preview.slice(0, 100).map((row, i) => (
                <tr key={i}>
                  {columns.map(c => <td key={c}>{typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 100 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>Showing first 100 of {preview.length} rows — download the full report for everything.</div>}
        </div>
      )}
    </div>
  );
}
