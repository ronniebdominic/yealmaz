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
  MdDashboard, MdChecklist, MdPersonRemove, MdPersonSearch,
} from 'react-icons/md';
import { Field, inputStyle, generatePassword, PasswordInput } from '../../utils/adminForms';
import ErrorBoundary from '../../components/ErrorBoundary';

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
import OnboardingPanel from './more/OnboardingPanel';
import OffboardingPanel from './more/OffboardingPanel';
import RecruitmentPanel from './more/RecruitmentPanel';
import HRAnalyticsTab from './tabs/HRAnalyticsTab';

const MAIN_TABS = [
  { label: 'Dashboard', icon: MdDashboard },
  { label: 'Employees', icon: MdGroups },
  { label: 'Attendance', icon: MdAccessTime },
  { label: 'Leave', icon: MdEventBusy },
  { label: 'Payroll Runs', icon: MdPaid },
];
// Same 17 destinations as before, just grouped so the "More" menu reads as
// sections instead of one tall stack. Grouping is presentational only —
// selecting any item still sets `tab` to its exact label.
const MORE_GROUPS = [
  { title: 'Time & Attendance', items: [
    { label: 'Timesheets', icon: MdSchedule },
    { label: 'Overtime', icon: MdTimer },
    { label: 'Shifts', icon: MdEventNote },
    { label: 'Holidays', icon: MdCalendarMonth },
  ] },
  { title: 'Compensation', items: [
    { label: 'Salary Structures', icon: MdAccountBalanceWallet },
    { label: 'Incentives', icon: MdEmojiEvents },
    { label: 'Advances', icon: MdCreditCard },
    { label: 'Expenses', icon: MdReceiptLong },
  ] },
  { title: 'Development', items: [
    { label: 'Goals', icon: MdFlag },
    { label: 'Skills', icon: MdPsychology },
    { label: 'Training', icon: MdSchool },
  ] },
  { title: 'Records', items: [
    { label: 'Documents', icon: MdFolder },
    { label: 'Assets', icon: MdInventory },
    { label: 'Reports', icon: MdAssessment },
  ] },
  { title: 'Lifecycle', items: [
    { label: 'Onboarding', icon: MdChecklist },
    { label: 'Offboarding', icon: MdPersonRemove },
    { label: 'Recruitment', icon: MdPersonSearch },
  ] },
];
const MORE_TABS = MORE_GROUPS.flatMap(g => g.items);

function HRWorkspaceStyles() {
  return (
    <style>{`
      .hrw-nav{display:flex;gap:2px;border-bottom:1px solid var(--border);
        margin-bottom:20px;overflow-x:auto;scrollbar-width:none}
      .hrw-nav::-webkit-scrollbar{display:none}
      .hrw-tab{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;
        padding:10px 14px;border:none;background:none;cursor:pointer;
        font:inherit;font-size:13px;font-weight:550;color:var(--text-3);
        border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;
        transition:color var(--t) var(--ease-in-out),border-color var(--t) var(--ease-in-out),background var(--t) var(--ease)}
      .hrw-tab:hover{color:var(--text-2)}
      .hrw-tab[data-on="true"]{color:var(--text-1);border-bottom-color:var(--brand)}
      .hrw-tab .mi{transition:transform var(--t) var(--ease)}
      .hrw-tab[data-on="true"] .mi{transform:scale(1.05)}

      .hrw-more-wrap{position:relative;flex-shrink:0}
      .hrw-more-scrim{position:fixed;inset:0;z-index:19}
      .hrw-more{position:absolute;top:calc(100% + 6px);right:0;z-index:20;
        width:min(92vw,460px);max-height:min(70vh,520px);overflow-y:auto;
        display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px;
        padding:14px;border-radius:var(--radius-lg);
        background:var(--surface);border:1px solid var(--border);
        box-shadow:var(--shadow-lg);animation:fadeInScale var(--t-slow) var(--ease-out)}
      @media (max-width:520px){.hrw-more{grid-template-columns:1fr}}
      .hrw-more-group{break-inside:avoid;margin-bottom:6px}
      .hrw-more-h{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
        color:var(--text-4);padding:6px 8px 4px}
      .hrw-more-item{display:flex;align-items:center;gap:9px;width:100%;
        padding:8px;border:none;background:none;cursor:pointer;border-radius:var(--radius-sm);
        font:inherit;font-size:12.5px;font-weight:500;color:var(--text-2);text-align:left;
        transition:background var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
      .hrw-more-item:hover{background:var(--surface-2);color:var(--text-1)}
      .hrw-more-item[data-on="true"]{background:var(--brand-tint);color:var(--brand-soft)}
      .hrw-more-item .mi{color:var(--text-4)}
      .hrw-more-item[data-on="true"] .mi{color:var(--brand)}
      .hrw-body{animation:fadeInUp var(--t-slow) var(--ease-out) both}
    `}</style>
  );
}

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
  const [tab, setTab] = useState('Dashboard');
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
      <HRWorkspaceStyles />
      <nav className="hrw-nav">
        {MAIN_TABS.map(t => (
          <button key={t.label} className="hrw-tab" data-on={tab === t.label}
            onClick={() => { setTab(t.label); setMoreOpen(false); }}>
            <t.icon className="mi" size={15} /> {t.label}
          </button>
        ))}
        <div className="hrw-more-wrap">
          <button className="hrw-tab" data-on={isMore} onClick={() => setMoreOpen(o => !o)}
            aria-expanded={moreOpen} aria-haspopup="true">
            <MdMoreHoriz className="mi" size={15} /> {isMore ? tab : 'More'}
          </button>
          {moreOpen && (
            <>
              <div className="hrw-more-scrim" onClick={() => setMoreOpen(false)} />
              <div className="hrw-more" role="menu">
                {MORE_GROUPS.map(g => (
                  <div key={g.title} className="hrw-more-group">
                    <div className="hrw-more-h">{g.title}</div>
                    {g.items.map(t => (
                      <button key={t.label} className="hrw-more-item" role="menuitem" data-on={tab === t.label}
                        onClick={() => { setTab(t.label); setMoreOpen(false); }}>
                        <t.icon className="mi" size={15} /> {t.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </nav>

      <ErrorBoundary key={tab}>
        <div className="hrw-body">
        {tab === 'Dashboard' && <HRAnalyticsTab />}
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
        {tab === 'Onboarding' && <OnboardingPanel employees={employees} />}
        {tab === 'Offboarding' && <OffboardingPanel employees={employees} />}
        {tab === 'Recruitment' && <RecruitmentPanel />}
        </div>
      </ErrorBoundary>

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
