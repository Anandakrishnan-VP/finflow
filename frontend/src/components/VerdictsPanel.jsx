import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

const TIER_COLORS = {
  CROSS_VALIDATED_HIGH: 'bg-danger/10 text-danger border border-danger/20 dark:bg-danger/5',
  DIVERGENT_ALGO_ONLY: 'bg-warning/10 text-warning border border-warning/20 dark:bg-warning/5',
  DIVERGENT_LLM_ONLY: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 dark:bg-purple-500/5',
  ALGO_FLAGGED_PENDING_REVIEW: 'bg-accent/10 text-accent border border-accent/20 dark:bg-accent/5',
  ALGO_CLEAR_NOT_REVIEWED: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
  CROSS_VALIDATED_CLEAR: 'bg-success/10 text-success border border-success/20 dark:bg-success/5',
};

const FACTOR_LABELS = {
  watchlist_hit: 'Watchlist Hit (Max 25 pts)',
  rule_severity: 'Rule Engine Flags (Max 20 pts)',
  isolation_forest: 'ML Anomaly Score (Max 20 pts)',
  taint_propagation: 'Risk Taint Propagation (Max 20 pts)',
  betweenness: 'Network Centrality (Max 15 pts)',
};

const FACTOR_COLORS = {
  watchlist_hit: 'bg-danger',
  rule_severity: 'bg-warning',
  isolation_forest: 'bg-accent',
  taint_propagation: 'bg-purple-500',
  betweenness: 'bg-teal-500',
};

