import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

const TIER_COLORS = {
  CROSS_VALIDATED_HIGH: 'bg-rose-50 text-rose-700 border border-rose-200',
  DIVERGENT_ALGO_ONLY: 'bg-amber-50 text-amber-700 border border-amber-200',
  DIVERGENT_LLM_ONLY: 'bg-purple-50 text-purple-700 border border-purple-200',
  ALGO_FLAGGED_PENDING_REVIEW: 'bg-sky-50 text-sky-700 border border-sky-200',
  ALGO_CLEAR_NOT_REVIEWED: 'bg-slate-100 text-slate-600 border border-slate-200',
  CROSS_VALIDATED_CLEAR: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

const FACTOR_LABELS = {
  watchlist_hit: 'Watchlist Hit (Max 25 pts)',
  rule_severity: 'Rule Engine Flags (Max 20 pts)',
  isolation_forest: 'ML Anomaly Score (Max 20 pts)',
  taint_propagation: 'Risk Taint Propagation (Max 20 pts)',
  betweenness: 'Network Centrality (Max 15 pts)',
};

const FACTOR_COLORS = {
  watchlist_hit: 'bg-red-500',
  rule_severity: 'bg-amber-500',
  isolation_forest: 'bg-indigo-500',
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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
        <span className="ml-3 text-sm text-slate-500">Loading verdicts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Consolidated Risk Verdicts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-validation of statistical rules, graph GDS, and blind LLM second opinions.
          </p>
        </div>
        <button
          onClick={loadVerdicts}
          className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md font-medium transition"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {verdicts.map((v) => {
          const breakdown = v.score_breakdown || {};
          const isLlmReviewed = v.llm_verdict !== 'NOT_REVIEWED';

          return (
            <div
              key={v.account_id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200"
            >
              {/* Card Header */}
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-slate-800">
                      {v.account_id}
                    </span>
                    <span className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full uppercase ${TIER_COLORS[v.agreement_tier] || 'bg-slate-100 text-slate-600'}`}>
                      {v.agreement_tier.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {v.tier_label}
                  </div>
                </div>

                {/* Composite Score Circle badge */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Composite Score</div>
                    <div className="text-xs text-slate-400 font-medium">Algo Verdict: <span className="font-bold text-slate-700">{v.algo_verdict}</span></div>
                  </div>
                  <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-900 text-white font-semibold text-lg relative">
                    {v.composite_score}
                    <div className="absolute inset-0.5 rounded-full border border-white/20"></div>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side: breakdown bars */}
                <div className="space-y-3.5">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Signal Breakdown</h4>
                  {Object.entries(FACTOR_LABELS).map(([key, label]) => {
                    const value = breakdown[key] || 0.0;
                    const maxVal = key === 'watchlist_hit' ? 25 : key === 'betweenness' ? 15 : 20;
                    const pct = Math.min(100, (value / maxVal) * 100);
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-slate-600">{label}</span>
                          <span className="text-slate-900 font-semibold">{value} pts</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`${FACTOR_COLORS[key]} h-full rounded-full transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right side: LLM audit review */}
                <div className="flex flex-col justify-between border-l border-slate-100 pl-0 md:pl-6">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span>Blind AI Second Opinion</span>
                      {isLlmReviewed && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          v.llm_verdict === 'SUSPICIOUS' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
                        }`}>
                          {v.llm_verdict} (Conf: {v.llm_confidence})
                        </span>
                      )}
                    </h4>

                    {isLlmReviewed ? (
                      <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 text-xs text-slate-600 leading-relaxed italic">
                        "{v.llm_reasoning}"
                      </div>
                    ) : (
                      <div className="bg-slate-50/50 border border-dashed border-slate-200 rounded-lg p-4 text-center">
                        <p className="text-xs text-slate-500 leading-relaxed mb-3">
                          This account fell outside the automatic audit pool limit (RULE 17). Click below to perform an on-demand audit.
                        </p>
                        <button
                          disabled={runningOpinion[v.account_id]}
                          onClick={() => triggerSecondOpinion(v.account_id)}
                          className="text-xs bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium px-4 py-2 rounded-md transition inline-flex items-center"
                        >
                          {runningOpinion[v.account_id] ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Running Blind Audit...
                            </>
                          ) : (
                            'Trigger Blind AI Audit'
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {isLlmReviewed && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        Audited: {v.reviewed_at ? new Date(v.reviewed_at).toLocaleString() : '—'}
                      </span>
                      <button
                        disabled={runningOpinion[v.account_id]}
                        onClick={() => triggerSecondOpinion(v.account_id)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold transition"
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
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-lg bg-slate-50">
            <span className="text-xs text-slate-400">No account verdicts available. Please trigger an analysis first.</span>
          </div>
        )}
      </div>
    </div>
  );
}
