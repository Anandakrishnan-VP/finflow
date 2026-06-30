import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function MoneyTrailTable({ caseId }) {
  const [trail, setTrail] = useState([]);
  useEffect(() => { apiClient.get(`/cases/${caseId}/money-trail`).then(r => setTrail(r.data)); }, [caseId]);

  return (
    <div className="bg-surface-raised border border-border-hairline rounded-lg shadow-card">
      <div className="p-3 border-b border-border-hairline text-xs text-ink-muted bg-surface-sunken/40">
        FIFO money trail — for each credit, shows where the funds went and how long they were held.
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-ink-muted text-xs bg-surface-sunken/20">
          <tr>
            <th className="px-4 py-2 font-medium">Credit Date</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Debit Date</th>
            <th className="px-4 py-2 font-medium">Days Held</th>
            <th className="px-4 py-2 font-medium">To Account</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-hairline">
          {trail.map((t, i) => (
            <tr key={i} className="hover:bg-surface-sunken/30 transition-colors odd:bg-surface-raised even:bg-surface-base/30">
              <td className="px-4 py-2 text-ink-muted font-data">{t.credit_date ? new Date(t.credit_date).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2 text-ink-primary font-data">₹{Number(t.amount).toLocaleString('en-IN')}</td>
              <td className="px-4 py-2 text-ink-muted font-data">{t.debit_date ? new Date(t.debit_date).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2">
                <span className={t.days_held <= 3 ? 'text-risk-high font-bold font-data' : 'text-ink-secondary font-data'}>
                  {t.days_held}d
                </span>
              </td>
              <td className="px-4 py-2 font-mono text-ink-secondary">{t.counterparty_account || '—'}</td>
            </tr>
          ))}
          {trail.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                No money trail data — upload statements to execute FIFO tracking.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
