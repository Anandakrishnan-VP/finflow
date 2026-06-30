import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import RiskBadge from './RiskBadge';

const FLAG_TIER = {
  CIRCULAR_FLOW: 'high', ROUND_TRIP: 'high', LAYERING: 'high', STRUCTURING: 'high',
  FAN_OUT_PATTERN: 'medium', FAN_IN_PATTERN: 'medium', PASSTHROUGH_SUSPECTED: 'medium',
  DORMANT_ACTIVATION: 'medium', ML_ANOMALY_ISOLATION_FOREST: 'medium', WATCHLIST_HIT: 'high',
  BALANCE_MISMATCH: 'low', LOW_OCR_CONFIDENCE: 'low', FAILED_TXN: 'low',
  TIMING_REGULARITY: 'low', CASH_INTENSIVE: 'low',
};

function getSeverity(flag) {
  const key = flag.replace('TransactionFlag.', '').replace('ML_ANOMALY_IF', 'ML_ANOMALY_ISOLATION_FOREST');
  return FLAG_TIER[key] || 'low';
}

export default function AlertsTable({ caseId }) {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => { apiClient.get(`/cases/${caseId}/alerts`).then(r => setAlerts(r.data)); }, [caseId]);

  const flags = ['ALL', ...new Set(alerts.map(a => a.flag))];
  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.flag === filter);

  return (
    <div className="bg-surface-raised border border-border-hairline rounded-lg shadow-card">
      <div className="p-3 border-b border-border-hairline flex gap-2 overflow-x-auto">
        {flags.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-md whitespace-nowrap transition-colors font-medium ${
              filter === f ? 'bg-accent text-accent-fg' : 'bg-surface-sunken text-ink-secondary hover:bg-border-hairline'
            }`}
          >
            {f.replace(/TransactionFlag\./g, '').replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-ink-muted text-xs bg-surface-sunken/40">
          <tr>
            <th className="px-4 py-2 font-medium">Account</th>
            <th className="px-4 py-2 font-medium">Flag</th>
            <th className="px-4 py-2 font-medium">Confidence</th>
            <th className="px-4 py-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((a, i) => (
            <tr key={i} className="border-t border-border-hairline odd:bg-surface-base even:bg-surface-raised">
              <td className="px-4 py-2 font-mono text-ink-primary">{a.account_id}</td>
              <td className="px-4 py-2">
                <RiskBadge
                  tier={getSeverity(a.flag)}
                  label={a.flag.replace(/TransactionFlag\./g, '').replace(/_/g, ' ')}
                />
              </td>
              <td className="px-4 py-2 font-data text-ink-secondary">{Math.round((a.confidence || 0) * 100)}%</td>
              <td className="px-4 py-2 font-data text-ink-muted">
                {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                No alerts detected for this case.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
