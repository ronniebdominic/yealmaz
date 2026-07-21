import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MdMap, MdEdit, MdDelete, MdLocalHospital, MdGroup } from 'react-icons/md';

export default function AdminZones() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editZone, setEditZone] = useState(null);

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.get('/zones').then(r => r.data),
  });

  const addZone = async () => {
    if (!newName.trim()) { toast.error('Zone name is required'); return; }
    try {
      await api.post('/zones', { name: newName.trim() });
      qc.invalidateQueries({ queryKey: ['zones'] });
      setNewName('');
      toast.success('Zone added');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add zone'); }
  };

  const saveEdit = async () => {
    try {
      await api.patch(`/zones/${editZone.id}`, { name: editZone.name });
      qc.invalidateQueries({ queryKey: ['zones'] });
      setEditZone(null);
      toast.success('Zone updated');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to update'); }
  };

  const deleteZone = async (zone) => {
    if (!window.confirm(`Remove zone "${zone.name}"? Clinics and delivery partners assigned to it will just show no zone — nothing else is deleted.`)) return;
    try {
      await api.delete(`/zones/${zone.id}`);
      qc.invalidateQueries({ queryKey: ['zones'] });
      toast.success('Zone removed');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to remove'); }
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdMap className="mi" size={18} /> Zones</div>
      </div>
      <div className="content">
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, maxWidth: 640 }}>
          A zone is a collective of stations (e.g. "East Zone" covers Bole, CMC and Megenagna). Assign a zone to
          clinics and delivery partners on their respective pages — Dispatch then sees each case's zone and can
          quickly find a delivery partner covering it.
        </p>

        {/* Add new */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Add New Zone</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, maxWidth: 320 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: .5, display: 'block', marginBottom: 5 }}>ZONE NAME *</label>
              <input
                placeholder="e.g. East Zone"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addZone()}
                style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
              />
            </div>
            <button className="btn btn-primary" onClick={addZone}>+ Add Zone</button>
          </div>
        </div>

        {/* List */}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zone Name</th>
                  <th style={{ width: 140, textAlign: 'center' }}>Clinics</th>
                  <th style={{ width: 160, textAlign: 'center' }}>Delivery Partners</th>
                  <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={4} className="empty-state">Loading…</td></tr>
                ) : zones.length === 0 ? (
                  <tr><td colSpan={4} className="empty-state">No zones yet — add one above</td></tr>
                ) : zones.map(z => editZone?.id === z.id ? (
                  <tr key={z.id} style={{ background: 'rgba(21,101,192,0.04)' }}>
                    <td>
                      <input
                        value={editZone.name}
                        onChange={e => setEditZone(p => ({ ...p, name: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && saveEdit()}
                        style={{ width: '100%', border: '1.5px solid var(--blue)', borderRadius: 6, padding: '5px 8px', fontSize: 13 }}
                      />
                    </td>
                    <td />
                    <td />
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-primary btn-sm" onClick={saveEdit}>✓ Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditZone(null)} style={{ marginLeft: 6 }}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={z.id}>
                    <td style={{ fontWeight: 600 }}>{z.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>
                        <MdLocalHospital size={13} /> {z._count?.clinics ?? 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                        <MdGroup size={13} /> {z._count?.users ?? 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditZone({ id: z.id, name: z.name })}><MdEdit size={14} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4, color: 'var(--red)' }} onClick={() => deleteZone(z)}><MdDelete size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
