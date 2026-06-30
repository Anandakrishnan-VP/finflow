import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

const BANKS = [
  'sbi', 'hdfc', 'axis', 'kotak',
  'indusind', 'idfc', 'bandhan', 'yes_bank',
  'icici', 'pnb', 'canara', 'union_bank',
];

function ProcessingStatus({ statement }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (statement.status !== 'PROCESSING' && statement.status !== 'PENDING') return;

    const getElapsed = () => {
      if (!statement.uploaded_at) return 0;
      const uploadedTime = new Date(statement.uploaded_at).getTime();
      return Math.max(0, Math.floor((Date.now() - uploadedTime) / 1000));
    };

    setElapsed(getElapsed());

    const interval = setInterval(() => {
      setElapsed(getElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [statement.status, statement.uploaded_at]);

  const isOCR = statement.stage?.toLowerCase().includes('ocr') || statement.stage?.toLowerCase().includes('scanned');
  const estimatedTotal = isOCR ? 45 : 10;
  const remaining = Math.max(1, estimatedTotal - elapsed);

  const getSupportMessage = () => {
    if (statement.status === 'PENDING') return "Queueing statement for analysis...";
    if (isOCR) {
      if (elapsed > 45) return "Performing heavy OCR layout analysis (this is normal for scanned files)...";
      if (elapsed > 25) return "Running character recognition and table alignment...";
      return "Extracting scan components using neural OCR...";
    }
    if (elapsed > 10) return "Validating parsed columns and transaction entries...";
    return "Analyzing document layout...";
  };

  return (
    <div className="flex flex-col gap-1 w-64">
      <div className="flex justify-between items-center text-xs">
        <span className="font-bold text-accent bg-accent-subtle border border-accent/20 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 animate-pulse">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-ping"></span>
          {statement.status}
        </span>
        <span className="text-ink-muted font-data text-[10px]">{statement.progress || 0}%</span>
      </div>
      <div className="w-full bg-surface-sunken rounded-full h-1.5 overflow-hidden relative border border-border-hairline">
        <div 
          className="bg-accent h-1.5 rounded-full transition-all duration-300 relative" 
          style={{ width: `${statement.progress || 0}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer"></div>
        </div>
      </div>
      {statement.stage && (
        <div className="text-[10px] text-ink-secondary font-medium truncate" title={statement.stage}>
          Stage: {statement.stage}
        </div>
      )}
      <div className="text-[10px] text-ink-muted italic">
        {getSupportMessage()} 
        {statement.status === 'PROCESSING' && (
          <span className="font-semibold font-data text-ink-secondary ml-1">
            (Est. remaining: {remaining}s)
          </span>
        )}
      </div>
    </div>
  );
}

export default function UploadPanel({ caseId, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [statements, setStatements] = useState([]);
  const [bankOverride, setBankOverride] = useState({});
  const [uploading, setUploading] = useState(false);
  
  const [mapperStatement, setMapperStatement] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mapping, setMapping] = useState({ date: '', narration: '', debit: '', credit: '', amount: '', balance: '' });
  const [reparsing, setReparsing] = useState(false);

  const fetchStatements = async () => {
    try {
      const { data } = await apiClient.get(`/cases/${caseId}/statements`);
      setStatements(data);
    } catch (err) {
      console.error('Failed to load statements', err);
    }
  };

  useEffect(() => {
    fetchStatements();
  }, [caseId]);

  // Poll for updates if any statement is still processing or pending
  useEffect(() => {
    const needsPolling = statements.some(s => s.status === 'PROCESSING' || s.status === 'PENDING');
    if (!needsPolling) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await apiClient.get(`/cases/${caseId}/statements`);
        setStatements(data);
        const stillNeedsPolling = data.some(s => s.status === 'PROCESSING' || s.status === 'PENDING');
        if (!stillNeedsPolling && onUploaded) {
          onUploaded();
        }
      } catch (err) {
        console.error('Error polling statements', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [statements, caseId, onUploaded]);

  const handleUpload = async () => {
    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const override = bankOverride[file.name];
        const params = override ? { bank_override: override } : {};
        await apiClient.post(`/cases/${caseId}/statements`, formData, {
          params, headers: { 'Content-Type': 'multipart/form-data' },
        });
        await fetchStatements();
      } catch (err) {
        const detail = err.response?.data?.detail || 'Upload failed';
        setStatements((s) => [...s, { filename: file.name, status: 'FAILED', error: detail }]);
      }
    }
    setFiles([]);
    setUploading(false);
  };

  const openColumnMapper = async (stmt) => {
    try {
      setMapperStatement(stmt);
      setPreviewRows([]);
      setPreviewLoading(true);
      const { data } = await apiClient.get(`/cases/${caseId}/statements/${stmt.id}/preview`);
      setPreviewRows(data.rows || []);
      if (stmt.column_mapping) {
        setMapping({
          date: stmt.column_mapping.date ?? '',
          narration: stmt.column_mapping.narration ?? '',
          debit: stmt.column_mapping.debit ?? '',
          credit: stmt.column_mapping.credit ?? '',
          amount: stmt.column_mapping.amount ?? '',
          balance: stmt.column_mapping.balance ?? '',
        });
      } else {
        setMapping({ date: '', narration: '', debit: '', credit: '', amount: '', balance: '' });
      }
    } catch (err) {
      alert('Failed to load file preview: ' + (err.response?.data?.detail || err.message));
      setMapperStatement(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const submitReparse = async () => {
    setReparsing(true);
    try {
      await apiClient.post(`/cases/${caseId}/statements/${mapperStatement.id}/reparse`, {
        column_mapping: {
          date: mapping.date !== '' ? parseInt(mapping.date) : null,
          narration: mapping.narration !== '' ? parseInt(mapping.narration) : null,
          debit: mapping.debit !== '' ? parseInt(mapping.debit) : null,
          credit: mapping.credit !== '' ? parseInt(mapping.credit) : null,
          amount: mapping.amount !== '' ? parseInt(mapping.amount) : null,
          balance: mapping.balance !== '' ? parseInt(mapping.balance) : null,
        }
      });
      setMapperStatement(null);
      await fetchStatements();
    } catch (err) {
      alert('Reparsing failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setReparsing(false);
    }
  };

  const maxCols = previewRows.reduce((max, r) => Math.max(max, r.length), 0);
  const previewCols = Array.from({ length: maxCols }, (_, i) => {
    return previewRows[0]?.[i] || `Col ${i}`;
  });

  return (
    <div className="space-y-4">
      <div className="bg-surface-raised border border-border-hairline rounded-lg p-4 shadow-card">
        <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx,.png,.jpg,.jpeg,.tiff,.webp,.bmp"
               onChange={(e) => setFiles(Array.from(e.target.files))}
               className="text-xs text-ink-secondary mb-3 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface-sunken file:text-ink-primary hover:file:bg-border/50 cursor-pointer" />
        {files.map((f) => (
          <div key={f.name} className="flex items-center gap-2 text-xs text-ink-secondary mb-1">
            <span className="truncate max-w-[200px]">{f.name}</span>
            <select value={bankOverride[f.name] || ''}
                    onChange={(e) => setBankOverride({ ...bankOverride, [f.name]: e.target.value })}
                    className="border border-border bg-surface-raised text-ink-primary rounded text-xs px-2 py-1 focus:border-accent outline-none">
              <option value="">Auto-detect bank</option>
              {BANKS.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
            </select>
          </div>
        ))}
        <button onClick={handleUpload} disabled={files.length === 0 || uploading}
                className="mt-2 bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold rounded px-4 py-2 disabled:opacity-50 transition-colors">
          {uploading ? 'Uploading...' : `Upload ${files.length || ''} file(s)`}
        </button>
        <p className="text-xs text-ink-muted mt-2">
          If a bank isn't auto-detected, select it manually from the dropdown before uploading.
        </p>
      </div>

      <div className="bg-surface-raised border border-border-hairline rounded-lg overflow-hidden shadow-card">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-muted text-xs bg-surface-sunken border-b border-border">
            <tr>
              <th className="px-4 py-2.5">File</th>
              <th className="px-4 py-2.5">Bank</th>
              <th className="px-4 py-2.5">Status & Progress</th>
              <th className="px-4 py-2.5">Rows</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s, i) => (
              <tr key={i} className="border-t border-border-hairline hover:bg-surface-sunken/40">
                <td className="px-4 py-3 font-semibold text-ink-primary">
                  <div>{s.filename}</div>
                  {s.parse_method && (
                    <div className="text-[10px] text-ink-muted mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="bg-surface-sunken text-ink-secondary border border-border-hairline rounded px-1.5 py-0.5 font-mono uppercase font-bold text-[8px] tracking-wider">
                        {s.parse_method.replace('_', ' ')}
                      </span>
                      {s.parse_quality_score !== null && s.parse_quality_score !== undefined && (
                        <span>
                          Quality: <strong className="text-ink-primary font-data">{Math.round(s.parse_quality_score * 100)}%</strong>
                        </span>
                      )}
                      {s.ocr_confidence_avg !== null && s.ocr_confidence_avg !== undefined && (
                        <span>
                          OCR: <strong className="text-ink-primary font-data">{Math.round(s.ocr_confidence_avg * 100)}%</strong>
                        </span>
                      )}
                    </div>
                  )}
                  {s.status === 'NEEDS_REVIEW' && s.needs_review_reason && (
                    <div className="text-[10px] text-risk-medium font-semibold bg-risk-medium-bg border border-risk-medium/15 rounded-md px-2 py-1 mt-1.5 max-w-xs break-words">
                      ⚠️ Needs Review: {s.needs_review_reason}
                    </div>
                  )}
                  {s.parse_warnings && s.parse_warnings.length > 0 && (
                    <div className="mt-1.5 max-w-xs space-y-1">
                      {s.parse_warnings.map((w, idx) => (
                        <div key={idx} className="text-[9px] text-risk-medium bg-risk-medium-bg/40 border-l-2 border-risk-medium pl-1.5 py-0.5 rounded-r">
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-secondary uppercase text-xs font-semibold">{s.bank || '—'}</td>
                <td className="px-4 py-3">
                  {s.status === 'PROCESSING' || s.status === 'PENDING' ? (
                    <ProcessingStatus statement={s} />
                  ) : s.status === 'PARSED' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-accent-subtle text-accent border border-accent/20">
                        PARSED
                      </span>
                      <button onClick={() => openColumnMapper(s)}
                              className="text-xs bg-surface-sunken hover:bg-border text-ink-secondary border border-border-hairline rounded px-2 py-0.5 font-semibold transition-colors">
                        ✏️ Adjust Map
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-risk-high-bg text-risk-high border border-risk-high/15">
                        {s.status}
                      </span>
                      {s.id && (
                        <button onClick={() => openColumnMapper(s)}
                                className="text-xs bg-accent hover:bg-accent-hover text-accent-fg font-semibold rounded px-2 py-0.5 shadow-sm transition-colors">
                          ✏️ Map Columns
                        </button>
                      )}
                    </div>
                  )}
                  {s.error && (
                    <div className="text-xs text-risk-high mt-1 max-w-xs break-words bg-risk-high-bg border border-risk-high/15 rounded-md p-2 font-medium">
                      {typeof s.error === 'object' && s.error.case_id ? (
                        <span>
                          {s.error.message}{' '}
                          <a
                            href={`/cases/${s.error.case_id}`}
                            className="underline text-accent hover:text-accent-hover font-semibold inline-block"
                          >
                            View Case: {s.error.case_title}
                          </a>
                        </span>
                      ) : (
                        typeof s.error === 'object' ? s.error.message || 'Upload failed' : s.error
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-secondary font-data text-xs">
                  {s.rows_parsed !== undefined && s.rows_parsed !== null ? (
                    <div>
                      <div className="font-bold text-ink-primary">{s.rows_parsed} rows</div>
                      {(s.extracted_row_count !== undefined || s.duplicate_row_count !== undefined || s.rejected_row_count !== undefined) && (
                        <div className="text-[10px] text-ink-muted space-y-0.5 mt-1">
                          {s.extracted_row_count !== null && <div>Extracted: {s.extracted_row_count}</div>}
                          {s.duplicate_row_count > 0 && <div className="text-risk-medium font-semibold">Dupes: {s.duplicate_row_count}</div>}
                          {s.rejected_row_count > 0 && <div className="text-risk-high font-semibold">Rejected: {s.rejected_row_count}</div>}
                        </div>
                      )}
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Column Mapper Modal */}
      {mapperStatement && (
        <div className="fixed inset-0 bg-surface-shading/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface-raised rounded-xl shadow-card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-border-hairline">
            {/* Header */}
            <div className="px-6 py-4 bg-surface-sunken border-b border-border flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-ink-primary text-lg">Manual Column Mapping</h3>
                <p className="text-xs text-ink-secondary truncate max-w-lg">{mapperStatement.filename}</p>
              </div>
              <button onClick={() => setMapperStatement(null)} className="text-ink-muted hover:text-ink-primary transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-surface-sunken p-4 rounded-lg border border-border-hairline">
                <div>
                  <label className="block text-xs font-semibold text-ink-secondary mb-1">Date Column *</label>
                  <select value={mapping.date} onChange={(e) => setMapping({...mapping, date: e.target.value})}
                          className="w-full text-xs border border-border bg-surface-raised text-ink-primary rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Narration Column * <span className="text-slate-400 font-normal">(Transaction Details / Description)</span>
                  </label>
                  <select value={mapping.narration} onChange={(e) => setMapping({...mapping, narration: e.target.value})}
                          className="w-full text-xs border border-border bg-surface-raised text-ink-primary rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-secondary mb-1">Debit / Withdrawal</label>
                  <select value={mapping.debit} onChange={(e) => setMapping({...mapping, debit: e.target.value})}
                          className="w-full text-xs border border-border bg-surface-raised text-ink-primary rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-secondary mb-1">Credit / Deposit</label>
                  <select value={mapping.credit} onChange={(e) => setMapping({...mapping, credit: e.target.value})}
                          className="w-full text-xs border border-border bg-surface-raised text-ink-primary rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-secondary mb-1">Single Amount Column</label>
                  <select value={mapping.amount} onChange={(e) => setMapping({...mapping, amount: e.target.value})}
                          className="w-full text-xs border border-border bg-surface-raised text-ink-primary rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-secondary mb-1">Balance Column</label>
                  <select value={mapping.balance} onChange={(e) => setMapping({...mapping, balance: e.target.value})}
                          className="w-full text-xs border border-border bg-surface-raised text-ink-primary rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-primary">Preview Data (First 10 Rows)</span>
                {previewLoading ? (
                  <div className="border border-border rounded-lg p-8 flex flex-col items-center justify-center gap-2 text-ink-muted">
                    <svg className="w-6 h-6 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    <span className="text-xs">Generating preview… For scanned PDFs this may take 5–15 seconds while OCR runs.</span>
                  </div>
                ) : previewRows.length === 0 ? (
                  <div className="border border-border rounded-lg p-6 text-center text-xs text-ink-muted bg-surface-sunken/40">
                    ⚠️ No preview rows could be extracted from this file.<br/>
                    <span className="text-ink-muted">If this is a scanned PDF, try closing and re-opening the mapper — OCR may still be initializing.</span>
                  </div>
                ) : (
                <div className="border border-border rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-surface-sunken sticky top-0 border-b border-border">
                      <tr>
                        {previewCols.map((_, idx) => (
                          <th key={idx} className="px-3 py-2 text-left text-ink-secondary font-semibold border-r border-border bg-surface-sunken">
                            Column {idx}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 10).map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-border hover:bg-surface-sunken/30">
                          {previewCols.map((_, colIdx) => (
                            <td key={colIdx} className="px-3 py-2 border-r border-border max-w-[200px] truncate text-ink-secondary" title={row[colIdx] || ''}>
                              {row[colIdx] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-surface-sunken border-t border-border flex justify-end gap-3">
              <button onClick={() => setMapperStatement(null)} className="border border-border text-ink-secondary px-4 py-2 rounded text-xs hover:bg-surface-sunken bg-surface-raised transition-colors">
                Cancel
              </button>
              <button onClick={submitReparse} disabled={reparsing || !mapping.date || (!mapping.amount && !mapping.debit && !mapping.credit)}
                      className="bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 rounded text-xs disabled:opacity-50 font-semibold transition-colors">
                {reparsing ? 'Reparsing...' : 'Save & Reparse'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
