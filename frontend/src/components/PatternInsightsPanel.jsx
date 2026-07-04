import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

function formatAmount(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

export default function PatternInsightsPanel({ caseId, onFocusPattern, focusedKey }) {
  const [patterns, setPatterns] = useState(null);

  useEffect(() => {
    apiClient.get(`/cases/${caseId}/graph/patterns`).then((r) => setPatterns(r.data));
  }, [caseId]);

  if (!patterns) {
    return <div className="text-sm text-ink-muted py-3">Scanning for patterns...</div>;
  }

  const cards = [];

  patterns.fan_out.forEach((p, i) => {
    const key = `fan_out_${i}`;
    cards.push({
      key, type: 'fan_out',
      title: 'Fan-out detected',
      summary: `${p.hub} sent to ${p.targets.length} accounts — ${formatAmount(p.total_amount)} total across ${p.txn_count} transfer(s)`,
      data: p,
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      activeClass: 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 ring-2 ring-blue-500/20',
      inactiveClass: 'border-border-hairline bg-surface-raised hover:border-blue-400 dark:hover:border-blue-500/50',
    });
  });

  patterns.fan_in.forEach((p, i) => {
    const key = `fan_in_${i}`;
    cards.push({
      key, type: 'fan_in',
      title: 'Fan-in detected',
      summary: `${p.sources.length} accounts sent into ${p.hub} — ${formatAmount(p.total_amount)} total across ${p.txn_count} transfer(s)`,
      data: p,
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      activeClass: 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/30 ring-2 ring-purple-500/20',
      inactiveClass: 'border-border-hairline bg-surface-raised hover:border-purple-400 dark:hover:border-purple-500/50',
    });
  });

  patterns.circular_flows.forEach((p, i) => {
    const key = `circular_${i}`;
    cards.push({
      key, type: 'circular',
      title: 'Round-trip flow detected',
      summary: `Money returned to origin after ${p.hops.length} hop(s) over ${p.duration_days} day(s) — ${formatAmount(p.total_amount)} moved`,
      data: p,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      activeClass: 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-amber-500/20',
      inactiveClass: 'border-border-hairline bg-surface-raised hover:border-amber-400 dark:hover:border-amber-500/50',
    });
  });

  patterns.layering_chains.forEach((p, i) => {
    const key = `layering_${i}`;
    cards.push({
      key, type: 'layering',
      title: 'Layering chain detected',
      summary: `${p.path.length}-hop chain, amount shrinking ~${p.shrink_pct}% per hop — consistent with a skimming fee at each layer`,
      data: p,
      badgeColor: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
      activeClass: 'border-pink-500 bg-pink-50/70 dark:bg-pink-950/30 ring-2 ring-pink-500/20',
      inactiveClass: 'border-border-hairline bg-surface-raised hover:border-pink-400 dark:hover:border-pink-500/50',
    });
  });

  if (cards.length === 0) {
    return (
      <div className="text-sm text-ink-muted py-3">
        No fan-out, fan-in, round-trip, or layering patterns detected on the
        currently loaded accounts.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-ink-muted mb-1 flex items-center justify-between">
        <span>{cards.length} pattern(s) detected</span>
        {focusedKey && (
          <button
            onClick={() => onFocusPattern(null)}
            className="text-[10px] text-accent hover:underline font-semibold"
          >
            Clear Focus
          </button>
        )}
      </div>
      <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => onFocusPattern(focusedKey === c.key ? null : c)}
            className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
              focusedKey === c.key ? c.activeClass : c.inactiveClass
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-ink-primary">{c.title}</div>
              <span className={`text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${c.badgeColor}`}>
                {c.type === 'circular' ? 'round-trip' : c.type.replace('_', '-')}
              </span>
            </div>
            <div className="text-xs text-ink-secondary mt-1">{c.summary}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
