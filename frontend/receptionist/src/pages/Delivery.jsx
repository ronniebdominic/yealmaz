import Layout from '../components/Layout';
import api from '../api';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';

const fetchAssigned = () => api.get('/delivery/assigned').then(r => r.data.cases ?? r.data);

export default function Delivery() {
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['delivery', 'assigned'],
    queryFn: fetchAssigned,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return (
    <Layout>
      <div className="topbar">
        <div className="topbar-title">Ready to Dispatch</div>
        <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
          {cases.length} case{cases.length !== 1 ? 's' : ''} ready
        </div>
      </div>

      <div className="content">
        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '60px' }}>Loading…</div>
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🚚</div>
            <div className="empty-title">No cases ready for dispatch</div>
            <p>Cases will appear here once payment is verified</p>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Patient</th>
                    <th>Clinic</th>
                    <th>Address</th>
                    <th>Work Type</th>
                    <th>Payment</th>
                    <th>Ready Since</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td><span className="case-number">{c.caseNumber}</span></td>
                      <td><span className="patient-name">{c.patientName}</span></td>
                      <td>{c.clinic?.name}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-3)' }}>{c.clinic?.address || '—'}</td>
                      <td>{c.workType}</td>
                      <td><span className="badge badge-pay-verified">✓ Verified</span></td>
                      <td style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                        {format(new Date(c.updatedAt), 'dd MMM, h:mm a')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
