import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Field, inputStyle } from '../utils/adminForms';
import {
  MdWarehouse, MdEmojiEvents, MdWarning, MdTrendingUp, MdTrendingDown,
  MdAdd, MdEdit, MdInventory2, MdSwapVert,
} from 'react-icons/md';

const TABS = ['Stock', 'Requests', 'Ledger', 'Milling Leaderboard'];

// ── Create / Edit Item Modal ────────────────────────────────
// Name/unit/reorder threshold/active go through here (PATCH), but
// quantityOnHand never does once an item exists — the backend deliberately
// only ever moves stock through a logged RESTOCK/ADJUSTMENT transaction
// (AdjustStockModal below), so InventoryTransaction stays the single
// source of truth for usage reporting. Initial stock on creation is the
// one exception, since there's no prior balance to reconcile against.
function ItemFormModal({ initial, onSaved, onClose }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(initial ? {
    name: initial.name, unit: initial.unit,
    reorderThreshold: initial.reorderThreshold != null ? String(initial.reorderThreshold) : '',
    isActive: initial.isActive,
  } : { name: '', unit: '', reorderThreshold: '', quantityOnHand: '0', isActive: true });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Item name is required'); return; }
    if (!form.unit.trim())  { toast.error('Unit is required (e.g. pcs, box, kg)'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const { data } = await api.patch(`/inventory/items/${initial.id}`, {
          name: form.name.trim(),
          unit: form.unit.trim(),
          reorderThreshold: form.reorderThreshold.trim() === '' ? null : parseInt(form.reorderThreshold),
          isActive: form.isActive,
        });
        toast.success(`${data.name} updated`);
        onSaved(data);
      } else {
        const { data } = await api.post('/inventory/items', {
          name: form.name.trim(),
          unit: form.unit.trim(),
          quantityOnHand: form.quantityOnHand.trim() === '' ? 0 : parseInt(form.quantityOnHand),
          reorderThreshold: form.reorderThreshold.trim() === '' ? null : parseInt(form.reorderThreshold),
        });
        toast.success(`${data.name} added to inventory`);
        onSaved(data);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isEdit ? <><MdEdit className="mi" size={16} /> Edit Item</> : <><MdInventory2 className="mi" size={16} /> New Inventory Item</>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {isEdit ? 'Update name, unit and low-stock alert' : 'Add a new material or supply to track'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <Field label="Item Name" hint="required">
            <input style={inputStyle} placeholder="e.g. Zirconia Disc A2-16"
              value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr 1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
            <Field label="Unit" hint="required">
              <input style={inputStyle} placeholder="pcs, box, kg…"
                value={form.unit} onChange={e => set('unit', e.target.value)} />
            </Field>

            {!isEdit && (
              <Field label="Starting Qty" hint="optional">
                <input style={inputStyle} type="number" min="0" placeholder="0"
                  value={form.quantityOnHand} onChange={e => set('quantityOnHand', e.target.value)} />
              </Field>
            )}

            <Field label="Low-Stock Alert" hint="optional">
              <input style={inputStyle} type="number" min="0" placeholder="none"
                value={form.reorderThreshold} onChange={e => set('reorderThreshold', e.target.value)} />
            </Field>
          </div>

          {isEdit && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Active</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Inactive items are hidden from staff goods-request pickers
                </div>
              </div>
              <button
                type="button"
                onClick={() => set('isActive', !form.isActive)}
                style={{
                  width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: form.isActive ? 'var(--green)' : 'var(--border)',
                  position: 'relative', transition: 'background .2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left .2s',
                  left: form.isActive ? 21 : 3,
                }} />
              </button>
            </div>
          )}

          {isEdit && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
              Current stock: <strong style={{ color: 'var(--text-1)' }}>{initial.quantityOnHand} {initial.unit}</strong> — use "Adjust Stock" on the item row to change it (kept as a logged transaction, not editable here).
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              onClick={submit} disabled={saving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: saving ? 'var(--border)' : 'var(--blue)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', transition: 'background .15s',
              }}
            >
              {saving ? 'Saving…' : isEdit ? '✓ Save Changes' : '✓ Add Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Adjust Stock Modal ──────────────────────────────────────
// RESTOCK always adds; ADJUSTMENT takes a signed delta (for a correction —
// damaged stock, recount, etc.) — same two types the backend accepts.
function AdjustStockModal({ item, onSaved, onClose }) {
  const [type, setType]   = useState('RESTOCK');
  const [qty, setQty]     = useState('');
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const delta = (() => {
    const n = parseInt(qty);
    if (!n) return 0;
    return type === 'RESTOCK' ? Math.abs(n) : n;
  })();
  const resultingQty = item.quantityOnHand + delta;

  const submit = async () => {
    const n = parseInt(qty);
    if (!n) { toast.error('Enter a non-zero quantity'); return; }
    if (resultingQty < 0) { toast.error(`Cannot go below zero (currently ${item.quantityOnHand}).`); return; }
    setSaving(true);
    try {
      const { data } = await api.post(`/inventory/items/${item.id}/adjust`, { type, quantity: n, note: note.trim() || undefined });
      toast.success(`${item.name} now at ${data.item.quantityOnHand} ${item.unit}`);
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Adjustment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MdSwapVert className="mi" size={16} /> Adjust Stock
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{item.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <Field label="Type">
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: 'RESTOCK',    label: 'Restock (+)' },
                { val: 'ADJUSTMENT', label: 'Correction (±)' },
              ].map(opt => (
                <button key={opt.val} type="button" onClick={() => setType(opt.val)}
                  style={{
                    flex: 1, padding: '8px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${type === opt.val ? 'var(--blue)' : 'var(--border)'}`,
                    background: type === opt.val ? 'var(--blue-dim, #EEF2FF)' : 'var(--surface)',
                    color: type === opt.val ? 'var(--blue)' : 'var(--text-2)',
                  }}>{opt.label}</button>
              ))}
            </div>
          </Field>

          <Field label={type === 'RESTOCK' ? 'Quantity received' : 'Signed delta'} hint={type === 'RESTOCK' ? 'always added' : 'e.g. -5 to remove, 5 to add'}>
            <input style={inputStyle} type="number" placeholder={type === 'RESTOCK' ? 'e.g. 50' : 'e.g. -5'}
              value={qty} onChange={e => setQty(e.target.value)} autoFocus />
          </Field>

          <Field label="Note" hint="optional">
            <input style={inputStyle} placeholder="e.g. New supplier delivery, damaged in transit…"
              value={note} onChange={e => setNote(e.target.value)} />
          </Field>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13,
          }}>
            <span style={{ color: 'var(--text-3)' }}>{item.quantityOnHand} {item.unit} → </span>
            <strong style={{ color: resultingQty < 0 ? 'var(--red)' : 'var(--text-1)' }}>{resultingQty} {item.unit}</strong>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              onClick={submit} disabled={saving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: saving ? 'var(--border)' : 'var(--blue)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', transition: 'background .15s',
              }}
            >
              {saving ? 'Saving…' : '✓ Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminInventory() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('Stock');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);

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

  const refreshItems = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'inventory', 'items'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'inventory', 'transactions'] });
  };
  const handleSaved = () => { refreshItems(); setShowAdd(false); setEditTarget(null); };
  const handleAdjusted = () => { refreshItems(); setAdjustTarget(null); };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdWarehouse className="mi" size={18} /> Inventory</div>
        {tab === 'Stock' && (
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--blue)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 16px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            <MdAdd size={16} /> Add Item
          </button>
        )}
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
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">No inventory items yet</td></tr>
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
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setAdjustTarget(i)}>
                              <MdSwapVert className="mi" size={14} /> Adjust
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(i)}>
                              <MdEdit className="mi" size={14} /> Edit
                            </button>
                          </div>
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

      {showAdd && <ItemFormModal onSaved={handleSaved} onClose={() => setShowAdd(false)} />}
      {editTarget && <ItemFormModal initial={editTarget} onSaved={handleSaved} onClose={() => setEditTarget(null)} />}
      {adjustTarget && <AdjustStockModal item={adjustTarget} onSaved={handleAdjusted} onClose={() => setAdjustTarget(null)} />}
    </AdminLayout>
  );
}
