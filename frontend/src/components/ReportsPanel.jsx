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
  const [officerBadge, setOfficerBadge] = useState('');
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageError, setPackageError] = useState('');

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

  const downloadEvidencePackage = async (e) => {
    e.preventDefault();
    if (!officerBadge.trim()) {
      setPackageError('Please enter your officer badge number.');
      return;
    }
    setPackageLoading(true);
    setPackageError('');
    try {
      const res = await apiClient.post(
        `/cases/${caseId}/evidence-package`,
        {},
        {
          params: { officer_badge: officerBadge.trim() },
          responseType: 'blob'
        }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence_package_${caseId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPackageError('Failed to compile package. Please verify database connection and LLM state.');
    } finally {
      setPackageLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-risk-medium-bg border border-risk-medium/15 text-risk-medium text-xs rounded-lg p-3">
        All AI-generated narrative and risk scoring in these reports are investigative leads only
        and require expert human validation before use in any judicial proceeding.
      </div>

      {/* Individual Reports */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Individual Reports</h3>
        {REPORTS.map((r) => (
          <div key={r.key} className="bg-surface-raised border border-border-hairline rounded-lg p-4 flex items-center justify-between shadow-card">
            <span className="text-sm font-semibold text-ink-primary">{r.label}</span>
            <button
              onClick={() => download(r.key, r.filename)}
              disabled={busyKey === r.key}
              className="text-xs bg-accent hover:bg-accent-hover text-accent-fg font-semibold rounded-md px-4 py-2 transition-colors disabled:opacity-50"
            >
              {busyKey === r.key ? 'Generating...' : 'Download'}
            </button>
          </div>
        ))}
      </div>

      {/* Official Court-Ready Evidence Package */}
      <div className="border border-accent/20 bg-accent-subtle rounded-xl p-5 mt-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-accent/15 rounded-lg text-accent">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Court-Ready Evidence Package</h3>
            <p className="text-xs text-ink-secondary mt-0.5">
              Generates a secure ZIP file bundling PDF report, Excel ledger, investigator metadata, and a cryptographically signed SHA-256 integrity manifest audit log.
            </p>
          </div>
        </div>

        <form onSubmit={downloadEvidencePackage} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Officer Badge Number (e.g. KA-9821)"
            value={officerBadge}
            onChange={e => setOfficerBadge(e.target.value)}
            className="flex-1 p-2 border border-border rounded-md text-sm bg-surface-raised text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={packageLoading || !officerBadge.trim()}
            className="bg-accent hover:bg-accent-hover text-accent-fg font-semibold text-sm rounded-md px-5 py-2 disabled:opacity-40 transition-colors"
          >
            {packageLoading ? 'Compiling ZIP...' : 'Compile Evidence ZIP'}
          </button>
        </form>

        {packageError && (
          <div className="mt-2.5 text-xs text-risk-high font-semibold bg-risk-high-bg border border-risk-high/15 p-2.5 rounded-lg">
            {packageError}
          </div>
        )}
      </div>
    </div>
  );
}
