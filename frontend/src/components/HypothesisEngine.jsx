import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { apiClient } from '../api/client';
import { useTheme } from '../contexts/ThemeContext';

export default function HypothesisEngine({ caseId }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const { theme } = useTheme();

  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [maxHops, setMaxHops] = useState(4);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pathFound, setPathFound] = useState(false);
  const [pathData, setPathData] = useState(null);
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
    setPathData(null);

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
        setPathData(data.path_data);
      }
    } catch (err) {
      setErrorMsg("Error querying shortest paths: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pathData && pathFound) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      initializeGraph(pathData.nodes, pathData.edges);
    }
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [pathData, pathFound, theme]); // eslint-disable-line react-hooks/exhaustive-deps

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
            'font-family': 'var(--font-mono)',
            'color': 'rgb(var(--ink-secondary))',
            'background-color': 'rgb(var(--risk-low))',
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
            'background-color': 'rgb(var(--accent))',
            'color': 'rgb(var(--ink-primary))',
            'border-width': 3,
            'border-color': 'rgb(var(--border-default))',
            'width': 44,
            'height': 44,
          }
        },
        {
          selector: `node[id="${toAccount}"]`,
          style: {
            'background-color': 'rgb(var(--risk-high))',
            'color': 'rgb(var(--ink-primary))',
            'border-width': 3,
            'border-color': 'rgb(var(--border-default))',
            'width': 44,
            'height': 44,
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2.5,
            'line-color': 'rgb(var(--border-default))',
            'target-arrow-color': 'rgb(var(--border-default))',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount)',
            'font-size': 9,
            'font-family': 'var(--font-mono)',
            'color': 'rgb(var(--ink-primary))',
            'font-weight': '600',
            'text-background-opacity': 0.85,
            'text-background-color': 'rgb(var(--surface-raised))',
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': 'rgb(var(--accent))',
            'line-color': 'rgb(var(--accent))',
            'target-arrow-color': 'rgb(var(--accent))',
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
      <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card">
        <h2 className="text-base font-semibold text-ink-primary mb-2">Fund Flow Hypothesis Engine</h2>
        <p className="text-xs text-ink-muted mb-4">
          Trace shortest transaction paths between any two target accounts up to a specified depth.
        </p>

        <form onSubmit={handleTrace} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Source Account (From)</label>
            <select
              value={fromAccount}
              onChange={e => setFromAccount(e.target.value)}
              className="w-full p-2 border border-border rounded-md text-sm bg-surface-raised text-ink-primary focus:border-accent outline-none font-mono"
            >
              <option value="">Select source account...</option>
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Destination Account (To)</label>
            <select
              value={toAccount}
              onChange={e => setToAccount(e.target.value)}
              className="w-full p-2 border border-border rounded-md text-sm bg-surface-raised text-ink-primary focus:border-accent outline-none font-mono"
            >
              <option value="">Select destination account...</option>
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Max Hops (<span className="font-data font-bold">{maxHops}</span>)</label>
            <input
              type="range"
              min="1"
              max="6"
              value={maxHops}
              onChange={e => setMaxHops(parseInt(e.target.value))}
              className="w-full h-2 bg-surface-sunken rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between text-[10px] text-ink-muted mt-1 font-data">
              <span>1 hop</span>
              <span>3</span>
              <span>6 hops</span>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !fromAccount || !toAccount}
              className="w-full bg-accent hover:bg-accent-hover text-accent-fg font-semibold py-2 px-4 rounded-md text-sm disabled:opacity-40 transition-colors"
            >
              {loading ? "Tracing Path..." : "Trace Shortest Path"}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-3 p-3 bg-risk-high-bg border border-risk-high/15 rounded-md text-xs text-risk-high font-medium">
            {errorMsg}
          </div>
        )}
      </div>

      {searched && (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 bg-surface-raised border border-border-hairline rounded-xl overflow-hidden shadow-card relative min-h-[450px]">
            {loading && (
              <div className="absolute inset-0 bg-surface-raised/70 flex items-center justify-center z-10">
                <span className="text-sm font-medium text-ink-secondary">Running shortest-path trace in Neo4j...</span>
              </div>
            )}

            {!loading && !pathFound && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 bg-risk-medium-bg rounded-full flex items-center justify-center mb-3 border border-risk-medium/10">
                  <svg className="w-6 h-6 text-risk-medium" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-ink-primary mb-1">No Flow Path Detected</h3>
                <p className="text-xs text-ink-muted max-w-sm">
                  There are no directed transactional paths from <span className="font-semibold text-ink-secondary font-mono">{fromAccount}</span> to <span className="font-semibold text-ink-secondary font-mono">{toAccount}</span> within <span className="font-data font-bold">{maxHops}</span> hops.
                </p>
              </div>
            )}

            <div
              ref={containerRef}
              className={`w-full h-[450px] bg-surface-sunken ${(!loading && pathFound) ? 'block' : 'hidden'}`}
            />
          </div>

          {pathFound && (selectedNode || selectedEdge) && (
            <div className="w-full lg:w-80 bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-card h-fit">
              <h3 className="font-semibold text-ink-primary text-xs uppercase tracking-wider mb-3">
                Element Inspector
              </h3>

              {selectedNode && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Account ID</span>
                    <span className="text-xs font-semibold text-ink-primary font-mono">{selectedNode.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Risk Score</span>
                    <span className="text-xs font-bold text-ink-primary font-data">
                      {selectedNode.risk_score ? (selectedNode.risk_score * 100).toFixed(0) : '0'}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Total Volume</span>
                    <span className="text-xs font-bold text-ink-primary font-data">{selectedNode.volume || 0} txn(s)</span>
                  </div>
                  {selectedNode.community !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-muted">Community Class</span>
                      <span className="text-xs font-semibold text-ink-primary font-data">#{selectedNode.community}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedEdge && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Source</span>
                    <span className="text-xs font-semibold text-ink-primary font-mono">{selectedEdge.source}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Target</span>
                    <span className="text-xs font-semibold text-ink-primary font-mono">{selectedEdge.target}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Transferred</span>
                    <span className="text-xs font-bold text-accent font-data">{selectedEdge.amount}</span>
                  </div>
                  {selectedEdge.date && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-muted">Date</span>
                      <span className="text-xs font-semibold text-ink-primary font-data">{selectedEdge.date}</span>
                    </div>
                  )}
                  {selectedEdge.narration && (
                    <div className="border-t border-border-hairline pt-2 mt-2">
                      <span className="text-[10px] text-ink-muted block mb-1">Narration</span>
                      <p className="text-xs text-ink-secondary italic bg-surface-sunken p-2 rounded border border-border-hairline font-mono break-all">
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
