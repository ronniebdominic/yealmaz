// Ye-Almaz — Admin Audit Log: every create/edit/delete each user made across the system.
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../components/AdminLayout';
import ExportMenu from '../components/ExportMenu';
import api from '../api';
import { format } from 'date-fns';
import { MdHistory, MdSearch, MdExpandMore, MdChevronRight } from 'react-icons/md';

const METHOD_STYLE = {
  POST:   { label: 'Created / action', color: 'var(--green)', bg: 'var(--green-dim)' },
  PUT:    { label: 'Updated',          color: 'var(--blue)',  bg: 'var(--brand-tint)' },
  PATCH:  { label: 'Updated',          color: 'var(--blue)',  bg: 'var(--brand-tint)' },
  DELETE: { label: 'Deleted',          color: 'var(--red)',   bg: 'var(--red-dim)' },
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const pretty = (path) => path.replace(/^\/api\//, '').replace(UUID_RE, (m) => `…${m.slice(-6)}`);

function Details({ body }) {
  if (!body) return <span style={{ color: 'var(--text-3)' }}>No data sent</span>;
  let obj = null;
  try { obj = JSON.parse(body); } catch { /* truncated JSON — show raw */ }
  if (!obj || typeof obj !== 'object') return <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{body}</code>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', gap: '4px 14px', fontSize: 12 }}>
      {Object.entries(obj).map(([k, v]) => (
        <Fragment key={k}>
          <span style={{ color: 'var(--text-3)' }}>{k}</span>
          <span style={{ wordBreak: 'break-word' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </Fragment>
      ))}
    </div>
  );
}

export default function AdminAudit() {
  const [filters, setFilters] = useState({ userId: '', module: '', method: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  const { data: options } = useQuery({
    queryKey: ['audit', 'filters'],
    queryFn: () => api.get('/audit/filters').then(r => r.data),
    staleTime: 60_000,
  });

  const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit: 50 };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', 'list', params],
    queryFn: () => api.get('/audit', { params }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 30_000,
  });

  const rows = data?.rows || [];
  const pg = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const fieldStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13 };

  const fetchAll = async () => {
    const all = [];
    for (let p = 1; p <= 20; p++) {
      const r = await api.get('/audit', { params: { ...params, page: p, limit: 200 } });
      all.push(...r.data.rows);
      if (p >= r.data.pagination.totalPages) break;
    }
    return all;
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MdHistory size={20} /> Audit Log</div>
        <ExportMenu
          fetchData={fetchAll}
          columns={[
            { header: 'When',    value: r => format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm:ss') },
            { header: 'User',    value: r => r.userName || '' },
            { header: 'Role',    value: r => r.userRole || '' },
            { header: 'Action',  value: r => (METHOD_STYLE[r.method]?.label || r.method) },
            { header: 'Module',  value: r => r.module },
            { header: 'Request', value: r => `${r.method} ${r.path}` },
            { header: 'Data',    value: r => r.body || '' },
            { header: 'IP',      value: r => r.ip || '' },
          ]}
          filename="audit-log"
          title="Audit Log"
        />
      </div>

      <div className="content">
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-input" style={{ minWidth: 220, flex: 1 }}>
            <span className="icon mi"><MdSearch size={16} /></span>
            <input placeholder="Search user, case id, data…" value={filters.q} onChange={e => set('q', e.target.value)} />
          </div>
          <select style={fieldStyle} value={filters.userId} onChange={e => set('userId', e.target.value)}>
            <option value="">All users</option>
            {(options?.users || []).map(u => <option key={u.id} value={u.id}>{u.name || u.id} ({u.role}) · {u.count}</option>)}
          </select>
          <select style={fieldStyle} value={filters.module} onChange={e => set('module', e.target.value)}>
            <option value="">All modules</option>
            {(options?.modules || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select style={fieldStyle} value={filters.method} onChange={e => set('method', e.target.value)}>
            <option value="">All actions</option>
            <option value="POST">Created / action</option>
            <option value="PATCH">Updated</option>
            <option value="DELETE">Deleted</option>
          </select>
          <input type="date" style={fieldStyle} value={filters.from} onChange={e => set('from', e.target.value)} />
          <span style={{ color: 'var(--text-3)' }}>to</span>
          <input type="date" style={fieldStyle} value={filters.to} onChange={e => set('to', e.target.value)} />
        </div>

        <div className="card">
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
            ) : isError ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>
                Could not load the audit log. <button className="btn btn-ghost btn-sm" onClick={refetch}>Retry</button>
              </div>
            ) : rows.length === 0 ? (
              <div className="empty-state"><div className="empty-title">No activity found</div><p>Edits made by users appear here as they happen.</p></div>
            ) : (
              <table>
                <thead>
                  <tr><th></th><th>When</th><th>User</th><th>Action</th><th>Module</th><th>Request</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const m = METHOD_STYLE[r.method] || METHOD_STYLE.POST;
                    const isOpen = open === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r.id)}>
                          <td style={{ width: 28 }}>{isOpen ? <MdExpandMore size={18} /> : <MdChevronRight size={18} />}</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{format(new Date(r.createdAt), 'dd MMM yyyy, HH:mm:ss')}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.userName || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.userRole}</div>
                          </td>
                          <td><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>{m.label}</span></td>
                          <td style={{ fontWeight: 600 }}>{r.module}</td>
                          <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{r.method} {pretty(r.path)}</td>
                        </tr>
                        {isOpen && (
                          <tr style={{ background: 'var(--surface-2)' }}>
                            <td colSpan={6} style={{ padding: '12px 16px 14px 44px' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
                                {r.path}{r.ip ? ` · IP ${r.ip}` : ''}{r.entityId ? ` · record ${r.entityId}` : ''}
                              </div>
                              <Details body={r.body} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {pg.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 14 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Page {pg.page} of {pg.totalPages} · {pg.total} entries</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pg.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
