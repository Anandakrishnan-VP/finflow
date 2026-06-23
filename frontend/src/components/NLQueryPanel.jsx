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
    <div className="space-y-6 text-xs animate-fade-in">
      
      {/* Title description */}
      <div className="border-b border-borderLight dark:border-borderDark pb-2.5">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">Natural Language AI Search</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">Query account statements using direct English (translates into SQL filters dynamically).</p>
      </div>

      {/* Query Search Card Form */}
      <form onSubmit={ask} className="flex gap-3 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark p-4 rounded-enterprise shadow-sm">
        <input 
          value={question} 
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Show all transactions above ₹4,00,000 made between 2 AM and 5 AM"
          className="flex-1 px-4 py-3 rounded-btn border border-borderLight dark:border-borderDark bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-semibold focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" 
        />
        <button 
          disabled={busy || !question.trim()} 
          type="submit"
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 rounded-btn shadow-md shadow-accent/20 transition-all flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <span>Search</span>
          )}
        </button>
      </form>

      {/* Query Result Card Table */}
      {result && (
        <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise shadow-sm overflow-hidden flex flex-col">
          
          <div className="p-4 border-b border-borderLight dark:border-borderDark flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50/20 dark:bg-slate-900/10">
            <div>
              Interpretation Type: <code className="text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[9px] lowercase">{result.query_spec?.query_type}</code>
            </div>
            <span>{result.count} record{result.count !== 1 ? 's' : ''} found</span>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30 dark:bg-slate-900/30 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider border-b border-borderLight dark:border-borderDark sticky top-0 bg-white dark:bg-cardDark">
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Account ID</th>
                  <th className="px-6 py-3.5 text-center">Type</th>
                  <th className="px-6 py-3.5 text-right">Flow Value</th>
                  <th className="px-6 py-3.5">Particulars / Narration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLight dark:divide-borderDark">
                {result.results.map((t) => (
                  <tr key={t.txn_hash} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10 transition-colors odd:bg-white dark:odd:bg-cardDark even:bg-slate-50/10 dark:even:bg-slate-900/10">
                    <td className="px-6 py-3.5 text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium">
                      {new Date(t.txn_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {t.account_id}
                    </td>
                    <td className="px-6 py-3.5 text-center whitespace-nowrap">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border
                        ${t.txn_type === 'CR' 
                          ? 'bg-success/10 text-success border-success/20 dark:bg-success/5' 
                          : 'bg-danger/10 text-danger border-danger/20 dark:bg-danger/5'
                        }`}
                      >
                        {t.txn_type}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      ₹{Number(t.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400 font-medium max-w-sm truncate" title={t.narration}>
                      {t.narration}
                    </td>
                  </tr>
                ))}
                {result.results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                      No results matched query filter constraints.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
}
