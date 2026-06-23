import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';

export default function ExecutiveSummaryPanel({ caseId }) {
  const [summary, setSummary] = useState(null);
  const [verdicts, setVerdicts] = useState([]);
  const [nextActions, setNextActions] = useState([]);
  const [syndicates, setSyndicates] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  
  // Custom Action inputs
  const [newActionAccount, setNewActionAccount] = useState('');
  const [newActionKey, setNewActionKey] = useState('');
  const [newActionText, setNewActionText] = useState('');
  
  // Annotation input
  const [newAnnotation, setNewAnnotation] = useState('');

  // AI Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Officer, I have analyzed the case transactions. How can I assist you with the investigation today?' }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Download PDF loading
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchSummary();
    fetchVerdicts();
    fetchNextActions();
    fetchSyndicates();
    fetchAnnotations();
  }, [caseId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchSummary = () => {
    apiClient.get(`/cases/${caseId}/summary`).then(r => setSummary(r.data));
  };

  const fetchVerdicts = () => {
    apiClient.get(`/cases/${caseId}/verdicts`).then(r => setVerdicts(r.data || []));
  };

  const fetchNextActions = () => {
    apiClient.get(`/cases/${caseId}/next-actions`).then(r => setNextActions(r.data || []));
  };

  const fetchSyndicates = () => {
    apiClient.get(`/cases/${caseId}/syndicates`).then(r => setSyndicates(r.data || []));
  };

  const fetchAnnotations = () => {
    apiClient.get(`/cases/${caseId}/annotations`).then(r => setAnnotations(r.data || []));
  };

  // Next Actions handlers
  const handleToggleAction = (actionId, currentStatus) => {
    apiClient.patch(`/cases/${caseId}/next-actions/${actionId}`, {
      completed: !currentStatus
    }).then(() => {
      fetchNextActions();
    });
  };

  const handleAddCustomAction = (e) => {
    e.preventDefault();
    if (!newActionText) return;
    
    apiClient.post(`/cases/${caseId}/next-actions`, {
      account_id: newActionAccount || 'GLOBAL',
      action_key: newActionKey || `CUSTOM_${Date.now()}`,
      action_text: newActionText
    }).then(() => {
      fetchNextActions();
      setNewActionAccount('');
      setNewActionKey('');
      setNewActionText('');
    });
  };

  // Annotations handler
  const handleAddAnnotation = (e) => {
    e.preventDefault();
    if (!newAnnotation) return;

    apiClient.post(`/cases/${caseId}/annotations`, {
      annotation: newAnnotation
    }).then(() => {
      fetchAnnotations();
      setNewAnnotation('');
    });
  };

  // AI Chat handler
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    apiClient.post(`/cases/${caseId}/chat`, {
      message: userMsg.content,
      history: chatMessages.slice(-8)
    }).then(({ data }) => {
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    }).catch((err) => {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error communicating with AI: ${err.message}` }]);
    }).finally(() => {
      setChatLoading(false);
    });
  };

  // PDF download handler
  const handleDownloadBrief = () => {
    setDownloading(true);
    apiClient.post(`/cases/${caseId}/reports/officer-brief`, {}, { responseType: 'blob' })
      .then(response => {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `officer_brief_${caseId.substring(0,8)}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
      })
      .finally(() => {
        setDownloading(false);
      });
  };

  // Calculate suspects counts
  const suspectsCount = verdicts.filter(v => v.role_label && v.role_label !== 'CLEAR').length;

  return (
    <div className="space-y-6 text-xs animate-fade-in">
      
      {/* Top Row: KPIs and Quick Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-6 shadow-sm">
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full lg:w-auto lg:flex-1">
          <div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Transactions</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1.5">{summary?.transaction_count ?? '—'}</div>
          </div>
          <div className="border-l border-slate-100 dark:border-slate-800 pl-6">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Scrutinized</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1.5">
              ₹{summary?.total_amount ? Number(summary.total_amount).toLocaleString('en-IN') : '—'}
            </div>
          </div>
          <div className="border-l border-slate-100 dark:border-slate-800 pl-6">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Suspect Accounts</div>
            <div className="text-xl font-extrabold text-danger mt-1.5">{suspectsCount}</div>
          </div>
          <div className="border-l border-slate-100 dark:border-slate-800 pl-6">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pending Tasks</div>
            <div className="text-xl font-extrabold text-accent mt-1.5">
              {nextActions.filter(a => !a.completed).length}
            </div>
          </div>
        </div>
        
        <div className="w-full lg:w-auto">
          <button
            onClick={handleDownloadBrief}
            disabled={downloading}
            className="w-full lg:w-auto bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-btn px-5 py-3 font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {downloading ? (
              <div className="w-3.5 h-3.5 rounded-full border border-white border-t-transparent animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            )}
            <span>Download Officer Brief PDF</span>
          </button>
        </div>

      </div>

      {/* Main Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle Column - Checklist, Syndicates, Annotations (2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. Next Actions Checklist */}
          <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm">
            <div className="border-b border-borderLight dark:border-borderDark pb-2.5 mb-4">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Investigation Checklist</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Recommendations and task actions assigned to this case.</p>
            </div>
            
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {nextActions.length === 0 ? (
                <div className="text-slate-400 italic py-2">No checklist items generated yet. Run analysis to seed recommendations.</div>
              ) : (
                nextActions.map(action => (
                  <div key={action.id} className="flex items-start gap-3 p-3 bg-slate-50/50 dark:bg-slate-900/20 border border-borderLight dark:border-borderDark/60 rounded-xl hover:bg-slate-100/30 dark:hover:bg-slate-800/20 transition-colors">
                    <input
                      type="checkbox"
                      checked={action.completed}
                      onChange={() => handleToggleAction(action.id, action.completed)}
                      className="mt-0.5 h-4.5 w-4.5 rounded border-slate-300 dark:border-borderDark text-accent focus:ring-accent cursor-pointer bg-white dark:bg-slate-900"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${action.completed ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800' : 'bg-accent/10 border-accent/20 text-accent font-mono'}`}>
                        {action.account_id}
                      </span>
                      <p className={`text-xs text-slate-700 dark:text-slate-300 mt-1.5 font-medium leading-relaxed ${action.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                        {action.action_text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Custom Next Action Input */}
            <form onSubmit={handleAddCustomAction} className="mt-5 pt-4 border-t border-borderLight dark:border-borderDark space-y-3">
              <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Create Custom Action</span>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Linked Account (e.g. 1004561)..."
                  className="w-1/2 p-2.5 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                  value={newActionAccount}
                  onChange={e => setNewActionAccount(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Task Key (e.g. SUMMONS)..."
                  className="w-1/2 p-2.5 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                  value={newActionKey}
                  onChange={e => setNewActionKey(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Describe required investigation task..."
                  className="flex-1 p-2.5 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                  value={newActionText}
                  onChange={e => setNewActionText(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-hover text-white px-4 rounded-btn font-bold transition-all shadow-md shadow-accent/15"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>

          {/* 2. Cross-Case Syndicate overlap */}
          <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm">
            <div className="border-b border-borderLight dark:border-borderDark pb-2.5 mb-4">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Multi-Case Syndicate Overlaps</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Overlap markers identified across other cases in the system database.</p>
            </div>
            
            <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
              {syndicates.length === 0 ? (
                <div className="text-slate-400 italic py-2">No cross-case identifier matches detected for this case.</div>
              ) : (
                syndicates.map((syn, idx) => (
                  <div key={idx} className="p-3.5 bg-danger/5 dark:bg-danger/10 border border-danger/20 rounded-xl flex justify-between items-start gap-4 animate-pulse">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-danger/15 text-danger px-2 py-0.5 rounded-full border border-danger/20">
                          {syn.match_type} MATCH
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{syn.matched_value}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mt-2 font-medium leading-relaxed">{syn.details}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold block">Overlapping File</span>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">{syn.matched_case_title}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. Case Annotations and Notes */}
          <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm">
            <div className="border-b border-borderLight dark:border-borderDark pb-2.5 mb-4">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Officer log Notes & Annotations</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Timeline of administrative notes saved by investigators.</p>
            </div>
            
            <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1 mb-4">
              {annotations.length === 0 ? (
                <div className="text-slate-400 italic py-2">No notes added yet. Write notes below.</div>
              ) : (
                annotations.map(note => (
                  <div key={note.id} className="p-3.5 bg-slate-50/50 dark:bg-slate-900/20 border border-borderLight dark:border-borderDark/60 rounded-xl">
                    <div className="flex justify-between items-center text-[9px] text-slate-400 dark:text-slate-500 font-bold mb-2">
                      <span>{note.username || 'System'}</span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                    {note.account_id && (
                      <span className="inline-block text-[9px] font-mono font-bold bg-accent/15 text-accent px-1.5 py-0.5 rounded border border-accent/20 mb-2">
                        ACCOUNT: {note.account_id}
                      </span>
                    )}
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-medium leading-relaxed">{note.annotation}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddAnnotation} className="flex gap-3">
              <input
                type="text"
                placeholder="Write general investigation note or update..."
                className="flex-1 p-2.5 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                value={newAnnotation}
                onChange={e => setNewAnnotation(e.target.value)}
                required
              />
              <button
                type="submit"
                className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-btn px-4 font-bold transition-colors"
              >
                Save Note
              </button>
            </form>
          </div>

        </div>

        {/* Right Column - Interactive AI Case Assistant (1 Column) */}
        <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm flex flex-col h-[650px]">
          
          <div className="border-b border-borderLight dark:border-borderDark pb-2.5 mb-4">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">AI Case Assistant</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Ask questions directly regarding cases details.</p>
          </div>
          
          {/* Chat message space */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 scrollbar-thin">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed shadow-sm font-medium
                  ${msg.role === 'user' 
                    ? 'bg-accent text-white rounded-tr-none' 
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-tl-none border border-borderLight dark:border-borderDark'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-50 dark:bg-slate-900 text-slate-400 rounded-2xl rounded-tl-none p-3.5 border border-borderLight dark:border-borderDark italic animate-pulse">
                  AI is studying case context...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Send Input */}
          <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-borderLight dark:border-borderDark pt-4">
            <input
              type="text"
              placeholder="Ask about mules, loops, legal actions..."
              className="flex-1 p-2.5 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-accent"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={chatLoading}
              required
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="bg-accent hover:bg-accent-hover text-white font-bold px-4 rounded-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-accent/20"
            >
              Send
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
