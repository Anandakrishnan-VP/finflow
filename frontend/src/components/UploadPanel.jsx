import { useState, useRef } from 'react';
import { apiClient } from '../api/client';

const BANKS = ['sbi', 'hdfc', 'icici', 'axis', 'pnb', 'bob', 'canara', 'hsbc', 'citi', 'standard_chartered'];

export default function UploadPanel({ caseId, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  
  // Custom manual bank overrides per file
  const [bankOverride, setBankOverride] = useState({});

  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addUniqueFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      addUniqueFiles(Array.from(e.target.files));
    }
  };

  const addUniqueFiles = (newFiles) => {
    setFiles((prev) => {
      const existingNames = new Set(prev.map(f => f.name));
      const filtered = newFiles.filter(f => !existingNames.has(f.name));
      return [...prev, ...filtered];
    });
  };

  const removeFile = (index) => {
    setFiles((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed) {
        const nextOverrides = { ...bankOverride };
        delete nextOverrides[removed.name];
        setBankOverride(nextOverrides);
      }
      return next;
    });
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadResults(null);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    // Append custom bank overrides metadata
    const overridesMeta = {};
    Object.entries(bankOverride).forEach(([filename, bank]) => {
      if (bank) overridesMeta[filename] = bank;
    });
    formData.append('overrides_json', JSON.stringify(overridesMeta));

    try {
      const { data } = await apiClient.post(`/cases/${caseId}/statements/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResults(data);
      setFiles([]);
      setBankOverride({});
      if (onUploaded) onUploaded();
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 text-xs text-onSurface">
      
      {/* Upload layout context info */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h3 className="text-sm font-bold text-onSurface">Financial Statement Ingestion</h3>
          <p className="text-[11px] text-onSurfaceVariant mt-0.5">Import bank statements into the forensic engine database for OCR parsing and link analysis.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Upload file drag and drop zone */}
        <div 
          onDragEnter={handleDrag} 
          onDragOver={handleDrag} 
          onDragLeave={handleDrag} 
          onDrop={handleDrop}
          className={`bg-surfaceContainerLow border-2 border-dashed rounded-m3-l p-6 transition-all text-center flex flex-col items-center justify-center min-h-[220px] cursor-pointer
            ${dragActive 
              ? 'border-primary bg-primaryContainer/30 text-onPrimaryContainer' 
              : 'border-outlineVariant hover:border-outline'
            }`}
          onClick={onButtonClick}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            multiple 
            accept=".pdf,.xlsx,.xls,.csv,.docx,.png,.jpg,.jpeg,.tiff,.webp,.bmp"
            onChange={handleFileChange}
            className="hidden" 
          />
          
          <div className="p-4 bg-surfaceContainerHighest rounded-m3-m text-onSurfaceVariant mb-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          
          <h4 className="font-bold text-onSurface">Drag and Drop Statements Here</h4>
          <p className="text-[10px] text-onSurfaceVariant mt-1 max-w-[200px]">Supports bank PDFs, Excel, CSVs, scanned files or image receipts.</p>
          
          <button 
            type="button" 
            className="mt-4 px-4 py-2 border border-outlineVariant hover:bg-surfaceContainerHighest text-primary font-bold rounded-m3-s transition-colors m3-interactive font-sans"
          >
            Browse Workstation
          </button>
        </div>

        {/* Selected Files Queue Cards */}
        {files.length > 0 && (
          <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l p-5 space-y-3.5">
            <h4 className="font-bold text-onSurface uppercase tracking-wider text-[10px]">Import Queue ({files.length} file{files.length > 1 ? 's' : ''})</h4>
            
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {files.map((f, index) => (
                <div key={f.name} className="p-3 bg-surfaceContainer border border-outlineVariant rounded-m3-m flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-onSurface truncate" title={f.name}>{f.name}</div>
                    <div className="text-[10px] text-onSurfaceVariant font-mono mt-0.5">{(f.size / (1024 * 1024)).toFixed(2)} MB</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select 
                      value={bankOverride[f.name] || ''}
                      onChange={(e) => setBankOverride({ ...bankOverride, [f.name]: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-xs text-[10px] text-onSurface font-semibold focus:outline-none font-sans"
                    >
                      <option value="">Auto-detect</option>
                      {BANKS.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
                    </select>
                    
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                      className="text-onSurfaceVariant hover:text-error p-1 transition-colors m3-interactive"
                    >
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleUpload} 
              disabled={uploading}
              className="w-full bg-primary text-onPrimary font-bold py-2.5 rounded-m3-s transition-all text-center flex items-center justify-center gap-2 m3-interactive"
            >
              {uploading ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-m3-full border-2 border-onPrimary border-t-transparent animate-spin" />
                  <span>Uploading Files...</span>
                </>
              ) : (
                <span>Upload Statement Queue</span>
              )}
            </button>
          </div>
        )}

      </div>

      {/* Upload Results status report panel */}
      {uploadResults && (
        <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primaryContainer text-onPrimaryContainer rounded-m3-m">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-onSurface">Statement Ingestion Completed</h4>
              <p className="text-[10px] text-onSurfaceVariant">Summary report from OCR and database transaction import pipeline.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            
            <div className="p-3.5 bg-surfaceContainer border border-outlineVariant rounded-m3-m text-center">
              <div className="text-lg font-bold text-onSurface font-mono">{uploadResults.uploaded_count || 0}</div>
              <div className="text-[9px] text-onSurfaceVariant uppercase font-bold mt-1.5">Processed Files</div>
            </div>

            <div className="p-3.5 bg-surfaceContainer border border-outlineVariant rounded-m3-m text-center">
              <div className="text-lg font-bold text-onSurface font-mono">{uploadResults.parsed_transactions || 0}</div>
              <div className="text-[9px] text-onSurfaceVariant uppercase font-bold mt-1.5">Parsed Records</div>
            </div>

            <div className="p-3.5 bg-surfaceContainer border border-outlineVariant rounded-m3-m text-center">
              <div className="text-lg font-bold text-onSurface font-mono">{uploadResults.rejected_count || 0}</div>
              <div className="text-[9px] text-onSurfaceVariant uppercase font-bold mt-1.5">Rejected Files</div>
            </div>

            <div className="p-3.5 bg-surfaceContainer border border-outlineVariant rounded-m3-m text-center">
              <div className="text-lg font-bold text-primary font-mono">{uploadResults.ocr_runs || 0}</div>
              <div className="text-[9px] text-onSurfaceVariant uppercase font-bold mt-1.5">OCR Sub-calls</div>
            </div>

          </div>

          {/* Individual file summaries */}
          {uploadResults.details && uploadResults.details.length > 0 && (
            <div className="border border-outlineVariant rounded-m3-m overflow-hidden mt-3">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-surfaceContainer text-onSurfaceVariant font-bold border-b border-outlineVariant">
                    <th className="px-4 py-2.5">Ingested Document Filename</th>
                    <th className="px-4 py-2.5 text-center">Engine</th>
                    <th className="px-4 py-2.5 text-center">Parsed Txns</th>
                    <th className="px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outlineVariant">
                  {uploadResults.details.map((det, index) => (
                    <tr key={index} className="hover:bg-surfaceContainerHighest transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-onSurface truncate max-w-xs" title={det.filename}>{det.filename}</td>
                      <td className="px-4 py-2.5 text-center text-onSurfaceVariant font-mono font-bold uppercase">{det.engine}</td>
                      <td className="px-4 py-2.5 text-center text-onSurface font-mono">{det.tx_count || 0}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-m3-full uppercase
                          ${det.status === 'success' ? 'bg-primaryContainer text-onPrimaryContainer' : 'bg-errorContainer text-onErrorContainer'}`}
                        >
                          {det.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