export default function VerdictsPanel({ caseId }) {
  const [verdicts, setVerdicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningOpinion, setRunningOpinion] = useState({});

  const loadVerdicts = async () => {
    try {
      setLoading(true);
      const r = await apiClient.get(`/cases/${caseId}/verdicts`);
      setVerdicts(r.data);
    } catch (e) {
      console.error('Failed to load verdicts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVerdicts();
  }, [caseId]);

  const triggerSecondOpinion = async (accountId) => {
    try {
      setRunningOpinion(prev => ({ ...prev, [accountId]: true }));
      await apiClient.post(`/cases/${caseId}/accounts/${accountId}/second-opinion`);
      await loadVerdicts();
    } catch (e) {
      console.error('Failed to trigger second opinion:', e);
    } finally {
      setRunningOpinion(prev => ({ ...prev, [accountId]: false }));
    }
  };

  if (loading && verdicts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-accent animate-spin" />
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider animate-pulse">Loading verdicts...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs animate-fade-in">
      
      {/* Title Header */}
      <div className="flex justify-between items-center border-b border-borderLight dark:border-borderDark pb-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Consolidated Risk Verdicts</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Cross-validation of statistical rules, graph GDS algorithms, and blind AI second opinions.
          </p>
        </div>
        <button
          onClick={loadVerdicts}
          className="px-4 py-2 border border-borderLight dark:border-borderDark hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-btn transition"
        >
          Refresh Ledger
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 gap-6">
        {verdicts.map((v) => {
          const breakdown = v.score_breakdown || {};
          const isLlmReviewed = v.llm_verdict !== 'NOT_REVIEWED';

          return (
            <div
              key={v.account_id}
              className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise overflow-hidden shadow-sm hover:shadow-md transition duration-200"
            >
              {/* Card Header Section */}
              <div className="px-5 py-4 border-b border-borderLight dark:border-borderDark bg-slate-50/50 dark:bg-slate-900/30 flex flex-wrap gap-4 items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">
                      {v.account_id}
                    </span>
                    <span className={`text-[9px] font-bold tracking-wider px-2.5 py-1 rounded-full uppercase border ${TIER_COLORS[v.agreement_tier] || 'bg-slate-100 text-slate-600'}`}>
                      {v.agreement_tier.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {v.tier_label}
                  </div>
                </div>

                {/* Score badge indicator */}
                <div className="flex items-center gap-4">
                  <div className="text-right space-y-0.5">
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Composite Score</div>
                    <div className="text-[10px] text-slate-400 font-semibold">Algo Verdict: <span className="font-bold text-slate-700 dark:text-slate-200">{v.algo_verdict}</span></div>
                  </div>
                  
                  <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-900 dark:bg-slate-850 text-white font-extrabold text-lg relative shadow-inner">
                    {v.composite_score}
                    <div className="absolute inset-0.5 rounded-full border border-white/10"></div>
                  </div>
                </div>
              </div>

              {/* Card Body Section */}
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Signal Breakdown */}
                <div className="space-y-3.5">
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Signal Breakdown</h4>
                  {Object.entries(FACTOR_LABELS).map(([key, label]) => {
                    const value = breakdown[key] || 0.0;
                    const maxVal = key === 'watchlist_hit' ? 25 : key === 'betweenness' ? 15 : 20;
                    const pct = Math.min(100, (value / maxVal) * 100);
                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className="text-slate-600 dark:text-slate-400">{label}</span>
                          <span className="text-slate-900 dark:text-slate-200">{value} pts</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`${FACTOR_COLORS[key]} h-full rounded-full transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* LLM Audit panel */}
                <div className="flex flex-col justify-between border-t md:border-t-0 md:border-l border-borderLight dark:border-borderDark pt-6 md:pt-0 pl-0 md:pl-6">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                      <span>Blind AI Second Opinion</span>
                      {isLlmReviewed && (
                        <span className={`text-[9px] px-2.5 py-1 rounded-full border font-bold uppercase ${
                          v.llm_verdict === 'SUSPICIOUS' 
                            ? 'bg-danger/10 text-danger border-danger/20 dark:bg-danger/5' 
                            : 'bg-success/10 text-success border-success/20 dark:bg-success/5'
                        }`}>
                          {v.llm_verdict} (Conf: {v.llm_confidence})
                        </span>
                      )}
                    </h4>

                    {isLlmReviewed ? (
                      <div className="bg-slate-50 dark:bg-slate-900 border border-borderLight dark:border-borderDark rounded-xl p-4 text-slate-600 dark:text-slate-400 leading-relaxed font-semibold italic">
                        "{v.llm_reasoning}"
                      </div>
                    ) : (
                      <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-dashed border-borderLight dark:border-borderDark rounded-xl p-5 text-center">
                        <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                          This account fell outside the automatic audit pool limit (RULE 17). Click below to perform an on-demand audit.
                        </p>
                        <button
                          disabled={runningOpinion[v.account_id]}
                          onClick={() => triggerSecondOpinion(v.account_id)}
                          className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-white font-bold px-4 py-2.5 rounded-btn transition inline-flex items-center gap-1.5 shadow-sm"
                        >
                          {runningOpinion[v.account_id] && (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          )}
                          <span>{runningOpinion[v.account_id] ? 'Running Blind Audit...' : 'Trigger Blind AI Audit'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isLlmReviewed && (
                    <div className="mt-4 pt-3.5 border-t border-borderLight dark:border-borderDark flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-medium">
                        Audited: {v.reviewed_at ? new Date(v.reviewed_at).toLocaleString() : '—'}
                      </span>
                      <button
                        disabled={runningOpinion[v.account_id]}
                        onClick={() => triggerSecondOpinion(v.account_id)}
                        className="text-[11px] text-accent hover:text-accent-hover font-bold transition"
                      >
                        {runningOpinion[v.account_id] ? 'Auditing...' : 'Re-run AI Audit'}
                      </button>
                    </div>
                  )}
                </div>

              </div>

            </div>
          );
        })}

        {verdicts.length === 0 && (
          <div className="text-center py-12 border border-dashed border-borderLight dark:border-borderDark rounded-enterprise bg-slate-50/50 dark:bg-slate-900/10">
            <span className="text-slate-400">No account verdicts available. Please execute pipeline from the Overview tab.</span>
          </div>
        )}
      </div>

    </div>
  );
}
