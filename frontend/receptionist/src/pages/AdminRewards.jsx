import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MdCardGiftcard, MdEdit, MdPause, MdPlayArrow, MdDelete } from 'react-icons/md';

const TABS = ['Settings', 'Reward Catalog', 'Clinic Points', 'Redemptions'];

const statusStyle = {
  PENDING:  { bg: 'rgba(230,81,0,0.1)',   color: '#E65100', label: 'Pending' },
  APPROVED: { bg: 'rgba(46,125,50,0.1)',  color: '#2E7D32', label: 'Approved' },
  REJECTED: { bg: 'rgba(198,40,40,0.1)',  color: '#C62828', label: 'Rejected' },
};

export default function AdminRewards() {
  const qc = useQueryClient();
  const [tab, setTab]               = useState('Settings');
  const [redemptionFilter, setRedemptionFilter] = useState('PENDING');

  // ── Settings ─────────────────────────────────────────────
  const { data: settings } = useQuery({
    queryKey: ['rewards', 'settings'],
    queryFn: () => api.get('/rewards/settings').then(r => r.data),
  });
  const [ppc, setPpc] = useState('');
  const savePpc = async () => {
    const v = parseInt(ppc);
    if (isNaN(v) || v < 0) { toast.error('Enter a valid number'); return; }
    try {
      await api.put('/rewards/settings', { pointsPerCase: v });
      qc.invalidateQueries({ queryKey: ['rewards', 'settings'] });
      toast.success('Points per case updated');
      setPpc('');
    } catch { toast.error('Failed to save'); }
  };

  // ── Catalog ───────────────────────────────────────────────
  const { data: items = [] } = useQuery({
    queryKey: ['rewards', 'items'],
    queryFn: () => api.get('/rewards/items').then(r => r.data),
  });
  const [newItem, setNewItem] = useState({ name: '', description: '', pointsCost: '' });
  const [editItem, setEditItem] = useState(null);

  const addItem = async () => {
    if (!newItem.name || !newItem.pointsCost) { toast.error('Name and points cost required'); return; }
    try {
      await api.post('/rewards/items', newItem);
      qc.invalidateQueries({ queryKey: ['rewards', 'items'] });
      setNewItem({ name: '', description: '', pointsCost: '' });
      toast.success('Reward added');
    } catch { toast.error('Failed to add reward'); }
  };
  const saveEdit = async () => {
    try {
      await api.patch(`/rewards/items/${editItem.id}`, editItem);
      qc.invalidateQueries({ queryKey: ['rewards', 'items'] });
      setEditItem(null);
      toast.success('Reward updated');
    } catch { toast.error('Failed to update'); }
  };
  const toggleActive = async (item) => {
    try {
      await api.patch(`/rewards/items/${item.id}`, { isActive: !item.isActive });
      qc.invalidateQueries({ queryKey: ['rewards', 'items'] });
    } catch { toast.error('Failed'); }
  };
  const deleteItem = async (id) => {
    if (!window.confirm('Remove this reward?')) return;
    try {
      await api.delete(`/rewards/items/${id}`);
      qc.invalidateQueries({ queryKey: ['rewards', 'items'] });
      toast.success('Removed');
    } catch { toast.error('Failed to remove'); }
  };

  // ── Leaderboard ───────────────────────────────────────────
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['rewards', 'leaderboard'],
    queryFn: () => api.get('/rewards/leaderboard').then(r => r.data),
    enabled: tab === 'Clinic Points',
  });

  // ── Redemptions ───────────────────────────────────────────
  const { data: redemptions = [] } = useQuery({
    queryKey: ['rewards', 'redemptions', redemptionFilter],
    queryFn: () => api.get('/rewards/redemptions', { params: { status: redemptionFilter } }).then(r => r.data),
    enabled: tab === 'Redemptions',
  });
  const [rejectNote, setRejectNote] = useState({});

  const processRedemption = async (id, status) => {
    try {
      await api.patch(`/rewards/redemptions/${id}`, { status, adminNote: rejectNote[id] || null });
      qc.invalidateQueries({ queryKey: ['rewards', 'redemptions'] });
      qc.invalidateQueries({ queryKey: ['rewards', 'leaderboard'] });
      toast.success(status === 'APPROVED' ? 'Redemption approved!' : 'Redemption rejected');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdCardGiftcard className="mi" size={18} /> Rewards Management</div>
      </div>
      <div className="content">

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 18px', fontSize: 14, fontWeight: 600,
              color: tab === t ? 'var(--blue)' : 'var(--text-3)',
              borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -2, transition: 'color .15s',
            }}>{t}</button>
          ))}
        </div>

        {/* ── Settings ── */}
        {tab === 'Settings' && (
          <div className="card" style={{ maxWidth: 480, padding: 28 }}>
            <h3 style={{ marginBottom: 20, fontSize: 16, fontWeight: 700 }}>Points per Case</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              Each time a clinic submits a new case through the app, they earn this many reward points.
            </p>
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Current setting</span>
              <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)' }}>
                {settings?.pointsPerCase ?? '—'} pts
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="number" min="0" placeholder="New value…"
                value={ppc} onChange={e => setPpc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePpc()}
                style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
              />
              <button className="btn btn-primary" onClick={savePpc}>Save</button>
            </div>
          </div>
        )}

        {/* ── Catalog ── */}
        {tab === 'Reward Catalog' && (
          <div>
            {/* Add new */}
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Add New Reward</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: .5, display: 'block', marginBottom: 5 }}>NAME *</label>
                  <input placeholder="e.g. Free Lab Kit" value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                </div>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: .5, display: 'block', marginBottom: 5 }}>DESCRIPTION</label>
                  <input placeholder="Optional description" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: .5, display: 'block', marginBottom: 5 }}>POINTS COST *</label>
                  <input type="number" min="1" placeholder="e.g. 50" value={newItem.pointsCost} onChange={e => setNewItem(p => ({ ...p, pointsCost: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                </div>
                <button className="btn btn-primary" onClick={addItem} style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}>+ Add Reward</button>
              </div>
            </div>

            {/* List */}
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reward Name</th>
                      <th>Description</th>
                      <th style={{ width: 120, textAlign: 'center' }}>Points</th>
                      <th style={{ width: 90, textAlign: 'center' }}>Status</th>
                      <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={5} className="empty-state">No rewards yet — add one above</td></tr>
                    ) : items.map(item => editItem?.id === item.id ? (
                      <tr key={item.id} style={{ background: 'rgba(21,101,192,0.04)' }}>
                        <td><input value={editItem.name} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
                          style={{ width: '100%', border: '1.5px solid var(--blue)', borderRadius: 6, padding: '5px 8px', fontSize: 13 }} /></td>
                        <td><input value={editItem.description || ''} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))}
                          style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13 }} /></td>
                        <td><input type="number" value={editItem.pointsCost} onChange={e => setEditItem(p => ({ ...p, pointsCost: e.target.value }))}
                          style={{ width: 80, border: '1.5px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13 }} /></td>
                        <td />
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit}>✓ Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditItem(null)} style={{ marginLeft: 6 }}>Cancel</button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} style={{ opacity: item.isActive ? 1 : 0.55 }}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.description || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--blue)' }}>{item.pointsCost}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                            background: item.isActive ? 'rgba(46,125,50,0.1)' : 'var(--surface-2)',
                            color: item.isActive ? 'var(--green)' : 'var(--text-3)',
                          }}>{item.isActive ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditItem({ ...item })}><MdEdit size={14} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => toggleActive(item)}>
                            {item.isActive ? <MdPause size={14} /> : <MdPlayArrow size={14} />}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4, color: 'var(--red)' }} onClick={() => deleteItem(item.id)}><MdDelete size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Clinic Points Leaderboard ── */}
        {tab === 'Clinic Points' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>Clinic</th>
                    <th style={{ textAlign: 'right', width: 140 }}>Earned</th>
                    <th style={{ textAlign: 'right', width: 140 }}>Redeemed</th>
                    <th style={{ textAlign: 'right', width: 140 }}>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">No clinic points yet</td></tr>
                  ) : leaderboard.map((row, i) => {
                    const available = row.totalEarned - row.totalRedeemed;
                    return (
                      <tr key={row.id}>
                        <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>
                          {row.clinic?.name}
                          {row.clinic?.code && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-3)' }}>[{row.clinic.code}]</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>+{row.totalEarned}</td>
                        <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>-{row.totalRedeemed}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, fontSize: 15, color: available > 0 ? 'var(--blue)' : 'var(--text-3)' }}>
                            {available} pts
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Redemptions ── */}
        {tab === 'Redemptions' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
                <button key={s} onClick={() => setRedemptionFilter(s)} style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${redemptionFilter === s ? statusStyle[s].color : 'var(--border)'}`,
                  background: redemptionFilter === s ? statusStyle[s].bg : 'var(--surface)',
                  color: redemptionFilter === s ? statusStyle[s].color : 'var(--text-3)',
                }}>{statusStyle[s].label}</button>
              ))}
            </div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Clinic</th>
                      <th>Reward</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Points</th>
                      <th style={{ width: 120 }}>Requested</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                      {redemptionFilter === 'PENDING' && <th style={{ width: 260, textAlign: 'right' }}>Actions</th>}
                      {redemptionFilter !== 'PENDING' && <th style={{ width: 200 }}>Note</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {redemptions.length === 0 ? (
                      <tr><td colSpan={6} className="empty-state">No {redemptionFilter.toLowerCase()} redemptions</td></tr>
                    ) : redemptions.map(r => {
                      const s = statusStyle[r.status] || statusStyle.PENDING;
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{r.clinic?.name}</td>
                          <td>{r.rewardItem?.name}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--blue)' }}>{r.pointsSpent}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color }}>
                              {s.label}
                            </span>
                          </td>
                          {r.status === 'PENDING' && (
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                                <input
                                  placeholder="Reject note…"
                                  value={rejectNote[r.id] || ''}
                                  onChange={e => setRejectNote(p => ({ ...p, [r.id]: e.target.value }))}
                                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, width: 130 }}
                                />
                                <button className="btn btn-success btn-sm" onClick={() => processRedemption(r.id, 'APPROVED')}>✓ Approve</button>
                                <button className="btn btn-danger btn-sm" onClick={() => processRedemption(r.id, 'REJECTED')}>✗ Reject</button>
                              </div>
                            </td>
                          )}
                          {r.status !== 'PENDING' && (
                            <td style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: r.adminNote ? 'normal' : 'italic' }}>
                              {r.adminNote || '—'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
