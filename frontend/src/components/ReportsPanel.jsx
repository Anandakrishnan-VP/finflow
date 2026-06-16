import { useState } from 'react';
import { apiClient } from '../api/client';

const REPORTS = [
  { key: 'pdf',   label: 'Full Investigation Report (PDF)', filename: 'report.pdf' },
  { key: 'excel', label: 'Transaction Workbook (Excel)',    filename: 'report.xlsx' },
  { key: 'brief', label: 'Magistrate Brief (PDF)',          filename: 'brief.pdf' },
  { key: 'str',   label: 'STR Draft (XML, FIU-IND)',        filename: 'str_draft.xml' },
];

export default function ReportsPanel({ caseId }) {
  const [busyKey, setBusyKey] = useState(null);

  const download = async (key, filename) => {
    setBusyKey(key);
    try {
      const res = await apiClient.post(`/cases/${caseId}/reports/${key}`, {}, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3">
        All AI-generated narrative and risk scoring in these reports are investigative leads only
        and require expert human validation before use in any judicial proceeding.
      </div>
      {REPORTS.map((r) => (
        <div key={r.key} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm text-slate-700">{r.label}</span>
          <button onClick={() => download(r.key, r.filename)} disabled={busyKey === r.key}
                  className="text-sm bg-slate-900 text-white rounded px-4 py-1.5 disabled:opacity-50">
            {busyKey === r.key ? 'Generating...' : 'Download'}
          </button>
        </div>
      ))}
    </div>
  );
}
