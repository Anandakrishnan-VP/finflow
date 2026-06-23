import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function EntitiesPanel({ caseId }) {
  const [entities, setEntities] = useState([]);
  
  useEffect(() => { 
    apiClient.get(`/cases/${caseId}/entities`).then(r => setEntities(r.data)); 
  }, [caseId]);

  return (
    <div className="space-y-4 text-xs animate-fade-in">
      
      {/* Title description */}
      <div className="border-b border-borderLight dark:border-borderDark pb-2.5 mb-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">Resolved Entity Directory</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">Identified persons, PANs, phone numbers, and organizations mapped across statements.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {entities.map((e) => {
          const riskPercentage = Math.round((e.risk_score || 0) * 100);
          const isHighRisk = e.risk_score >= 0.7;
          const isMedRisk = e.risk_score >= 0.3 && e.risk_score < 0.7;

          return (
            <div key={e.id} className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm hover-elevation flex flex-col justify-between space-y-4">
              <div>
                <div className="flex justify-between items-start gap-2">
                  <div className="font-bold text-slate-800 dark:text-white text-sm">{e.canonical_name || 'Unnamed Entity'}</div>
                  {e.risk_score != null && (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase
                      ${isHighRisk 
                        ? 'bg-danger/10 text-danger border-danger/20 dark:bg-danger/5' 
                        : isMedRisk 
                          ? 'bg-warning/10 text-warning border-warning/20 dark:bg-warning/5' 
                          : 'bg-success/10 text-success border-success/20 dark:bg-success/5'
                      }`}
                    >
                      {isHighRisk ? 'High Risk' : isMedRisk ? 'Med Risk' : 'Low Risk'}
                    </span>
                  )}
                </div>
                
                {/* Linked accounts badges */}
                <div className="mt-3.5 space-y-1.5">
                  <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Linked Account Connections</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.isArray(e.linked_accounts) && e.linked_accounts.length > 0 ? (
                      e.linked_accounts.map(acc => (
                        <span key={acc} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-bold text-[9px]">
                          {acc}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">No connections resolved.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Risk bar indicator */}
              {e.risk_score != null && (
                <div className="space-y-1 border-t border-borderLight dark:border-borderDark pt-3">
                  <div className="flex justify-between text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                    <span>Ensemble Risk score</span>
                    <span className="font-mono">{riskPercentage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-1.5 rounded-full transition-all duration-300
                        ${isHighRisk ? 'bg-danger' : isMedRisk ? 'bg-warning' : 'bg-success'}`}
                      style={{ width: `${riskPercentage}%` }}
                    />
                  </div>
                </div>
              )}
              
            </div>
          );
        })}

        {entities.length === 0 && (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center text-slate-400 py-12">
            No resolved entities found. Click "Execute Pipeline" on Overview to identify markers.
          </div>
        )}
      </div>

    </div>
  );
}
