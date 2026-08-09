// Ye-Almaz — Admin User Management

import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generatePassword, inputStyle, labelStyle, Field, PasswordInput } from '../utils/adminForms';
import {
  MdFolder, MdBiotech, MdLocalShipping, MdInventory2, MdPaid, MdEdit,
  MdPerson, MdCheckCircle, MdVpnKey, MdSearch, MdPause, MdPlayArrow, MdWarehouse, MdGroups,
  MdHandshake, MdPointOfSale, MdSupervisorAccount,
} from 'react-icons/md';

// ── Constants ─────────────────────────────────────────────
const ROLES = [
  { value: 'RECEPTIONIST',      label: 'Receptionist',       icon: MdFolder },
  { value: 'LAB_TECH',          label: 'Lab Technician',     icon: MdBiotech },
  { value: 'DELIVERY',          label: 'Delivery',           icon: MdLocalShipping },
  { value: 'DISPATCH',          label: 'Dispatch',           icon: MdInventory2 },
  { value: 'FINANCE',           label: 'Finance',            icon: MdPaid },
  { value: 'FINANCE_AP',        label: 'Finance — AP (Trusted Partners)', icon: MdHandshake },
  { value: 'FINANCE_CASHIER',   label: 'Finance — Cashier',  icon: MdPointOfSale },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager',  icon: MdWarehouse },
  { value: 'HR_MANAGER',        label: 'HR Manager',         icon: MdGroups },
  { value: 'LEADER',            label: 'Operation Manager',  icon: MdSupervisorAccount },
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.value, r]));

const DEPARTMENTS = [
  { code: 'PLASTER',      label: 'Plaster Department'   },
  { code: 'MARGIN',       label: 'Margin Department'    },
  { code: 'SCANNING',     label: 'Scanning'             },
  { code: 'DESIGNING',    label: 'Designing'            },
  { code: 'MILLING',      label: 'Milling / Sintering'  },
  { code: 'RESIN_PRINT',  label: 'Resin 3D Printing'    },
  { code: 'METAL_PRINT',  label: 'Metal 3D Printing'    },
  { code: 'METAL_FINISH', label: 'Metal Finishing'      },
  { code: 'OPAQUE',       label: 'Opaque Application'   },
  { code: 'CERAMIC',      label: 'Ceramic Layering'     },
  { code: 'ZIRCONIA',     label: 'Zirconia Fitting'     },
  { code: 'GLAZING',      label: 'Glazing'              },
  { code: 'THERMO',       label: 'Thermo Press'         },
  { code: 'TRIMMING',     label: 'Trimming'             },
  { code: 'QC',           label: 'Quality Control'      },
];

const ROLE_COLORS = {
  RECEPTIONIST:      { bg: 'rgba(26,86,160,0.1)',   color: 'var(--blue)' },
  LAB_TECH:          { bg: 'rgba(124,58,237,0.1)',  color: '#7C3AED'     },
  DELIVERY:          { bg: 'rgba(217,119,6,0.1)',   color: '#D97706'     },
  DISPATCH:          { bg: 'rgba(14,165,233,0.1)',  color: '#0EA5E9'     },
  FINANCE:           { bg: 'rgba(22,163,74,0.1)',   color: 'var(--green)'},
  FINANCE_AP:        { bg: 'rgba(109,40,217,0.1)',  color: '#6D28D9'     },
  FINANCE_CASHIER:   { bg: 'rgba(22,163,74,0.1)',   color: 'var(--green)'},
  INVENTORY_MANAGER: { bg: 'rgba(180,83,9,0.1)',    color: '#B45309'     },
  HR_MANAGER:        { bg: 'rgba(14,116,144,0.1)',  color: '#0E7490'     },
  LEADER:            { bg: 'rgba(219,39,119,0.1)',  color: '#DB2777'     },
};


