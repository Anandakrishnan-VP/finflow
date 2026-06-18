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

const TABS = ['Overview', 'Upload', 'Transactions', 'Alerts', 'Verdicts', 'Graph', 'Money Trail', 'Entities', 'Ask AI', 'Reports'];


export default function CaseDetailPage() {
  const { caseId } = useParams();
  const [activeTab, setActiveTab] = useState('Overview');
  const [caseInfo, setCaseInfo]   = useState(null);
  const [summary, setSummary]     = useState(null);
  const [taskId, setTaskId]       = useState(null);

  const loadCase    = () => apiClient.get(`/cases/${caseId}`).then(r => setCaseInfo(r.data));
  const loadSummary = () => apiClient.get(`/cases/${caseId}/summary`).then(r => setSummary(r.data));

  useEffect(() => { loadCase(); loadSummary(); }, [caseId]);

  const startAnalysis = async () => {
    const { data } = await apiClient.post(`/cases/${caseId}/analyze`);
    setTaskId(data.task_id);
  };

  if (!caseInfo) return <div className="text-sm text-slate-400">Loading case...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-slate-900">{caseInfo.case_number} — {caseInfo.title}</h1>
        <LlmModeBadge />
      </div>
      <div className="text-xs text-slate-400 mb-4">Status: {caseInfo.status}</div>

      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition
                    ${activeTab === tab ? 'border-slate-900 text-slate-900 font-medium' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-400">Transactions</div>
              <div className="text-2xl font-semibold text-slate-900">{summary?.transaction_count ?? '—'}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-400">Total Amount</div>
              <div className="text-2xl font-semibold text-slate-900">
                ₹{summary?.total_amount ? Number(summary.total_amount).toLocaleString('en-IN') : '—'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-400">Alert Types</div>
              <div className="text-2xl font-semibold text-slate-900">
                {summary?.alerts_by_flag ? Object.keys(summary.alerts_by_flag).length : '—'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-700">Analysis</h3>
              <button onClick={startAnalysis} className="text-sm bg-slate-900 text-white rounded px-4 py-1.5">
                Analyze
              </button>
            </div>
            {taskId && <ProgressBar taskId={taskId} onComplete={() => { loadSummary(); loadCase(); }} />}
          </div>

          <BenfordCard caseId={caseId} />

          <TimelineChart caseId={caseId} />
        </div>
      )}

      {activeTab === 'Upload'       && <UploadPanel caseId={caseId} onUploaded={loadSummary} />}
      {activeTab === 'Transactions' && <TransactionsTable caseId={caseId} />}
      {activeTab === 'Alerts'       && <AlertsTable caseId={caseId} />}
      {activeTab === 'Verdicts'     && <VerdictsPanel caseId={caseId} />}
      {activeTab === 'Graph'        && <GraphView caseId={caseId} />}
      {activeTab === 'Money Trail'  && <MoneyTrailTable caseId={caseId} />}
      {activeTab === 'Entities'     && <EntitiesPanel caseId={caseId} />}
      {activeTab === 'Ask AI'       && <NLQueryPanel caseId={caseId} />}
      {activeTab === 'Reports'      && <ReportsPanel caseId={caseId} />}
    </div>
  );
}

