import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { apiClient } from '../api/client';

export default function HypothesisEngine({ caseId }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [maxHops, setMaxHops] = useState(4);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pathFound, setPathFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);

  // Load account list on component mount
  useEffect(() => {
    apiClient.get(`/cases/${caseId}/graph`)
      .then(({ data }) => {
        const list = (data.nodes || []).map(n => n.data.id);
        setAccounts(list.sort());
      })
      .catch(err => {
        console.error("Failed to load accounts for hypothesis engine:", err);
      });
  }, [caseId]);

  const handleTrace = async (e) => {
    e.preventDefault();
    if (!fromAccount || !toAccount) {
      setErrorMsg("Please select both source and destination accounts.");
      return;
    }
    if (fromAccount === toAccount) {
      setErrorMsg("Source and destination accounts must be different.");
      return;
    }

    setLoading(true);
    setSearched(true);
    setErrorMsg('');
    setSelectedNode(null);
    setSelectedEdge(null);

    try {
      const { data } = await apiClient.get(`/cases/${caseId}/hypothesis`, {
        params: {
          from_account: fromAccount,
          to_account: toAccount,
          max_hops: maxHops
        }
      });

      setPathFound(data.path_found);

      if (data.path_found && data.path_data) {
        // Destroy previous graph if any
        if (cyRef.current) {
          cyRef.current.destroy();
          cyRef.current = null;
        }

        setTimeout(() => {
          initializeGraph(data.path_data.nodes, data.path_data.edges);
        }, 100);
      } else {
        if (cyRef.current) {
          cyRef.current.destroy();
          cyRef.current = null;
        }
      }
    } catch (err) {
      setErrorMsg("Error querying shortest paths: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const initializeGraph = (nodes, edges) => {
    if (!containerRef.current) return;

    const isDark = document.documentElement.classList.contains('dark');

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      layout: {
        name: 'grid',
        rows: 1,
        spacingFactor: 1.2,
        padding: 50,
      },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(id)',
            'font-size': 10,
            'color': isDark ? '#E2E8F0' : '#1E293B',
            'background-color': '#3B82F6',
            'width': 36,
            'height': 36,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'font-weight': 'bold',
          }
        },
        {
          selector: `node[id="${fromAccount}"]`,
          style: {
            'background-color': '#10B981', // green for source
            'border-width': 3,
            'border-color': '#059669',
            'width': 44,
            'height': 44,
          }
        },
        {
          selector: `node[id="${toAccount}"]`,
          style: {
            'background-color': '#EF4444', // red for target
            'border-width': 3,
            'border-color': '#DC2626',
            'width': 44,
            'height': 44,
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2.5,
            'line-color': isDark ? '#475569' : '#64748B',
            'target-arrow-color': isDark ? '#475569' : '#64748B',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount)',
            'font-size': 9,
            'color': isDark ? '#F1F5F9' : '#0F172A',
            'font-weight': '600',
            'text-background-opacity': 0.8,
            'text-background-color': isDark ? '#1E293B' : '#FFFFFF',
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': '#F59E0B',
            'line-color': '#F59E0B',
            'target-arrow-color': '#F59E0B',
          }
        }
      ],
    });

    cy.on('tap', 'node', (evt) => {
      setSelectedNode(evt.target.data());
      setSelectedEdge(null);
    });

    cy.on('tap', 'edge', (evt) => {
      setSelectedEdge(evt.target.data());
      setSelectedNode(null);
    });

    cyRef.current = cy;
  };

  return (
    <div className="space-y-6 text-xs animate-fade-in">
      
      {/* Search Filter input form */}
      <div className="bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm">
        <div className="border-b border-borderLight dark:border-borderDark pb-2.5 mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Fund Flow Hypothesis Engine</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Trace shortest transaction flows between target accounts to isolate layering hops.
          </p>
        </div>

        <form onSubmit={handleTrace} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          
          {/* Source Select */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Source Account (From)</label>
            <select
              value={fromAccount}
              onChange={e => setFromAccount(e.target.value)}
              className="w-full p-2.5 border border-borderLight dark:border-borderDark rounded-btn bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none"
            >
              <option value="">Select source account...</option>
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          {/* Target Select */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Destination Account (To)</label>
            <select
              value={toAccount}
              onChange={e => setToAccount(e.target.value)}
              className="w-full p-2.5 border border-borderLight dark:border-borderDark rounded-btn bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none"
            >
              <option value="">Select destination account...</option>
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          {/* Hops depth */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Max Depth Limit</label>
              <span className="font-mono font-bold text-accent">{maxHops} hops</span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              value={maxHops}
              onChange={e => setMaxHops(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between text-[8px] text-slate-400 mt-1 font-bold font-mono">
              <span>1 HOP</span>
              <span>3</span>
              <span>6 HOPS</span>
            </div>
          </div>

          {/* Submit */}
          <div>
            <button
              type="submit"
              disabled={loading || !fromAccount || !toAccount}
              className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2.5 px-4 rounded-btn shadow-md shadow-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Tracing Path..." : "Trace Shortest Path"}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-3 p-3 bg-danger/5 border border-danger/25 text-danger font-semibold rounded-btn animate-pulse">
            {errorMsg}
          </div>
        )}
      </div>

      {searched && (
        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* Graph view canvas */}
          <div className="flex-1 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise overflow-hidden shadow-sm relative min-h-[450px]">
            {loading && (
              <div className="absolute inset-0 bg-white/70 dark:bg-cardDark/85 flex flex-col items-center justify-center gap-3 z-10">
                <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-accent animate-spin" />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider animate-pulse">Running shortest-path trace GDS algorithms...</span>
              </div>
            )}

            {!loading && !pathFound && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-warning" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">No Flow Path Isolated</h3>
                <p className="text-slate-400 max-w-sm">
                  There are no directed transaction flows from <span className="font-semibold text-slate-700 dark:text-slate-200">{fromAccount}</span> to <span className="font-semibold text-slate-700 dark:text-slate-200">{toAccount}</span> within {maxHops} hops.
                </p>
              </div>
            )}

            <div
              ref={containerRef}
              className={`w-full h-[450px] bg-slate-50/50 dark:bg-slate-950/20 shadow-inner ${(!loading && pathFound) ? 'block' : 'hidden'}`}
            />
          </div>

          {/* Details inspector panel */}
          {pathFound && (selectedNode || selectedEdge) && (
            <div className="w-full lg:w-80 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 shadow-sm h-fit space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider border-b border-borderLight dark:border-borderDark pb-2">
                Element Inspector
              </h3>

              {selectedNode && (
                <div className="space-y-3 font-semibold text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Account ID</span>
                    <span className="font-mono text-slate-900 dark:text-white">{selectedNode.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Risk Score</span>
                    <span className="text-slate-900 dark:text-white">
                      {selectedNode.risk_score ? (selectedNode.risk_score * 100).toFixed(0) : '0'}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Volume</span>
                    <span className="text-slate-900 dark:text-white">{selectedNode.volume} txns</span>
                  </div>
                  {selectedNode.community !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Community ID</span>
                      <span className="text-slate-900 dark:text-white">#{selectedNode.community}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedEdge && (
                <div className="space-y-3 font-semibold text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Source Account</span>
                    <span className="font-mono text-slate-900 dark:text-white">{selectedEdge.source}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Target Account</span>
                    <span className="font-mono text-slate-900 dark:text-white">{selectedEdge.target}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Transferred Amount</span>
                    <span className="text-success font-extrabold">{selectedEdge.amount}</span>
                  </div>
                  {selectedEdge.date && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Date</span>
                      <span className="text-slate-900 dark:text-white">{selectedEdge.date}</span>
                    </div>
                  )}
                  {selectedEdge.narration && (
                    <div className="border-t border-borderLight dark:border-borderDark pt-3 mt-3">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-1.5">Narration Context</span>
                      <p className="text-slate-600 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-borderLight dark:border-borderDark font-medium leading-relaxed">
                        {selectedEdge.narration}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
