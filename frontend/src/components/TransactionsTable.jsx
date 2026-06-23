import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function TransactionsTable({ caseId }) {
  const [txns, setTxns] = useState([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const params = accountFilter ? { account_id: accountFilter } : {};
    apiClient.get(`/cases/${caseId}/transactions`, { params }).then(r => setTxns(r.data));
  }, [caseId, accountFilter]);

  // Client-side text search over narration and transaction amount
  const filtered = txns.filter(t => 
    t.narration.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.account_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.counterparty_account && t.counterparty_account.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise shadow-sm overflow-hidden flex flex-col">
      
      {/* Table Search and Filters */}
      <div className="p-5 border-b border-borderLight dark:border-borderDark flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Transaction Logs Database</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Comprehensive chronological database of parsed statement entries.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Account Filter Input */}
          <input 
            placeholder="Filter by account ID" 
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-borderLight dark:border-borderDark rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent w-36 sm:w-44" 
          />
          {/* General Keyword Search input */}
          <div className="relative flex-1 sm:flex-none sm:w-56">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search narration..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-borderLight dark:border-borderDark rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {/* Table Canvas */}
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider border-b border-borderLight dark:border-borderDark sticky top-0 bg-white dark:bg-cardDark">
              <th className="px-6 py-4">Value Date</th>
              <th className="px-6 py-4">Account ID</th>
              <th className="px-6 py-4 text-center">Type</th>
              <th className="px-6 py-4 text-right">Flow Value</th>
              <th className="px-6 py-4">Particulars / Narration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLight dark:divide-borderDark">
            {filtered.map((t) => (
              <tr key={t.txn_hash} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/10 transition-colors odd:bg-white dark:odd:bg-cardDark even:bg-slate-50/10 dark:even:bg-slate-900/10">
                <td className="px-6 py-4.5 text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium">
                  {new Date(t.txn_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4.5 font-mono font-bold text-slate-700 dark:text-slate-300">
                  {t.account_id}
                </td>
                <td className="px-6 py-4.5 text-center whitespace-nowrap">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wider border
                    ${t.txn_type === 'CR' 
                      ? 'bg-success/10 text-success border-success/20' 
                      : 'bg-danger/10 text-danger border-danger/20'
                    }`}
                  >
                    {t.txn_type}
                  </span>
                </td>
                <td className="px-6 py-4.5 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  ₹{Number(t.amount).toLocaleString('en-IN')}
                </td>
                <td className="px-6 py-4.5 text-slate-500 dark:text-slate-400 font-medium max-w-sm truncate" title={t.narration}>
                  {t.narration}
                  {t.counterparty_account && (
                    <span className="block text-[9px] text-accent font-bold font-mono mt-0.5">
                      ↳ Target: {t.counterparty_account}
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  No transaction entries match filters. Import logs using Upload tab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
