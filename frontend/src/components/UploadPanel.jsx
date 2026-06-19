import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

const BANKS = ['sbi', 'hdfc', 'axis', 'kotak', 'icici', 'yes_bank', 'pnb', 'canara', 'union_bank'];

export default function UploadPanel({ caseId, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [statements, setStatements] = useState([]);
  const [bankOverride, setBankOverride] = useState({});
  const [uploading, setUploading] = useState(false);

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
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                      PARSED
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                      {s.status}
                    </span>
                  )}
                  {s.error && <div className="text-xs text-red-400 mt-1 max-w-xs break-words">{s.error}</div>}
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono">{s.rows_parsed ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

