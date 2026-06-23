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
      <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 animate-pulse text-xs">
        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3 mb-3"></div>
        <div className="h-8 bg-slate-50 dark:bg-slate-900 rounded"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm text-xs">
      <div className="flex items-start justify-between border-b border-borderLight dark:border-borderDark pb-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span>Benford's Law Forensic Audit</span>
            {data.applicable && (
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase border ${
                data.significant_deviation 
                  ? 'bg-danger/10 text-danger border-danger/20 dark:bg-danger/5' 
                  : 'bg-success/10 text-success border-success/20 dark:bg-success/5'
              }`}>
                {data.significant_deviation ? 'Deviation Detected' : 'Normal Distribution'}
              </span>
            )}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
            Statistical check of leading digits against Benford's logarithmic expected frequencies.
          </p>
        </div>
      </div>

      {!data.applicable ? (
        <div className="bg-slate-50 dark:bg-slate-900 border border-borderLight dark:border-borderDark rounded-xl p-4 text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
          <span className="font-bold text-slate-800 dark:text-slate-200">Not Applicable:</span> {data.reason}
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Stats Metrics Row */}
          <div className="grid grid-cols-3 gap-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl p-3 border border-borderLight dark:border-borderDark">
            <div className="text-center">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Sample Size</div>
              <div className="text-base font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{data.sample_size}</div>
            </div>
            <div className="text-center border-x border-borderLight dark:border-borderDark">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Chi-Square</div>
              <div className="text-base font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{data.chi_square}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">p-value</div>
              <div className="text-base font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{data.p_value}</div>
            </div>
          </div>

          {/* Deviation alert narrative */}
          {data.significant_deviation ? (
            <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 text-danger leading-relaxed font-medium">
              <span className="font-bold">Anomalous Distribution Alert:</span> The p-value ({data.p_value}) is below the significance threshold (0.05), indicating a statistically abnormal transaction digit distribution. This suggests possible ledger tampering, manual structuring, or artificial bookkeeping.
            </div>
          ) : (
            <div className="bg-success/5 border border-success/20 rounded-xl p-4 text-success leading-relaxed font-medium">
              <span className="font-bold">Distribution Conforming:</span> Transaction digits conform to Benford's Law (p-value {data.p_value} &ge; 0.05). No statistical indicators of artificial transaction structuring detected.
            </div>
          )}

          {/* Inline bar chart of distribution */}
          <div className="space-y-3 pt-2">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Digit Frequencies (Observed vs Expected)</div>
            <div className="grid grid-cols-9 gap-1.5 items-end h-32 pt-4 border-b border-l border-borderLight dark:border-borderDark px-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
                const obs = (data.observed_distribution || {})[d] || 0.0;
                const exp = (data.expected_distribution || {})[d] || 0.0;
                const obsHeight = `${Math.min(100, obs * 250)}%`;
                const expHeight = `${Math.min(100, exp * 250)}%`;

                return (
                  <div key={d} className="flex flex-col items-center h-full justify-end relative group">
                    <div className="flex w-full items-end gap-0.5 justify-center h-full">
                      {/* Expected (Logarithmic) Bar */}
                      <div
                        className="w-2 bg-slate-200 dark:bg-slate-800 rounded-t transition-all duration-300 relative group-hover:bg-slate-300 dark:group-hover:bg-slate-750"
                        style={{ height: expHeight }}
                        title={`Expected Digit ${d}: ${(exp * 100).toFixed(1)}%`}
                      ></div>
                      {/* Observed Bar */}
                      <div
                        className={`w-2 rounded-t transition-all duration-300 relative ${
                          data.significant_deviation 
                            ? 'bg-danger group-hover:bg-danger/80' 
                            : 'bg-success group-hover:bg-success/80'
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
            
            <div className="flex justify-center gap-5 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 bg-slate-200 dark:bg-slate-800 rounded"></span>
                <span>Expected Frequencies</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded ${
                  data.significant_deviation ? 'bg-danger' : 'bg-success'
                }`}></span>
                <span>Observed Frequencies</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
