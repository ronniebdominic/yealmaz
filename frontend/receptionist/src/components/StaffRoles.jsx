// Ye-Almaz — Staff roles: admin/HR-created job titles ("Front Office") on top
// of a built-in access level. Used by Admin > Users and HR > Employees.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../api';
import { Field, inputStyle } from '../utils/adminForms';
import { MdBadge, MdDelete, MdAdd, MdEdit } from 'react-icons/md';

// The departments the business uses (free text is still allowed for a new one).
export const STAFF_DEPARTMENTS = ['Front Office', 'Support Staff', 'Operation', 'HR', 'Finance', 'Inventory', 'Admin'];

// "Front Office · Cashier" — the department first so two Cashiers can be told apart.
export const staffRoleLabel = (r) => (r?.department ? `${r.department} · ${r.name}` : r?.name || '');

// [{ department, roles: [...] }] in department order, roles with no department last.
export function groupStaffRoles(roles) {
  const by = new Map();
  for (const r of roles) {
    const key = r.department || '';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(r);
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([department, list]) => ({ department, roles: list.sort((x, y) => x.name.localeCompare(y.name)) }));
}

export function useStaffRoles() {
  const { data = [] } = useQuery({
    queryKey: ['admin', 'staff-roles'],
    queryFn: () => api.get('/staff-roles').then(r => r.data),
    staleTime: 30_000,
  });
  return data;
}

// ── Roles Modal ───────────────────────────────────────────
// Admin-created job titles ("Front Office") on top of a built-in access level.
// Staff on a role get exactly that access level's screens and permissions.
// levels: the access levels this viewer may assign, as { value, label }. A role
// whose level isn't in the list (Admin, for HR) is shown read-only.
export function RolesModal({ levels, onChanged = () => {}, onClose }) {
  const levelLabel = (v) => levels.find(l => l.value === v)?.label || v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
  const canEdit = (r) => levels.some(l => l.value === r.baseRole);
  const queryClient = useQueryClient();
  const staffRoles = useStaffRoles();
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  // No default access level: it has to be chosen on purpose. (It used to start on the first entry,
  // Admin, so a role created without touching the dropdown silently got full admin access.)
  const [baseRole, setBaseRole] = useState('');
  // Admin is listed last so it is never the easy pick.
  const orderedLevels = [...levels.filter(l => l.value !== 'ADMIN'), ...levels.filter(l => l.value === 'ADMIN')];
  const ADMIN_WARNING = 'Admin access gives this role FULL control of the whole system — everyone on it can see and change everything, including users, payments and settings. Grant it only to people who must have it.';
  const [editing, setEditing] = useState(null); // { id, name, department, baseRole }
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'staff-roles'] });
    onChanged();
  };
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast.success(okMsg); refresh(); return true; }
    catch (err) { toast.error(err.response?.data?.error || 'Something went wrong'); return false; }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!name.trim()) { toast.error('Role name is required'); return; }
    if (!baseRole) { toast.error('Choose an access level for this role'); return; }
    const admin = baseRole === 'ADMIN';
    if (admin && !window.confirm(`${ADMIN_WARNING}\n\nCreate "${name.trim()}" with Admin access?`)) return;
    if (await run(() => api.post('/staff-roles', { name: name.trim(), department: department.trim() || null, baseRole, ...(admin ? { confirmAdmin: true } : {}) }), `${name.trim()} role created`)) {
      setName('');
      setBaseRole('');
    }
  };
  const saveEdit = async () => {
    if (!editing.name.trim()) { toast.error('Role name is required'); return; }
    const original = staffRoles.find(r => r.id === editing.id);
    const grantingAdmin = editing.baseRole === 'ADMIN' && original?.baseRole !== 'ADMIN';
    if (grantingAdmin && !window.confirm(`${ADMIN_WARNING}\n\nMove everyone on "${editing.name.trim()}" to Admin access?`)) return;
    if (await run(() => api.patch(`/staff-roles/${editing.id}`, { name: editing.name.trim(), department: editing.department.trim() || null, baseRole: editing.baseRole, ...(grantingAdmin ? { confirmAdmin: true } : {}) }), 'Role updated')) setEditing(null);
  };
  const remove = (r) => {
    if (!window.confirm(`Delete the "${r.name}" role?`)) return;
    run(() => api.delete(`/staff-roles/${r.id}`), `${r.name} deleted`);
  };

  const levelSelect = (value, onChange) => (
    <select style={{ ...inputStyle, cursor: 'pointer' }} value={value} onChange={e => onChange(e.target.value)}>
      {value === '' && <option value="" disabled>Choose an access level…</option>}
      {orderedLevels.map(r => <option key={r.value} value={r.value}>{r.value === 'ADMIN' ? `${r.label} (full access)` : r.label}</option>)}
    </select>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdBadge className="mi" size={16} /> Roles</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Pick a department (e.g. Front Office), name the job title (e.g. Cashier) and choose which access level it uses
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <datalist id="staff-departments">
            {STAFF_DEPARTMENTS.map(d => <option key={d} value={d} />)}
          </datalist>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0 10px', alignItems: 'end' }}>
            <Field label="Department">
              <input style={inputStyle} list="staff-departments" placeholder="e.g. Front Office" value={department}
                onChange={e => setDepartment(e.target.value)} autoFocus />
            </Field>
            <Field label="Job Title">
              <input style={inputStyle} placeholder="e.g. Cashier" value={name}
                onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} />
            </Field>
            <Field label="Access Level" hint="same screens as">
              {levelSelect(baseRole, setBaseRole)}
            </Field>
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary" disabled={busy || !baseRole || !name.trim()} onClick={create} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MdAdd size={15} /> Add
              </button>
            </div>
          </div>

          {baseRole === 'ADMIN' && (
            <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
              {ADMIN_WARNING}
            </div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {staffRoles.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>No custom roles yet</div>
            ) : groupStaffRoles(staffRoles).map(group => (
              <div key={group.department || '_none'}>
                <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-3)', background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                  {group.department || 'No department'}
                </div>
                {group.roles.map((r, i) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderTop: i ? '1px solid var(--border)' : 'none',
              }}>
                {editing?.id === r.id ? (
                  <>
                    <input style={{ ...inputStyle, flex: 1 }} list="staff-departments" placeholder="Department" value={editing.department} onChange={e => setEditing(x => ({ ...x, department: e.target.value }))} />
                    <input style={{ ...inputStyle, flex: 1 }} placeholder="Job title" value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))} />
                    <div style={{ flex: 1 }}>{levelSelect(editing.baseRole, v => setEditing(x => ({ ...x, baseRole: v })))}</div>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveEdit}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        <span style={r.baseRole === 'ADMIN' ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{levelLabel(r.baseRole)} access</span> · {r._count?.users ?? 0} staff
                      </div>
                    </div>
                    {canEdit(r) ? (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: r.id, name: r.name, department: r.department || '', baseRole: r.baseRole })}>
                          <MdEdit className="mi" size={14} /> Edit
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => remove(r)} title="Delete role">
                          <MdDelete className="mi" size={14} />
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Admin only</span>
                    )}
                  </>
                )}
              </div>
                ))}
              </div>
            ))}
          </div>
          {editing && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
              Changing the access level moves everyone on this role to the new level.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

