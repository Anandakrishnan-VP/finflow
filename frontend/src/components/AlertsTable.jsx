import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

const SEVERITY = {
  CIRCULAR_FLOW: 'high', ROUND_TRIP: 'high', LAYERING: 'high', STRUCTURING: 'high',
  FAN_OUT_PATTERN: 'medium', FAN_IN_PATTERN: 'medium', PASSTHROUGH_SUSPECTED: 'medium',
  DORMANT_ACTIVATION: 'medium', ML_ANOMALY_ISOLATION_FOREST: 'medium', WATCHLIST_HIT: 'high',
  BALANCE_MISMATCH: 'low', LOW_OCR_CONFIDENCE: 'low', FAILED_TXN: 'low',
  TIMING_REGULARITY: 'low', CASH_INTENSIVE: 'low',
};

const COLORS = {
  high: 'bg-errorContainer text-onErrorContainer border border-error/10',
  medium: 'bg-secondaryContainer text-onSecondaryContainer border border-secondary/10',
  low: 'bg-surfaceContainerHighest text-onSurfaceVariant border border-outlineVariant'
};

function getSeverity(flag) {
  const key = flag.replace('TransactionFlag.', '').replace('ML_ANOMALY_IF', 'ML_ANOMALY_ISOLATION_FOREST');
  return SEVERITY[key] || 'low';
}

export default function AlertsTable({ caseId }) {
  const [alerts, setAlerts] = useState([]);
  const [selectedFlag, setSelectedFlag] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { 
    apiClient.get(`/cases/${caseId}/alerts`).then(r => setAlerts(r.data)); 
  }, [caseId]);

  const flags = ['ALL', ...new Set(alerts.map(a => a.flag))];
  
  // Filter by selected flag category and search input
  const filtered = alerts.filter(a => {
    const matchesFlag = selectedFlag === 'ALL' || a.flag === selectedFlag;
    const matchesSearch = a.account_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          a.flag.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFlag && matchesSearch;
  });

  return (
    <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l overflow-hidden flex flex-col">
      
      {/* Search and Category Filter Bar */}
      <div className="p-5 border-b border-outlineVariant space-y-4">
        
        {/* Row 1: Title and Search input */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-onSurface">Flagged Suspicious Activity Logs</h3>
            <p className="text-[11px] text-onSurfaceVariant mt-0.5">List of transaction anomalies detected by the ensemble fusion engine.</p>
          </div>
          
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-onSurfaceVariant">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by account or flag..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface focus:outline-none focus:ring-1 focus:ring-primary font-sans"
            />
          </div>
        </div>

        {/* Row 2: Category Filter Buttons */}
        <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
          {flags.map(f => (
            <button 
              key={f} 
              onClick={() => setSelectedFlag(f)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-m3-full whitespace-nowrap border transition-all duration-200 m3-interactive
                ${selectedFlag === f 
                  ? 'bg-primaryContainer border-primary/20 text-onPrimaryContainer font-bold' 
                  : 'bg-surfaceContainerHighest border-outlineVariant text-onSurfaceVariant hover:bg-surfaceContainer'
                }`}
            >
              {f.replace(/TransactionFlag\./g, '').replace(/_/g, ' ')}
            </button>
          ))}
        </div>

      </div>

      {/* Table grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-surfaceContainer border-b border-outlineVariant text-onSurfaceVariant font-bold uppercase tracking-wider sticky top-0 bg-surfaceContainerLow">
              <th className="px-6 py-4">Account ID</th>
              <th className="px-6 py-4">Suspicious Flag Type</th>
              <th className="px-6 py-4 text-center">Confidence Rating</th>
              <th className="px-6 py-4 text-right">Detection Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outlineVariant">
            {filtered.map((a, i) => {
              const severity = getSeverity(a.flag);
              return (
                <tr key={i} className="hover:bg-surfaceContainerHighest transition-colors m3-interactive">
                  <td className="px-6 py-4 font-mono font-bold text-onSurface">
                    {a.account_id}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-m3-full uppercase ${COLORS[severity]}`}>
                      {a.flag.replace(/TransactionFlag\./g, '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center whitespace-nowrap font-bold">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-12 bg-surfaceContainerHighest rounded-m3-full h-1.5 overflow-hidden hidden sm:block">
                        <div 
                          className={`h-1.5 rounded-m3-full ${severity === 'high' ? 'bg-error' : severity === 'medium' ? 'bg-secondary' : 'bg-primary'}`}
                          style={{ width: `${Math.round((a.confidence || 0) * 100)}%` }}
                        />
                      </div>
                      <span className={severity === 'high' ? 'text-error' : severity === 'medium' ? 'text-secondary' : 'text-onSurfaceVariant'}>
                        {Math.round((a.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-onSurfaceVariant font-medium whitespace-nowrap font-mono">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              );
            })}
            
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-onSurfaceVariant">
                  No matching anomalies detected in statement logs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