// ── User Form Modal ───────────────────────────────────────
function UserFormModal({ initial, onSaved, onClose }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(initial ? {
    name:            initial.name            || '',
    email:           initial.email           || '',
    phone:           initial.phone           || '',
    station:         initial.station         || '',
    zoneId:          initial.zoneId          || '',
    role:            initial.role            || 'RECEPTIONIST',
    departments:     initial.departments     || [],
    isSharedAccount: initial.isSharedAccount || false,
    password:        '',
  } : {
    name: '', email: '', phone: '', station: '', zoneId: '',
    role: 'RECEPTIONIST', departments: [], isSharedAccount: false, password: generatePassword(),
  });
  const [showPass,           setShowPass]           = useState(!isEdit);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [saving,             setSaving]             = useState(false);

  const { data: zones = [] } = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.get('/zones').then(r => r.data),
    staleTime: 60_000,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleDept = (code) => setForm(f => ({
    ...f,
    departments: f.departments.includes(code)
      ? f.departments.filter(d => d !== code)
      : [...f.departments, code],
  }));

  const submit = async () => {
    if (!form.name.trim())  { toast.error('Name is required');  return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    if (!isEdit && !form.password.trim()) { toast.error('Password is required'); return; }

    setSaving(true);
    try {
      const payload = {
        name:  form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        station: form.station.trim() || undefined,
        zoneId: form.zoneId || '',
        role:  form.role,
        departments: form.role === 'LAB_TECH' ? form.departments : [],
        isSharedAccount: form.isSharedAccount,
      };
      if (form.password.trim()) payload.password = form.password.trim();

      let saved;
      if (isEdit) {
        const { data } = await api.patch(`/users/${initial.id}`, payload);
        saved = data;
        toast.success(`${saved.name} updated`);
      } else {
        const { data } = await api.post('/users', payload);
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
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{isEdit ? <><MdEdit className="mi" size={16} /> Edit User</> : <><MdPerson className="mi" size={16} /> New User</>}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {isEdit ? 'Update details — leave password blank to keep existing' : 'Fill in details or regenerate the password'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {/* Name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Full Name" hint="required">
                <input style={inputStyle} placeholder="e.g. Biruk Alemu"
                  value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
              </Field>
            </div>

            {/* Role */}
            <Field label="Role" hint="required">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.role}
                onChange={e => { set('role', e.target.value); set('departments', []); }}
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>

            {/* Shared/department login — not a real person (e.g. "Zirconia Fitting",
                "Finance Department"). Excluded from the HR & Payroll employee list. */}
            <div style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
                <input type="checkbox" checked={form.isSharedAccount}
                  onChange={e => set('isSharedAccount', e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--blue)', cursor: 'pointer' }} />
                This is a shared/department login, not a real person
              </label>
              {form.isSharedAccount && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, marginLeft: 23 }}>
                  Won't appear in HR & Payroll's employee list.
                </div>
              )}
            </div>

            {/* Departments — LAB_TECH only, multi-select */}
            {form.role === 'LAB_TECH' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Field
                  label="Departments"
                  hint={form.departments.length ? `scoped to ${form.departments.length} selected` : 'none selected = unrestricted (all departments)'}
                >
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6,
                    padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)',
                  }}>
                    {DEPARTMENTS.map(d => {
                      const checked = form.departments.includes(d.code);
                      return (
                        <label key={d.code} style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          fontSize: 12, fontWeight: checked ? 700 : 400,
                          color: checked ? 'var(--blue)' : 'var(--text-2)',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleDept(d.code)}
                            style={{ width: 14, height: 14, accentColor: 'var(--blue)', cursor: 'pointer' }} />
                          {d.label}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}

            {/* Email */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Email" hint="used to log in">
                <input style={inputStyle} type="email" placeholder="user@yealmaz.com"
                  value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
            </div>

            {/* Phone */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Phone" hint="optional">
                <input style={inputStyle} placeholder="+251 9…"
                  value={form.phone} onChange={e => set('phone', e.target.value)} />
              </Field>
            </div>

            {/* Station + Zone — mainly for Dispatch/Delivery routing */}
            <Field label="Station / Area" hint="optional — for routing, matches a clinic's station">
              <input style={inputStyle} placeholder="e.g. Bole, Piassa, CMC"
                value={form.station} onChange={e => set('station', e.target.value)} />
            </Field>
            <Field label="Zone" hint="optional — the broader area they cover">
              <select style={inputStyle} value={form.zoneId} onChange={e => set('zoneId', e.target.value)}>
                <option value="">— No zone —</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </Field>

            {/* Password */}
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
                    <MdVpnKey size={14} /> Change Password
                  </button>
                ) : (
                  <Field label="New Password">
                    <PasswordInput
                      value={form.password}
                      onChange={v => set('password', v)}
                      showPass={showPass}
                      onToggleShow={() => setShowPass(s => !s)}
                      onRegenerate={() => { set('password', generatePassword()); setShowPass(true); }}
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
                    onRegenerate={() => { set('password', generatePassword()); setShowPass(true); }}
                  />
                </Field>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
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
              {saving ? 'Saving…' : isEdit ? '✓ Save Changes' : '✓ Create User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Credentials Card ──────────────────────────────────────
function CredsCard({ user, password, onClose }) {
  const copy = (text, label) =>
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}><MdCheckCircle className="mi" size={16} /> User Created</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Save these credentials — password won't be shown again
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            {[
              { label: 'Name',     value: user.name },
              { label: 'Role',     value: ROLE_MAP[user.role]?.label || user.role },
              { label: 'Email',    value: user.email, copy: true },
              { label: 'Password', value: password,   copy: true, mono: true },
            ].map((row, i, arr) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{row.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: row.mono ? 'DM Mono, monospace' : 'inherit', color: row.mono ? 'var(--blue)' : 'var(--text-1)' }}>
                    {row.value}
                  </div>
                </div>
                {row.copy && (
                  <button onClick={() => copy(row.value, row.label)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-2)', fontWeight: 600 }}>
                    Copy
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ width: '100%', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────
const ROLE_FILTERS = [{ label: 'All', value: '' }, ...ROLES.map(r => ({ label: r.label, value: r.value }))];

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [newCreds,     setNewCreds]     = useState(null);
  const [roleFilter,   setRoleFilter]   = useState('');
  const [search,       setSearch]       = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/users').then(r => r.data),
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const filtered = users.filter(u => {
    const matchRole = !roleFilter || u.role === roleFilter;
    const matchSearch = !search.trim() ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.station || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.zone?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.departments || []).join(' ').toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const handleSaved = (user, plainPassword) => {
    refresh();
    setShowForm(false);
    setEditTarget(null);
    if (plainPassword) setNewCreds({ user, password: plainPassword });
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title">Users</div>
        <button
          onClick={() => setShowForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + New User
        </button>
      </div>

      <div className="content">
        {/* Search + role filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 1, minWidth: 220 }}>
            <span className="icon mi"><MdSearch size={16} /></span>
            <input
              placeholder="Search by name, email or department…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="filters" style={{ marginBottom: 20 }}>
          {ROLE_FILTERS.map(f => (
            <button key={f.value} className={`filter-chip ${roleFilter === f.value ? 'active' : ''}`}
              onClick={() => setRoleFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading users…</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon mi"><MdPerson size={32} /></div>
                <div className="empty-title">No users found</div>
                <p>{search || roleFilter ? 'Try adjusting your search or filter' : 'Add the first user with the button above'}</p>
              </div>
            ) : (
              <table style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 200 }} />
                  <col style={{ width: 210 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 230 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Phone</th>
                    <th>Station</th>
                    <th>Zone</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => {
                    const roleInfo  = ROLE_MAP[u.role] || {};
                    const roleColor = ROLE_COLORS[u.role] || { bg: 'var(--surface-2)', color: 'var(--text-2)' };
                    return (
                      <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.5 }}>
                        <td style={{ padding: '8px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 7, background: roleColor.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }} className="patient-name" title={u.name}>
                              {u.name}
                              {u.isSharedAccount && (
                                <span title="Shared/department login — excluded from HR & Payroll" style={{
                                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                                  background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', flexShrink: 0,
                                }}>SHARED</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={u.email}>{u.email}</td>
                        <td style={{ padding: '8px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: roleColor.bg, color: roleColor.color, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {roleInfo.icon && <roleInfo.icon size={11} />} {roleInfo.label || u.role}
                          </span>
                        </td>
                        <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title={u.role === 'LAB_TECH' ? (u.departments || []).map(c => DEPARTMENTS.find(d => d.code === c)?.label || c).join(', ') : ''}>
                          {u.role === 'LAB_TECH'
                            ? ((u.departments?.length)
                                ? u.departments.map(c => DEPARTMENTS.find(d => d.code === c)?.label || c).join(', ')
                                : <span style={{ color: 'var(--text-3)' }}>Flexible</span>)
                            : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{u.phone || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                        <td style={{ padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{u.station || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                        <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                          {u.zone?.name
                            ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(21,101,192,0.1)', color: 'var(--blue)' }}>{u.zone.name}</span>
                            : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: u.isActive ? 'rgba(22,163,74,0.1)' : 'rgba(229,62,62,0.1)', color: u.isActive ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {format(new Date(u.createdAt), 'dd MMM yyyy')}
                        </td>
                        <td style={{ padding: '8px 16px' }}>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(u)}><MdEdit className="mi" size={14} /> Edit</button>
                            <button
                              onClick={() => {
                                api.patch(`/users/${u.id}`, { isActive: !u.isActive })
                                  .then(() => { toast.success(`${u.name} ${u.isActive ? 'deactivated' : 'activated'}`); refresh(); })
                                  .catch(() => toast.error('Update failed'));
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, background: u.isActive ? 'rgba(229,62,62,0.07)' : 'rgba(22,163,74,0.08)', color: u.isActive ? 'var(--red)' : 'var(--green)', border: `1px solid ${u.isActive ? 'rgba(229,62,62,0.2)' : 'rgba(22,163,74,0.25)'}`, borderRadius: 6, padding: '4px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {u.isActive ? <><MdPause size={13} /> Deactivate</> : <><MdPlayArrow size={13} /> Activate</>}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showForm    && <UserFormModal onSaved={handleSaved} onClose={() => setShowForm(false)} />}
      {editTarget  && <UserFormModal initial={editTarget} onSaved={handleSaved} onClose={() => setEditTarget(null)} />}

      {newCreds && (
        <CredsCard
          user={newCreds.user}
          password={newCreds.password}
          onClose={() => setNewCreds(null)}
        />
      )}
    </AdminLayout>
  );
}
