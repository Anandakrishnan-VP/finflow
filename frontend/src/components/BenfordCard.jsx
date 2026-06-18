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
      <div className="bg-white border border-slate-200 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-3"></div>
        <div className="h-8 bg-slate-50 rounded"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span>Benford's Law Forensic Audit</span>
            {data.applicable && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                data.significant_deviation ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                {data.significant_deviation ? 'Deviation Detected' : 'Normal Distribution'}
              </span>
            )}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Statistical check of leading digits against Benford's logarithmic expected frequencies.
          </p>
        </div>
      </div>

      {!data.applicable ? (
        <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">Not Applicable:</span> {data.reason}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats Metrics Row */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50/50 rounded-lg p-3 border border-slate-100">
            <div className="text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sample Size</div>
              <div className="text-base font-semibold text-slate-800 mt-0.5">{data.sample_size}</div>
            </div>
            <div className="text-center border-x border-slate-150">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Chi-Square</div>
              <div className="text-base font-semibold text-slate-800 mt-0.5">{data.chi_square}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">p-value</div>
              <div className="text-base font-semibold text-slate-800 mt-0.5">{data.p_value}</div>
            </div>
          </div>

          {/* Deviation alert narrative */}
          {data.significant_deviation ? (
            <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-xs text-rose-800 leading-relaxed">
              <span className="font-semibold">PMLA Alert:</span> The p-value ({data.p_value}) is below the 0.05 threshold of significance, indicating a statistically anomalous distribution of transaction amounts. This suggests potential fabrication of ledger entries or structured round-tripping.
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 leading-relaxed">
              <span className="font-semibold">Normal Distribution:</span> Digit frequencies conform to Benford's Law (p-value {data.p_value} &ge; 0.05). No statistical indicators of artificial transaction structuring found.
            </div>
          )}

          {/* Inline bar chart of distribution */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Digit Frequencies (Observed vs Expected)</div>
            <div className="grid grid-cols-9 gap-1.5 items-end h-32 pt-4 border-b border-l border-slate-200 px-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
                const obs = (data.observed_distribution || {})[d] || 0.0;
                const exp = (data.expected_distribution || {})[d] || 0.0;
                const obsHeight = `${Math.min(100, obs * 250)}%`;
                const expHeight = `${Math.min(100, exp * 250)}%`;

                return (
                  <div key={d} className="flex flex-col items-center h-full justify-end relative group">
                    <div className="flex w-full items-end gap-0.5 justify-center h-full">
                      {/* Expected (Logarithmic) Bar - Slate/Silver */}
                      <div
                        className="w-2 bg-slate-200 rounded-t transition-all duration-300 relative group-hover:bg-slate-300"
                        style={{ height: expHeight }}
                        title={`Expected Digit ${d}: ${(exp * 100).toFixed(1)}%`}
                      ></div>
                      {/* Observed Bar - Cyan or Red */}
                      <div
                        className={`w-2 rounded-t transition-all duration-300 relative ${
                          data.significant_deviation ? 'bg-rose-500 group-hover:bg-rose-600' : 'bg-emerald-500 group-hover:bg-emerald-600'
                        }`}
                        style={{ height: obsHeight }}
                        title={`Observed Digit ${d}: ${(obs * 100).toFixed(1)}%`}
                      ></div>
                    </div>
                    {/* Tooltip detail on hover */}
                    <div className="absolute bottom-full mb-1 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-10 shadow">
                      {d} - Obs: {(obs * 100).toFixed(1)}% | Exp: {(exp * 100).toFixed(1)}%
                    </div>
                    {/* Digit Label */}
                    <span className="text-[10px] font-semibold text-slate-500 mt-1">{d}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 text-[10px] text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 bg-slate-200 rounded"></span>
                <span>Expected (Benford's Law)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded ${
                  data.significant_deviation ? 'bg-rose-500' : 'bg-emerald-500'
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
