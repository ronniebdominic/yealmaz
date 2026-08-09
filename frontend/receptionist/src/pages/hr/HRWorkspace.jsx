// Ye-Almaz — HR & Payroll workspace: the ONE shared implementation used by
// both AdminHR.jsx (wrapped in AdminLayout) and HRDashboard.jsx (the HR
// Manager's own portal, own header chrome). Built once in the shared
// light/blue glass design system instead of two divergent UIs.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  MdGroups, MdAccessTime, MdEventBusy, MdPaid, MdMoreHoriz, MdAdd, MdClose,
  MdSchedule, MdTimer, MdEventNote, MdCalendarMonth,
  MdAccountBalanceWallet, MdEmojiEvents, MdCreditCard, MdReceiptLong, MdAssessment,
  MdPsychology, MdSchool, MdFolder, MdInventory, MdFlag,
} from 'react-icons/md';
import { Field, inputStyle, generatePassword, PasswordInput } from '../../utils/adminForms';

import EmployeesTab from './tabs/EmployeesTab';
import AttendanceTab from './tabs/AttendanceTab';
import LeaveTab from './tabs/LeaveTab';
import PayrollRunsTab from './tabs/PayrollRunsTab';
import EmployeeProfileModal from './EmployeeProfileModal';
import ClockEventModal from './components/ClockEventModal';
import LeaveModal from './components/LeaveModal';
import ShiftsPanel from './more/ShiftsPanel';
import TimesheetsPanel from './more/TimesheetsPanel';
import OvertimePanel from './more/OvertimePanel';
import HolidaysPanel from './more/HolidaysPanel';
import SalaryStructuresPanel from './more/SalaryStructuresPanel';
import IncentivesPanel from './more/IncentivesPanel';
import AdvancesPanel from './more/AdvancesPanel';
import ExpensesPanel from './more/ExpensesPanel';
import ReportsPanel from './more/ReportsPanel';
import SkillsPanel from './more/SkillsPanel';
import TrainingPanel from './more/TrainingPanel';
import DocumentsPanel from './more/DocumentsPanel';
import AssetsPanel from './more/AssetsPanel';
import GoalsPanel from './more/GoalsPanel';

const MAIN_TABS = [
  { label: 'Employees', icon: MdGroups },
  { label: 'Attendance', icon: MdAccessTime },
  { label: 'Leave', icon: MdEventBusy },
  { label: 'Payroll Runs', icon: MdPaid },
];
const MORE_TABS = [
  { label: 'Timesheets', icon: MdSchedule },
  { label: 'Overtime', icon: MdTimer },
  { label: 'Shifts', icon: MdEventNote },
  { label: 'Holidays', icon: MdCalendarMonth },
  { label: 'Salary Structures', icon: MdAccountBalanceWallet },
  { label: 'Incentives', icon: MdEmojiEvents },
  { label: 'Advances', icon: MdCreditCard },
  { label: 'Expenses', icon: MdReceiptLong },
  { label: 'Reports', icon: MdAssessment },
  { label: 'Goals', icon: MdFlag },
  { label: 'Skills', icon: MdPsychology },
  { label: 'Training', icon: MdSchool },
  { label: 'Documents', icon: MdFolder },
  { label: 'Assets', icon: MdInventory },
];

