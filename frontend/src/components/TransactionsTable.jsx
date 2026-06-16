import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function TransactionsTable({ caseId }) {
  const [txns, setTxns] = useState([]);
  const [accountFilter, setAccountFilter] = useState('');

  useEffect(() => {
    const params = accountFilter ? { account_id: accountFilter } : {};
    apiClient.get(`/cases/${caseId}/transactions`, { params }).then(r => setTxns(r.data));
  }, [caseId, accountFilter]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="p-3 border-b border-slate-200">
        <input placeholder="Filter by account ID" value={accountFilter}
               onChange={(e) => setAccountFilter(e.target.value)}
               className="text-sm border border-slate-300 rounded px-3 py-1.5 w-64" />
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400 text-xs">
          <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Type</th><th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Narration</th></tr>
        </thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.txn_hash} className="border-t border-slate-100">
              <td className="px-4 py-2 text-slate-400">{new Date(t.txn_date).toLocaleDateString()}</td>
              <td className="px-4 py-2 text-slate-700">{t.account_id}</td>
              <td className="px-4 py-2">
                <span className={t.txn_type === 'CR' ? 'text-emerald-600' : 'text-red-600'}>{t.txn_type}</span>
              </td>
              <td className="px-4 py-2 text-slate-900">₹{Number(t.amount).toLocaleString('en-IN')}</td>
              <td className="px-4 py-2 text-slate-500 max-w-xs truncate">{t.narration}</td>
            </tr>
          ))}
          {txns.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No transactions yet. Upload statements first.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
