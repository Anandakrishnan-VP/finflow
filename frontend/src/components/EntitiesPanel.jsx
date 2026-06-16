import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function EntitiesPanel({ caseId }) {
  const [entities, setEntities] = useState([]);
  useEffect(() => { apiClient.get(`/cases/${caseId}/entities`).then(r => setEntities(r.data)); }, [caseId]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {entities.map((e) => (
        <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="font-medium text-slate-900">{e.canonical_name || 'Unnamed entity'}</div>
          <div className="text-xs text-slate-400 mt-1">
            Linked accounts: {Array.isArray(e.linked_accounts) ? e.linked_accounts.join(', ') : '—'}
          </div>
          {e.risk_score != null && (
            <div className="text-xs text-slate-500 mt-2">Risk score: {Math.round(e.risk_score * 100)}%</div>
          )}
        </div>
      ))}
      {entities.length === 0 && (
        <div className="col-span-2 text-center text-slate-400 text-sm py-8">No entities resolved yet. Run analysis first.</div>
      )}
    </div>
  );
}
