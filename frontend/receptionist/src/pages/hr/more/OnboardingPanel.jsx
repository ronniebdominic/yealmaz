// Ye-Almaz — Onboarding (More → Onboarding). Per-employee customizable
// checklist, seeded from a default template on first load.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd, MdDelete } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function OnboardingPanel({ employees }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [newTask, setNewTask] = useState('');

  const { data: tasks = [] } = useQuery({
    queryKey: ['hr', 'onboarding', userId],
    queryFn: () => api.get(`/onboarding/${userId}`).then(r => r.data),
    enabled: !!userId,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'onboarding', userId] });

  const toggle = async (task) => {
    try { await api.patch(`/onboarding/tasks/${task.id}`, { isDone: !task.isDone }); refresh(); }
    catch { toast.error('Could not update task'); }
  };
  const addTask = async () => {
    if (!newTask.trim()) return;
    try { await api.post(`/onboarding/${userId}/tasks`, { label: newTask }); setNewTask(''); refresh(); }
    catch { toast.error('Could not add task'); }
  };
  const removeTask = async (id) => {
    try { await api.delete(`/onboarding/tasks/${id}`); refresh(); }
    catch { toast.error('Could not remove task'); }
  };

  const done = tasks.filter(t => t.isDone).length;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Onboarding Checklist</div>
        <div style={{ minWidth: 200 }}>
          <select style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">— Select employee —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>
      {!userId ? (
        <div className="empty-state">Select an employee to see their onboarding checklist</div>
      ) : (
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>{done} of {tasks.length} complete</div>
          {tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" checked={t.isDone} onChange={() => toggle(t)} style={{ width: 16, height: 16 }} />
              <span style={{ flex: 1, fontSize: 13, textDecoration: t.isDone ? 'line-through' : 'none', color: t.isDone ? 'var(--text-3)' : 'var(--text-1)' }}>{t.label}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => removeTask(t.id)}><MdDelete size={13} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input style={inputStyle} value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a custom task…" />
            <button className="btn btn-primary btn-sm" onClick={addTask}><MdAdd size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
