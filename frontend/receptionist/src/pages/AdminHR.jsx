// Ye-Almaz — Admin's HR & Payroll view. All actual content lives in
// HRWorkspace.jsx (shared with HRDashboard.jsx, the HR Manager's own
// portal) — this file is just the AdminLayout shell.
import AdminLayout from '../components/AdminLayout';
import { MdGroups } from 'react-icons/md';
import HRWorkspace from './hr/HRWorkspace';

export default function AdminHR() {
  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MdGroups className="mi" size={18} /> HR & Payroll
        </div>
      </div>
      <div className="content">
        <HRWorkspace role="ADMIN" />
      </div>
    </AdminLayout>
  );
}
