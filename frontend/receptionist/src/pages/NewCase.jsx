import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function NewCase() {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    clinicId: '', patientName: '', patientAge: '',
    workType: '', toothNumbers: '', shade: '',
    notes: '', dueDate: '', totalAmount: ''
  });

  useEffect(() => {
    // Load clinics for dropdown
    api.get('/cases?limit=1').catch(() => {}); // warm up
    // We'll load clinics via a simple approach
    loadClinics();
  }, []);

  const loadClinics = async () => {
    try {
      // Get unique clinics from recent cases
      const res = await api.get('/cases?limit=100');
      const unique = {};
      res.data.cases.forEach(c => { if (c.clinic) unique[c.clinic.id] = c.clinic; });
      setClinics(Object.values(unique));
    } catch {}
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clinicId) return toast.error('Please select a clinic');
    if (!form.patientName) return toast.error('Patient name is required');
    if (!form.workType) return toast.error('Work type is required');

    setSubmitting(true);
    try {
      const res = await api.post('/cases', form);
      toast.success(`Case ${res.data.caseNumber} created!`);
      navigate('/cases');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create case');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="topbar">
        <div className="topbar-title">New Case</div>
      </div>

      <div className="content">
        <div className="card" style={{ maxWidth: '640px' }}>
          <div className="card-header">
            <div className="card-title">Create a New Lab Case</div>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Clinic *</label>
                <select value={form.clinicId} onChange={set('clinicId')} required>
                  <option value="">— Select clinic —</option>
                  {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                  New clinic? Ask them to register via the clinic app first.
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Patient Name *</label>
                  <input placeholder="e.g. Ahmed Al-Rashid" value={form.patientName} onChange={set('patientName')} required />
                </div>
                <div className="form-group">
                  <label>Patient Age</label>
                  <input type="number" placeholder="e.g. 34" value={form.patientAge} onChange={set('patientAge')} />
                </div>
              </div>

              <div className="form-group">
                <label>Work Type *</label>
                <select value={form.workType} onChange={set('workType')} required>
                  <option value="">— Select work type —</option>
                  <option>PFM Crown</option>
                  <option>Zirconia Crown</option>
                  <option>Full Denture</option>
                  <option>Partial Denture</option>
                  <option>Bridge</option>
                  <option>Veneer</option>
                  <option>Inlay / Onlay</option>
                  <option>Clear Aligner</option>
                  <option>Night Guard</option>
                  <option>Implant Crown</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Tooth Numbers</label>
                  <input placeholder="e.g. 14, 15, 16" value={form.toothNumbers} onChange={set('toothNumbers')} />
                </div>
                <div className="form-group">
                  <label>Shade</label>
                  <input placeholder="e.g. A2, B1" value={form.shade} onChange={set('shade')} />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" value={form.dueDate} onChange={set('dueDate')} />
                </div>
                <div className="form-group">
                  <label>Amount (₹)</label>
                  <input type="number" placeholder="e.g. 2500" value={form.totalAmount} onChange={set('totalAmount')} />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea rows={3} placeholder="Special instructions, preferences…" value={form.notes} onChange={set('notes')} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : '+ Create Case & Generate QR'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => navigate('/cases')}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
