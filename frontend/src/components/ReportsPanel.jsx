import { useState } from 'react';
import { apiClient } from '../api/client';

const REPORTS = [
  { key: 'pdf',   label: 'Full Investigation Report', format: 'PDF Document', desc: 'Detailed crime dossier containing ML ensemble analysis, graph insights, and narrative summaries.', filename: 'report.pdf' },
  { key: 'excel', label: 'Transaction Workbook',    format: 'Excel Ledger', desc: 'Consolidated spreadsheet workbook containing all transaction trails, FIFO traces, and entities.', filename: 'report.xlsx' },
  { key: 'brief', label: 'Magistrate Brief',          format: 'PDF Document', desc: 'Synthesized brief customized for court filing under Indian Evidence Act guidelines.', filename: 'brief.pdf' },
  { key: 'str',   label: 'STR Draft XML',        format: 'FIU-IND XML',  desc: 'Draft Suspicious Transaction Report schema ready for FIU-IND portal import.', filename: 'str_draft.xml' },
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      
      {/* LEFT COLUMN: Report Catalog Cards (7 Columns) */}
      <div className="lg:col-span-7 space-y-6 text-xs flex flex-col justify-between">
        <div className="space-y-6">
          
          {/* Legal alert notice banner */}
          <div className="bg-warning/5 border border-warning/20 text-warning dark:text-warning-light p-4 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <span className="font-bold">Investigative Lead Disclaimer</span>
              <p className="mt-0.5 font-medium opacity-80 leading-relaxed">
                All AI-generated narrative summaries, risk calculations, and node associations are leads for investigation and require professional validation before being submitted to any court of law.
              </p>
            </div>
          </div>

          {/* Individual Report Cards Grid */}
          <div className="space-y-3.5">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Available Investigation Formats</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {REPORTS.map((r) => (
                <div key={r.key} className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-4 shadow-sm hover-elevation flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-slate-800 dark:text-white text-xs">{r.label}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {r.format}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-2 font-medium leading-relaxed">{r.desc}</p>
                  </div>
                  
                  <button 
                    onClick={() => download(r.key, r.filename)} 
                    disabled={busyKey === r.key}
                    className="w-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold rounded-btn py-2 text-center transition-all mt-4 flex items-center justify-center gap-1.5"
                  >
                    {busyKey === r.key ? (
                      <>
                        <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                        <span>Compiling...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        <span>Download</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Official Court-Ready Evidence Package Card */}
        <div className="border border-accent/20 bg-accent/5 dark:bg-accent/10 rounded-enterprise p-5 shadow-sm mt-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2.5 bg-accent/10 rounded-xl text-accent shadow-inner">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Court-Ready Evidence Package Compilation</h3>
              <p className="text-slate-400 mt-1 leading-relaxed">
                Generates a secure ZIP file bundling the PDF dossier, Excel ledger, investigator metadata, and a cryptographically signed SHA-256 integrity manifest audit log.
              </p>
            </div>
          </div>

          <form onSubmit={downloadEvidencePackage} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Officer Badge Number (e.g. KA-9821)"
              value={officerBadge}
              onChange={e => setOfficerBadge(e.target.value)}
              className="flex-1 p-2.5 border border-borderLight dark:border-borderDark rounded-btn bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-semibold focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={packageLoading || !officerBadge.trim()}
              className="bg-accent hover:bg-accent-hover text-white font-bold rounded-btn px-5 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-accent/20"
            >
              {packageLoading ? 'Compiling ZIP...' : 'Compile Evidence ZIP'}
            </button>
          </form>

          {packageError && (
            <div className="mt-3 text-danger font-semibold bg-danger/5 border border-danger/20 p-2.5 rounded-lg animate-pulse">
              {packageError}
            </div>
          )}
        </div>

      </div>

      {/* RIGHT COLUMN: Interactive Document Preview (5 Columns) */}
      <div className="lg:col-span-5 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise shadow-sm p-6 flex flex-col min-h-[480px]">
        <div className="border-b border-borderLight dark:border-borderDark pb-2.5 mb-5 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">Dossier Preview</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Court briefing structural preview layout.</p>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/20 uppercase tracking-wide">
            Ready
          </span>
        </div>

        {/* Mock PDF Document Layout */}
        <div className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-borderDark p-5 font-mono text-[9px] text-slate-500 dark:text-slate-400 flex flex-col justify-between shadow-inner">
          
          {/* Document Header */}
          <div className="border-b border-slate-300 dark:border-borderDark pb-3 text-center">
            <div className="font-bold text-slate-800 dark:text-white uppercase tracking-wider text-[10px]">Karnataka Police Department</div>
            <div className="font-bold text-slate-600 dark:text-slate-300 text-[8px] uppercase mt-0.5">Economic Offences Wing (EOW)</div>
            <div className="text-[7px] text-slate-400 mt-1">CONFIDENTIAL · INVESTIGATION NARRATIVE REPORT</div>
          </div>

          {/* Document Body details */}
          <div className="my-5 flex-1 space-y-4">
            
            {/* Section 1 */}
            <div className="space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300">I. CASE METADATA REFERENCE</div>
              <div className="grid grid-cols-2 gap-y-1 text-slate-400 pl-2">
                <div>Case Identifier:</div>
                <div className="font-bold text-slate-600 dark:text-slate-400">{caseId?.substring(0,8).toUpperCase()}...</div>
                <div>Statutory Act:</div>
                <div className="font-bold text-slate-600 dark:text-slate-400">Prevention of Money Laundering Act</div>
                <div>Status:</div>
                <div className="font-bold text-slate-600 dark:text-slate-400">UNDER ACTIVE INQUIRY</div>
              </div>
            </div>

            {/* Section 2 */}
            <div className="space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300">II. TARGET CRIME ANOMALIES DETECTED</div>
              <div className="space-y-1.5 pl-2">
                <div className="flex items-center gap-1 text-[8px] bg-white dark:bg-slate-950 p-1.5 border border-slate-100 dark:border-slate-800/80 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                  <span className="font-bold text-slate-600 dark:text-slate-300">STRUCTURING CRIME:</span> Flagged on account 48109-XX
                </div>
                <div className="flex items-center gap-1 text-[8px] bg-white dark:bg-slate-950 p-1.5 border border-slate-100 dark:border-slate-800/80 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                  <span className="font-bold text-slate-600 dark:text-slate-300">CIRCULAR FLOW:</span> Detected across 3 linked nodes
                </div>
              </div>
            </div>

            {/* Section 3 */}
            <div className="space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300">III. VERIFICATION CERTIFICATE CERTIFYING SECTION 65B</div>
              <p className="text-slate-400 pl-2 leading-relaxed text-[7.5px]">
                This is to certify that all digital evidence logs extracted from bank systems have been verified for integrity against SHA-256 hash chains.
              </p>
            </div>

          </div>

          {/* Document Footer Signature lines */}
          <div className="border-t border-slate-300 dark:border-borderDark pt-3 flex justify-between items-center text-[7px] text-slate-400">
            <div>HASH: 7C9E0D...B5E2</div>
            <div className="text-right">
              <div className="w-16 border-b border-slate-400 dark:border-slate-700 h-3 ml-auto" />
              <div className="mt-1">Investigating Officer Sign</div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
