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

  if (!caseInfo) return <div className="text-sm text-ink-muted p-6">Loading case...</div>;

  const needsAnalysis = ANALYSIS_REQUIRED_TABS.includes(activeTab) && caseInfo.status !== 'ANALYZED';
  const isAnalysisDisabled = statements.length === 0 || statements.some(s => ['PROCESSING', 'PENDING', 'FAILED', 'NEEDS_REVIEW'].includes(s.status));

  return (
    <div>
      {/* Top Header details card */}
      {isEditing ? (
        <div className="bg-surface-sunken border border-border-hairline rounded-xl p-5 mb-5 space-y-3 shadow-inner">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Case Number</label>
              <input 
                type="text" 
                value={editCaseNumber} 
                onChange={e => setEditCaseNumber(e.target.value)}
                className="w-full border border-border rounded-lg p-2 text-xs bg-surface-raised text-ink-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent" 
              />
            </div>
            <div className="flex-[2]">
              <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Title</label>
              <input 
                type="text" 
                value={editTitle} 
                onChange={e => setEditTitle(e.target.value)}
                className="w-full border border-border rounded-lg p-2 text-xs bg-surface-raised text-ink-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent" 
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Description</label>
            <textarea 
              value={editDescription} 
              onChange={e => setEditDescription(e.target.value)}
              rows={2}
              className="w-full border border-border rounded-lg p-2 text-xs bg-surface-raised text-ink-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsEditing(false)} className="text-xs px-3 py-1.5 text-ink-secondary font-semibold hover:text-ink-primary transition">
              Cancel
            </button>
            <button onClick={saveEdits} className="text-xs bg-accent hover:bg-accent-hover text-accent-fg rounded-lg px-4 py-1.5 font-semibold transition shadow-sm">
              Save Details
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 mb-5 shadow-card relative hover:border-border transition-colors">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold text-ink-primary">
                  {caseInfo.case_number} — {caseInfo.title}
                </h1>
                <button 
                  onClick={startEditing}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-accent bg-accent-subtle hover:bg-accent-hover/20 rounded-md px-2 py-1 transition-colors"
                  title="Edit Details"
                >
                  ✏️ Edit
                </button>
              </div>
              <p className="text-xs text-ink-secondary mt-2 leading-relaxed whitespace-pre-wrap">
                {caseInfo.description || <span className="italic text-ink-muted">No description provided. Click Edit to add details.</span>}
              </p>
            </div>
            <div className="self-end sm:self-auto">
              <LlmModeBadge />
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-ink-muted mb-4 flex items-center gap-2">
        <span>Status:</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          caseInfo.status === 'ANALYZED' 
            ? 'bg-accent-subtle text-accent border border-accent/20'
            : caseInfo.status === 'ANALYZING'
            ? 'bg-risk-medium-bg text-risk-medium border border-risk-medium/15 animate-pulse'
            : 'bg-surface-sunken text-ink-secondary border border-border-hairline'
        }`}>
          {caseInfo.status}
        </span>
      </div>

      {/* Global Live Task Banner */}
      {taskId && (
        <div className="bg-surface-shading text-accent-fg p-5 rounded-xl mb-6 shadow-card border border-border-hairline relative">
          <button 
            onClick={() => setTaskId(null)}
            className="absolute top-3 right-3 text-accent-fg/70 hover:text-accent-fg text-sm font-bold"
            title="Dismiss status banner"
          >
            ✕
          </button>
          <div className="mb-3 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-accent-fg border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-fg/80">
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
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const tabLocked = ANALYSIS_REQUIRED_TABS.includes(tab) && caseInfo.status !== 'ANALYZED';
          return (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition flex items-center gap-1.5
                ${activeTab === tab 
                  ? 'border-accent text-ink-primary font-bold' 
                  : 'border-transparent text-ink-muted hover:text-ink-secondary'}`}
            >
              <span>{tab}</span>
              {tabLocked && <span className="text-[10px]" title="Requires Analysis">🔒</span>}
            </button>
          );
        })}
      </div>

      {/* Main Tab Panel Content */}
      {needsAnalysis ? (
        <div className="bg-surface-raised border border-border-hairline rounded-xl p-8 max-w-lg mx-auto text-center my-12 shadow-card">
          {caseInfo.status === 'ANALYZING' ? (
            <>
              <div className="text-4xl mb-4 animate-spin inline-block">⚙️</div>
              <h3 className="text-base font-bold text-ink-primary mb-2">Analysis in Progress</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                The AI models, PageRank algorithms, and money-trail tracing flows are running in the background. You can inspect transactions under the **Transactions** tab while waiting.
              </p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-base font-bold text-ink-primary mb-2">Analysis Required</h3>
              <p className="text-xs text-ink-muted mb-6 leading-relaxed">
                The panel <strong className="text-ink-secondary">{activeTab}</strong> contains downstream forensics, machine learning flags, and AI-driven intelligence reports. Run case analysis to generate these insights.
              </p>
              <button 
                onClick={startAnalysis} 
                disabled={isAnalysisDisabled}
                className="inline-flex items-center gap-2 bg-accent text-accent-fg rounded-lg px-5 py-2.5 text-xs font-semibold hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-ink-muted disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <span>Analyze Case Now</span>
              </button>
              {isAnalysisDisabled && (
                <p className="text-[11px] text-risk-medium font-semibold mt-2.5 max-w-xs mx-auto">
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
                <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-card">
                  <div className="text-xs text-ink-muted font-medium">Transactions</div>
                  <div className="text-2xl font-bold text-ink-primary mt-1 font-data">{summary?.transaction_count ?? '—'}</div>
                </div>
                <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-card">
                  <div className="text-xs text-ink-muted font-medium">Total Amount</div>
                  <div className="text-2xl font-bold text-ink-primary mt-1 font-data">
                    ₹{summary?.total_amount ? Number(summary.total_amount).toLocaleString('en-IN') : '—'}
                  </div>
                </div>
                <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-card">
                  <div className="text-xs text-ink-muted font-medium">Alert Types</div>
                  <div className="text-2xl font-bold text-ink-primary mt-1 font-data">
                    {summary?.alerts_by_flag ? Object.keys(summary.alerts_by_flag).length : '—'}
                  </div>
                </div>
              </div>

              <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-primary">Forensic Analysis Status</h3>
                    <p className="text-xs text-ink-muted mt-0.5">
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
                        className="text-xs bg-accent hover:bg-accent-hover text-accent-fg disabled:bg-surface-sunken disabled:text-ink-muted disabled:cursor-not-allowed rounded-lg px-4 py-2 font-semibold transition shadow-sm"
                      >
                        Analyze Case
                      </button>
                      {isAnalysisDisabled && (
                        <span className="text-[10px] text-risk-medium font-semibold">
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
