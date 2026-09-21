// Ye-Almaz — Admin Clinic Management

import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import ExportMenu from '../components/ExportMenu';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generatePassword, inputStyle, labelStyle, Field, PasswordInput } from '../utils/adminForms';
import { todayLocal } from '../utils/date';
import { renderOnboardingCard, printCardImage, downloadCardImage, whatsAppUrl } from '../utils/onboardingCard';
import { printCredentialsCard } from '../utils/printCredentialsCard';
import {
  MdEdit, MdLocalHospital, MdAutoAwesome, MdVpnKey, MdCheckCircle, MdSearch,
  MdPause, MdPlayArrow, MdHandshake, MdQrCode2, MdBadge,
  MdSend, MdShare, MdDownload, MdPrint, MdContentCopy, MdMoreVert,
} from 'react-icons/md';

// ── Row action menu ───────────────────────────────────────
// The table used to render five action buttons inline per row, which forced
// a 1,385px minimum width and pushed the actions off-screen. They now live
// in a menu. It is position:fixed (measured from the button) rather than
// absolutely positioned, because the table sits in an overflow container
// that would clip an absolute popover on the last rows.
function RowMenu({ items }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return close();
    const r = btnRef.current.getBoundingClientRect();
    const menuH = items.length * 38 + 12;
    const openUp = r.bottom + menuH > window.innerHeight - 8;
    setPos({
      right: Math.max(8, window.innerWidth - r.right),
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  };

  return (
    <>
      <button ref={btnRef} className="btn btn-ghost btn-sm" onClick={toggle} title="More actions" aria-haspopup="menu" aria-expanded={!!pos} style={{ padding: '4px 6px' }}>
        <MdMoreVert size={17} />
      </button>
      {pos && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
          <div role="menu" style={{
            position: 'fixed', right: pos.right, top: pos.top, bottom: pos.bottom, zIndex: 1000, minWidth: 190,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: 6,
          }}>
            {items.map(it => (
              <button key={it.label} role="menuitem" disabled={it.disabled} title={it.title}
                onClick={() => { close(); it.onClick(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none', borderRadius: 6, padding: '8px 10px',
                  fontSize: 13, fontWeight: 600, color: it.color || 'var(--text-1)',
                  cursor: it.disabled ? 'not-allowed' : 'pointer', opacity: it.disabled ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {it.icon} {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

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
  name: '', code: '', station: '', zoneId: '', email: '',
  phone: '', address: '', password: '', isExcluded: false,
};

// ── Create / Edit Form Modal ───────────────────────────────
function ClinicFormModal({ initial, onSaved, onClose }) {
  const isEdit = !!initial?.id;
  const [form,    setForm]    = useState(initial ? {
    name:       initial.name       || '',
    code:       initial.code       || '',
    station:    initial.station    || '',
    zoneId:     initial.zoneId     || '',
    email:      initial.email      || '',
    phone:      initial.phone      || '',
    address:    initial.address    || '',
    password:   '',
    isExcluded: initial.isExcluded ?? false,
  } : { ...EMPTY_FORM });
  const [showPass,           setShowPass]           = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [saving,             setSaving]             = useState(false);

  const { data: zones = [] } = useQuery({
    queryKey: ['zones'],
    queryFn: () => api.get('/zones').then(r => r.data),
    staleTime: 60_000,
  });

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
        zoneId:     form.zoneId || '',
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
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{isEdit ? <><MdEdit className="mi" size={16} /> Edit Clinic</> : <><MdLocalHospital className="mi" size={16} /> New Clinic</>}</div>
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
              background: 'var(--blue-dim, var(--brand-tint))', border: '1px solid rgba(29,78,216,0.15)',
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
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <MdAutoAwesome size={13} /> Auto-fill
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

            <Field label="Zone" hint="optional — collective of stations">
              <select style={inputStyle} value={form.zoneId} onChange={e => set('zoneId', e.target.value)}>
                <option value="">— No zone —</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
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
                    <MdVpnKey size={14} /> Change Password
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
            <div className="modal-title" style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}><MdCheckCircle className="mi" size={16} /> Clinic Created</div>
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

// ── Onboarding Card (preview + print / download / WhatsApp) ─
function OnboardingCardModal({ card, onClose }) {
  const [img, setImg] = useState(null);

  useEffect(() => {
    let alive = true;
    renderOnboardingCard(card).then(d => alive && setImg(d)).catch(() => toast.error('Could not render the card'));
    return () => { alive = false; };
  }, [card]);

  const copyLink = () => navigator.clipboard.writeText(card.url).then(() => toast.success('Link copied'));

  const shareImage = async () => {
    try {
      const blob = await (await fetch(img)).blob();
      const file = new File([blob], `yealmaz-onboarding.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `Complete your Ye-Almaz clinic setup: ${card.url}` });
      } else {
        downloadCardImage(img, card.clinic.name);
        toast('Image downloaded — attach it in WhatsApp', { icon: '📎' });
      }
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share the image');
    }
  };

  const btn = (bg, color, border) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: bg, color, border: `1px solid ${border}`, borderRadius: 8,
    padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: img ? 'pointer' : 'not-allowed',
    opacity: img ? 1 : 0.5,
  });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MdQrCode2 className="mi" size={16} /> Onboarding Card — {card.clinic.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Print it, or send the image + link on WhatsApp. The link works once and expires in 14 days.
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto', width: 260, maxWidth: '100%' }}>
            {img
              ? <img src={img} alt="Onboarding card" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', display: 'block' }} />
              : <div style={{ aspectRatio: '1080 / 1527', borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>Rendering…</div>}
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button disabled={!img} onClick={() => whatsAppOpen()} style={btn('#16A34A', '#fff', '#16A34A')}>
              <MdSend size={16} /> Send on WhatsApp{card.clinic.phone ? ` (${card.clinic.phone})` : ''}
            </button>
            <button disabled={!img} onClick={shareImage} style={btn('var(--surface-2)', 'var(--text-1)', 'var(--border)')}>
              <MdShare size={16} /> Share image
            </button>
            <button disabled={!img} onClick={() => downloadCardImage(img, card.clinic.name)} style={btn('var(--surface-2)', 'var(--text-1)', 'var(--border)')}>
              <MdDownload size={16} /> Download image
            </button>
            <button disabled={!img} onClick={() => printCardImage(img, card.clinic.name)} style={btn('var(--surface-2)', 'var(--text-1)', 'var(--border)')}>
              <MdPrint size={16} /> Print (A5)
            </button>
            <button onClick={copyLink} style={btn('var(--surface-2)', 'var(--text-1)', 'var(--border)')}>
              <MdContentCopy size={16} /> Copy link
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 4 }}>
              WhatsApp opens a chat with the message and link ready. To include the card, tap the paperclip and attach the downloaded image, or use “Share image” on a phone.
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function whatsAppOpen() {
    window.open(whatsAppUrl({ phone: card.clinic.phone, clinicName: card.clinic.name, url: card.url, expiresAt: card.expiresAt }), '_blank', 'noopener');
  }
}

// ── Main Page ─────────────────────────────────────────────
export default function AdminClinics() {
  const queryClient = useQueryClient();
  const [showForm,   setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [newCreds,   setNewCreds]   = useState(null); // { clinic, password }
  const [onboardCard, setOnboardCard] = useState(null); // { clinic, url, qrCodeUrl, expiresAt }
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
    (c.station|| '').toLowerCase().includes(search.toLowerCase()) ||
    (c.zone?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const [generatingQr,   setGeneratingQr]   = useState(null); // clinic id currently generating
  const [generatingCard, setGeneratingCard] = useState(null); // clinic id currently generating

  const printOnboardingQr = async (clinic) => {
    setGeneratingQr(clinic.id);
    try {
      const { data } = await api.post(`/clinics/${clinic.id}/onboarding-link`);
      setOnboardCard({ clinic: { ...data.clinic, phone: clinic.phone }, url: data.url, qrCodeUrl: data.qrCodeUrl, expiresAt: data.expiresAt });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not generate onboarding QR');
    } finally {
      setGeneratingQr(null);
    }
  };

  const printCredCard = async (clinic) => {
    if (!clinic.email) { toast.error('Add an email for this clinic first'); return; }
    if (!window.confirm(`This resets ${clinic.name}'s password to a new one and prints it on a card. Continue?`)) return;
    setGeneratingCard(clinic.id);
    try {
      const { data } = await api.post(`/clinics/${clinic.id}/credentials-card`);
      printCredentialsCard({ clinic: data.clinic, password: data.password, qrCodeUrl: data.qrCodeUrl });
      toast.success(`New password printed for ${clinic.name}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'clinics', 'all'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not generate credentials card');
    } finally {
      setGeneratingCard(null);
    }
  };

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ExportMenu
            data={filtered}
            columns={[
              { header: 'Clinic Name',      value: c => c.name },
              { header: 'Code',             value: c => c.code || '' },
              { header: 'Station',          value: c => c.station || '' },
              { header: 'Zone',             value: c => c.zone?.name || '' },
              { header: 'Email',            value: c => c.email || '' },
              { header: 'Phone',            value: c => c.phone || '' },
              { header: 'Address',          value: c => c.address || '' },
              { header: 'Trusted Partner',  value: c => c.isExcluded ? 'Yes' : 'No' },
              { header: 'Status',           value: c => c.isActive ? 'Active' : 'Inactive' },
              { header: 'Added',            value: c => c.createdAt ? format(new Date(c.createdAt), 'dd MMM yyyy') : '' },
            ]}
            filename={`clinics_${todayLocal()}`}
            title="Clinics"
          />
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
      </div>

      <div className="content">
        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <div className="search-input">
            <span className="icon mi"><MdSearch size={16} /></span>
            <input
              placeholder="Search by name, code, email or station…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading clinics…</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon mi"><MdLocalHospital size={32} /></div>
                <div className="empty-title">No clinics found</div>
                <p>{search ? 'Try a different search term' : 'Create the first clinic using the button above'}</p>
              </div>
            ) : (
              <table style={{ tableLayout: 'fixed', width: '100%', minWidth: 980 }}>
                <colgroup>
                  {/* Sums to exactly 100% so the table fills — and never exceeds — its
                      container. (A mix of % and px columns overflows by the px amount.) */}
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Clinic</th>
                    <th>Station</th>
                    <th>Zone</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Partner</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
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
                            {c.code && (
                              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{c.code}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.station || '—'}</td>
                      <td style={{ padding: '8px 16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.zone?.name
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(21,101,192,0.1)', color: 'var(--blue)' }}>{c.zone.name}</span>
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.email || ''}>{c.email || '—'}</td>
                      <td style={{ padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '8px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: c.isExcluded ? 'rgba(29,78,216,0.1)' : 'var(--surface-2)',
                          color: c.isExcluded ? 'var(--blue)' : 'var(--text-3)',
                          border: `1px solid ${c.isExcluded ? 'rgba(29,78,216,0.25)' : 'var(--border)'}`,
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
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'nowrap' }} title="Date added">
                          {format(new Date(c.createdAt), 'dd MMM yyyy')}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <button className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setEditTarget(c)}>
                            <MdEdit className="mi" size={14} /> Edit
                          </button>
                          <RowMenu items={[
                            {
                              label: generatingQr === c.id ? 'Generating…' : 'Setup QR',
                              icon: <MdQrCode2 size={15} />, color: 'var(--blue)', disabled: generatingQr === c.id,
                              title: 'Print an onboarding form + QR for this clinic to fill in their details and set their own password',
                              onClick: () => printOnboardingQr(c),
                            },
                            {
                              label: generatingCard === c.id ? 'Generating…' : 'Login Card',
                              icon: <MdBadge size={15} />, color: '#A855F7', disabled: generatingCard === c.id,
                              title: "Reset this clinic's password and print a business-card-sized QR + credentials",
                              onClick: () => printCredCard(c),
                            },
                            {
                              label: c.isExcluded ? 'Remove Partner' : 'Mark Partner',
                              icon: c.isExcluded ? null : <MdHandshake size={15} />,
                              color: c.isExcluded ? 'var(--red)' : 'var(--blue)',
                              onClick: () => {
                                api.patch(`/clinics/${c.id}`, { isExcluded: !c.isExcluded })
                                  .then(() => {
                                    toast.success(`${c.name} ${c.isExcluded ? 'removed from partners' : 'marked as trusted partner'}`);
                                    queryClient.invalidateQueries({ queryKey: ['admin', 'clinics', 'all'] });
                                  })
                                  .catch(() => toast.error('Update failed'));
                              },
                            },
                            {
                              label: c.isActive ? 'Deactivate' : 'Activate',
                              icon: c.isActive ? <MdPause size={15} /> : <MdPlayArrow size={15} />,
                              color: c.isActive ? 'var(--red)' : 'var(--green)',
                              onClick: () => {
                                api.patch(`/clinics/${c.id}`, { isActive: !c.isActive })
                                  .then(() => {
                                    toast.success(`${c.name} ${c.isActive ? 'deactivated' : 'activated'}`);
                                    queryClient.invalidateQueries({ queryKey: ['admin', 'clinics', 'all'] });
                                    queryClient.invalidateQueries({ queryKey: ['clinics'] });
                                  })
                                  .catch(() => toast.error('Update failed'));
                              },
                            },
                          ]} />
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

      {/* Onboarding card preview */}
      {onboardCard && <OnboardingCardModal card={onboardCard} onClose={() => setOnboardCard(null)} />}

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
