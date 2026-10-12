// Ye-Almaz — Admin Data Health: do the dashboards agree, and is the data under them sane?
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdHealthAndSafety, MdCheckCircle, MdWarning, MdRefresh } from 'react-icons/md';

const br = (n) => `Br ${Number(n || 0).toLocaleString('en-US')}`;

export default function AdminDataHealth() {
  const queryClient = useQueryClient();
  const [fixing, setFixing] = useState(false);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'data-health'],
    queryFn: () => api.get('/dashboard/reconcile').then(r => r.data),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const syncAmounts = async (count) => {
    if (!window.confirm(`Set the payment amount of ${count} unpaid case(s) to match each case's total? Paid (verified) cases are never touched.`)) return;
    setFixing(true);
    try {
      const { data: r } = await api.post('/dashboard/reconcile/sync-amounts');
      toast.success(`Synced ${r.fixed} payment amount(s).`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'data-health'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not sync amounts.');
    } finally {
      setFixing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MdHealthAndSafety size={20} /> Data Health</div>
        <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={isFetching}>
          <MdRefresh size={15} /> {isFetching ? 'Checking…' : 'Run check again'}
        </button>
      </div>

      <div className="content" style={{ display: "grid", gap: 16, alignContent: "start" }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Checking every dashboard against the cases…</div>
        ) : isError ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Could not run the check.</div>
        ) : (
          <>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {data.allAgree ? <MdCheckCircle size={22} color="var(--green)" /> : <MdWarning size={22} color="var(--red)" />}
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {data.allAgree ? 'All dashboards agree' : 'Some dashboards disagree'}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
                Outstanding, calculated directly from the cases: <b>{data.expected.count}</b> unpaid delivered cases ·{' '}
                <b>{br(data.expected.amount)}</b> · checked {format(new Date(data.checkedAt), 'dd MMM, HH:mm')}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Screen</th><th style={{ textAlign: 'right' }}>Cases</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
                  <tbody>
                    {data.figures.map(f => (
                      <tr key={f.name}>
                        <td style={{ fontWeight: 600 }}>{f.name}</td>
                        <td style={{ textAlign: 'right' }}>{f.count}</td>
                        <td style={{ textAlign: 'right' }}>{br(f.amount)}</td>
                        <td style={{ color: f.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{f.ok ? 'Matches' : 'Differs'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {data.anomalies.map(a => (
              <div className="card" key={a.key} style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {a.count === 0 ? <MdCheckCircle size={20} color="var(--green)" /> : <MdWarning size={20} color="var(--amber)" />}
                  <div style={{ fontWeight: 700, flex: 1 }}>{a.title} <span style={{ color: a.count ? 'var(--amber)' : 'var(--green)' }}>({a.count})</span></div>
                  {a.fixable && a.count > 0 && (
                    <button className="btn btn-success btn-sm" disabled={fixing} onClick={() => syncAmounts(a.count)}>
                      {fixing ? 'Syncing…' : 'Sync amounts'}
                    </button>
                  )}
                </div>
                {a.count > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 10px 30px' }}>{a.hint}</div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Case</th><th>Clinic</th><th>Detail</th></tr></thead>
                        <tbody>
                          {a.samples.map(s => (
                            <tr key={s.caseNumber + s.detail}>
                              <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{s.caseNumber}</td>
                              <td>{s.clinic || '—'}</td>
                              <td style={{ fontSize: 12 }}>{s.detail}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {a.count > a.samples.length && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>…and {a.count - a.samples.length} more</div>
                    )}
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
