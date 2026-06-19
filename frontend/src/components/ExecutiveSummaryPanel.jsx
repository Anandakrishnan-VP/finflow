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
    <div className="space-y-6">
      {/* Top Row: KPIs and Quick Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full md:w-auto md:flex-1">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Transactions</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{summary?.transaction_count ?? '—'}</div>
          </div>
          <div className="border-l border-slate-100 pl-6">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Scrutinized</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              ₹{summary?.total_amount ? Number(summary.total_amount).toLocaleString('en-IN') : '—'}
            </div>
          </div>
          <div className="border-l border-slate-100 pl-6">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Suspect Accounts</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{suspectsCount}</div>
          </div>
          <div className="border-l border-slate-100 pl-6">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Tasks</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">
              {nextActions.filter(a => !a.completed).length}
            </div>
          </div>
        </div>
        
        <div>
          <button
            onClick={handleDownloadBrief}
            disabled={downloading}
            className="flex items-center gap-2 bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
          >
            {downloading ? 'Generating...' : 'Download Officer Brief PDF'}
          </button>
        </div>
      </div>

      {/* Main Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle Column - Checklist, Syndicates, Annotations */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. Next Actions Checklist */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="font-bold text-slate-800 text-base mb-4 border-b border-slate-100 pb-2">Investigation Checklist</div>
            
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {nextActions.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No checklist items generated yet. Run analysis to seed recommendations.</div>
              ) : (
                nextActions.map(action => (
                  <div key={action.id} className="flex items-start gap-3 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={action.completed}
                      onChange={() => handleToggleAction(action.id, action.completed)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded mr-2 ${action.completed ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-700'}`}>
                        {action.account_id}
                      </span>
                      <p className={`text-xs text-slate-700 mt-0.5 inline-block ${action.completed ? 'line-through text-slate-400' : ''}`}>
                        {action.action_text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Custom Next Action Input */}
            <form onSubmit={handleAddCustomAction} className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-semibold text-slate-600">Create Custom Next Action</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Linked Account (e.g. 1004561)..."
                  className="w-1/3 p-1.5 border border-slate-200 rounded-lg text-xs"
                  value={newActionAccount}
                  onChange={e => setNewActionAccount(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Task Key (e.g. SUMMONS)..."
                  className="w-1/3 p-1.5 border border-slate-200 rounded-lg text-xs"
                  value={newActionKey}
                  onChange={e => setNewActionKey(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Describe required investigation task..."
                  className="flex-1 p-1.5 border border-slate-200 rounded-lg text-xs"
                  value={newActionText}
                  onChange={e => setNewActionText(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="bg-indigo-600 text-white text-xs px-3 rounded-lg hover:bg-indigo-500 transition-colors font-semibold"
                >
                  Add
                </button>
              </div>
            </form>
          </div>

          {/* 2. Cross-Case Syndicate overlap */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="font-bold text-slate-800 text-base mb-4 border-b border-slate-100 pb-2">Multi-Case Syndicate overlaps</div>
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {syndicates.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No cross-case identifier matches detected for this case.</div>
              ) : (
                syndicates.map((syn, idx) => (
                  <div key={idx} className="p-3 bg-red-50 border border-red-100 rounded-xl flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          {syn.match_type} MATCH
                        </span>
                        <span className="text-xs font-semibold text-slate-800">{syn.matched_value}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{syn.details}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Overlapping Case</div>
                      <div className="text-xs font-semibold text-slate-700 mt-0.5">{syn.matched_case_title}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. Case Annotations and Notes */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="font-bold text-slate-800 text-base mb-4 border-b border-slate-100 pb-2">Officer notes & Annotations</div>
            
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1 mb-4">
              {annotations.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No notes added yet. Write notes below.</div>
              ) : (
                annotations.map(note => (
                  <div key={note.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold mb-1">
                      <span>{note.username || 'System'}</span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                    {note.account_id && (
                      <span className="inline-block text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mb-1">
                        ACCOUNT: {note.account_id}
                      </span>
                    )}
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.annotation}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddAnnotation} className="flex gap-2">
              <input
                type="text"
                placeholder="Write general investigation note or update..."
                className="flex-1 p-2 border border-slate-200 rounded-lg text-xs"
                value={newAnnotation}
                onChange={e => setNewAnnotation(e.target.value)}
                required
              />
              <button
                type="submit"
                className="bg-slate-900 text-white text-xs px-4 rounded-lg hover:bg-slate-800 font-semibold transition-colors"
              >
                Save Note
              </button>
            </form>
          </div>

        </div>

        {/* Right Column - Interactive AI Case Assistant */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[650px]">
          <div className="font-bold text-slate-800 text-base border-b border-slate-100 pb-2 mb-3">AI Case Assistant</div>
          
          {/* Chat message space */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-sm
                  ${msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-400 rounded-2xl rounded-tl-none p-3 text-xs border border-slate-200 italic animate-pulse">
                  AI is studying case context...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Send Input */}
          <form onSubmit={handleSendMessage} className="flex gap-1.5 border-t border-slate-100 pt-3">
            <input
              type="text"
              placeholder="Ask about mules, loops, legal actions..."
              className="flex-1 p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={chatLoading}
              required
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="bg-indigo-600 text-white text-xs font-semibold px-4 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
