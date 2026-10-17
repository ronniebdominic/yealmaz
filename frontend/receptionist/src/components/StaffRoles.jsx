// Ye-Almaz — Staff roles: admin/HR-created job titles ("Front Office") on top
// of a built-in access level. Used by Admin > Users and HR > Employees.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../api';
import { Field, inputStyle } from '../utils/adminForms';
import { MdBadge, MdDelete, MdAdd, MdEdit } from 'react-icons/md';

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
  const [baseRole, setBaseRole] = useState(levels[0]?.value || 'RECEPTIONIST');
  const [editing, setEditing] = useState(null); // { id, name, baseRole }
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
    if (await run(() => api.post('/staff-roles', { name: name.trim(), baseRole }), `${name.trim()} role created`)) setName('');
  };
  const saveEdit = async () => {
    if (!editing.name.trim()) { toast.error('Role name is required'); return; }
    if (await run(() => api.patch(`/staff-roles/${editing.id}`, { name: editing.name.trim(), baseRole: editing.baseRole }), 'Role updated')) setEditing(null);
  };
  const remove = (r) => {
    if (!window.confirm(`Delete the "${r.name}" role?`)) return;
    run(() => api.delete(`/staff-roles/${r.id}`), `${r.name} deleted`);
  };

  const levelSelect = (value, onChange) => (
    <select style={{ ...inputStyle, cursor: 'pointer' }} value={value} onChange={e => onChange(e.target.value)}>
      {levels.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
    </select>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdBadge className="mi" size={16} /> Roles</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Create a role name for onboarding (e.g. Front Office) and choose which access level it uses
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0 10px', alignItems: 'end' }}>
            <Field label="Role Name">
              <input style={inputStyle} placeholder="e.g. Front Office" value={name}
                onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} autoFocus />
            </Field>
            <Field label="Access Level" hint="same screens as">
              {levelSelect(baseRole, setBaseRole)}
            </Field>
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary" disabled={busy} onClick={create} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MdAdd size={15} /> Add
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {staffRoles.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>No custom roles yet</div>
            ) : staffRoles.map((r, i) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderTop: i ? '1px solid var(--border)' : 'none',
              }}>
                {editing?.id === r.id ? (
                  <>
                    <input style={{ ...inputStyle, flex: 1 }} value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))} />
                    <div style={{ flex: 1 }}>{levelSelect(editing.baseRole, v => setEditing(x => ({ ...x, baseRole: v })))}</div>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveEdit}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {levelLabel(r.baseRole)} access · {r._count?.users ?? 0} staff
                      </div>
                    </div>
                    {canEdit(r) ? (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: r.id, name: r.name, baseRole: r.baseRole })}>
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

