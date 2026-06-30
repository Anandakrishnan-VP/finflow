import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function EntitiesPanel({ caseId }) {
  const [entities, setEntities] = useState([]);
  useEffect(() => { apiClient.get(`/cases/${caseId}/entities`).then(r => setEntities(r.data)); }, [caseId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {entities.map((e) => (
        <div key={e.id} className="bg-surface-raised border border-border-hairline rounded-lg p-4 shadow-card">
          <div className="font-semibold text-ink-primary text-sm">{e.canonical_name || 'Unnamed entity'}</div>
          <div className="text-xs text-ink-muted mt-1.5">
            Linked accounts:{' '}
            <span className="font-mono text-ink-secondary font-medium">
              {Array.isArray(e.linked_accounts) ? e.linked_accounts.join(', ') : '—'}
            </span>
          </div>
          {e.risk_score != null && (
            <div className="text-xs text-ink-secondary mt-2 flex items-center gap-1.5">
              <span>Risk score:</span>
              <span className="font-data font-bold text-ink-primary">
                {Math.round(e.risk_score * 100)}%
              </span>
            </div>
          )}
        </div>
      ))}
      {entities.length === 0 && (
        <div className="col-span-2 text-center text-ink-muted text-sm py-8 bg-surface-raised border border-dashed border-border-hairline rounded-lg">
          No entities resolved yet — run identity resolution or upload statement files to link accounts.
        </div>
      )}
    </div>
  );
}
