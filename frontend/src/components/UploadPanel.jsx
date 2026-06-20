import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

const BANKS = ['sbi', 'hdfc', 'axis', 'kotak', 'icici', 'yes_bank', 'pnb', 'canara', 'union_bank'];

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
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx,.png,.jpg,.jpeg,.tiff,.webp,.bmp"
               onChange={(e) => setFiles(Array.from(e.target.files))}
               className="text-sm mb-3" />
        {files.map((f) => (
          <div key={f.name} className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>{f.name}</span>
            <select value={bankOverride[f.name] || ''}
                    onChange={(e) => setBankOverride({ ...bankOverride, [f.name]: e.target.value })}
                    className="border border-slate-200 rounded text-xs px-1 py-0.5">
              <option value="">Auto-detect bank</option>
              {BANKS.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
            </select>
          </div>
        ))}
        <button onClick={handleUpload} disabled={files.length === 0 || uploading}
                className="mt-2 bg-slate-900 text-white text-sm rounded px-4 py-2 disabled:opacity-50">
          {uploading ? 'Uploading...' : `Upload ${files.length || ''} file(s)`}
        </button>
        <p className="text-xs text-slate-400 mt-2">
          If a bank isn't auto-detected, select it manually from the dropdown before uploading.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400 text-xs bg-slate-50">
            <tr>
              <th className="px-4 py-2.5">File</th>
              <th className="px-4 py-2.5">Bank</th>
              <th className="px-4 py-2.5">Status & Progress</th>
              <th className="px-4 py-2.5">Rows</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-700">{s.filename}</td>
                <td className="px-4 py-3 text-slate-500">{s.bank || '—'}</td>
                <td className="px-4 py-3">
                  {s.status === 'PROCESSING' || s.status === 'PENDING' ? (
                    <div className="flex flex-col gap-1 w-64">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                          {s.status}
                        </span>
                        <span className="text-slate-500 font-mono text-[10px]">{s.progress || 0}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${s.progress || 0}%` }}></div>
                      </div>
                      {s.stage && <div className="text-[10px] text-slate-400 truncate" title={s.stage}>{s.stage}</div>}
                    </div>
                  ) : s.status === 'PARSED' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                        PARSED
                      </span>
                      <button onClick={() => openColumnMapper(s)}
                              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded px-2 py-0.5 font-medium transition-colors">
                        ✏️ Adjust Map
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                        {s.status}
                      </span>
                      {s.id && (
                        <button onClick={() => openColumnMapper(s)}
                                className="text-xs bg-slate-800 hover:bg-slate-900 text-white rounded px-2 py-0.5 font-medium shadow-sm transition-colors">
                          ✏️ Map Columns
                        </button>
                      )}
                    </div>
                  )}
                  {s.error && <div className="text-xs text-red-400 mt-1 max-w-xs break-words">{s.error}</div>}
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono">{s.rows_parsed ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Column Mapper Modal */}
      {mapperStatement && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-100">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">Manual Column Mapping</h3>
                <p className="text-xs text-slate-500 truncate max-w-lg">{mapperStatement.filename}</p>
              </div>
              <button onClick={() => setMapperStatement(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Date Column *</label>
                  <select value={mapping.date} onChange={(e) => setMapping({...mapping, date: e.target.value})}
                          className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Narration Column *</label>
                  <select value={mapping.narration} onChange={(e) => setMapping({...mapping, narration: e.target.value})}
                          className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Debit / Withdrawal</label>
                  <select value={mapping.debit} onChange={(e) => setMapping({...mapping, debit: e.target.value})}
                          className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Credit / Deposit</label>
                  <select value={mapping.credit} onChange={(e) => setMapping({...mapping, credit: e.target.value})}
                          className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Single Amount Column</label>
                  <select value={mapping.amount} onChange={(e) => setMapping({...mapping, amount: e.target.value})}
                          className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Balance Column</label>
                  <select value={mapping.balance} onChange={(e) => setMapping({...mapping, balance: e.target.value})}
                          className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white">
                    <option value="">Select Column...</option>
                    {previewCols.map((c, idx) => (
                      <option key={idx} value={idx}>Column {idx} ({c ? c.substring(0, 20) : 'Empty'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-700">Preview Data (First 10 Rows)</span>
                {previewLoading ? (
                  <div className="border border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    <span className="text-xs">Generating preview… For scanned PDFs this may take 5–15 seconds while OCR runs.</span>
                  </div>
                ) : previewRows.length === 0 ? (
                  <div className="border border-slate-200 rounded-lg p-6 text-center text-xs text-slate-400">
                    ⚠️ No preview rows could be extracted from this file.<br/>
                    <span className="text-slate-300">If this is a scanned PDF, try closing and re-opening the mapper — OCR may still be initializing.</span>
                  </div>
                ) : (
                <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-slate-100 sticky top-0 border-b border-slate-200">
                      <tr>
                        {previewCols.map((_, idx) => (
                          <th key={idx} className="px-3 py-2 text-left text-slate-600 font-semibold border-r border-slate-200 bg-slate-100">
                            Column {idx}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 10).map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50">
                          {previewCols.map((_, colIdx) => (
                            <td key={colIdx} className="px-3 py-2 border-r border-slate-100 max-w-[200px] truncate" title={row[colIdx] || ''}>
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
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setMapperStatement(null)} className="border border-slate-200 text-slate-600 px-4 py-2 rounded text-xs hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={submitReparse} disabled={reparsing || !mapping.date || (!mapping.amount && !mapping.debit && !mapping.credit)}
                      className="bg-slate-900 text-white px-4 py-2 rounded text-xs hover:bg-slate-800 disabled:opacity-50 font-semibold">
                {reparsing ? 'Reparsing...' : 'Save & Reparse'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
