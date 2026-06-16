import { useState } from 'react';
import { apiClient } from '../api/client';

export default function NLQueryPanel({ caseId }) {
  const [question, setQuestion] = useState('');
  const [result, setResult]     = useState(null);
  const [busy, setBusy]         = useState(false);

  const ask = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await apiClient.post(`/cases/${caseId}/query`, { question });
      setResult(data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={ask} className="flex gap-2 mb-4">
        <input value={question} onChange={(e) => setQuestion(e.target.value)}
               placeholder="e.g. Show all money that returned to Harish within 30 days"
               className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm" />
        <button disabled={busy || !question} type="submit"
                className="bg-slate-900 text-white text-sm rounded px-4 py-2 disabled:opacity-50">
          {busy ? 'Asking...' : 'Ask'}
        </button>
      </form>

      {result && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="p-3 border-b border-slate-200 text-xs text-slate-400">
            Interpreted as: <code className="text-slate-600">{result.query_spec?.query_type}</code> · {result.count} result(s)
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 text-xs">
              <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Type</th><th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Narration</th></tr>
            </thead>
            <tbody>
              {result.results.map((t) => (
                <tr key={t.txn_hash} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-400">{new Date(t.txn_date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-slate-700">{t.account_id}</td>
                  <td className="px-4 py-2">{t.txn_type}</td>
                  <td className="px-4 py-2">₹{Number(t.amount).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-slate-500 max-w-xs truncate">{t.narration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
