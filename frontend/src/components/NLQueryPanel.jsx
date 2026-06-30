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
      <div className="flex bg-surface-sunken border border-border-hairline p-0.5 rounded-lg w-fit mb-4">
        <button
          onClick={() => setSubTab('chat')}
          className={`text-xs px-4 py-2 rounded-md font-semibold transition-all ${
            subTab === 'chat'
              ? 'bg-surface-raised text-ink-primary shadow-sm'
              : 'text-ink-muted hover:text-ink-secondary'
          }`}
        >
          💬 AI Case Assistant
        </button>
        <button
          onClick={() => setSubTab('search')}
          className={`text-xs px-4 py-2 rounded-md font-semibold transition-all ${
            subTab === 'search'
              ? 'bg-surface-raised text-ink-primary shadow-sm'
              : 'text-ink-muted hover:text-ink-secondary'
          }`}
        >
          🔍 Table Search
        </button>
      </div>

      {subTab === 'chat' ? (
        <div className="flex flex-col border border-border-hairline rounded-xl bg-surface-sunken overflow-hidden shadow-card">
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
                  className={`text-xs leading-relaxed max-w-[80%] px-4 py-2.5 shadow-sm rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-accent text-accent-fg rounded-tr-none'
                      : 'bg-surface-raised text-ink-primary border border-border-hairline rounded-tl-none'
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
                <div className="bg-surface-raised border border-border-hairline rounded-lg rounded-tl-none px-4 py-2.5 shadow-sm max-w-[80%] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-ink-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input field */}
          <form onSubmit={sendChatMessage} className="flex border-t border-border-hairline bg-surface-raised p-3 gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about suspect mule roles, shell loops, or BNSS legal next steps..."
              className="flex-1 border border-border rounded-md px-3 py-2 text-xs outline-none bg-surface-base text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent"
              disabled={chatBusy}
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              className="bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
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
              className="flex-1 border border-border rounded-md bg-surface-raised text-ink-primary px-3 py-2 text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <button
              disabled={busy || !question}
              type="submit"
              className="bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold rounded-md px-4 py-2 disabled:opacity-50 transition-all active:scale-95"
            >
              {busy ? 'Searching...' : 'Search'}
            </button>
          </form>

          {result && (
            <div className="bg-surface-raised border border-border-hairline rounded-lg overflow-hidden shadow-card">
              <div className="p-3 border-b border-border-hairline text-[10px] text-ink-muted font-semibold bg-surface-sunken/40 uppercase tracking-wider">
                Interpreted as: <code className="text-accent bg-accent-subtle px-1 py-0.5 rounded font-mono font-bold lowercase border border-accent/15">{result.query_spec?.query_type}</code> · <span className="font-data">{result.count}</span> result(s)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-ink-muted bg-surface-sunken/20 border-b border-border-hairline">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Account</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Narration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((t) => (
                      <tr key={t.txn_hash} className="border-t border-border-hairline hover:bg-surface-sunken/30 transition-colors odd:bg-surface-raised even:bg-surface-base/30">
                        <td className="px-4 py-2 text-ink-muted font-data">{new Date(t.txn_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-ink-primary font-mono font-medium">{t.account_id}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block border ${
                            (t.txn_type === 'DEBIT' || t.txn_type === 'DR')
                              ? 'bg-risk-high-bg text-risk-high border-risk-high/15'
                              : 'bg-accent-subtle text-accent border-accent/20'
                          }`}>
                            {t.txn_type === 'DR' || t.txn_type === 'DEBIT' ? 'WITHDRAWAL' : 'DEPOSIT'}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-semibold font-data text-ink-primary">₹{Number(t.amount).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2 text-ink-secondary max-w-xs truncate" title={t.narration}>{t.narration}</td>
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
