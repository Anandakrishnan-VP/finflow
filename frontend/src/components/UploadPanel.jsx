import { useState } from 'react';
import { apiClient } from '../api/client';

const BANKS = ['sbi', 'hdfc', 'axis', 'kotak', 'icici', 'yes_bank', 'pnb', 'canara', 'union_bank'];

export default function UploadPanel({ caseId, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [statements, setStatements] = useState([]);
  const [bankOverride, setBankOverride] = useState({});
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const override = bankOverride[file.name];
        const params = override ? { bank_override: override } : {};
        const { data } = await apiClient.post(`/cases/${caseId}/statements`, formData, {
          params, headers: { 'Content-Type': 'multipart/form-data' },
        });
        setStatements((s) => [...s, { filename: file.name, ...data }]);
      } catch (err) {
        const detail = err.response?.data?.detail || 'Upload failed';
        setStatements((s) => [...s, { filename: file.name, status: 'FAILED', error: detail }]);
      }
    }
    setFiles([]);
    setUploading(false);
    if (onUploaded) onUploaded();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx"
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

      <div className="bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400 text-xs">
            <tr><th className="px-4 py-2">File</th><th className="px-4 py-2">Bank</th>
                <th className="px-4 py-2">Status</th><th className="px-4 py-2">Rows</th></tr>
          </thead>
          <tbody>
            {statements.map((s, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{s.filename}</td>
                <td className="px-4 py-2 text-slate-500">{s.bank || '—'}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${s.status === 'PARSED' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {s.status}
                  </span>
                  {s.error && <div className="text-xs text-red-400 mt-0.5">{s.error}</div>}
                </td>
                <td className="px-4 py-2 text-slate-500">{s.rows_parsed ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
