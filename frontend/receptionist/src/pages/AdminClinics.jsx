// Ye-Almaz — Admin Clinic Management

import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generatePassword, inputStyle, labelStyle, Field, PasswordInput } from '../utils/adminForms';

// ── Clinic-specific Helpers ───────────────────────────────
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
}

function generateEmail(name) {
  return `${slugify(name)}@clinics.yealmaz.com`;
}

function generateCode(name) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 5);
}

const EMPTY_FORM = {
  name: '', code: '', station: '', email: '',
  phone: '', address: '', password: '', isExcluded: false,
};

// ── Create / Edit Form Modal ───────────────────────────────
function ClinicFormModal({ initial, onSaved, onClose }) {
  const isEdit = !!initial?.id;
  const [form,    setForm]    = useState(initial ? {
    name:       initial.name       || '',
    code:       initial.code       || '',
    station:    initial.station    || '',
    email:      initial.email      || '',
    phone:      initial.phone      || '',
    address:    initial.address    || '',
    password:   '',
    isExcluded: initial.isExcluded ?? false,
  } : { ...EMPTY_FORM });
  const [showPass,           setShowPass]           = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [saving,             setSaving]             = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const autoFill = () => {
    if (!form.name.trim()) { toast.error('Enter a clinic name first'); return; }
    setForm(f => ({
      ...f,
      code:     f.code     || generateCode(f.name),
      email:    f.email    || generateEmail(f.name),
      password: generatePassword(),
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Clinic name is required'); return; }
    if (!isEdit && !form.password.trim()) { toast.error('Password is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name:       form.name.trim(),
        code:       form.code.trim()    || undefined,
        station:    form.station.trim() || undefined,
        email:      form.email.trim()   || undefined,
        phone:      form.phone.trim()   || undefined,
        address:    form.address.trim() || undefined,
        isExcluded: form.isExcluded,
      };
      if (form.password.trim()) payload.password = form.password.trim();

      let saved;
      if (isEdit) {
        const { data } = await api.patch(`/clinics/${initial.id}`, payload);
        saved = data;
        toast.success(`${saved.name} updated`);
      } else {
        const { data } = await api.post('/clinics', payload);
        saved = data;
        toast.success(`${saved.name} created`);
      }
      onSaved(saved, !isEdit ? form.password : null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? '✏️ Edit Clinic' : '🏥 New Clinic'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {isEdit ? 'Update clinic details — leave password blank to keep existing' : 'Fill in the details or use Auto-fill to generate credentials'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Auto-fill banner (create only) */}
          {!isEdit && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--blue-dim, #EEF2FF)', border: '1px solid rgba(26,86,160,0.15)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 18, gap: 12,
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Enter the clinic name, then auto-generate code, email &amp; password.
              </div>
              <button
                type="button"
                onClick={autoFill}
                style={{
                  whiteSpace: 'nowrap', background: 'var(--blue)', color: '#fff',
                  border: 'none', borderRadius: 7, padding: '7px 14px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                }}
              >
                ✨ Auto-fill
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Clinic Name" hint="required">
                <input style={inputStyle} placeholder="e.g. 3B Dental Clinic"
                  value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
              </Field>
            </div>

            <Field label="Clinic Code" hint="optional — auto-generated">
              <input style={inputStyle} placeholder="e.g. 3BD"
                value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} />
            </Field>

            <Field label="Station / Area" hint="optional">
              <input style={inputStyle} placeholder="e.g. Bole, Kazanchis"
                value={form.station} onChange={e => set('station', e.target.value)} />
            </Field>

            <Field label="Phone" hint="optional">
              <input style={inputStyle} placeholder="+251 9…"
                value={form.phone} onChange={e => set('phone', e.target.value)} />
            </Field>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Address" hint="optional">
                <input style={inputStyle} placeholder="Street, city…"
                  value={form.address} onChange={e => set('address', e.target.value)} />
              </Field>
            </div>

            {/* ── Credentials ── */}
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', margin: '4px 0 14px', paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                Login Credentials
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Email" hint="used to log in to the clinic app">
                <input style={inputStyle} type="email" placeholder="clinic@clinics.yealmaz.com"
                  value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              {isEdit ? (
                !showPasswordChange ? (
                  <button
                    type="button"
                    onClick={() => { setShowPasswordChange(true); set('password', generatePassword()); setShowPass(true); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'var(--surface-2)', border: '1.5px dashed var(--border)',
                      borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                      color: 'var(--text-2)', cursor: 'pointer', marginBottom: 14,
                    }}
                  >
                    🔑 Change Password
                  </button>
                ) : (
                  <Field label="New Password">
                    <PasswordInput
                      value={form.password}
                      onChange={v => set('password', v)}
                      showPass={showPass}
                      onToggleShow={() => setShowPass(s => !s)}
                      onRegenerate={() => set('password', generatePassword())}
                      autoFocus
                    />
                    <button type="button"
                      onClick={() => { setShowPasswordChange(false); set('password', ''); }}
                      style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', padding: 0 }}>
                      ✕ Cancel password change
                    </button>
                  </Field>
                )
              ) : (
                <Field label="Password" hint="required">
                  <PasswordInput
                    value={form.password}
                    onChange={v => set('password', v)}
                    showPass={showPass}
                    onToggleShow={() => setShowPass(s => !s)}
                    onRegenerate={() => set('password', generatePassword())}
                  />
                </Field>
              )}
            </div>
          </div>

          {/* Excluded toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Exclude from payment tracking</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Trusted partner — invoicing managed separately
              </div>
            </div>
            <button
              type="button"
              onClick={() => set('isExcluded', !form.isExcluded)}
              style={{
                width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
                background: form.isExcluded ? 'var(--blue)' : 'var(--border)',
                position: 'relative', transition: 'background .2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left .2s',
                left: form.isExcluded ? 21 : 3,
              }} />
            </button>
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
              {saving ? 'Saving…' : isEdit ? '✓ Save Changes' : '✓ Create Clinic'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Credentials Card (shown after creation) ───────────────
function CredsCard({ clinic, password, onClose }) {
  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ color: 'var(--green)' }}>✅ Clinic Created</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Save these credentials — the password won't be shown again
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden', marginBottom: 20,
          }}>
            {[
              { label: 'Clinic',    value: clinic.name },
              { label: 'Code',      value: clinic.code || '—' },
              { label: 'Email',     value: clinic.email || '—', copy: !!clinic.email },
              { label: 'Password',  value: password, mono: true, copy: true },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{row.label}</div>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    fontFamily: row.mono ? 'DM Mono, monospace' : 'inherit',
                    color: row.mono ? 'var(--blue)' : 'var(--text-1)',
                  }}>{row.value}</div>
                </div>
                {row.copy && (
                  <button
                    onClick={() => copy(row.value, row.label)}
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '5px 10px', fontSize: 12,
                      cursor: 'pointer', color: 'var(--text-2)', fontWeight: 600,
                    }}
                  >
                    Copy
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            style={{
              width: '100%', background: 'var(--blue)', color: '#fff',
              border: 'none', borderRadius: 8, padding: '10px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────
export default function AdminClinics() {
  const queryClient = useQueryClient();
  const [showForm,   setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [newCreds,   setNewCreds]   = useState(null); // { clinic, password }
  const [search,     setSearch]     = useState('');

  const { data: clinics = [], isLoading } = useQuery({
    queryKey: ['admin', 'clinics', 'all'],
    queryFn: () => api.get('/clinics/all').then(r => r.data),
    staleTime: 30_000,
  });

  const filtered = clinics.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.code   || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email  || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.station|| '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSaved = (clinic, plainPassword) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'clinics', 'all'] });
    queryClient.invalidateQueries({ queryKey: ['clinics'] });
    setShowForm(false);
    setEditTarget(null);
    if (plainPassword) setNewCreds({ clinic, password: plainPassword });
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title">Clinics</div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--blue)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '7px 16px', fontSize: 13,
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          + New Clinic
        </button>
      </div>

      <div className="content">
        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <div className="search-input">
            <span className="icon">🔍</span>
            <input
              placeholder="Search by name, code, email or station…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading clinics…</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏥</div>
                <div className="empty-title">No clinics found</div>
                <p>{search ? 'Try a different search term' : 'Create the first clinic using the button above'}</p>
              </div>
            ) : (
              <table style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 200 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 200 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 200 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Clinic</th>
                    <th>Code</th>
                    <th>Station</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Partner</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                      <td style={{ padding: '8px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: 7, background: 'var(--blue)',
                            color: '#fff', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
                          }}>
                            {c.name[0]?.toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              className="patient-name"
                              title={c.name}
                              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {c.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                        {c.code
                          ? <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>{c.code}</span>
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.station || '—'}</td>
                      <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.email || ''}>{c.email || '—'}</td>
                      <td style={{ padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '8px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: c.isExcluded ? 'rgba(26,86,160,0.1)' : 'var(--surface-2)',
                          color: c.isExcluded ? 'var(--blue)' : 'var(--text-3)',
                          border: `1px solid ${c.isExcluded ? 'rgba(26,86,160,0.25)' : 'var(--border)'}`,
                          borderRadius: 999, padding: '3px 10px',
                          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                        }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                            background: c.isExcluded ? 'var(--blue)' : 'var(--border)',
                          }} />
                          {c.isExcluded ? 'Partner' : 'Standard'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 16px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: c.isActive ? 'rgba(22,163,74,0.1)' : 'rgba(229,62,62,0.1)',
                          color: c.isActive ? 'var(--green)' : 'var(--red)',
                          whiteSpace: 'nowrap',
                        }}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {format(new Date(c.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td style={{ padding: '8px 16px' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditTarget(c)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => {
                              api.patch(`/clinics/${c.id}`, { isActive: !c.isActive })
                                .then(() => {
                                  toast.success(`${c.name} ${c.isActive ? 'deactivated' : 'activated'}`);
                                  queryClient.invalidateQueries({ queryKey: ['admin', 'clinics', 'all'] });
                                  queryClient.invalidateQueries({ queryKey: ['clinics'] });
                                })
                                .catch(() => toast.error('Update failed'));
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              background: c.isActive ? 'rgba(229,62,62,0.07)' : 'rgba(22,163,74,0.08)',
                              color: c.isActive ? 'var(--red)' : 'var(--green)',
                              border: `1px solid ${c.isActive ? 'rgba(229,62,62,0.2)' : 'rgba(22,163,74,0.25)'}`,
                              borderRadius: 6, padding: '4px 9px',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            {c.isActive ? '⏸ Deactivate' : '▶ Activate'}
                          </button>
                          <button
                            onClick={() => {
                              api.patch(`/clinics/${c.id}`, { isExcluded: !c.isExcluded })
                                .then(() => {
                                  toast.success(`${c.name} ${c.isExcluded ? 'removed from partners' : 'marked as trusted partner'}`);
                                  queryClient.invalidateQueries({ queryKey: ['admin', 'clinics', 'all'] });
                                })
                                .catch(() => toast.error('Update failed'));
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              background: c.isExcluded ? 'rgba(229,62,62,0.07)' : 'rgba(26,86,160,0.07)',
                              color: c.isExcluded ? 'var(--red)' : 'var(--blue)',
                              border: `1px solid ${c.isExcluded ? 'rgba(229,62,62,0.2)' : 'rgba(26,86,160,0.2)'}`,
                              borderRadius: 6, padding: '4px 9px',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            {c.isExcluded ? '✕ Remove Partner' : '🤝 Mark Partner'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showForm && (
        <ClinicFormModal
          onSaved={handleSaved}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <ClinicFormModal
          initial={editTarget}
          onSaved={handleSaved}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Credentials reveal */}
      {newCreds && (
        <CredsCard
          clinic={newCreds.clinic}
          password={newCreds.password}
          onClose={() => setNewCreds(null)}
        />
      )}
    </AdminLayout>
  );
}
