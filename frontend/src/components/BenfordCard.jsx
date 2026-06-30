import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function BenfordCard({ caseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get(`/cases/${caseId}/benford`)
      .then(r => setData(r.data))
      .catch(e => console.error('Failed to load Benford check:', e))
      .finally(() => setLoading(false));
  }, [caseId]);

  if (loading) {
    return (
      <div className="bg-surface-raised border border-border-hairline rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-surface-sunken rounded w-1/3 mb-3"></div>
        <div className="h-8 bg-surface-base rounded"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card">
      <div className="flex items-start justify-between border-b border-border-hairline pb-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
            <span>Benford's Law Forensic Audit</span>
            {data.applicable && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                data.significant_deviation ? 'bg-risk-high-bg text-risk-high border-risk-high/15' : 'bg-accent-subtle text-accent border-accent/20'
              }`}>
                {data.significant_deviation ? 'Deviation Detected' : 'Normal Distribution'}
              </span>
            )}
          </h3>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Statistical check of leading digits against Benford's logarithmic expected frequencies.
          </p>
        </div>
      </div>

      {!data.applicable ? (
        <div className="bg-surface-sunken border border-border-hairline rounded-md p-3 text-xs text-ink-secondary leading-relaxed">
          <span className="font-semibold text-ink-primary">Not Applicable:</span> {data.reason}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats Metrics Row */}
          <div className="grid grid-cols-3 gap-4 bg-surface-sunken/40 rounded-md p-3 border border-border-hairline">
            <div className="text-center">
              <div className="text-[10px] text-ink-muted font-bold uppercase tracking-wider">Sample Size</div>
              <div className="text-base font-bold text-ink-primary mt-0.5 font-data">{data.sample_size}</div>
            </div>
            <div className="text-center border-x border-border-hairline">
              <div className="text-[10px] text-ink-muted font-bold uppercase tracking-wider">Chi-Square</div>
              <div className="text-base font-bold text-ink-primary mt-0.5 font-data">{data.chi_square}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-ink-muted font-bold uppercase tracking-wider">p-value</div>
              <div className="text-base font-bold text-ink-primary mt-0.5 font-data">{data.p_value}</div>
            </div>
          </div>

          {/* Deviation alert narrative */}
          {data.significant_deviation ? (
            <div className="bg-risk-high-bg border border-risk-high/15 rounded-md p-3 text-xs text-risk-high leading-relaxed">
              <span className="font-semibold">PMLA Alert:</span> The p-value (<span className="font-data">{data.p_value}</span>) is below the 0.05 threshold of significance, indicating a statistically anomalous distribution of transaction amounts. This suggests potential fabrication of ledger entries or structured round-tripping.
            </div>
          ) : (
            <div className="bg-accent-subtle border border-accent/20 rounded-md p-3 text-xs text-accent leading-relaxed">
              <span className="font-semibold">Normal Distribution:</span> Digit frequencies conform to Benford's Law (p-value <span className="font-data">{data.p_value}</span> &ge; 0.05). No statistical indicators of artificial transaction structuring found.
            </div>
          )}

          {/* Inline bar chart of distribution */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">Digit Frequencies (Observed vs Expected)</div>
            <div className="grid grid-cols-9 gap-1.5 items-end h-32 pt-4 border-b border-l border-border px-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
                const obs = (data.observed_distribution || {})[d] || 0.0;
                const exp = (data.expected_distribution || {})[d] || 0.0;
                const obsHeight = `${Math.min(100, obs * 250)}%`;
                const expHeight = `${Math.min(100, exp * 250)}%`;

                return (
                  <div key={d} className="flex flex-col items-center h-full justify-end relative group">
                    <div className="flex w-full items-end gap-0.5 justify-center h-full">
                      {/* Expected (Logarithmic) Bar - Border/Slate */}
                      <div
                        className="w-2 bg-border rounded-t transition-all duration-300 relative group-hover:bg-ink-muted/30"
                        style={{ height: expHeight }}
                        title={`Expected Digit ${d}: ${(exp * 100).toFixed(1)}%`}
                      ></div>
                      {/* Observed Bar - Accent or Red */}
                      <div
                        className={`w-2 rounded-t transition-all duration-300 relative ${
                          data.significant_deviation ? 'bg-risk-high group-hover:opacity-90' : 'bg-accent group-hover:opacity-90'
                        }`}
                        style={{ height: obsHeight }}
                        title={`Observed Digit ${d}: ${(obs * 100).toFixed(1)}%`}
                      ></div>
                    </div>
                    {/* Tooltip detail on hover */}
                    <div className="absolute bottom-full mb-1 bg-surface-raised border border-border-hairline text-ink-primary text-[9px] px-1.5 py-0.5 rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-10 shadow-card font-data">
                      {d} - Obs: {(obs * 100).toFixed(1)}% | Exp: {(exp * 100).toFixed(1)}%
                    </div>
                    {/* Digit Label */}
                    <span className="text-[10px] font-semibold text-ink-secondary mt-1">{d}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 text-[10px] text-ink-secondary font-medium">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 bg-border rounded"></span>
                <span>Expected (Benford's Law)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded ${
                  data.significant_deviation ? 'bg-risk-high' : 'bg-accent'
                }`}></span>
                <span>Observed</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
