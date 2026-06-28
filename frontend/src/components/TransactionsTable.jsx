import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function TransactionsTable({ caseId }) {
  const [txns, setTxns] = useState([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [chainReport, setChainReport] = useState(null);
  const [showChainModal, setShowChainModal] = useState(false);

  const checkChainIntegrity = async () => {
    setVerifyingChain(true);
    try {
      const { data } = await apiClient.get(`/cases/${caseId}/statements/verify-chain`);
      setChainReport(data);
      setShowChainModal(true);
    } catch (err) {
      alert('Verification failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setVerifyingChain(false);
    }
  };

  // Fetch summary to get total transaction count for pagination
  const fetchTotalCount = () => {
    apiClient.get(`/cases/${caseId}/summary`)
      .then(r => setTotalCount(r.data.transaction_count ?? 0))
      .catch(e => console.error('Failed to fetch transaction summary:', e));
  };

  useEffect(() => {
    fetchTotalCount();
  }, [caseId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [accountFilter, pageSize]);

  useEffect(() => {
    setLoading(true);
    const params = {
      page: currentPage,
      size: pageSize,
    };
    if (accountFilter) {
      params.account_id = accountFilter;
    }
    apiClient.get(`/cases/${caseId}/transactions`, { params })
      .then(r => {
        setTxns(r.data || []);
      })
      .catch(e => console.error('Failed to fetch transactions:', e))
      .finally(() => setLoading(false));
  }, [caseId, accountFilter, currentPage, pageSize]);

  const totalPages = accountFilter ? null : Math.ceil(totalCount / pageSize) || 1;
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = startIdx + txns.length - 1;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all relative">
      {/* Search and Size Select Bar */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-3 bg-slate-50/50">
        <div className="relative">
          <input
            placeholder="Filter by account ID (e.g. 1002301)"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-lg px-4 py-2 w-full sm:w-80 shadow-inner bg-white transition-all"
          />
          {accountFilter && (
            <button 
              onClick={() => setAccountFilter('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-semibold"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
          <button onClick={checkChainIntegrity} disabled={verifyingChain}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition">
            {verifyingChain ? (
              <span className="w-3 h-3 border-2 border-slate-700 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span>🛡️ Verify Ledger</span>
            )}
          </button>
          
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">Rows per page:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-medium text-slate-700 shadow-sm outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto min-h-[300px] relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="text-sm text-indigo-600 font-semibold flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              Loading transactions...
            </div>
          </div>
        )}

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-400">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Account ID</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3">Counterparty</th>
              <th className="px-5 py-3">Narration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {txns.map((t) => (
              <tr key={t.txn_hash} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-5 py-3 text-slate-500 font-medium whitespace-nowrap">
                  {new Date(t.txn_date).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </td>
                <td className="px-5 py-3 text-slate-700 font-mono font-medium">{t.account_id}</td>
                <td className="px-5 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    t.txn_type === 'CR' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                      : 'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    {t.txn_type === 'CR' ? 'DEPOSIT' : 'WITHDRAWAL'}
                  </span>
                </td>
                <td className={`px-5 py-3 text-right font-semibold font-mono ${
                  t.txn_type === 'CR' ? 'text-emerald-600' : 'text-slate-900'
                }`}>
                  {t.txn_type === 'CR' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {t.counterparty_account || t.counterparty_name || t.counterparty_bank ? (
                    <div className="flex flex-col">
                      {t.counterparty_account && (
                        <span className="font-mono text-[11px] text-slate-700 font-medium">{t.counterparty_account}</span>
                      )}
                      {t.counterparty_name && (
                        <span className="text-[10px] text-slate-500 font-semibold truncate max-w-[180px]" title={t.counterparty_name}>
                          {t.counterparty_name}
                        </span>
                      )}
                      {t.counterparty_bank && (
                        <span className="text-[9px] text-slate-400 italic truncate max-w-[180px]" title={t.counterparty_bank}>
                          {t.counterparty_bank}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-slate-500 max-w-sm truncate font-normal" title={t.narration}>
                  {t.narration}
                </td>
              </tr>
            ))}

            {txns.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <span className="text-lg">📂</span>
                    <span className="font-medium text-sm">No transactions found</span>
                    <span className="text-xs text-slate-400">Upload statement PDFs or select another filter.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {txns.length > 0 && (
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
          <div className="text-xs text-slate-500 font-medium">
            {accountFilter ? (
              <span>Showing {txns.length} matching rows on this page</span>
            ) : (
              <span>Showing <span className="font-semibold text-slate-700">{startIdx}</span> to <span className="font-semibold text-slate-700">{endIdx}</span> of <span className="font-semibold text-slate-700">{totalCount.toLocaleString('en-IN')}</span> transactions</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1 || loading}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="First Page"
            >
              &laquo;
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Previous Page"
            >
              Prev
            </button>

            <span className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-md">
              Page {currentPage} {totalPages && `of ${totalPages}`}
            </span>

            <button
              onClick={() => setCurrentPage(prev => (totalPages ? Math.min(totalPages, prev + 1) : prev + 1))}
              disabled={(totalPages ? currentPage === totalPages : txns.length < pageSize) || loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Next Page"
            >
              Next
            </button>
            {totalPages && (
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || loading}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Last Page"
              >
                &raquo;
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chain Integrity Verification Modal */}
      {showChainModal && chainReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-100 animate-fade-in">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <span>🛡️ Forensic Audit Ledger Verification</span>
              </h3>
              <button onClick={() => setShowChainModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {chainReport.chain_intact ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
                  <span className="text-2xl">🔒</span>
                  <div>
                    <h4 className="font-semibold text-emerald-800 text-xs">Chain of Custody Intact</h4>
                    <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                      All transaction rows are cryptographically sealed with a sequential SHA-256 chain linked to the original file. No modification or tampering detected.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex gap-3">
                  <span className="text-2xl">🚨</span>
                  <div>
                    <h4 className="font-semibold text-rose-800 text-xs">Ledger Tampering Detected</h4>
                    <p className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                      Cryptographic validation has detected modifications to the transaction database rows! The chain sequence is broken.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statement Ledger Status</span>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden bg-slate-50/50">
                  {chainReport.statements.map((s, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center text-xs">
                      <div className="truncate max-w-[220px]">
                        <span className="font-medium text-slate-700 block truncate" title={s.filename}>{s.filename}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{s.transaction_count} rows</span>
                      </div>
                      {s.intact ? (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold bg-emerald-50">Verified</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-semibold bg-rose-50">Tampered</span>
                      )}
                    </div>
                  ))}
                  {chainReport.statements.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs">No statements uploaded yet.</div>
                  )}
                </div>
              </div>

              {!chainReport.chain_intact && chainReport.broken_transactions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Broken Transaction Hashes</span>
                  <div className="bg-slate-900 rounded p-3 text-[10px] font-mono text-rose-400 overflow-y-auto max-h-[120px] space-y-1">
                    {chainReport.broken_transactions.map((t, idx) => (
                      <div key={idx} className="truncate">
                        [Row ID {t.id.substring(0,8)}] Expected: {t.expected_chain_hash.substring(0,10)}... Actual: {t.actual_chain_hash ? t.actual_chain_hash.substring(0,10) + '...' : 'None'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowChainModal(false)}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded text-xs font-semibold">
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
