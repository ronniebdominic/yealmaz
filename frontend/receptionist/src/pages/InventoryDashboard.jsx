import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MdLogout, MdAdd, MdEdit, MdClose, MdWarning, MdCheckCircle,
  MdCancel, MdHistory, MdInventory2, MdPendingActions, MdTrendingUp, MdTrendingDown,
} from 'react-icons/md';

const TABS = [
  { id: 'stock', label: 'Stock', icon: MdInventory2 },
  { id: 'requests', label: 'Requests', icon: MdPendingActions },
  { id: 'ledger', label: 'Activity Ledger', icon: MdHistory },
];

// ── Add / edit item modal ─────────────────────────────────
function ItemModal({ item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name || '', unit: item?.unit || '', quantityOnHand: item?.quantityOnHand ?? 0,
    reorderThreshold: item?.reorderThreshold ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim() || !form.unit.trim()) { toast.error('Name and unit are required'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/inventory/items/${item.id}`, { name: form.name, unit: form.unit, reorderThreshold: form.reorderThreshold });
      } else {
        await api.post('/inventory/items', form);
      }
      toast.success(isEdit ? 'Item updated' : 'Item added');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save item'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ background: '#B45309', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isEdit ? 'Edit Item' : 'Add Item'}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>ITEM NAME *</div>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Zirconia Blank" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>UNIT *</div>
              <input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                placeholder="pcs, box, kg…" style={inputStyle} />
            </div>
            {!isEdit && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>STARTING QTY</div>
                <input type="number" min="0" value={form.quantityOnHand} onChange={e => setForm(p => ({ ...p, quantityOnHand: e.target.value }))} style={inputStyle} />
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>LOW-STOCK ALERT THRESHOLD</div>
            <input type="number" min="0" value={form.reorderThreshold} onChange={e => setForm(p => ({ ...p, reorderThreshold: e.target.value }))}
              placeholder="Leave blank for no alert" style={inputStyle} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: '#B45309', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Adjust stock modal ────────────────────────────────────
function AdjustModal({ item, onClose, onSaved }) {
  const [type, setType] = useState('RESTOCK');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const qty = parseInt(quantity);
    if (!qty) { toast.error('Enter a quantity'); return; }
    setSaving(true);
    try {
      await api.post(`/inventory/items/${item.id}/adjust`, { type, quantity: qty, note });
      toast.success('Stock updated');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not adjust stock'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ background: '#0F2044', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Adjust Stock — {item.name}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Currently on hand: <strong style={{ color: '#1F2937' }}>{item.quantityOnHand} {item.unit}</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setType('RESTOCK')} style={{ ...pillStyle, ...(type === 'RESTOCK' ? { background: '#DCFCE7', color: '#166534', border: '1.5px solid #16A34A' } : {}) }}>+ Restock</button>
            <button onClick={() => setType('ADJUSTMENT')} style={{ ...pillStyle, ...(type === 'ADJUSTMENT' ? { background: '#FEF3C7', color: '#92400E', border: '1.5px solid #D97706' } : {}) }}>± Correction</button>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>
              {type === 'RESTOCK' ? 'QUANTITY TO ADD' : 'SIGNED CHANGE (e.g. -3 to remove 3)'}
            </div>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>NOTE</div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason (optional)" style={inputStyle} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: '#0F2044', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Review (accept/reject) request modal ──────────────────
function ReviewModal({ request, onClose, onSaved }) {
  const [action, setAction] = useState('ACCEPT');
  const [quantityApproved, setQuantityApproved] = useState(request.quantityRequested);
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/inventory/requests/${request.id}`, {
        action, quantityApproved: action === 'ACCEPT' ? parseInt(quantityApproved) : undefined, reviewNote,
      });
      toast.success(action === 'ACCEPT' ? 'Request accepted' : 'Request rejected');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not process request'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, overflow: 'hidden' }}>
        <div style={{ background: '#0F2044', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Review Request
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px', border: '1px solid #E5E7EB', fontSize: 13 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{request.item.name} <span style={{ fontWeight: 400, color: '#6B7280' }}>({request.quantityRequested} {request.item.unit})</span></div>
            <div style={{ color: '#6B7280' }}>Requested by <strong style={{ color: '#1F2937' }}>{request.requestedBy?.name}</strong> — {request.department}</div>
            {request.requesterNote && <div style={{ marginTop: 6, fontStyle: 'italic', color: '#6B7280' }}>"{request.requesterNote}"</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAction('ACCEPT')} style={{ ...pillStyle, ...(action === 'ACCEPT' ? { background: '#DCFCE7', color: '#166534', border: '1.5px solid #16A34A' } : {}) }}><MdCheckCircle size={14} /> Accept</button>
            <button onClick={() => setAction('REJECT')} style={{ ...pillStyle, ...(action === 'REJECT' ? { background: '#FEE2E2', color: '#991B1B', border: '1.5px solid #DC2626' } : {}) }}><MdCancel size={14} /> Reject</button>
          </div>
          {action === 'ACCEPT' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>QUANTITY TO ISSUE</div>
              <input type="number" min="1" value={quantityApproved} onChange={e => setQuantityApproved(e.target.value)} style={inputStyle} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>NOTE</div>
            <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional note" style={inputStyle} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: action === 'ACCEPT' ? '#16A34A' : '#DC2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Processing…' : action === 'ACCEPT' ? 'Confirm Accept' : 'Confirm Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box' };
const pillStyle = { flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#F9FAFB', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 };

export default function InventoryDashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('stock');
  const [itemModal, setItemModal] = useState(null); // { } for new, item for edit
  const [adjustItem, setAdjustItem] = useState(null);
  const [reviewRequest, setReviewRequest] = useState(null);
  const [requestStatusFilter, setRequestStatusFilter] = useState('PENDING');

  const { data: items = [], refetch: refetchItems } = useQuery({
    queryKey: ['inventory', 'items'],
    queryFn: () => api.get('/inventory/items').then(r => r.data),
  });
  const { data: requests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['inventory', 'requests', requestStatusFilter],
    queryFn: () => api.get('/inventory/requests', { params: requestStatusFilter === 'ALL' ? {} : { status: requestStatusFilter } }).then(r => r.data),
    refetchInterval: 20_000,
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ['inventory', 'transactions'],
    queryFn: () => api.get('/inventory/transactions').then(r => r.data),
    enabled: tab === 'ledger',
  });

  useEffect(() => {
    if (!user?.id) return;
    import('../api').then(mod => {
      const s = mod.socket;
      if (!s) return;
      s.emit('join_inventory');
      const onNew = () => { toast('📦 New goods request', { icon: '📦' }); refetchRequests(); };
      s.on('new_goods_request', onNew);
      return () => s.off('new_goods_request', onNew);
    }).catch(() => {});
  }, [user?.id, refetchRequests]);

  const refreshAll = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); };
  const initials = (user?.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: '#0F2044', color: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="logo" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.2 }}>Ye-Almaz Dental Lab</div>
            <span style={{ fontSize: 11, background: 'rgba(180,83,9,0.25)', color: '#FBBF24', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>Inventory Manager</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#B45309', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
          <button onClick={logout} title="Logout"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
            <MdLogout size={15} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: tab === t.id ? '1.5px solid #B45309' : '1px solid #E5E7EB',
                background: tab === t.id ? '#FEF3C7' : '#fff', color: tab === t.id ? '#92400E' : '#6B7280',
              }}>
              <t.icon size={15} /> {t.label}
              {t.id === 'requests' && pendingCount > 0 && (
                <span style={{ background: '#DC2626', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'stock' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Stock Items</div>
              <button onClick={() => setItemModal({})}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#B45309', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <MdAdd size={15} /> Add Item
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>Item</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center' }}>On Hand</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center' }}>Low-Stock Alert</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>No items yet — add one above</td></tr>
                ) : items.map(i => {
                  const low = i.reorderThreshold != null && i.quantityOnHand <= i.reorderThreshold;
                  return (
                    <tr key={i.id} style={{ borderTop: '1px solid #F3F4F6', background: low ? '#FEF2F2' : 'transparent' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{i.name} <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 12 }}>({i.unit})</span></td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: low ? '#DC2626' : '#1F2937' }}>
                        {i.quantityOnHand} {low && <MdWarning size={13} style={{ verticalAlign: 'middle', marginLeft: 3 }} />}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6B7280' }}>{i.reorderThreshold ?? '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button onClick={() => setAdjustItem(i)} style={{ ...actionBtn, marginRight: 6 }}>Adjust</button>
                        <button onClick={() => setItemModal(i)} style={actionBtn}><MdEdit size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'requests' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {['PENDING', 'FULFILLED', 'REJECTED', 'ALL'].map(s => (
                <button key={s} onClick={() => setRequestStatusFilter(s)}
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid #E5E7EB', background: requestStatusFilter === s ? '#0F2044' : '#fff', color: requestStatusFilter === s ? '#fff' : '#6B7280' }}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {requests.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB' }}>No requests here</div>
              ) : requests.map(r => (
                <div key={r.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.item?.name} <span style={{ fontWeight: 400, color: '#6B7280' }}>× {r.quantityRequested} {r.item?.unit}</span></div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                      {r.requestedBy?.name} · {r.department} · {format(new Date(r.createdAt), 'dd MMM yyyy, h:mm a')}
                    </div>
                    {r.requesterNote && <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>"{r.requesterNote}"</div>}
                    {r.status !== 'PENDING' && (
                      <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700, color: r.status === 'FULFILLED' ? '#16A34A' : '#DC2626' }}>
                        {r.status === 'FULFILLED' ? `✓ Issued ${r.quantityApproved} — by ${r.reviewedBy?.name}` : `✕ Rejected — by ${r.reviewedBy?.name}`}
                        {r.reviewNote && <span style={{ fontWeight: 400, color: '#6B7280' }}> ({r.reviewNote})</span>}
                      </div>
                    )}
                  </div>
                  {r.status === 'PENDING' && (
                    <button onClick={() => setReviewRequest(r)}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F2044', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Review
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'ledger' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', fontWeight: 800, fontSize: 14 }}>Stock Movement Ledger</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>Item</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center' }}>Type</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>By</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>When</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>No activity yet</td></tr>
                ) : transactions.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 600 }}>{t.item?.name}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center' }}>{t.type}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: t.quantity < 0 ? '#DC2626' : '#16A34A', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {t.quantity < 0 ? <MdTrendingDown size={13} /> : <MdTrendingUp size={13} />} {t.quantity > 0 ? `+${t.quantity}` : t.quantity}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#6B7280' }}>{t.performedBy?.name}</td>
                    <td style={{ padding: '9px 14px', color: '#6B7280' }}>{format(new Date(t.createdAt), 'dd MMM yyyy, h:mm a')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {itemModal && <ItemModal item={itemModal.id ? itemModal : null} onClose={() => setItemModal(null)} onSaved={() => { setItemModal(null); refreshAll(); }} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={() => { setAdjustItem(null); refreshAll(); }} />}
      {reviewRequest && <ReviewModal request={reviewRequest} onClose={() => setReviewRequest(null)} onSaved={() => { setReviewRequest(null); refreshAll(); }} />}
    </div>
  );
}

const actionBtn = { padding: '5px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
