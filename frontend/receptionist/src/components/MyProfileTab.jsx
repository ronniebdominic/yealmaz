import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  MdCameraAlt, MdBadge, MdCalendarToday, MdWork, MdPhone, MdEmail,
  MdVerified, MdBlock,
} from 'react-icons/md';

const EMPLOYMENT_TYPE_LABEL = {
  FULL_TIME: 'Full-Time', PART_TIME: 'Part-Time', CONTRACT: 'Contract', INTERN: 'Intern',
};

function Row({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
      <Icon size={16} color="var(--text-3)" style={{ flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{value}</div>
      </div>
    </div>
  );
}

// Read-only self-service profile (name/position/department scope/hire
// date/employment type & status/contact) — sourced from GET /employees/me
// — plus the one thing the tech CAN change themselves: their photo, via
// POST /employees/me/photo. Everything else stays HR/Admin-of-record,
// changed through HR & Payroll, not here.
export default function MyProfileTab() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', 'me'],
    queryFn: () => api.get('/employees/me').then(r => r.data),
    staleTime: 60_000,
  });

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      await api.post('/employees/me/photo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Profile photo updated');
      qc.invalidateQueries({ queryKey: ['employees', 'me'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not upload photo');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Loading…</div>;

  const profile = data?.employeeProfile;
  const initials = (data?.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const deptScope = data?.departments?.length ? data.departments.join(', ') : 'Flexible — all departments';

  return (
    <div>
      <div className="glass-card" style={{ padding: 20, textAlign: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', width: 84, height: 84, margin: '0 auto 12px' }}>
          {profile?.photoUrl ? (
            <img src={profile.photoUrl} alt="" style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.6)' }} />
          ) : (
            <div style={{
              width: 84, height: 84, borderRadius: '50%', background: 'var(--accent)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800,
              border: '3px solid rgba(255,255,255,0.6)',
            }}>{initials}</div>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Change photo" style={{
            position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%',
            background: 'var(--navy)', border: '2px solid #fff', color: '#fff', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
          }}>
            <MdCameraAlt size={13} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-1)' }}>{profile?.preferredName || data?.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{profile?.position || 'Lab Technician'}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: data?.isActive ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)', color: data?.isActive ? '#16A34A' : '#DC2626' }}>
          {data?.isActive ? <MdVerified size={12} /> : <MdBlock size={12} />} {data?.isActive ? 'Active' : 'Inactive'}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '4px 16px 6px' }}>
        <Row icon={MdBadge} label="Department Scope" value={deptScope} />
        <Row icon={MdWork} label="Employment Type" value={profile?.employmentType ? EMPLOYMENT_TYPE_LABEL[profile.employmentType] || profile.employmentType : null} />
        <Row icon={MdCalendarToday} label="Hire Date" value={profile?.hireDate ? format(new Date(profile.hireDate), 'dd MMM yyyy') : null} />
        <Row icon={MdPhone} label="Phone" value={data?.phone} />
        <Row icon={MdEmail} label="Email" value={data?.email} />
        {profile?.manager?.name && <Row icon={MdBadge} label="Manager" value={`${profile.manager.name}${profile.manager.employeeProfile?.position ? ` · ${profile.manager.employeeProfile.position}` : ''}`} />}
      </div>
    </div>
  );
}
