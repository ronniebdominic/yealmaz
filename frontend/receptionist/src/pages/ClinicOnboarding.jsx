// Ye-Almaz — Public clinic self-onboarding page.
// Reached by scanning the QR/link an admin prints from AdminClinics ("Onboarding
// QR" action). No login required — the token in the URL is the credential.
// Deliberately outside ProtectedRoute, same pattern as /kiosk in App.jsx.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { inputStyle, labelStyle, Field, PasswordInput, generatePassword } from '../utils/adminForms';

const CLINIC_APP_URL = import.meta.env.VITE_CLINIC_APP_URL || 'https://yealmazdentallab.odontofusion.com';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const EMPTY_FORM = { name: '', station: '', zone: '', email: '', phone: '', address: '', password: '', confirm: '' };

// Clinic name, station and zone are set by Ye-Almaz and shown read-only below —
// they drive case routing, so the intake form must not let a clinic change
// them (the backend ignores these three even if sent; see routes/clinics.js).
const readOnlyRowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
  padding: '9px 12px', borderRadius: 8, background: '#F4F7FB', border: '1px solid #E2E8F0',
  marginBottom: 10, fontSize: 13,
};
function ReadOnlyField({ label, value }) {
  return (
    <div style={readOnlyRowStyle}>
      <span style={{ color: '#6B7280', fontWeight: 600 }}>{label}</span>
      <span style={{ color: '#1F2937', fontWeight: 700, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}

export default function ClinicOnboarding() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/clinics/onboarding/${token}`)
      .then(({ data }) => {
        setForm(f => ({
          ...f,
          name:    data.name    || '',
          station: data.station || '',
          zone:    data.zone    || '',
          email:   data.email   || '',
          phone:   data.phone   || '',
          address: data.address || '',
        }));
      })
      .catch(err => setError(err.response?.data?.error || 'Could not load this onboarding link.'))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (form.password !== form.confirm) { toast.error('Passwords do not match'); return; }

    setSubmitting(true);
    try {
      // name/station/zone are fixed by Ye-Almaz and not sent — see ReadOnlyField above.
      await axios.post(`${API_URL}/clinics/onboarding/${token}`, {
        email: form.email, phone: form.phone, address: form.address, password: form.password,
      });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not complete onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F4F7FF', padding: 20, fontFamily: 'Manrope, sans-serif',
    }}>
      <Toaster position="top-center" />
      <div style={{
        width: '100%', maxWidth: 460, background: '#fff', borderRadius: 14,
        border: '1px solid #E2E8F0', padding: 28, boxShadow: '0 10px 30px rgba(26,86,160,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', marginBottom: 10 }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A56A0' }}>Welcome to Ye-Almaz</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Complete your clinic account setup</div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#6B7280', fontSize: 13 }}>Loading…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#B91C1C', fontSize: 13, fontWeight: 600 }}>{error}</div>
        ) : done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 6 }}>You're all set!</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 18 }}>
              Your clinic details are saved and your password is set. Log in to the Ye-Almaz clinic app with your email and new password.
            </div>
            <a href={CLINIC_APP_URL} style={{
              display: 'inline-block', background: '#1A56A0', color: '#fff', textDecoration: 'none',
              borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700,
            }}>
              Open the Clinic App
            </a>
          </div>
        ) : (
          <form onSubmit={submit}>
            <ReadOnlyField label="Clinic Name" value={form.name} />
            <ReadOnlyField label="Station / Area" value={form.station} />
            <ReadOnlyField label="Zone" value={form.zone} />
            <div style={{ fontSize: 11.5, color: '#9CA3AF', margin: '-2px 0 14px' }}>
              Set by Ye-Almaz — contact us if any of these need to change.
            </div>

            <Field label="Email" hint="used to log in">
              <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} autoFocus />
            </Field>
            <Field label="Phone" hint="optional">
              <input style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="Address" hint="optional">
              <input style={inputStyle} value={form.address} onChange={e => set('address', e.target.value)} />
            </Field>

            <div style={{ borderTop: '1px solid #E2E8F0', margin: '6px 0 16px', paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                Set Your Password
              </div>
            </div>

            <Field label="Password" hint="min 8 characters">
              <PasswordInput
                value={form.password}
                onChange={v => set('password', v)}
                showPass={showPass}
                onToggleShow={() => setShowPass(s => !s)}
                onRegenerate={() => set('password', generatePassword())}
              />
            </Field>
            <div style={{ marginBottom: 4 }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                style={inputStyle}
                type={showPass ? 'text' : 'password'}
                value={form.confirm}
                onChange={e => set('confirm', e.target.value)}
              />
            </div>

            <button
              type="submit" disabled={submitting}
              style={{
                width: '100%', marginTop: 18, background: submitting ? '#CBD5E0' : '#1A56A0',
                color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14,
                fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Saving…' : 'Complete Setup'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
