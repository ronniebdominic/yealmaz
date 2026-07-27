import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MdWarehouse, MdEmojiEvents, MdWarning, MdTrendingUp, MdTrendingDown } from 'react-icons/md';

const TABS = ['Stock', 'Requests', 'Ledger', 'Milling Leaderboard'];

export default function AdminInventory() {
  const [tab, setTab] = useState('Stock');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data: items = [] } = useQuery({
    queryKey: ['admin', 'inventory', 'items'],
    queryFn: () => api.get('/inventory/items').then(r => r.data),
    enabled: tab === 'Stock',
  });
  const { data: requests = [] } = useQuery({
    queryKey: ['admin', 'inventory', 'requests', statusFilter],
    queryFn: () => api.get('/inventory/requests', { params: statusFilter === 'ALL' ? {} : { status: statusFilter } }).then(r => r.data),
    enabled: tab === 'Requests',
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ['admin', 'inventory', 'transactions'],
    queryFn: () => api.get('/inventory/transactions').then(r => r.data),
    enabled: tab === 'Ledger',
  });
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['admin', 'milling', 'leaderboard'],
    queryFn: () => api.get('/milling/leaderboard').then(r => r.data),
    enabled: tab === 'Milling Leaderboard',
  });

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdWarehouse className="mi" size={18} /> Inventory</div>
      </div>
      <div className="content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}>{t}</button>
          ))}
        </div>

        {tab === 'Stock' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'center' }}>On Hand</th>
                    <th style={{ textAlign: 'center' }}>Low-Stock Alert</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={4} className="empty-state">No inventory items yet</td></tr>
                  ) : items.map(i => {
                    const low = i.reorderThreshold != null && i.quantityOnHand <= i.reorderThreshold;
                    return (
                      <tr key={i.id} style={low ? { background: 'var(--red-dim)' } : undefined}>
                        <td style={{ fontWeight: 600 }}>{i.name} <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}>({i.unit})</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: low ? 'var(--red)' : 'var(--text-1)' }}>
                          {i.quantityOnHand} {low && <MdWarning size={13} style={{ verticalAlign: 'middle', marginLeft: 3 }} />}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{i.reorderThreshold ?? '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${i.isActive ? 'badge-verified' : ''}`}>{i.isActive ? 'Active' : 'Inactive'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'Requests' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {['ALL', 'PENDING', 'FULFILLED', 'REJECTED'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th><th>Qty</th><th>Requested By</th><th>Department</th>
                      <th>Status</th><th>Reviewed By</th><th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr><td colSpan={7} className="empty-state">No requests</td></tr>
                    ) : requests.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.item?.name}</td>
                        <td>{r.status === 'FULFILLED' ? r.quantityApproved : r.quantityRequested} {r.item?.unit}</td>
                        <td>{r.requestedBy?.name}</td>
                        <td>{r.department}</td>
                        <td>
                          <span className={`badge ${r.status === 'FULFILLED' ? 'badge-verified' : r.status === 'REJECTED' ? 'badge-rejected' : ''}`}>{r.status}</span>
                        </td>
                        <td style={{ color: 'var(--text-3)' }}>{r.reviewedBy?.name || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(r.createdAt), 'dd MMM yyyy, h:mm a')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'Ledger' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Item</th><th>Type</th><th>Qty</th><th>Performed By</th><th>Note</th><th>When</th></tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state">No stock movement yet</td></tr>
                  ) : transactions.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.item?.name}</td>
                      <td>{t.type}</td>
                      <td style={{ fontWeight: 700, color: t.quantity < 0 ? 'var(--red)' : 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {t.quantity < 0 ? <MdTrendingDown size={13} /> : <MdTrendingUp size={13} />} {t.quantity > 0 ? `+${t.quantity}` : t.quantity}
                      </td>
                      <td>{t.performedBy?.name}</td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{t.note || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(t.createdAt), 'dd MMM yyyy, h:mm a')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'Milling Leaderboard' && (
          <div className="card">
            <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text-2)' }}>
              Bonus points earned by lab techs for yielding more than the expected crown count from a single milling blank.
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Lab Tech</th><th style={{ textAlign: 'center' }}>Bonus Points</th></tr>
                </thead>
                <tbody>
                  {leaderboard.length === 0 ? (
                    <tr><td colSpan={3} className="empty-state">No bonus points earned yet</td></tr>
                  ) : leaderboard.map((p, idx) => (
                    <tr key={p.id}>
                      <td>{idx === 0 ? <MdEmojiEvents size={16} color="#D97706" /> : idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{p.user?.name}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>{p.totalEarned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
