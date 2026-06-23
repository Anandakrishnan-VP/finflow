import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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

const TABS = ['Executive Summary', 'Overview', 'Upload', 'Transactions', 'Alerts', 'Verdicts', 'Graph', 'Money Trail', 'Entities', 'Ask AI', 'Reports', 'Hypothesis'];

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'Executive Summary';
  
  const [caseInfo, setCaseInfo]   = useState(null);
  const [summary, setSummary]     = useState(null);
  const [taskId, setTaskId]       = useState(null);

  const loadCase    = () => apiClient.get(`/cases/${caseId}`).then(r => setCaseInfo(r.data));
  const loadSummary = () => apiClient.get(`/cases/${caseId}/summary`).then(r => setSummary(r.data));

  useEffect(() => { 
    loadCase(); 
    loadSummary(); 
  }, [caseId]);

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  const startAnalysis = async () => {
    const { data } = await apiClient.post(`/cases/${caseId}/analyze`);
    setTaskId(data.task_id);
  };

  if (!caseInfo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-8 h-8 rounded-m3-full border-4 border-outlineVariant border-t-primary animate-spin" />
        <div className="text-xs text-onSurfaceVariant font-bold uppercase tracking-wider animate-pulse">Loading case data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outlineVariant pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-surfaceContainerHighest text-onSurfaceVariant px-2.5 py-1 rounded-m3-full uppercase">
              Case Folder
            </span>
            <span className="text-xs font-semibold text-onSurfaceVariant">/</span>
            <span className="text-xs font-bold text-onSurfaceVariant font-mono">{caseInfo.case_number}</span>
          </div>
          <h1 className="text-xl font-bold text-onSurface font-serif mt-1.5 flex items-center gap-3">
            {caseInfo.title}
          </h1>
          <div className="text-[11px] text-onSurfaceVariant mt-1 flex items-center gap-2">
            <span>Status: <span className="font-semibold text-onSurface">{caseInfo.status}</span></span>
            <span>·</span>
            <span>Created: <span className="font-semibold text-onSurface font-mono">{new Date(caseInfo.created_at).toLocaleDateString()}</span></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LlmModeBadge />
        </div>
      </div>

      {/* Dynamic Tab Navigation (Premium Tab Bar) */}
      <div className="bg-surfaceContainer border border-outlineVariant p-1.5 rounded-m3-m flex gap-1 overflow-x-auto scrollbar-thin">
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-bold rounded-m3-s whitespace-nowrap transition-all duration-200 m3-interactive
                ${isActive
                  ? 'bg-primaryContainer text-onPrimaryContainer'
                  : 'text-onSurfaceVariant hover:text-onSurface hover:bg-surfaceContainerHighest'
                }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Dynamic Tab Page Body */}
      <div className="animate-fade-in text-onSurface">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'Overview' && (
          <div className="space-y-6">
            
            {/* KPI row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Transactions count */}
              <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-m p-5">
                <span className="text-[10px] font-bold text-onSurfaceVariant uppercase tracking-widest">Transactions Scrutinized</span>
                <div className="text-2xl font-bold text-onSurface mt-2.5 font-mono">
                  {summary?.transaction_count ?? '—'}
                </div>
              </div>

              {/* Total volume */}
              <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-m p-5">
                <span className="text-[10px] font-bold text-onSurfaceVariant uppercase tracking-widest">Scrutinized Flow Volume</span>
                <div className="text-2xl font-bold text-onSurface mt-2.5 font-mono">
                  ₹{summary?.total_amount ? Number(summary.total_amount).toLocaleString('en-IN') : '—'}
                </div>
              </div>

              {/* Alert types */}
              <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-m p-5">
                <span className="text-[10px] font-bold text-onSurfaceVariant uppercase tracking-widest">Crime Indicators Flagged</span>
                <div className="text-2xl font-bold text-error mt-2.5 font-mono">
                  {summary?.alerts_by_flag ? Object.keys(summary.alerts_by_flag).length : '—'}
                </div>
              </div>

            </div>

            {/* Analysis controls card */}
            <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-onSurface">Forensic Analysis Pipeline</h3>
                  <p className="text-[11px] text-onSurfaceVariant mt-0.5">Executes ML models, taint propagation, Benford, and LLM second opinions.</p>
                </div>
                <button
                  onClick={startAnalysis}
                  className="bg-primary text-onPrimary text-xs font-bold rounded-m3-s px-5 py-3 transition-all flex items-center gap-2 m3-interactive"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  Execute Pipeline
                </button>
              </div>
              
              {taskId && (
                <div className="mt-5 border-t border-outlineVariant pt-5">
                  <ProgressBar taskId={taskId} onComplete={() => { loadSummary(); loadCase(); }} />
                </div>
              )}
            </div>

            {/* Benford Law Chi Square Card */}
            <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l overflow-hidden">
              <BenfordCard caseId={caseId} />
            </div>

            {/* Transaction Timeline */}
            <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l p-6">
              <TimelineChart caseId={caseId} />
            </div>

          </div>
        )}
        
        {/* EXECUTIVE SUMMARY */}
        {activeTab === 'Executive Summary' && <ExecutiveSummaryPanel caseId={caseId} />}

        {/* UPLOAD PANEL */}
        {activeTab === 'Upload' && (
          <UploadPanel caseId={caseId} onUploaded={loadSummary} />
        )}

        {/* TRANSACTIONS TABLE */}
        {activeTab === 'Transactions' && <TransactionsTable caseId={caseId} />}

        {/* ALERTS TABLE */}
        {activeTab === 'Alerts' && <AlertsTable caseId={caseId} />}

        {/* VERDICTS PANEL */}
        {activeTab === 'Verdicts' && <VerdictsPanel caseId={caseId} />}

        {/* GRAPH VIEW */}
        {activeTab === 'Graph' && <GraphView caseId={caseId} />}

        {/* MONEY TRAIL TABLE */}
        {activeTab === 'Money Trail' && <MoneyTrailTable caseId={caseId} />}

        {/* ENTITIES PANEL */}
        {activeTab === 'Entities' && <EntitiesPanel caseId={caseId} />}

        {/* ASK AI (NL QUERY) */}
        {activeTab === 'Ask AI' && <NLQueryPanel caseId={caseId} />}

        {/* REPORTS PANEL */}
        {activeTab === 'Reports' && <ReportsPanel caseId={caseId} />}

        {/* HYPOTHESIS ENGINE */}
        {activeTab === 'Hypothesis' && <HypothesisEngine caseId={caseId} />}

      </div>

    </div>
  );
}
