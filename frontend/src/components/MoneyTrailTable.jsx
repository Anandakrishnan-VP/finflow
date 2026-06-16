import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function MoneyTrailTable({ caseId }) {
  const [trail, setTrail] = useState([]);
  useEffect(() => { apiClient.get(`/cases/${caseId}/money-trail`).then(r => setTrail(r.data)); }, [caseId]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="p-3 border-b border-slate-200 text-xs text-slate-500">
        FIFO money trail — for each credit, shows where the funds went and how long they were held.
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400 text-xs">
          <tr><th className="px-4 py-2">Credit Date</th><th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Debit Date</th><th className="px-4 py-2">Days Held</th>
              <th className="px-4 py-2">To Account</th></tr>
        </thead>
        <tbody>
          {trail.map((t, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-4 py-2 text-slate-400">{t.credit_date ? new Date(t.credit_date).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2 text-slate-900">₹{Number(t.amount).toLocaleString('en-IN')}</td>
              <td className="px-4 py-2 text-slate-400">{t.debit_date ? new Date(t.debit_date).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2">
                <span className={t.days_held <= 3 ? 'text-red-600 font-medium' : 'text-slate-600'}>{t.days_held}d</span>
              </td>
              <td className="px-4 py-2 text-slate-500">{t.counterparty_account || '—'}</td>
            </tr>
          ))}
          {trail.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No money trail data. Run analysis first.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
