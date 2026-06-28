import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import UploadPanel from '../components/UploadPanel';
import ProgressBar from '../components/ProgressBar';
import GraphView from '../components/GraphView';
import AlertsTable from '../components/AlertsTable';
import TransactionsTable from '../components/TransactionsTable';
import MoneyTrailTable from '../components/MoneyTrailTable';
import EntitiesPanel from '../components/EntitiesPanel';
import NLQueryPanel from '../components/NLQueryPanel';
import ReportsPanel from '../components/ReportsPanel';
import TimelineChart from '../components/TimelineChart';
import LlmModeBadge from '../components/LlmModeBadge';
import VerdictsPanel from '../components/VerdictsPanel';
import BenfordCard from '../components/BenfordCard';
import ExecutiveSummaryPanel from '../components/ExecutiveSummaryPanel';
import HypothesisEngine from '../components/HypothesisEngine';

const TABS = [
  'Executive Summary', 'Overview', 'Upload', 'Transactions', 
  'Alerts', 'Verdicts', 'Graph', 'Money Trail', 'Entities', 
  'Ask AI', 'Reports', 'Hypothesis'
];

const ANALYSIS_REQUIRED_TABS = [
  'Executive Summary', 'Alerts', 'Verdicts', 'Graph', 
  'Money Trail', 'Ask AI', 'Reports', 'Hypothesis'
];

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const [activeTab, setActiveTab] = useState('Upload'); // fallback default
  const [caseInfo, setCaseInfo]   = useState(null);
  const [summary, setSummary]     = useState(null);
  const [statements, setStatements] = useState([]);
  const [taskId, setTaskId]       = useState(null);
  const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);

  const loadCase       = () => apiClient.get(`/cases/${caseId}`).then(r => setCaseInfo(r.data));
  const loadSummary    = () => apiClient.get(`/cases/${caseId}/summary`).then(r => setSummary(r.data));
  const loadStatements = () => apiClient.get(`/cases/${caseId}/statements`).then(r => setStatements(r.data || []));

  useEffect(() => {
    loadCase();
    loadSummary();
    loadStatements();
    
    // Check if there is an active running task stored locally
    const storedTaskId = localStorage.getItem(`finflow_task_${caseId}`);
    if (storedTaskId) {
      setTaskId(storedTaskId);
    }
  }, [caseId]);

  // Persist taskId to localStorage
  useEffect(() => {
    if (taskId) {
      localStorage.setItem(`finflow_task_${caseId}`, taskId);
    } else {
      localStorage.removeItem(`finflow_task_${caseId}`);
    }
  }, [taskId, caseId]);

  // Intelligently select default tab on initial load of case data
  useEffect(() => {
    if (caseInfo && statements && !hasSetDefaultTab) {
      if (caseInfo.status === 'ANALYZED') {
        setActiveTab('Executive Summary');
      } else if (statements.length > 0) {
        setActiveTab('Transactions');
      } else {
        setActiveTab('Upload');
      }
      setHasSetDefaultTab(true);
    }
  }, [caseInfo, statements, hasSetDefaultTab]);

  const startAnalysis = async () => {
    try {
      const { data } = await apiClient.post(`/cases/${caseId}/analyze`);
      setTaskId(data.task_id);
      setCaseInfo(prev => prev ? { ...prev, status: 'ANALYZING' } : null);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to trigger analysis.");
      loadCase();
    }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editCaseNumber, setEditCaseNumber] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const startEditing = () => {
    setEditCaseNumber(caseInfo.case_number || '');
    setEditTitle(caseInfo.title || '');
    setEditDescription(caseInfo.description || '');
    setIsEditing(true);
  };

  const saveEdits = async () => {
    try {
      await apiClient.patch(`/cases/${caseId}`, {
        case_number: editCaseNumber,
        title: editTitle,
        description: editDescription
      });
      setIsEditing(false);
      loadCase();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to update case details.");
    }
  };

  const handleUploaded = () => {
    loadSummary();
    loadStatements();
  };

  if (!caseInfo) return <div className="text-sm text-slate-400 p-6">Loading case...</div>;

  const needsAnalysis = ANALYSIS_REQUIRED_TABS.includes(activeTab) && caseInfo.status !== 'ANALYZED';
  const isAnalysisDisabled = statements.length === 0 || statements.some(s => ['PROCESSING', 'PENDING', 'FAILED', 'NEEDS_REVIEW'].includes(s.status));

  return (
    <div>
      {/* Top Header details card */}
      {isEditing ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5 space-y-3 shadow-inner">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Case Number</label>
              <input 
                type="text" 
                value={editCaseNumber} 
                onChange={e => setEditCaseNumber(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
            <div className="flex-[2]">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Title</label>
              <input 
                type="text" 
                value={editTitle} 
                onChange={e => setEditTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Description</label>
            <textarea 
              value={editDescription} 
              onChange={e => setEditDescription(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsEditing(false)} className="text-xs px-3 py-1.5 text-slate-500 font-semibold hover:text-slate-700 transition">
              Cancel
            </button>
            <button onClick={saveEdits} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-1.5 font-semibold transition shadow-sm">
              Save Details
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm relative hover:border-slate-350 transition-colors">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold text-slate-800">
                  {caseInfo.case_number} — {caseInfo.title}
                </h1>
                <button 
                  onClick={startEditing}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md px-2 py-1 transition-colors"
                  title="Edit Details"
                >
                  ✏️ Edit
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed whitespace-pre-wrap">
                {caseInfo.description || <span className="italic text-slate-300">No description provided. Click Edit to add details.</span>}
              </p>
            </div>
            <div className="self-end sm:self-auto">
              <LlmModeBadge />
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400 mb-4 flex items-center gap-2">
        <span>Status:</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          caseInfo.status === 'ANALYZED' 
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : caseInfo.status === 'ANALYZING'
            ? 'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse'
            : 'bg-slate-50 text-slate-700 border border-slate-100'
        }`}>
          {caseInfo.status}
        </span>
      </div>

      {/* Global Live Task Banner */}
      {taskId && (
        <div className="bg-slate-900 text-white p-5 rounded-xl mb-6 shadow-md border border-slate-800 relative">
          <button 
            onClick={() => setTaskId(null)}
            className="absolute top-3 right-3 text-slate-400 hover:text-white text-sm"
            title="Dismiss status banner"
          >
            ✕
          </button>
          <div className="mb-3 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Forensic Engines & ML Models Running
            </span>
          </div>
          <ProgressBar taskId={taskId} onComplete={() => { 
            loadSummary(); 
            loadCase(); 
            loadStatements();
            setTaskId(null); 
          }} />
        </div>
      )}

      {/* Navigation Tab Bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const tabLocked = ANALYSIS_REQUIRED_TABS.includes(tab) && caseInfo.status !== 'ANALYZED';
          return (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition flex items-center gap-1.5
                ${activeTab === tab 
                  ? 'border-slate-900 text-slate-900 font-medium' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              <span>{tab}</span>
              {tabLocked && <span className="text-[10px]" title="Requires Analysis">🔒</span>}
            </button>
          );
        })}
      </div>

      {/* Main Tab Panel Content */}
      {needsAnalysis ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg mx-auto text-center my-12 shadow-sm">
          {caseInfo.status === 'ANALYZING' ? (
            <>
              <div className="text-4xl mb-4 animate-spin inline-block">⚙️</div>
              <h3 className="text-base font-bold text-slate-800 mb-2">Analysis in Progress</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                The AI models, PageRank algorithms, and money-trail tracing flows are running in the background. You can inspect transactions under the **Transactions** tab while waiting.
              </p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-base font-bold text-slate-800 mb-2">Analysis Required</h3>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                The panel <strong className="text-slate-700">{activeTab}</strong> contains downstream forensics, machine learning flags, and AI-driven intelligence reports. Run case analysis to generate these insights.
              </p>
              <button 
                onClick={startAnalysis} 
                disabled={isAnalysisDisabled}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-5 py-2.5 text-xs font-semibold hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <span>Analyze Case Now</span>
              </button>
              {isAnalysisDisabled && (
                <p className="text-[11px] text-amber-600 mt-2.5 max-w-xs mx-auto">
                  ⚠️ {statements.length === 0 
                      ? "Please upload a bank statement in the 'Upload' tab first." 
                      : "Make sure all statements are successfully parsed (Map Columns if needed) before analyzing."}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {activeTab === 'Overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-slate-400 font-medium">Transactions</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{summary?.transaction_count ?? '—'}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-slate-400 font-medium">Total Amount</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    ₹{summary?.total_amount ? Number(summary.total_amount).toLocaleString('en-IN') : '—'}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-slate-400 font-medium">Alert Types</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {summary?.alerts_by_flag ? Object.keys(summary.alerts_by_flag).length : '—'}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Forensic Analysis Status</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {caseInfo.status === 'ANALYZED' 
                        ? 'Downstream analysis reports, graph modeling, and ML anomalies have been calculated.'
                        : 'Downstream forensics, machine learning flags, and AI-driven intelligence are pending.'
                      }
                    </p>
                  </div>
                  {caseInfo.status !== 'ANALYZED' && caseInfo.status !== 'ANALYZING' && (
                    <div className="flex flex-col items-end gap-1.5">
                      <button 
                        onClick={startAnalysis} 
                        disabled={isAnalysisDisabled}
                        className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-semibold transition shadow-sm"
                      >
                        Analyze Case
                      </button>
                      {isAnalysisDisabled && (
                        <span className="text-[10px] text-amber-600 font-medium">
                          {statements.length === 0 ? "Upload statements first" : "Statements not ready"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <BenfordCard caseId={caseId} />
              <TimelineChart caseId={caseId} />
            </div>
          )}
          
          {activeTab === 'Executive Summary' && <ExecutiveSummaryPanel caseId={caseId} />}
          {activeTab === 'Upload'       && <UploadPanel caseId={caseId} onUploaded={handleUploaded} />}
          {activeTab === 'Transactions' && <TransactionsTable caseId={caseId} />}
          {activeTab === 'Alerts'       && <AlertsTable caseId={caseId} />}
          {activeTab === 'Verdicts'     && <VerdictsPanel caseId={caseId} />}
          {activeTab === 'Graph'        && <GraphView caseId={caseId} />}
          {activeTab === 'Money Trail'  && <MoneyTrailTable caseId={caseId} />}
          {activeTab === 'Entities'     && <EntitiesPanel caseId={caseId} />}
          {activeTab === 'Ask AI'       && <NLQueryPanel caseId={caseId} />}
          {activeTab === 'Reports'      && <ReportsPanel caseId={caseId} />}
          {activeTab === 'Hypothesis'   && <HypothesisEngine caseId={caseId} />}
        </>
      )}
    </div>
  );
}

