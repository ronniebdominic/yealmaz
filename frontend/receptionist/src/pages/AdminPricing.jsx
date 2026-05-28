import { useState, useMemo, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 15;

const ETB = (v) => 'Br ' + Number(v || 0).toLocaleString('en-US');

export default function AdminPricing() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [edits, setEdits]   = useState({});
  const [page, setPage]     = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState('');
  const [newPrice, setNewPrice] = useState('');

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
      toast.success('Prices saved successfully');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to save prices');
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

  const dirtyCount = Object.keys(edits).length;

  const handleChange = (workType, val) => {
    setEdits(prev => ({ ...prev, [workType]: val }));
  };

  const handleSave = () => {
    const updates = Object.entries(edits)
      .map(([workType, price]) => ({ workType, price: parseFloat(price) || 0 }))
      .filter(u => u.price >= 0);
    if (updates.length === 0) return;
    saveAll(updates);
  };

  const handleReset = () => setEdits({});

  const handleAddNew = () => {
    const trimmed = newType.trim();
    if (!trimmed) { toast.error('Enter a work type name'); return; }
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) { toast.error('Enter a valid price'); return; }
    if (prices.some(p => p.workType.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('This work type already exists — edit its price in the table');
      return;
    }
    saveAll([{ workType: trimmed, price }]);
    setShowAdd(false);
    setNewType('');
    setNewPrice('');
  };

  const getPrice = (p) =>
    edits[p.workType] !== undefined ? edits[p.workType] : p.price;

  const isDirty = (workType) => edits[workType] !== undefined;

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
            {saving ? 'Saving…' : '💾 Save Changes'}
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
              <div style={{ flex: 1, minWidth: 140 }}>
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
                  <th style={{ width: 200 }}>Price (Br)</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
                      Loading prices…
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-state">No work types match your search</td>
                  </tr>
                ) : paginated.map((p, i) => {
                  const dirty = isDirty(p.workType);
                  const currentVal = getPrice(p);
                  const globalIdx = (page - 1) * PAGE_SIZE + i;
                  return (
                    <tr key={p.workType} style={dirty ? { background: 'rgba(240,165,0,0.05)' } : {}}>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{globalIdx + 1}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.workType}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Br</span>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={currentVal}
                            onChange={e => handleChange(p.workType, e.target.value)}
                            style={{
                              ...inputStyle,
                              width: 140,
                              fontWeight: dirty ? 700 : 400,
                              borderColor: dirty ? 'var(--amber)' : 'var(--border)',
                              color: dirty ? 'var(--text-1)' : 'var(--text-1)',
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {dirty ? (
                          <span style={{
                            background: 'rgba(240,165,0,0.15)', color: '#d97706',
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          }}>
                            Modified
                          </span>
                        ) : (
                          <span style={{
                            background: 'var(--green-dim)', color: 'var(--green)',
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          }}>
                            Saved
                          </span>
                        )}
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
