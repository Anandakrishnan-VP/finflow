import { useState, useRef, useEffect } from 'react';
import { apiClient } from '../api/client';

export default function NLQueryPanel({ caseId }) {
  const [subTab, setSubTab] = useState('chat'); // 'chat' | 'search'

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am the FinFlow AI Case Assistant. Ask me about suspect mule accounts, layering patterns, or next steps under BNSS/PMLA.'
    }
  ]);
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef(null);

  // Search State
  const [question, setQuestion] = useState('');
  const [result, setResult]     = useState(null);
  const [busy, setBusy]         = useState(false);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatBusy]);

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatBusy) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    
    // Add user message immediately
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatBusy(true);

    try {
      // Map history to server expectation
      const historyPayload = chatMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const { data } = await apiClient.post(`/cases/${caseId}/chat`, {
        message: userMsg,
        history: historyPayload
      });

      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Failed to connect to AI Assistant. Please verify your connection.' }
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  const ask = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await apiClient.post(`/cases/${caseId}/query`, { question });
      setResult(data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-Tabs Navigation */}
      <div className="flex bg-slate-100 p-0.5 rounded-lg w-fit mb-4">
        <button
          onClick={() => setSubTab('chat')}
          className={`text-xs px-4 py-2 rounded-md font-semibold transition-all ${
            subTab === 'chat'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          💬 AI Case Assistant
        </button>
        <button
          onClick={() => setSubTab('search')}
          className={`text-xs px-4 py-2 rounded-md font-semibold transition-all ${
            subTab === 'search'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          🔍 Table Search
        </button>
      </div>

      {subTab === 'chat' ? (
        <div className="flex flex-col border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-sm">
          {/* Scrollable messages log */}
          <div className="flex flex-col gap-3 h-[400px] overflow-y-auto p-4 scrollbar-thin">
            {chatMessages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`text-xs leading-relaxed max-w-[80%] px-4 py-2.5 shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-250 rounded-2xl rounded-tl-none'
                  }`}
                >
                  {msg.content.split('\n').map((line, lIdx) => (
                    <p key={lIdx} className={lIdx > 0 ? 'mt-1' : ''}>{line}</p>
                  ))}
                </div>
              </div>
            ))}

            {chatBusy && (
              <div className="flex items-start">
                <div className="bg-white border border-slate-250 rounded-2xl rounded-tl-none px-4 py-2.5 shadow-sm max-w-[80%] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input field */}
          <form onSubmit={sendChatMessage} className="flex border-t border-slate-200 bg-white p-3 gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about suspect mule roles, shell loops, or BNSS legal next steps..."
              className="flex-1 border border-slate-350 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              disabled={chatBusy}
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-95"
            >
              Send
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={ask} className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Show all money that returned to Harish within 30 days"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
            <button
              disabled={busy || !question}
              type="submit"
              className="bg-slate-900 text-white text-xs font-semibold rounded-lg px-4 py-2 disabled:opacity-50 transition active:scale-95"
            >
              {busy ? 'Searching...' : 'Search'}
            </button>
          </form>

          {result && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <div className="p-3 border-b border-slate-200 text-[10px] text-slate-400 font-semibold bg-slate-50 uppercase tracking-wider">
                Interpreted as: <code className="text-slate-650 bg-slate-100 px-1 py-0.5 rounded font-mono font-bold lowercase">{result.query_spec?.query_type}</code> · {result.count} result(s)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-400 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-bold">Date</th>
                      <th className="px-4 py-2.5 font-bold">Account</th>
                      <th className="px-4 py-2.5 font-bold">Type</th>
                      <th className="px-4 py-2.5 font-bold">Amount</th>
                      <th className="px-4 py-2.5 font-bold">Narration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((t) => (
                      <tr key={t.txn_hash} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-400">{new Date(t.txn_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-slate-700 font-medium">{t.account_id}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            (t.txn_type === 'DEBIT' || t.txn_type === 'DR')
                              ? 'bg-rose-50 text-rose-700 border border-rose-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {t.txn_type === 'DR' || t.txn_type === 'DEBIT' ? 'WITHDRAWAL' : 'DEPOSIT'}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-semibold">₹{Number(t.amount).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2 text-slate-500 max-w-xs truncate" title={t.narration}>{t.narration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