// ── Add Employee — a quick account-create (name/email/role/password),
// then hands off to the full Employee Profile editor for everything else.
// Full password-reset/management still lives in Admin > Users; this is
// just enough to get a new hire into the HR roster.
function AddEmployeeModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('LAB_TECH');
  const [password, setPassword] = useState(() => generatePassword());
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim()) { toast.error('Name and email are required'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/users', { name, email, password, role });
      toast.success(`${data.name} added — email ${email}, password ${password}`, { duration: 8000 });
      onCreated(data);
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create employee'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">Add Employee</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Field label="Full Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
          <Field label="Email"><input type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Role">
            <select style={inputStyle} value={role} onChange={e => setRole(e.target.value)}>
              <option value="LAB_TECH">Lab Technician</option>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="DELIVERY">Delivery</option>
              <option value="DISPATCH">Dispatch</option>
              <option value="FINANCE">Finance</option>
              <option value="INVENTORY_MANAGER">Inventory Manager</option>
              <option value="HR_MANAGER">HR Manager</option>
            </select>
          </Field>
          <Field label="Password">
            <PasswordInput value={password} onChange={setPassword} showPass={showPass}
              onToggleShow={() => setShowPass(s => !s)} onRegenerate={() => setPassword(generatePassword())} />
          </Field>
          <button className="btn btn-primary" onClick={submit} disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Creating…' : '✓ Create & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HRWorkspace({ role = 'ADMIN' }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('Employees');
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showClockEvent, setShowClockEvent] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['hr', 'employees'],
    queryFn: () => api.get('/employees').then(r => r.data),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['hr'] });
  const isMore = MORE_TABS.some(t => t.label === tab);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {MAIN_TABS.map(t => (
          <button key={t.label} className={`filter-chip ${tab === t.label ? 'active' : ''}`}
            onClick={() => { setTab(t.label); setMoreOpen(false); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
        <div style={{ position: 'relative' }}>
          <button className={`filter-chip ${isMore ? 'active' : ''}`} onClick={() => setMoreOpen(o => !o)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MdMoreHoriz size={14} /> {isMore ? tab : 'More'}
          </button>
          {moreOpen && (
            <div className="card" style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, minWidth: 180, padding: 6 }}>
              {MORE_TABS.map(t => (
                <button key={t.label} className="btn btn-ghost btn-sm" onClick={() => { setTab(t.label); setMoreOpen(false); }}
                  style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === 'Employees' && (
        <EmployeesTab
          employees={employees}
          onSelectEmployee={e => setSelectedEmployeeId(e.id)}
          onAddEmployee={() => setShowAddEmployee(true)}
          refresh={refresh}
        />
      )}
      {tab === 'Attendance' && <AttendanceTab employees={employees} onOpenClockEvent={() => setShowClockEvent(true)} />}
      {tab === 'Leave' && <LeaveTab employees={employees} onOpenLeaveModal={() => setShowLeave(true)} />}
      {tab === 'Payroll Runs' && <PayrollRunsTab canManage={role === 'HR_MANAGER' || role === 'ADMIN'} />}
      {tab === 'Timesheets' && <TimesheetsPanel employees={employees} />}
      {tab === 'Overtime' && <OvertimePanel />}
      {tab === 'Shifts' && <ShiftsPanel employees={employees} />}
      {tab === 'Holidays' && <HolidaysPanel />}
      {tab === 'Salary Structures' && <SalaryStructuresPanel employees={employees} />}
      {tab === 'Incentives' && <IncentivesPanel />}
      {tab === 'Advances' && <AdvancesPanel employees={employees} />}
      {tab === 'Expenses' && <ExpensesPanel employees={employees} />}
      {tab === 'Reports' && <ReportsPanel />}
      {tab === 'Goals' && <GoalsPanel employees={employees} />}
      {tab === 'Skills' && <SkillsPanel employees={employees} />}
      {tab === 'Training' && <TrainingPanel employees={employees} />}
      {tab === 'Documents' && <DocumentsPanel employees={employees} />}
      {tab === 'Assets' && <AssetsPanel employees={employees} />}

      {selectedEmployeeId && (
        <EmployeeProfileModal employeeId={selectedEmployeeId} employees={employees}
          onClose={() => setSelectedEmployeeId(null)} refresh={refresh} />
      )}
      {showAddEmployee && (
        <AddEmployeeModal onClose={() => setShowAddEmployee(false)}
          onCreated={(user) => { setShowAddEmployee(false); refresh(); setSelectedEmployeeId(user.id); }} />
      )}
      {showClockEvent && (
        <ClockEventModal employees={employees} onClose={() => setShowClockEvent(false)}
          onSaved={() => { setShowClockEvent(false); refresh(); }} />
      )}
      {showLeave && (
        <LeaveModal employees={employees} onClose={() => setShowLeave(false)}
          onSaved={() => { setShowLeave(false); refresh(); }} />
      )}
    </div>
  );
}
