import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function MoneyTrailTable({ caseId }) {
  const [trail, setTrail] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { 
    apiClient.get(`/cases/${caseId}/money-trail`).then(r => setTrail(r.data)); 
  }, [caseId]);

  const filtered = trail.filter(t => 
    (t.counterparty_account && t.counterparty_account.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (t.credit_narration && t.credit_narration.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (t.debit_narration && t.debit_narration.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise shadow-sm overflow-hidden flex flex-col text-xs">
      
      {/* Search Header */}
      <div className="p-5 border-b border-borderLight dark:border-borderDark flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">FIFO Money Trail Directory</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">FIFO funds tracing: traces where credits were distributed and how long they were held.</p>
        </div>
        
        <div className="relative w-full sm:w-64">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search account or narration..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-borderLight dark:border-borderDark rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Table Canvas */}
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider border-b border-borderLight dark:border-borderDark sticky top-0 bg-white dark:bg-cardDark">
              <th className="px-6 py-4">Credit Date</th>
              <th className="px-6 py-4 text-right">Flow Value</th>
              <th className="px-6 py-4">Debit Date</th>
              <th className="px-6 py-4 text-center">Days Held</th>
              <th className="px-6 py-4">Target Counterparty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLight dark:divide-borderDark">
            {filtered.map((t, i) => (
              <tr key={i} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10 transition-colors odd:bg-white dark:odd:bg-cardDark even:bg-slate-50/10 dark:even:bg-slate-900/10">
                <td className="px-6 py-4 text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium">
                  {t.credit_date ? new Date(t.credit_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  ₹{Number(t.amount).toLocaleString('en-IN')}
                </td>
                <td className="px-6 py-4 text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium">
                  {t.debit_date ? new Date(t.debit_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-6 py-4 text-center whitespace-nowrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                    ${t.days_held <= 3 
                      ? 'bg-danger/10 text-danger border-danger/20 dark:bg-danger/5 font-extrabold' 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {t.days_held} day{t.days_held !== 1 ? 's' : ''}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                  {t.counterparty_account || '—'}
                </td>
              </tr>
            ))}
            
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  No money trail entries matched filters. Run analysis first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
