import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

const SEVERITY = {
  CIRCULAR_FLOW: 'high', ROUND_TRIP: 'high', LAYERING: 'high', STRUCTURING: 'high',
  FAN_OUT_PATTERN: 'medium', FAN_IN_PATTERN: 'medium', PASSTHROUGH_SUSPECTED: 'medium',
  DORMANT_ACTIVATION: 'medium', ML_ANOMALY_ISOLATION_FOREST: 'medium', WATCHLIST_HIT: 'high',
  BALANCE_MISMATCH: 'low', LOW_OCR_CONFIDENCE: 'low', FAILED_TXN: 'low',
  TIMING_REGULARITY: 'low', CASH_INTENSIVE: 'low',
};
const COLORS = { high: 'bg-red-50 text-red-700', medium: 'bg-amber-50 text-amber-700', low: 'bg-slate-100 text-slate-600' };

function getSeverity(flag) {
  // Handle flags like 'TransactionFlag.STRUCTURING' format
  const key = flag.replace('TransactionFlag.', '').replace('ML_ANOMALY_IF', 'ML_ANOMALY_ISOLATION_FOREST');
  return SEVERITY[key] || 'low';
}

export default function AlertsTable({ caseId }) {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => { apiClient.get(`/cases/${caseId}/alerts`).then(r => setAlerts(r.data)); }, [caseId]);

  const flags = ['ALL', ...new Set(alerts.map(a => a.flag))];
  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.flag === filter);

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="p-3 border-b border-slate-200 flex gap-2 overflow-x-auto">
        {flags.map(f => (
          <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ${filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {f.replace(/TransactionFlag\./g, '').replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400 text-xs">
          <tr><th className="px-4 py-2">Account</th><th className="px-4 py-2">Flag</th>
              <th className="px-4 py-2">Confidence</th><th className="px-4 py-2">Date</th></tr>
        </thead>
        <tbody>
          {filtered.map((a, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-4 py-2 text-slate-700">{a.account_id}</td>
              <td className="px-4 py-2">
                <span className={`text-xs px-2 py-0.5 rounded ${COLORS[getSeverity(a.flag)]}`}>
                  {a.flag.replace(/TransactionFlag\./g, '').replace(/_/g, ' ')}
                </span>
              </td>
              <td className="px-4 py-2 text-slate-500">{Math.round((a.confidence || 0) * 100)}%</td>
              <td className="px-4 py-2 text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No alerts.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
