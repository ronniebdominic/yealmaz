import { useState, useMemo, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Pagination from '../components/Pagination';
import { MdSave, MdBolt, MdEdit, MdDelete } from 'react-icons/md';

const PAGE_SIZE = 15;

const ETB = (v) => 'Br ' + Number(v || 0).toLocaleString('en-US');

export default function AdminPricing() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [edits, setEdits]   = useState({});
  const [page, setPage]     = useState(1);
  const [durationEdits, setDurationEdits] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDays, setNewDays] = useState('');
  const [newExpressPrice, setNewExpressPrice] = useState('');
  const [newExpressDays, setNewExpressDays] = useState('');
  // per-row edit mode
  const [editRow, setEditRow] = useState(null); // id of row being inline-edited
  const [editRowData, setEditRowData] = useState({ workType: '', price: '', durationDays: '', expressPrice: '', expressDurationDays: '' });

  const { data: prices = [], isLoading } = useQuery({
    queryKey: ['prices'],
    queryFn: () => api.get('/prices').then(r => r.data),
    staleTime: 60_000,
  });

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: (updates) => api.put('/prices', updates).then(r => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['prices'], updated);
      setEdits({});
      setDurationEdits({});
      toast.success('Prices saved successfully');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to save prices');
    },
  });

  const { mutate: patchRow, isPending: patching } = useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/prices/${id}`, data).then(r => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['prices'], updated);
      setEditRow(null);
      toast.success('Work type updated');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to update work type');
    },
  });

  const { mutate: deleteRow, isPending: deleting } = useMutation({
    mutationFn: (id) => api.delete(`/prices/${id}`).then(r => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['prices'], updated);
      toast.success('Work type removed');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to delete work type');
    },
  });

  const filtered = useMemo(() => {
    return prices.filter(p =>
      p.workType.toLowerCase().includes(search.toLowerCase())
    );
  }, [prices, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const dirtyCount = new Set([
    ...Object.keys(edits).map(k => k.replace(/^express_/, '')),
    ...Object.keys(durationEdits).map(k => k.replace(/^express_/, '')),
  ]).size;

  const handleChange = (workType, val) => {
    setEdits(prev => ({ ...prev, [workType]: val }));
  };

  const handleDurationChange = (workType, val) => {
    setDurationEdits(prev => ({ ...prev, [workType]: val }));
  };

  const handleSave = () => {
    const allDirtyKeys = new Set([...Object.keys(edits), ...Object.keys(durationEdits)]);
    if (allDirtyKeys.size === 0) return;
    const dirtyWorkTypes = new Set([...allDirtyKeys].map(k => k.replace(/^express_/, '')));
    const updates = [...dirtyWorkTypes].map(workType => {
      const original = prices.find(p => p.workType === workType);
      const price = edits[workType] !== undefined ? parseFloat(edits[workType]) : original?.price || 0;
      const durVal = durationEdits[workType];
      const durationDays = durVal !== undefined ? (durVal === '' ? null : parseInt(durVal)) : original?.durationDays;
      const expPriceVal = edits[`express_${workType}`];
      const expressPrice = expPriceVal !== undefined ? (expPriceVal === '' ? null : parseFloat(expPriceVal)) : original?.expressPrice;
      const expDurVal = durationEdits[`express_${workType}`];
      const expressDurationDays = expDurVal !== undefined ? (expDurVal === '' ? null : parseInt(expDurVal)) : original?.expressDurationDays;
      return { workType, price, durationDays, expressPrice, expressDurationDays };
    }).filter(u => u.price >= 0);
    saveAll(updates);
  };

  const handleReset = () => { setEdits({}); setDurationEdits({}); };

  const startEdit = (p) => {
    setEditRow(p.id);
    setEditRowData({
      workType: p.workType,
      price: String(p.price),
      durationDays: String(p.durationDays ?? ''),
      expressPrice: String(p.expressPrice ?? ''),
      expressDurationDays: String(p.expressDurationDays ?? ''),
    });
  };

  const cancelEdit = () => setEditRow(null);

  const saveEdit = () => {
    if (!editRowData.workType.trim()) { toast.error('Work type name cannot be empty'); return; }
    const price = parseFloat(editRowData.price);
    if (isNaN(price) || price < 0) { toast.error('Enter a valid price'); return; }
    patchRow({
      id: editRow,
      workType: editRowData.workType.trim(),
      price,
      durationDays: editRowData.durationDays ? parseInt(editRowData.durationDays) : null,
      expressPrice: editRowData.expressPrice ? parseFloat(editRowData.expressPrice) : null,
      expressDurationDays: editRowData.expressDurationDays ? parseInt(editRowData.expressDurationDays) : null,
    });
  };

  const handleDelete = (p) => {
    if (!window.confirm(`Remove "${p.workType}" from pricing?\n\nThis cannot be undone.`)) return;
    deleteRow(p.id);
  };

  const handleAddNew = () => {
    const trimmed = newType.trim();
    if (!trimmed) { toast.error('Enter a work type name'); return; }
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) { toast.error('Enter a valid price'); return; }
    if (prices.some(p => p.workType.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('This work type already exists — edit its price in the table');
      return;
    }
    const durationDays = newDays ? parseInt(newDays) : null;
    const expressPrice = newExpressPrice ? parseFloat(newExpressPrice) : null;
    const expressDurationDays = newExpressDays ? parseInt(newExpressDays) : null;
    saveAll([{ workType: trimmed, price, durationDays, expressPrice, expressDurationDays }]);
    setShowAdd(false);
    setNewType('');
    setNewPrice('');
    setNewDays('');
    setNewExpressPrice('');
    setNewExpressDays('');
  };

  const getPrice = (p) =>
    edits[p.workType] !== undefined ? edits[p.workType] : p.price;

  const getDuration = (p) =>
    durationEdits[p.workType] !== undefined ? durationEdits[p.workType] : (p.durationDays ?? '');

  const isDirty = (workType) =>
    edits[workType] !== undefined || durationEdits[workType] !== undefined ||
    edits[`express_${workType}`] !== undefined || durationEdits[`express_${workType}`] !== undefined;

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title">Work Type Pricing</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dirtyCount > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
                {dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}
              </span>
              <button
                onClick={handleReset}
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '7px 14px',
                  fontSize: 13, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer',
                }}
              >
                Discard
              </button>
            </>
          )}
          <button
            onClick={() => { setShowAdd(v => !v); setNewType(''); setNewPrice(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: showAdd ? 'var(--surface-2)' : 'var(--accent-dim)',
              color: showAdd ? 'var(--text-2)' : 'var(--accent)',
              border: `1px solid ${showAdd ? 'var(--border)' : 'rgba(0,196,180,0.3)'}`,
              borderRadius: 8, padding: '7px 14px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showAdd ? '✕ Cancel' : '+ Add Work Type'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: dirtyCount === 0 ? 'var(--border)' : 'var(--blue)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 18px', fontSize: 13, fontWeight: 600,
              cursor: dirtyCount === 0 ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Saving…' : <><MdSave size={14} /> Save Changes</>}
          </button>
        </div>
      </div>

      <div className="content">
        {/* Search */}
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search work type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 'auto' }}>
              {filtered.length} of {prices.length} work types
              {search && ` matching "${search}"`}
            </span>
          </div>
        </div>

        {/* Add new work type */}
        {showAdd && (
          <div className="card" style={{ marginBottom: 20, padding: '18px 20px', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>
              New Work Type
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
                  WORK TYPE NAME
                </label>
                <input
                  type="text"
                  placeholder="e.g. Zirconia Implant Crown"
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNew()}
                  autoFocus
                  style={{ ...inputStyle, maxWidth: '100%', width: '100%' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#92400E', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                  <MdBolt size={12} /> EXPRESS PRICE (Br)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Br</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="optional"
                    value={newExpressPrice}
                    onChange={e => setNewExpressPrice(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNew()}
                    style={{ ...inputStyle, maxWidth: '100%', width: '100%' }}
                  />
                </div>
              </div>
              <div style={{ flex: 0, minWidth: 100 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#92400E', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                  <MdBolt size={12} /> EXPRESS DAYS
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="auto"
                  value={newExpressDays}
                  onChange={e => setNewExpressDays(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNew()}
                  style={{ ...inputStyle, maxWidth: '100%', width: '100%' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
                  PRICE (Br)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Br</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNew()}
                    style={{ ...inputStyle, maxWidth: '100%', width: '100%' }}
                  />
                </div>
              </div>
              <div style={{ flex: 0, minWidth: 100 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>
                  DURATION (days)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="auto"
                  value={newDays}
                  onChange={e => setNewDays(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNew()}
                  style={{ ...inputStyle, maxWidth: '100%', width: '100%' }}
                />
              </div>
              <button
                onClick={handleAddNew}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 8,
                  padding: '8px 20px', fontSize: 13, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap', alignSelf: 'flex-end',
                }}
              >
                {saving ? 'Adding…' : '+ Add'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Work Type</th>
                  <th style={{ width: 160 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MdBolt size={12} /> Express Price</span></th>
                  <th style={{ width: 130 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MdBolt size={12} /> Express Days</span></th>
                  <th style={{ width: 160 }}>Price (Br)</th>
                  <th style={{ width: 130 }}>Duration (days)</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
                      Loading prices…
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">No work types match your search</td>
                  </tr>
                ) : paginated.map((p, i) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + i;
                  const isEditing = editRow === p.id;

                  if (isEditing) {
                    return (
                      <tr key={p.id} style={{ background: 'rgba(21,101,192,0.04)', outline: '2px solid var(--blue)', outlineOffset: -2 }}>
                        <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{globalIdx + 1}</td>
                        <td>
                          <input
                            value={editRowData.workType}
                            onChange={e => setEditRowData(d => ({ ...d, workType: e.target.value }))}
                            autoFocus
                            style={{ ...inputStyle, width: '100%', maxWidth: '100%', fontWeight: 600 }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Br</span>
                            <input
                              type="number" min="0" step="100" placeholder="—"
                              value={editRowData.expressPrice}
                              onChange={e => setEditRowData(d => ({ ...d, expressPrice: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && saveEdit()}
                              style={{ ...inputStyle, width: 100, maxWidth: 100 }}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            type="number" min="1" step="1" placeholder="auto"
                            value={editRowData.expressDurationDays}
                            onChange={e => setEditRowData(d => ({ ...d, expressDurationDays: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && saveEdit()}
                            style={{ ...inputStyle, width: 90, maxWidth: 90 }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Br</span>
                            <input
                              type="number" min="0" step="100"
                              value={editRowData.price}
                              onChange={e => setEditRowData(d => ({ ...d, price: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && saveEdit()}
                              style={{ ...inputStyle, width: 100, maxWidth: 100 }}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            type="number" min="1" step="1" placeholder="auto"
                            value={editRowData.durationDays}
                            onChange={e => setEditRowData(d => ({ ...d, durationDays: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && saveEdit()}
                            style={{ ...inputStyle, width: 90, maxWidth: 90 }}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={saveEdit}
                              disabled={patching}
                              style={{ ...actionBtn, background: 'var(--blue)', color: '#fff', border: 'none' }}
                            >
                              {patching ? '…' : '✓ Save'}
                            </button>
                            <button onClick={cancelEdit} style={{ ...actionBtn }}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const dirty = isDirty(p.workType);
                  const priceDirty = edits[p.workType] !== undefined;
                  const durDirty = durationEdits[p.workType] !== undefined;
                  const currentVal = getPrice(p);
                  const currentDur = getDuration(p);

                  return (
                    <tr key={p.id} style={dirty ? { background: 'rgba(240,165,0,0.05)' } : {}}>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{globalIdx + 1}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.workType}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Br</span>
                          <input
                            type="number" min="0" step="100" placeholder="—"
                            value={edits[`express_${p.workType}`] !== undefined ? edits[`express_${p.workType}`] : (p.expressPrice ?? '')}
                            onChange={e => setEdits(prev => ({ ...prev, [`express_${p.workType}`]: e.target.value }))}
                            style={{
                              ...inputStyle, width: 110,
                              fontWeight: edits[`express_${p.workType}`] !== undefined ? 700 : 400,
                              borderColor: edits[`express_${p.workType}`] !== undefined ? 'var(--amber)' : 'var(--border)',
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          type="number" min="1" step="1" placeholder="auto"
                          value={durationEdits[`express_${p.workType}`] !== undefined ? durationEdits[`express_${p.workType}`] : (p.expressDurationDays ?? '')}
                          onChange={e => setDurationEdits(prev => ({ ...prev, [`express_${p.workType}`]: e.target.value }))}
                          style={{
                            ...inputStyle, width: 90,
                            fontWeight: durationEdits[`express_${p.workType}`] !== undefined ? 700 : 400,
                            borderColor: durationEdits[`express_${p.workType}`] !== undefined ? 'var(--amber)' : 'var(--border)',
                          }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Br</span>
                          <input
                            type="number" min="0" step="100"
                            value={currentVal}
                            onChange={e => handleChange(p.workType, e.target.value)}
                            style={{
                              ...inputStyle, width: 110,
                              fontWeight: priceDirty ? 700 : 400,
                              borderColor: priceDirty ? 'var(--amber)' : 'var(--border)',
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          type="number" min="1" step="1" placeholder="auto"
                          value={currentDur}
                          onChange={e => handleDurationChange(p.workType, e.target.value)}
                          style={{
                            ...inputStyle, width: 90,
                            fontWeight: durDirty ? 700 : 400,
                            borderColor: durDirty ? 'var(--amber)' : 'var(--border)',
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {dirty && (
                            <span style={{
                              background: 'rgba(240,165,0,0.15)', color: '#d97706',
                              padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            }}>
                              •
                            </span>
                          )}
                          <button
                            onClick={() => startEdit(p)}
                            disabled={!!editRow || deleting}
                            title="Edit work type name"
                            style={{ ...actionBtn }}
                          >
                            <MdEdit size={13} /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={!!editRow || deleting}
                            title="Remove work type"
                            style={{ ...actionBtn, color: 'var(--red)', borderColor: 'rgba(198,40,40,0.25)' }}
                          >
                            <MdDelete size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={page} totalPages={totalPages}
              total={filtered.length} pageSize={PAGE_SIZE}
              onPrev={() => setPage(p => p - 1)}
              onNext={() => setPage(p => p + 1)}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const inputStyle = {
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 13,
  color: 'var(--text-1)',
  background: 'var(--surface)',
  outline: 'none',
  fontFamily: 'DM Sans, sans-serif',
  width: '100%',
  maxWidth: 320,
};

const actionBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  border: '1px solid var(--border)', borderRadius: 6,
  padding: '4px 10px', fontSize: 12, fontWeight: 600,
  color: 'var(--text-2)', background: 'var(--surface)',
  cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'background 0.12s, border-color 0.12s',
};
