// Ye-Almaz — Skills Matrix (More → Skills)
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const LEVEL_COLOR = { BEGINNER: '', INTERMEDIATE: '', EXPERT: 'badge-verified' };

export default function SkillsPanel({ employees }) {
  const qc = useQueryClient();
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [userId, setUserId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [level, setLevel] = useState('BEGINNER');
  const [saving, setSaving] = useState(false);

  const { data: skills = [] } = useQuery({ queryKey: ['hr', 'skills'], queryFn: () => api.get('/skills').then(r => r.data) });
  const { data: matrix = [] } = useQuery({ queryKey: ['hr', 'skills-matrix'], queryFn: () => api.get('/skills/matrix').then(r => r.data) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr', 'skills'] }); qc.invalidateQueries({ queryKey: ['hr', 'skills-matrix'] }); };

  const createSkill = async () => {
    if (!newSkillName.trim()) return;
    try {
      await api.post('/skills', { name: newSkillName });
      toast.success('Skill added');
      setNewSkillName(''); setShowSkillForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add skill'); }
  };

  const assess = async () => {
    if (!userId || !skillId) { toast.error('Pick an employee and a skill'); return; }
    setSaving(true);
    try {
      await api.post('/skills/matrix', { userId, skillId, level });
      toast.success('Assessment recorded');
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not record assessment'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Skills</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSkillForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> New Skill</button>
        </div>
        {showSkillForm && (
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><Field label="Name"><input style={inputStyle} value={newSkillName} onChange={e => setNewSkillName(e.target.value)} placeholder="e.g. CAD Design" /></Field></div>
            <button className="btn btn-primary btn-sm" onClick={createSkill} style={{ marginBottom: 14 }}>Add</button>
          </div>
        )}
        <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {skills.length === 0 ? <span style={{ color: 'var(--text-3)', fontSize: 13 }}>No skills defined yet</span> :
            skills.map(s => <span key={s.id} className="badge">{s.name}</span>)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">Record Assessment</div></div>
        <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 160 }}>
            <Field label="Employee">
              <select style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">— Select —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ minWidth: 160 }}>
            <Field label="Skill">
              <select style={inputStyle} value={skillId} onChange={e => setSkillId(e.target.value)}>
                <option value="">— Select —</option>
                {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <Field label="Level">
              <select style={inputStyle} value={level} onChange={e => setLevel(e.target.value)}>
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="EXPERT">Expert</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-sm" onClick={assess} disabled={saving} style={{ marginBottom: 14 }}>Save</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Skills Matrix</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Skill</th><th style={{ textAlign: 'center' }}>Level</th><th>Assessed</th></tr></thead>
            <tbody>
              {matrix.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">No assessments yet</td></tr>
              ) : matrix.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.user?.name}</td>
                  <td>{m.skill?.name}</td>
                  <td style={{ textAlign: 'center' }}><span className={`badge ${LEVEL_COLOR[m.level]}`}>{m.level}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.assessedBy?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
