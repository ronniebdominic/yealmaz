// Ye-Almaz — Salary Structures (More → Salary Structures). Configurable
// components assembled into named structures, then assigned to employees.
// "Do not hard-code salary calculations."
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd, MdDelete } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const CALC_LABELS = { FIXED: 'Fixed (Br)', PERCENT_OF_BASIC: '% of Basic', PER_OVERTIME_HOUR: 'Br / OT hour', PER_UNIT: 'Br / unit' };

function ComponentForm({ onCreated }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('EARNING');
  const [calcType, setCalcType] = useState('FIXED');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.post('/salary-structures/components', { name, category, calcType, defaultAmount });
      toast.success('Component created');
      setName(''); setDefaultAmount('');
      onCreated();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create component'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 12px', padding: 16, borderBottom: '1px solid var(--border)' }}>
      <Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Housing Allowance" /></Field>
      <Field label="Category">
        <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="EARNING">Earning</option>
          <option value="DEDUCTION">Deduction</option>
        </select>
      </Field>
      <Field label="Calculation">
        <select style={inputStyle} value={calcType} onChange={e => setCalcType(e.target.value)}>
          {Object.entries(CALC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Default Amount"><input type="number" style={inputStyle} value={defaultAmount} onChange={e => setDefaultAmount(e.target.value)} /></Field>
      <div style={{ gridColumn: '1 / -1' }}>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Add Component'}</button>
      </div>
    </div>
  );
}

function StructureForm({ components, onCreated }) {
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems(it => [...it, { componentId: components[0]?.id || '', amount: '' }]);
  const setItem = (i, patch) => setItems(it => it.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeItem = (i) => setItems(it => it.filter((_, idx) => idx !== i));

  const create = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.post('/salary-structures', { name, items });
      toast.success('Structure created');
      setName(''); setItems([]);
      onCreated();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create structure'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
      <Field label="Structure Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard Lab Tech" /></Field>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <select style={{ ...inputStyle, flex: 2 }} value={it.componentId} onChange={e => setItem(i, { componentId: e.target.value })}>
            {components.map(c => <option key={c.id} value={c.id}>{c.name} ({CALC_LABELS[c.calcType]})</option>)}
          </select>
          <input type="number" style={{ ...inputStyle, flex: 1 }} placeholder={`default: ${components.find(c => c.id === it.componentId)?.defaultAmount ?? ''}`} value={it.amount} onChange={e => setItem(i, { amount: e.target.value })} />
          <button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}><MdDelete size={13} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={addItem} disabled={!components.length}><MdAdd size={13} /> Add Line</button>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Create Structure'}</button>
      </div>
    </div>
  );
}

export default function SalaryStructuresPanel({ employees }) {
  const qc = useQueryClient();
  const [showComponentForm, setShowComponentForm] = useState(false);
  const [showStructureForm, setShowStructureForm] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignStructureId, setAssignStructureId] = useState('');

  const { data: components = [] } = useQuery({ queryKey: ['hr', 'salary-components'], queryFn: () => api.get('/salary-structures/components').then(r => r.data) });
  const { data: structures = [] } = useQuery({ queryKey: ['hr', 'salary-structures'], queryFn: () => api.get('/salary-structures').then(r => r.data) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr', 'salary-components'] }); qc.invalidateQueries({ queryKey: ['hr', 'salary-structures'] }); };

  const assign = async () => {
    if (!assignUserId || !assignStructureId) { toast.error('Pick an employee and a structure'); return; }
    try {
      await api.post('/salary-structures/assign', { userId: assignUserId, structureId: assignStructureId });
      toast.success('Structure assigned');
      setAssignUserId('');
    } catch (err) { toast.error(err.response?.data?.error || 'Could not assign'); }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Salary Components</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowComponentForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> New Component</button>
        </div>
        {showComponentForm && <ComponentForm onCreated={() => { setShowComponentForm(false); refresh(); }} />}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th style={{ textAlign: 'center' }}>Category</th><th style={{ textAlign: 'center' }}>Calculation</th><th style={{ textAlign: 'center' }}>Default</th></tr></thead>
            <tbody>
              {components.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">No components yet</td></tr>
              ) : components.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ textAlign: 'center' }}><span className={`badge ${c.category === 'EARNING' ? 'badge-verified' : 'badge-rejected'}`}>{c.category}</span></td>
                  <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>{CALC_LABELS[c.calcType]}</td>
                  <td style={{ textAlign: 'center' }}>{c.defaultAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Salary Structures</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowStructureForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} disabled={!components.length}><MdAdd size={14} /> New Structure</button>
        </div>
        {showStructureForm && <StructureForm components={components} onCreated={() => { setShowStructureForm(false); refresh(); }} />}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Components</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
            <tbody>
              {structures.length === 0 ? (
                <tr><td colSpan={3} className="empty-state">No structures yet</td></tr>
              ) : structures.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.items.map(i => `${i.component.name} (${i.amount ?? i.component.defaultAmount})`).join(', ') || '—'}</td>
                  <td style={{ textAlign: 'center' }}><span className={`badge ${s.isActive ? 'badge-verified' : ''}`}>{s.isActive ? 'Active' : 'Disabled'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Assign Structure</div></div>
        <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <Field label="Employee">
              <select style={inputStyle} value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                <option value="">— Select —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ minWidth: 180 }}>
            <Field label="Structure">
              <select style={inputStyle} value={assignStructureId} onChange={e => setAssignStructureId(e.target.value)}>
                <option value="">— Select —</option>
                {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-sm" onClick={assign} style={{ marginBottom: 14 }}>Assign</button>
        </div>
      </div>
    </div>
  );
}
