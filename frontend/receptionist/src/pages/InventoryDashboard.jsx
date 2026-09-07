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
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';

const TABS = [
  { id: 'stock', label: 'Stock', icon: MdInventory2 },
  { id: 'requests', label: 'Requests', icon: MdPendingActions },
  { id: 'ledger', label: 'Activity Ledger', icon: MdHistory },
];

// Portal-scoped styles. `inv-` prefixed so nothing here reaches the
// Admin / HR / Technician / Clinic portals.
function InvStyles() {
  return (
    <style>{`
      .inv-shell{min-height:100vh;background:var(--bg)}
      .inv-header{
        position:sticky;top:0;z-index:40;height:56px;
        display:flex;align-items:center;justify-content:space-between;gap:16px;
        padding:0 clamp(12px,2.4vw,22px);
        background:var(--surface);border-bottom:1px solid var(--border);
      }
      .inv-body{max-width:1240px;margin:0 auto;padding:clamp(14px,2.4vw,28px);container-type:inline-size}

      .inv-panel{
        background:var(--surface);border:1px solid var(--border);
        border-radius:var(--radius-lg);overflow:hidden;
      }
      .inv-panel-head{
        display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
        padding:12px clamp(12px,2vw,18px);border-bottom:1px solid var(--border);
      }
      .inv-panel-title{font-size:13.5px;font-weight:600;color:var(--text-1);letter-spacing:-.01em}

      /* Table — compact, hairline row separators, right-aligned figures. */
      .inv-table{width:100%;border-collapse:collapse}
      .inv-table th{
        padding:9px clamp(10px,1.6vw,16px);text-align:left;white-space:nowrap;
        font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;
        color:var(--text-3);background:var(--surface-2);border-bottom:1px solid var(--border);
      }
      .inv-table td{
        padding:9px clamp(10px,1.6vw,16px);font-size:13px;color:var(--text-2);
        border-top:1px solid var(--border-soft);vertical-align:middle;
      }
      .inv-table tbody tr{transition:background var(--t-fast) var(--ease)}
      @media (hover:hover){.inv-table tbody tr:hover{background:var(--surface-2)}}
      .inv-name{font-weight:600;color:var(--text-1)}
      .inv-unit{font-weight:400;color:var(--text-4);font-size:12px}
      .inv-num{font-variant-numeric:tabular-nums;text-align:right;font-weight:600;color:var(--text-1)}
      .inv-c{text-align:center}
      .inv-row-low td{background:var(--red-dim)}
      .inv-row-low .inv-num{color:var(--red)}

      .inv-actbtn{
        display:inline-flex;align-items:center;gap:4px;
        padding:5px 10px;border-radius:var(--radius-xs);
        border:1px solid var(--border);background:var(--surface-2);
        color:var(--text-2);font:inherit;font-size:12px;font-weight:550;cursor:pointer;
        transition:transform var(--t-fast) var(--ease-out),background var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease),color var(--t-fast) var(--ease);
      }
      @media (hover:hover){.inv-actbtn:hover{background:var(--surface-3);color:var(--text-1);border-color:var(--border-2)}}
      .inv-actbtn:active{transform:translateY(1px) scale(.97)}

      /* Request card */
      .inv-req{
        background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);
        border-left:3px solid var(--row,var(--text-4));
        padding:14px clamp(12px,2vw,16px);
        display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;
        transition:transform var(--t-fast) var(--ease-out),background var(--t-fast) var(--ease);
      }
      .inv-req:active{transform:translateY(1px) scale(.995);background:var(--surface-2)}

      /* Mobile: rows become stacked cards with inline labels. */
      @container (max-width:640px){
        .inv-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
        .inv-table,.inv-table tbody,.inv-table tr,.inv-table td{display:block;width:100%}
        .inv-table tr{border:1px solid var(--border);border-radius:var(--radius-md);margin:10px;padding:4px 0;background:var(--surface)}
        .inv-table td{border:none;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 14px;text-align:right}
        .inv-table td::before{content:attr(data-label);font-size:10px;font-weight:600;letter-spacing:.06em;
          text-transform:uppercase;color:var(--text-3);text-align:left}
        .inv-table td[data-label=""]::before{content:none}
        .inv-num,.inv-c{text-align:right}
        .inv-row-low td{background:transparent}
        .inv-row-low{border-color:var(--red-line)}
      }
    `}</style>
  );
}

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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Edit Item' : 'Add Item'}</div>
          <button className="modal-close" onClick={onClose}><MdClose size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Item name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Zirconia Blank" autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <label>Unit *</label>
              <input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="pcs, box, kg…" />
            </div>
            {!isEdit && (
              <div className="form-group" style={{ margin: 0, flex: 1 }}>
                <label>Starting qty</label>
                <input type="number" min="0" value={form.quantityOnHand} onChange={e => setForm(p => ({ ...p, quantityOnHand: e.target.value }))} />
              </div>
            )}
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Low-stock alert threshold</label>
            <input type="number" min="0" value={form.reorderThreshold} onChange={e => setForm(p => ({ ...p, reorderThreshold: e.target.value }))} placeholder="Leave blank for no alert" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">Adjust Stock — {item.name}</div>
          <button className="modal-close" onClick={onClose}><MdClose size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Currently on hand: <strong style={{ color: 'var(--text-1)' }}>{item.quantityOnHand} {item.unit}</strong>
          </div>
          <div className="seg" style={{ width: '100%' }}>
            <button style={{ flex: 1 }} className={type === 'RESTOCK' ? 'active' : ''} onClick={() => setType('RESTOCK')}>+ Restock</button>
            <button style={{ flex: 1 }} className={type === 'ADJUSTMENT' ? 'active' : ''} onClick={() => setType('ADJUSTMENT')}>± Correction</button>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>{type === 'RESTOCK' ? 'Quantity to add' : 'Signed change (e.g. -3 to remove 3)'}</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason (optional)" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</button>
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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">Review Request</div>
          <button className="modal-close" onClick={onClose}><MdClose size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '12px 14px', border: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-1)' }}>
              {request.item.name} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>({request.quantityRequested} {request.item.unit})</span>
            </div>
            <div style={{ color: 'var(--text-3)' }}>Requested by <strong style={{ color: 'var(--text-1)' }}>{request.requestedBy?.name}</strong> — {request.department}</div>
            {request.requesterNote && <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--text-3)' }}>"{request.requesterNote}"</div>}
          </div>
          <div className="seg" style={{ width: '100%' }}>
            <button style={{ flex: 1 }} className={action === 'ACCEPT' ? 'active' : ''} onClick={() => setAction('ACCEPT')}>
              <MdCheckCircle size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} /> Accept
            </button>
            <button style={{ flex: 1 }} className={action === 'REJECT' ? 'active' : ''} onClick={() => setAction('REJECT')}>
              <MdCancel size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} /> Reject
            </button>
          </div>
          {action === 'ACCEPT' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Quantity to issue</label>
              <input type="number" min="1" value={quantityApproved} onChange={e => setQuantityApproved(e.target.value)} />
            </div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label>Note</label>
            <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional note" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className={`btn ${action === 'ACCEPT' ? 'btn-success' : 'btn-danger'}`} onClick={save} disabled={saving}>
            {saving ? 'Processing…' : action === 'ACCEPT' ? 'Confirm Accept' : 'Confirm Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InventoryDashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('stock');
  const [itemModal, setItemModal] = useState(null); // { } for new, item for edit
  const [adjustItem, setAdjustItem] = useState(null);
  const [reviewRequest, setReviewRequest] = useState(null);
  const [requestStatusFilter, setRequestStatusFilter] = useState('PENDING');

  const { data: items = [] } = useQuery({
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
    <div className="inv-shell">
      <InvStyles />
      <header className="inv-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', letterSpacing: '-.01em', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ye-Almaz Dental Lab</div>
            <span style={{ fontSize: 10.5, color: 'var(--amber)', fontWeight: 600 }}>Inventory Manager</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <AttendanceClock />
          <LeaveRequestButton />
          <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--amber-dim)', color: 'var(--amber)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{initials}</div>
            <span className="inv-hide-sm" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name?.split(' ')[0]}</span>
            <button onClick={logout} title="Logout" className="btn btn-tertiary btn-sm" style={{ padding: 7 }}><MdLogout size={15} /></button>
          </div>
        </div>
      </header>
      <style>{`@media (max-width:600px){.inv-hide-sm{display:none}}`}</style>

      <div className="inv-body">
        {/* Segmented navigation */}
        <div className="seg" style={{ marginBottom: 18, maxWidth: '100%', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <t.icon size={15} /> {t.label}
              {t.id === 'requests' && pendingCount > 0 && (
                <span className="badge badge-pay-pending" style={{ padding: '0 6px' }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'stock' && (
          <div className="inv-panel" style={{ animation: 'fadeInUp var(--t-slow) var(--ease-out) both' }}>
            <div className="inv-panel-head">
              <div className="inv-panel-title">Stock Items</div>
              <button className="btn btn-primary btn-sm" onClick={() => setItemModal({})}>
                <MdAdd size={15} /> Add Item
              </button>
            </div>
            <div className="table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="inv-c">On Hand</th>
                    <th className="inv-c">Low-Stock Alert</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={4} data-label="" style={{ padding: 28, textAlign: 'center', color: 'var(--text-4)' }}>No items yet — add one above</td></tr>
                  ) : items.map(i => {
                    const low = i.reorderThreshold != null && i.quantityOnHand <= i.reorderThreshold;
                    return (
                      <tr key={i.id} className={low ? 'inv-row-low' : undefined}>
                        <td data-label="Item">
                          <span className="inv-name">{i.name}</span> <span className="inv-unit">({i.unit})</span>
                        </td>
                        <td data-label="On hand" className="inv-num inv-c">
                          {i.quantityOnHand}
                          {low && <MdWarning size={13} style={{ verticalAlign: 'middle', marginLeft: 4, color: 'var(--red)' }} />}
                        </td>
                        <td data-label="Low-stock alert" className="inv-c" style={{ color: 'var(--text-3)' }}>{i.reorderThreshold ?? '—'}</td>
                        <td data-label="" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="inv-actbtn" style={{ marginRight: 6 }} onClick={() => setAdjustItem(i)}>Adjust</button>
                          <button className="inv-actbtn" onClick={() => setItemModal(i)}><MdEdit size={13} /> Edit</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'requests' && (
          <div style={{ animation: 'fadeInUp var(--t-slow) var(--ease-out) both' }}>
            <div className="filters" style={{ marginBottom: 12 }}>
              {['PENDING', 'FULFILLED', 'REJECTED', 'ALL'].map(s => (
                <button key={s} className={`filter-chip ${requestStatusFilter === s ? 'active' : ''}`} onClick={() => setRequestStatusFilter(s)}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {requests.length === 0 ? (
                <div className="inv-panel" style={{ padding: 28, textAlign: 'center', color: 'var(--text-4)' }}>No requests here</div>
              ) : requests.map(r => (
                <div key={r.id} className="inv-req"
                  style={{ '--row': r.status === 'PENDING' ? 'var(--amber)' : r.status === 'FULFILLED' ? 'var(--green)' : 'var(--red)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>
                      {r.item?.name} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>× {r.quantityRequested} {r.item?.unit}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      {r.requestedBy?.name} · {r.department} · {format(new Date(r.createdAt), 'dd MMM yyyy, h:mm a')}
                    </div>
                    {r.requesterNote && <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 2 }}>"{r.requesterNote}"</div>}
                    {r.status !== 'PENDING' && (
                      <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600, color: r.status === 'FULFILLED' ? 'var(--green)' : 'var(--red)' }}>
                        {r.status === 'FULFILLED' ? `✓ Issued ${r.quantityApproved} — by ${r.reviewedBy?.name}` : `✕ Rejected — by ${r.reviewedBy?.name}`}
                        {r.reviewNote && <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> ({r.reviewNote})</span>}
                      </div>
                    )}
                  </div>
                  {r.status === 'PENDING' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setReviewRequest(r)}>Review</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'ledger' && (
          <div className="inv-panel" style={{ animation: 'fadeInUp var(--t-slow) var(--ease-out) both' }}>
            <div className="inv-panel-head"><div className="inv-panel-title">Stock Movement Ledger</div></div>
            <div className="table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="inv-c">Type</th>
                    <th className="inv-c">Qty</th>
                    <th>By</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={5} data-label="" style={{ padding: 28, textAlign: 'center', color: 'var(--text-4)' }}>No activity yet</td></tr>
                  ) : transactions.map(t => (
                    <tr key={t.id}>
                      <td data-label="Item"><span className="inv-name">{t.item?.name}</span></td>
                      <td data-label="Type" className="inv-c" style={{ color: 'var(--text-3)' }}>{t.type}</td>
                      <td data-label="Qty" className="inv-c" style={{ fontWeight: 600, color: t.quantity < 0 ? 'var(--red)' : 'var(--green)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          {t.quantity < 0 ? <MdTrendingDown size={13} /> : <MdTrendingUp size={13} />} {t.quantity > 0 ? `+${t.quantity}` : t.quantity}
                        </span>
                      </td>
                      <td data-label="By" style={{ color: 'var(--text-3)' }}>{t.performedBy?.name}</td>
                      <td data-label="When" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{format(new Date(t.createdAt), 'dd MMM yyyy, h:mm a')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {itemModal && <ItemModal item={itemModal.id ? itemModal : null} onClose={() => setItemModal(null)} onSaved={() => { setItemModal(null); refreshAll(); }} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={() => { setAdjustItem(null); refreshAll(); }} />}
      {reviewRequest && <ReviewModal request={reviewRequest} onClose={() => setReviewRequest(null)} onSaved={() => { setReviewRequest(null); refreshAll(); }} />}
    </div>
  );
}
