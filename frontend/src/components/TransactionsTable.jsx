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

  // Filter input states
  const [channelInput, setChannelInput] = useState('');
  const [directionInput, setDirectionInput] = useState('');
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');
  const [minAmountInput, setMinAmountInput] = useState('');
  const [maxAmountInput, setMaxAmountInput] = useState('');
  const [counterpartyInput, setCounterpartyInput] = useState('');
  const [flaggedOnlyInput, setFlaggedOnlyInput] = useState(false);

  // Applied filter state
  const [appliedFilters, setAppliedFilters] = useState({
    channel: '',
    direction: '',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
    counterparty: '',
    flaggedOnly: false
  });

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

  const fetchTotalCount = () => {
    apiClient.get(`/cases/${caseId}/summary`)
      .then(r => setTotalCount(r.data.transaction_count ?? 0))
      .catch(e => console.error('Failed to fetch transaction summary:', e));
  };

  useEffect(() => {
    if (!Object.values(appliedFilters).some(v => v !== '' && v !== false)) {
      fetchTotalCount();
    }
  }, [caseId, appliedFilters]);

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
    if (appliedFilters.channel) {
      params.channel = appliedFilters.channel;
    }
    if (appliedFilters.direction) {
      params.direction = appliedFilters.direction;
    }
    if (appliedFilters.dateFrom) {
      params.date_from = appliedFilters.dateFrom;
    }
    if (appliedFilters.dateTo) {
      params.date_to = appliedFilters.dateTo;
    }
    if (appliedFilters.minAmount) {
      params.amount_min = Number(appliedFilters.minAmount);
    }
    if (appliedFilters.maxAmount) {
      params.amount_max = Number(appliedFilters.maxAmount);
    }
    if (appliedFilters.counterparty) {
      params.counterparty = appliedFilters.counterparty;
    }
    if (appliedFilters.flaggedOnly) {
      params.flagged_only = true;
    }

    apiClient.get(`/cases/${caseId}/transactions`, { params })
      .then(r => {
        setTxns(r.data || []);
        const countHeader = r.headers['x-total-count'];
        if (countHeader !== undefined) {
          setTotalCount(Number(countHeader));
        }
      })
      .catch(e => console.error('Failed to fetch transactions:', e))
      .finally(() => setLoading(false));
  }, [caseId, accountFilter, currentPage, pageSize, appliedFilters]);

  const handleApplyFilters = () => {
    setAppliedFilters({
      channel: channelInput,
      direction: directionInput,
      dateFrom: dateFromInput,
      dateTo: dateToInput,
      minAmount: minAmountInput,
      maxAmount: maxAmountInput,
      counterparty: counterpartyInput,
      flaggedOnly: flaggedOnlyInput
    });
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = startIdx + txns.length - 1;

  return (
    <div className="bg-surface-raised border border-border-hairline rounded-xl shadow-card overflow-hidden relative">
      {/* Search and Size Select Bar */}
      <div className="p-4 border-b border-border-hairline flex flex-col sm:flex-row justify-between gap-3 bg-surface-sunken/40">
        <div className="relative">
          <input
            placeholder="Filter by account ID (e.g. 1002301)"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="text-sm border border-border focus:border-accent focus:ring-1 focus:ring-accent outline-none rounded-md px-4 py-2 w-full sm:w-80 bg-surface-raised text-ink-primary transition-all"
          />
          {accountFilter && (
            <button 
              onClick={() => setAccountFilter('')}
              className="absolute right-3 top-2.5 text-xs text-ink-muted hover:text-ink-primary font-semibold"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
          <button
            onClick={checkChainIntegrity}
            disabled={verifyingChain}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-sunken hover:bg-border-hairline border border-border-hairline rounded-md text-xs font-semibold text-ink-secondary transition-colors"
          >
            {verifyingChain ? (
              <span className="w-3 h-3 border-2 border-ink-secondary border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span>🛡️ Verify Ledger</span>
            )}
          </button>
          
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-secondary font-medium">Rows per page:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="text-xs border border-border rounded-md px-2.5 py-1.5 bg-surface-raised font-medium text-ink-primary shadow-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter Panel (UPI, NEFT, IMPS, Date, Amount, Counterparty) */}
      <div className="p-4 border-b border-border-hairline bg-surface-sunken/15 flex flex-wrap gap-4 items-end text-xs">
        {/* Channel Dropdown */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
          <label className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider">Channel</label>
          <select
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-accent text-ink-primary shadow-sm"
          >
            <option value="">All Channels</option>
            <option value="UPI">UPI</option>
            <option value="NEFT">NEFT</option>
            <option value="RTGS">RTGS</option>
            <option value="IMPS">IMPS</option>
            <option value="CASH">CASH</option>
            <option value="ATM">ATM</option>
            <option value="CARD">CARD</option>
          </select>
        </div>

        {/* Direction Dropdown */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
          <label className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider">Direction</label>
          <select
            value={directionInput}
            onChange={(e) => setDirectionInput(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-accent text-ink-primary shadow-sm"
          >
            <option value="">All Directions</option>
            <option value="inbound">Deposits (Inbound)</option>
            <option value="outbound">Withdrawals (Outbound)</option>
          </select>
        </div>

        {/* Date From */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
          <label className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider">Date From</label>
          <input
            type="date"
            value={dateFromInput}
            onChange={(e) => setDateFromInput(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-2 py-1 outline-none focus:border-accent text-ink-primary shadow-sm"
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
          <label className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider">Date To</label>
          <input
            type="date"
            value={dateToInput}
            onChange={(e) => setDateToInput(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-2 py-1 outline-none focus:border-accent text-ink-primary shadow-sm"
          />
        </div>

        {/* Min Amount */}
        <div className="flex flex-col gap-1.5 w-24">
          <label className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider">Min Amount</label>
          <input
            type="number"
            placeholder="Min"
            value={minAmountInput}
            onChange={(e) => setMinAmountInput(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-1 outline-none focus:border-accent text-ink-primary shadow-sm"
          />
        </div>

        {/* Max Amount */}
        <div className="flex flex-col gap-1.5 w-24">
          <label className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider">Max Amount</label>
          <input
            type="number"
            placeholder="Max"
            value={maxAmountInput}
            onChange={(e) => setMaxAmountInput(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-1 outline-none focus:border-accent text-ink-primary shadow-sm"
          />
        </div>

        {/* Counterparty Name/ID */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[150px]">
          <label className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider">Counterparty</label>
          <input
            type="text"
            placeholder="Search name/ID"
            value={counterpartyInput}
            onChange={(e) => setCounterpartyInput(e.target.value)}
            className="w-full bg-surface-raised border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-accent text-ink-primary shadow-sm"
          />
        </div>

        {/* Flagged Only Checkbox */}
        <div className="flex items-center gap-2 mb-2 w-28">
          <input
            type="checkbox"
            id="flaggedOnlyCheckbox"
            checked={flaggedOnlyInput}
            onChange={(e) => setFlaggedOnlyInput(e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent w-4 h-4 bg-surface-raised cursor-pointer"
          />
          <label htmlFor="flaggedOnlyCheckbox" className="font-semibold text-ink-secondary text-xs cursor-pointer select-none">
            Flagged Only
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {Object.values(appliedFilters).some(v => v !== '' && v !== false) && (
            <button
              onClick={() => {
                setChannelInput('');
                setDirectionInput('');
                setDateFromInput('');
                setDateToInput('');
                setMinAmountInput('');
                setMaxAmountInput('');
                setCounterpartyInput('');
                setFlaggedOnlyInput(false);
                setAppliedFilters({
                  channel: '',
                  direction: '',
                  dateFrom: '',
                  dateTo: '',
                  minAmount: '',
                  maxAmount: '',
                  counterparty: '',
                  flaggedOnly: false
                });
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 bg-surface-sunken hover:bg-border-hairline border border-border-hairline rounded-md text-xs font-semibold text-ink-secondary transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleApplyFilters}
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-accent-fg rounded-md text-xs font-bold transition-all shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto min-h-[300px] relative">
        {loading && (
          <div className="absolute inset-0 bg-surface-raised/50 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="text-sm text-accent font-semibold flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              Loading transactions...
            </div>
          </div>
        )}

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-sunken/40 border-b border-border-hairline text-[10px] uppercase tracking-wider font-bold text-ink-muted">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Account ID</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3">Counterparty</th>
              <th className="px-5 py-3">Narration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-hairline text-xs">
            {txns.map((t) => (
              <tr key={t.txn_hash} className="hover:bg-surface-sunken/30 transition-colors odd:bg-surface-raised even:bg-surface-base/30">
                <td className="px-5 py-3 text-ink-muted font-data whitespace-nowrap">
                  {new Date(t.txn_date).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </td>
                <td className="px-5 py-3 text-ink-primary font-mono font-medium">{t.account_id}</td>
                <td className="px-5 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block border ${
                    t.txn_type === 'CR' 
                      ? 'bg-accent-subtle text-accent border-accent/20' 
                      : 'bg-risk-high-bg text-risk-high border-risk-high/15'
                  }`}>
                    {t.txn_type === 'CR' ? 'DEPOSIT' : 'WITHDRAWAL'}
                  </span>
                </td>
                <td className={`px-5 py-3 text-right font-semibold font-data ${
                  t.txn_type === 'CR' ? 'text-accent' : 'text-ink-primary'
                }`}>
                  {t.txn_type === 'CR' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-5 py-3 text-ink-secondary">
                  {t.counterparty_account || t.counterparty_name || t.counterparty_bank ? (
                    <div className="flex flex-col">
                      {t.counterparty_account && (
                        <span className="font-mono text-[11px] text-ink-primary font-medium">{t.counterparty_account}</span>
                      )}
                      {t.counterparty_name && (
                        <span className="text-[10px] text-ink-secondary font-semibold truncate max-w-[180px]" title={t.counterparty_name}>
                          {t.counterparty_name}
                        </span>
                      )}
                      {t.counterparty_bank && (
                        <span className="text-[9px] text-ink-muted italic truncate max-w-[180px]" title={t.counterparty_bank}>
                          {t.counterparty_bank}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-ink-muted/50">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-ink-secondary max-w-sm truncate font-normal" title={t.narration}>
                  {t.narration}
                </td>
              </tr>
            ))}

            {txns.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-ink-muted">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <span className="text-lg">📂</span>
                    <span className="font-medium text-sm text-ink-primary">No transactions found</span>
                    <span className="text-xs">No transactions yet — upload a bank statement to get started.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {txns.length > 0 && (
        <div className="p-4 border-t border-border-hairline flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-sunken/40">
          <div className="text-xs text-ink-secondary font-medium">
            {accountFilter ? (
              <span>Showing {txns.length} matching rows on this page</span>
            ) : (
              <span>Showing <span className="font-semibold text-ink-primary font-data">{startIdx}</span> to <span className="font-semibold text-ink-primary font-data">{endIdx}</span> of <span className="font-semibold text-ink-primary font-data">{totalCount.toLocaleString('en-IN')}</span> transactions</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1 || loading}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-border bg-surface-raised text-ink-secondary hover:bg-surface-sunken disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="First Page"
            >
              &laquo;
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-surface-raised text-ink-secondary hover:bg-surface-sunken disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Previous Page"
            >
              Prev
            </button>

            <span className="px-3 py-1.5 text-xs font-bold text-ink-primary bg-surface-raised border border-border rounded-md font-data">
              Page {currentPage} {totalPages && `of ${totalPages}`}
            </span>

            <button
              onClick={() => setCurrentPage(prev => (totalPages ? Math.min(totalPages, prev + 1) : prev + 1))}
              disabled={(totalPages ? currentPage === totalPages : txns.length < pageSize) || loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-surface-raised text-ink-secondary hover:bg-surface-sunken disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Next Page"
            >
              Next
            </button>
            {totalPages && (
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || loading}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-border bg-surface-raised text-ink-secondary hover:bg-surface-sunken disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
        <div className="fixed inset-0 bg-ink-primary/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface-raised rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-border-hairline">
            {/* Header */}
            <div className="px-5 py-4 bg-surface-sunken border-b border-border-hairline flex justify-between items-center">
              <h3 className="font-semibold text-ink-primary text-sm flex items-center gap-1.5">
                <span>🛡️ Forensic Audit Ledger Verification</span>
              </h3>
              <button onClick={() => setShowChainModal(false)} className="text-ink-muted hover:text-ink-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {chainReport.chain_intact ? (
                <div className="bg-accent-subtle border border-accent/20 rounded-md p-4 flex gap-3">
                  <span className="text-2xl">🔒</span>
                  <div>
                    <h4 className="font-semibold text-accent text-xs">Chain of Custody Intact</h4>
                    <p className="text-[11px] text-ink-secondary mt-1 leading-relaxed">
                      All transaction rows are cryptographically sealed with a sequential SHA-256 chain linked to the original file. No modification or tampering detected.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-risk-high-bg border border-risk-high/15 rounded-md p-4 flex gap-3">
                  <span className="text-2xl">🚨</span>
                  <div>
                    <h4 className="font-semibold text-risk-high text-xs">Ledger Tampering Detected</h4>
                    <p className="text-[11px] text-risk-high mt-1 leading-relaxed">
                      Cryptographic validation has detected modifications to the transaction database rows! The chain sequence is broken.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">Statement Ledger Status</span>
                <div className="divide-y divide-border-hairline border border-border-hairline rounded-md overflow-hidden bg-surface-sunken/20">
                  {chainReport.statements.map((s, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center text-xs">
                      <div className="truncate max-w-[220px]">
                        <span className="font-medium text-ink-primary block truncate" title={s.filename}>{s.filename}</span>
                        <span className="text-[10px] text-ink-muted font-mono">{s.transaction_count} rows</span>
                      </div>
                      {s.intact ? (
                        <span className="text-[10px] px-2 py-0.5 bg-accent-subtle text-accent rounded font-semibold border border-accent/20">Verified</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 bg-risk-high-bg text-risk-high rounded font-semibold border border-risk-high/15">Tampered</span>
                      )}
                    </div>
                  ))}
                  {chainReport.statements.length === 0 && (
                    <div className="p-4 text-center text-ink-muted text-xs">No statements uploaded yet.</div>
                  )}
                </div>
              </div>

              {!chainReport.chain_intact && chainReport.broken_transactions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-risk-high uppercase tracking-wider">Broken Transaction Hashes</span>
                  <div className="bg-surface-sunken border border-border-hairline rounded p-3 text-[10px] font-mono text-risk-high overflow-y-auto max-h-[120px] space-y-1">
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
            <div className="px-5 py-3 bg-surface-sunken border-t border-border-hairline flex justify-end">
              <button
                onClick={() => setShowChainModal(false)}
                className="bg-accent hover:bg-accent-hover text-accent-fg px-4 py-1.5 rounded-md text-xs font-semibold transition-colors"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
