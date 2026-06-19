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
            'color': '#1e293b',
            'background-color': '#3b82f6',
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
            'background-color': '#10b981', // green for source
            'border-width': 3,
            'border-color': '#047857',
            'width': 44,
            'height': 44,
          }
        },
        {
          selector: `node[id="${toAccount}"]`,
          style: {
            'background-color': '#ef4444', // red for target
            'border-width': 3,
            'border-color': '#b91c1c',
            'width': 44,
            'height': 44,
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2.5,
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount)',
            'font-size': 9,
            'color': '#0f172a',
            'font-weight': '600',
            'text-background-opacity': 0.7,
            'text-background-color': '#ffffff',
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': '#f59e0b',
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
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
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Fund Flow Hypothesis Engine</h2>
        <p className="text-xs text-slate-500 mb-4">
          Trace shortest transaction paths between any two target accounts up to a specified depth.
        </p>

        <form onSubmit={handleTrace} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Source Account (From)</label>
            <select
              value={fromAccount}
              onChange={e => setFromAccount(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
            >
              <option value="">Select source account...</option>
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Destination Account (To)</label>
            <select
              value={toAccount}
              onChange={e => setToAccount(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
            >
              <option value="">Select destination account...</option>
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Max Hops ({maxHops})</label>
            <input
              type="range"
              min="1"
              max="6"
              value={maxHops}
              onChange={e => setMaxHops(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>1 hop</span>
              <span>3</span>
              <span>6 hops</span>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !fromAccount || !toAccount}
              className="w-full bg-slate-900 text-white font-medium py-2 px-4 rounded-lg text-sm hover:bg-slate-800 disabled:opacity-40 transition"
            >
              {loading ? "Tracing Path..." : "Trace Shortest Path"}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 font-medium">
            {errorMsg}
          </div>
        )}
      </div>

      {searched && (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm relative min-h-[450px]">
            {loading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                <span className="text-sm font-medium text-slate-600">Running shortest-path trace in Neo4j...</span>
              </div>
            )}

            {!loading && !pathFound && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">No Flow Path Detected</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  There are no directed transactional paths from <span className="font-semibold text-slate-600">{fromAccount}</span> to <span className="font-semibold text-slate-600">{toAccount}</span> within {maxHops} hops.
                </p>
              </div>
            )}

            <div
              ref={containerRef}
              className={`w-full h-[450px] bg-slate-50 ${(!loading && pathFound) ? 'block' : 'hidden'}`}
            />
          </div>

          {pathFound && (selectedNode || selectedEdge) && (
            <div className="w-full lg:w-80 bg-white border border-slate-200 rounded-xl p-4 shadow-sm h-fit">
              <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-3">
                Element Inspector
              </h3>

              {selectedNode && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Account ID</span>
                    <span className="text-xs font-semibold text-slate-800">{selectedNode.account_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Risk Score</span>
                    <span className="text-xs font-semibold text-slate-800">
                      {selectedNode.risk_score ? (selectedNode.risk_score * 100).toFixed(0) : '0'}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Total Volume</span>
                    <span className="text-xs font-semibold text-slate-800">{selectedNode.volume} txns</span>
                  </div>
                  {selectedNode.community !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Community Class</span>
                      <span className="text-xs font-semibold text-slate-800">#{selectedNode.community}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedEdge && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Source</span>
                    <span className="text-xs font-semibold text-slate-800">{selectedEdge.source}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Target</span>
                    <span className="text-xs font-semibold text-slate-800">{selectedEdge.target}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Transferred</span>
                    <span className="text-xs font-semibold text-emerald-600">{selectedEdge.amount}</span>
                  </div>
                  {selectedEdge.date && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Date</span>
                      <span className="text-xs font-semibold text-slate-800">{selectedEdge.date}</span>
                    </div>
                  )}
                  {selectedEdge.narration && (
                    <div className="border-t border-slate-100 pt-2 mt-2">
                      <span className="text-[10px] text-slate-400 block mb-1">Narration</span>
                      <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded border border-slate-100">
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
