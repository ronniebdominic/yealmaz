// Ye-Almaz — Employees tab: search/filter/sort/pagination over the
// existing employee table, now with configurable-ish columns via the
// Phase 1 EmployeeProfile fields. Row click opens the full Employee
// Profile (owned by the parent HRWorkspace, via onSelectEmployee).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api';
import { format } from 'date-fns';
import { MdSearch, MdPersonAdd } from 'react-icons/md';
import { inputStyle } from '../../../utils/adminForms';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On Leave', value: 'ON_LEAVE' },
  { label: 'Terminated', value: 'TERMINATED' },
];
const PAGE_SIZE = 15;

export default function EmployeesTab({ employees, onSelectEmployee, onAddEmployee, refresh }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const roles = useMemo(() => [...new Set(employees.map(e => e.role))].sort(), [employees]);

  const filtered = useMemo(() => employees.filter(e => {
    const p = e.employeeProfile || {};
    const status = p.employmentStatus || 'ACTIVE';
    if (statusFilter && status !== statusFilter) return false;
    if (roleFilter && e.role !== roleFilter) return false;
    if (employmentTypeFilter && p.employmentType !== employmentTypeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [e.name, e.email, p.employeeCode, p.position, (e.departments || []).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [employees, search, statusFilter, roleFilter, employmentTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const byId = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-input" style={{ flex: 1, minWidth: 220 }}>
          <span className="icon mi"><MdSearch size={16} /></span>
          <input placeholder="Search name, email, code, position…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select style={{ ...inputStyle, width: 160 }} value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 160 }} value={employmentTypeFilter} onChange={e => { setEmploymentTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All employment types</option>
          <option value="FULL_TIME">Full-time</option>
          <option value="PART_TIME">Part-time</option>
          <option value="CONTRACT">Contract</option>
          <option value="INTERN">Intern</option>
        </select>
        <button className="btn btn-primary btn-sm" onClick={onAddEmployee} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdPersonAdd size={14} /> Add Employee
        </button>
      </div>

      <div className="filters" style={{ marginBottom: 14 }}>
        {STATUS_FILTERS.map(f => (
          <button key={f.value} className={`filter-chip ${statusFilter === f.value ? 'active' : ''}`}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}>{f.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Employee Code</th><th>Department</th><th>Role</th><th>Position</th>
                <th>Employment Type</th><th>Joining Date</th>
                <th style={{ textAlign: 'center' }}>Base Salary</th>
                <th style={{ textAlign: 'center' }}>Status</th><th>Manager</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={10} className="empty-state">No employees match this filter</td></tr>
              ) : pageItems.map(e => {
                const p = e.employeeProfile || {};
                const manager = p.managerId ? byId.get(p.managerId) : null;
                return (
                  <tr key={e.id} onClick={() => onSelectEmployee(e)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{e.name}</td>
                    <td>{p.employeeCode || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{(e.departments || []).length ? e.departments.join(', ') : '—'}</td>
                    <td>{e.role}</td>
                    <td>{p.position || '—'}</td>
                    <td>{p.employmentType ? p.employmentType.replace('_', ' ') : '—'}</td>
                    <td>{p.hireDate ? format(new Date(p.hireDate), 'dd MMM yyyy') : '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.baseSalary != null ? `Br ${p.baseSalary.toLocaleString('en-US')}` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${(p.employmentStatus || 'ACTIVE') === 'ACTIVE' ? 'badge-verified' : ''}`}>{p.employmentStatus || 'ACTIVE'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{manager?.name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 0' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
            <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>Page {page} of {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}
