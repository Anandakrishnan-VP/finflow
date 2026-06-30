import { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { apiClient } from '../api/client';
import SankeyFlowView from './SankeyFlowView';
import { useTheme } from '../contexts/ThemeContext';

cytoscape.use(coseBilkent);

const LABEL_BUDGET = 15;   // RULE 28: only the top N nodes get a visible label

function riskTier(score) {
  if (score >= 65) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

const ROLE_BADGE = {
  MULE: 'M', AGGREGATOR: 'A', CASH_OUT: 'C', DORMANT_REACTIVATED: 'D',
};

export default function GraphView({ caseId }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const { theme } = useTheme();
  const [raw, setRaw] = useState(null);
  const [view, setView] = useState('network');       // 'network' | 'flow'
  const [minAmount, setMinAmount] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // AI Explainer State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiError, setAiError] = useState('');

  const generateAiInsights = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const response = await apiClient.post(`/cases/${caseId}/graph/explain`);
      setAiExplanation(response.data.explanation);
    } catch (err) {
      console.error(err);
      setAiError(err.response?.data?.detail || 'Failed to generate AI insights.');
    } finally {
      setAiLoading(false);
    }
  };

  const load = (nodeLimit) => {
    apiClient
      .get(`/cases/${caseId}/graph`, { params: { min_amount: minAmount, node_limit: nodeLimit } })
      .then((r) => setRaw(r.data));
  };

  useEffect(() => { load(showAll ? 5000 : 150); }, [caseId, minAmount, showAll]); // eslint-disable-line

  // RULE 28: only the top LABEL_BUDGET nodes by composite_score get a label
  const labeledIds = useMemo(() => {
    if (!raw) return new Set();
    const sorted = [...raw.nodes].sort(
      (a, b) => (b.data.composite_score || 0) - (a.data.composite_score || 0)
    );
    return new Set(sorted.slice(0, LABEL_BUDGET).map((n) => n.data.id));
  }, [raw]);

  useEffect(() => {
    if (!raw || view !== 'network') return;
    let cy;

    const nodes = raw.nodes.map((n) => ({
      data: {
        ...n.data,
        risk_tier: riskTier(n.data.composite_score || 0),
        display_label: labeledIds.has(n.data.id) ? (n.data.name || n.data.id) : '',
        role_badge: ROLE_BADGE[n.data.role_label] || '',
      },
    }));
    const edges = raw.edges.map((e) => ({ data: e.data }));

    // Find the max degree node to make sure the central hub is at the center
    const maxDegree = raw.nodes.reduce((max, n) => Math.max(max, n.data.degree || 0), 0);

    // RULE 27: layout choice depends on topology, not a fixed default
    const layout = raw.is_hub_dominated
      ? {
          name: 'concentric',
          concentric: (node) => {
            if (node.data('degree') === maxDegree) return 1000;
            return node.data('composite_score') || 1;
          },
          levelWidth: () => 15,
          minNodeSpacing: 40,
          avoidOverlap: true,
          nodeDimensionsIncludeLabels: true,
          spacingFactor: 1.5,
          animate: false,
        }
      : { name: 'cose-bilkent', animate: false, nodeRepulsion: 8000 };

    cy = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      layout,
      style: [
        { selector: 'node', style: {
            'label': 'data(display_label)', 'font-size': 9, 'color': 'rgb(var(--ink-secondary))',
            'width': 'mapData(volume, 0, 10000000, 18, 56)',
            'height': 'mapData(volume, 0, 10000000, 18, 56)',
            'text-valign': 'bottom', 'text-margin-y': 4, 'text-wrap': 'none',
        }},
        { selector: 'node[risk_tier="low"]',    style: { 'shape': 'ellipse', 'background-color': 'rgb(var(--risk-low))' } },
        { selector: 'node[risk_tier="medium"]', style: { 'shape': 'diamond', 'background-color': 'rgb(var(--risk-medium))' } },
        { selector: 'node[risk_tier="high"]',   style: { 'shape': 'hexagon', 'background-color': 'rgb(var(--risk-high))' } },
        // RULE 29: edge width and opacity scale with log_amount, never flat
        { selector: 'edge', style: {
            'width': 'mapData(log_amount, 5, 18, 0.75, 6)',
            'opacity': 'mapData(log_amount, 5, 18, 0.25, 0.9)',
            'line-color': 'rgb(var(--border-default))', 'target-arrow-color': 'rgb(var(--border-default))',
            'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
        }},
        { selector: ':selected', style: { 'border-width': 3, 'border-color': 'rgb(var(--accent))' } },
        { selector: '.faded', style: { 'opacity': 0.08 } },
        { selector: '.highlighted', style: { 'border-width': 3, 'border-color': 'rgb(var(--accent))' } },
      ],
    });

    cy.on('tap', 'node', (evt) => setSelected({ type: 'node', data: evt.target.data() }));
    cy.on('tap', 'edge', (evt) => setSelected({ type: 'edge', data: evt.target.data() }));

    // Focus mode: double-click isolates the 1-hop neighborhood
    cy.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().difference(neighborhood).addClass('faded');
      neighborhood.removeClass('faded');
    });
    cy.on('tap', (evt) => {
      if (evt.target === cy) cy.elements().removeClass('faded');
    });

    cyRef.current = cy;
    return () => { if (cy) cy.destroy(); };
  }, [raw, view, labeledIds, theme]);

  // Search: highlight + center on matching node
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted');
    if (!search) return;
    const matches = cy.nodes().filter((n) => 
      n.data('id').toLowerCase().includes(search.toLowerCase()) ||
      (n.data('name') && n.data('name').toLowerCase().includes(search.toLowerCase()))
    );
    matches.addClass('highlighted');
    if (matches.length > 0) cy.center(matches);
  }, [search]);

  if (!raw) return <div className="text-sm text-ink-muted py-8 text-center">Loading graph...</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex bg-surface-sunken rounded-lg p-0.5 border border-border-hairline">
          <button onClick={() => setView('network')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors ${view === 'network' ? 'bg-surface-raised shadow-sm text-ink-primary font-medium' : 'text-ink-muted hover:text-ink-secondary'}`}>
            Network
          </button>
          <button onClick={() => setView('flow')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors ${view === 'flow' ? 'bg-surface-raised shadow-sm text-ink-primary font-medium' : 'text-ink-muted hover:text-ink-secondary'}`}>
            Flow
          </button>
        </div>

        <input
          placeholder="Search account or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs bg-surface-raised text-ink-primary border border-border rounded px-2 py-1.5 w-44"
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-muted">Min amount</label>
          <input type="range" min="0" max="1000000" step="10000" value={minAmount}
                 onChange={(e) => setMinAmount(Number(e.target.value))} className="w-32 accent-accent" />
          <span className="text-xs text-ink-muted w-20 font-data">
            ₹{minAmount.toLocaleString('en-IN')}
          </span>
        </div>

        {raw.total_node_count > raw.shown_node_count && (
          <button onClick={() => setShowAll(true)}
                  className="text-xs bg-risk-medium-bg text-risk-medium border border-risk-medium/10 rounded px-3 py-1.5">
            Showing {raw.shown_node_count} of {raw.total_node_count} accounts — show all
          </button>
        )}
      </div>

      {view === 'network' ? (
        <div className="flex gap-4 flex-col lg:flex-row">
          <div ref={containerRef} className="flex-1 h-[560px] bg-surface-raised border border-border-hairline rounded-lg" />
          <div className="w-full lg:w-80 bg-surface-raised border border-border-hairline rounded-lg p-4 text-sm flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="font-semibold text-ink-primary text-xs uppercase tracking-wider mb-3">Selected Details</div>
              {selected ? (
                <div className="space-y-4">
                  {selected.type === 'node' ? (
                    <>
                      <div>
                        <div className="text-[10px] text-ink-muted uppercase font-semibold">Account Holder</div>
                        <div className="font-bold text-ink-primary text-sm">{selected.data.name || 'Unknown Counterparty'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-ink-muted uppercase font-semibold">Account Number</div>
                        <div className="font-mono text-xs text-ink-secondary break-all">{selected.data.account_id}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Bank</div>
                          <div className="text-xs text-ink-secondary font-medium">{selected.data.bank || 'Unknown Bank'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Type</div>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold inline-block ${
                            selected.data.is_primary ? 'bg-accent-subtle text-accent border border-accent/20' : 'bg-surface-sunken text-ink-secondary border border-border-hairline'
                          }`}>
                            {selected.data.is_primary ? 'Primary Account' : 'Counterparty'}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Risk Score</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-2 h-2 rounded-full ${
                              selected.data.risk_tier === 'high' ? 'bg-risk-high' : selected.data.risk_tier === 'medium' ? 'bg-risk-medium' : 'bg-risk-low'
                            }`} />
                            <span className="font-bold text-ink-primary text-xs font-data">{(selected.data.composite_score || 0).toFixed(0)}/100</span>
                          </div>
                        </div>
                        {selected.data.role_label && (
                          <div>
                            <div className="text-[10px] text-ink-muted uppercase font-semibold">Inferred Role</div>
                            <span className="text-[10px] bg-risk-high-bg text-risk-high font-bold border border-risk-high/10 rounded px-1.5 py-0.5 mt-0.5 inline-block">
                              {selected.data.role_label.replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Transacted Volume</div>
                          <div className="text-xs font-bold text-ink-primary mt-0.5 font-data">
                            ₹{Number(selected.data.volume || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Direct Links</div>
                          <div className="text-xs font-semibold text-ink-secondary mt-0.5 font-data">
                            {selected.data.degree} connections
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="text-[10px] text-ink-muted uppercase font-semibold">Flow direction</div>
                        <div className="font-bold text-ink-secondary text-xs flex items-center gap-1 mt-0.5">
                          <span className="font-mono text-[10px] text-ink-muted truncate max-w-[90px]" title={selected.data.source}>{selected.data.source}</span>
                          <span>➡️</span>
                          <span className="font-mono text-[10px] text-ink-muted truncate max-w-[90px]" title={selected.data.target}>{selected.data.target}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Total Amount</div>
                          <div className="text-sm font-bold text-ink-primary mt-0.5 font-data">
                            ₹{Number(selected.data.total_amount).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">TX Count</div>
                          <div className="text-xs font-bold text-ink-secondary mt-0.5 font-data">
                            {selected.data.txn_count} transaction(s)
                          </div>
                        </div>
                      </div>
                      {selected.data.sample_narrations && selected.data.sample_narrations.length > 0 && (
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold mb-1">Sample Narrations</div>
                          <ul className="space-y-1">
                            {selected.data.sample_narrations.map((nar, idx) => (
                              <li key={idx} className="text-[10px] bg-surface-sunken border border-border-hairline rounded p-1 text-ink-secondary break-words font-mono">
                                {nar}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-ink-muted text-xs italic py-8 text-center border border-dashed border-border-hairline rounded-lg bg-surface-sunken/40">
                  Click a node or edge for details.
                </div>
              )}
            </div>
            <div className="mt-6 border-t border-border-hairline pt-4">
              <div className="font-semibold text-ink-secondary text-[10px] uppercase tracking-wider mb-2">Graph Legend</div>
              <div className="flex items-center gap-2 mb-1.5"><span className="w-2.5 h-2.5 rounded-full bg-risk-low" /> <span className="text-xs text-ink-secondary">Low risk (Regular)</span></div>
              <div className="flex items-center gap-2 mb-1.5"><span className="w-2.5 h-2.5 bg-risk-medium" style={{clipPath:'polygon(50% 0,100% 50%,50% 100%,0 50%)'}} /> <span className="text-xs text-ink-secondary">Medium risk</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-risk-high" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} /> <span className="text-xs text-ink-secondary">High risk (Alert)</span></div>
            </div>
          </div>
        </div>
      ) : (
        <SankeyFlowView caseId={caseId} minAmount={minAmount} />
      )}

      {/* AI Network Insights Section */}
      <div className="bg-surface-sunken border border-border-hairline rounded-xl p-5 mt-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <h3 className="text-sm font-bold text-ink-primary">AI Graph Explainer & Insights</h3>
          </div>
          <button
            onClick={generateAiInsights}
            disabled={aiLoading}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-sm ${
              aiLoading
                ? 'bg-accent/50 text-accent-fg cursor-not-allowed'
                : 'bg-accent hover:bg-accent-hover text-accent-fg active:scale-95'
            }`}
          >
            {aiLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-accent-fg border-t-transparent rounded-full animate-spin"></span>
                Analyzing Network...
              </span>
            ) : (
              'Explain Network Flow'
            )}
          </button>
        </div>

        {aiError && (
          <div className="text-xs text-risk-high bg-risk-high-bg border border-risk-high/10 rounded-lg p-3 mb-4">
            ⚠️ {aiError}
          </div>
        )}

        {aiExplanation ? (
          <div className="bg-surface-raised border border-border-hairline rounded-lg p-4 text-xs text-ink-secondary leading-relaxed shadow-inner">
            <div className="prose prose-neutral max-w-none prose-xs">
              {aiExplanation.split('\n').map((line, idx) => {
                if (line.startsWith('###')) {
                  return <h4 key={idx} className="font-bold text-ink-primary mt-3 mb-1 text-sm">{line.replace('###', '').trim()}</h4>;
                }
                if (line.startsWith('##')) {
                  return <h3 key={idx} className="font-bold text-ink-primary mt-4 mb-2 text-sm">{line.replace('##', '').trim()}</h3>;
                }
                if (line.startsWith('#')) {
                  return <h2 key={idx} className="font-bold text-ink-primary mt-5 mb-2 text-base">{line.replace('#', '').trim()}</h2>;
                }
                if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
                  return <li key={idx} className="ml-4 list-disc my-1">{line.replace(/^[\s-*]+/, '').trim()}</li>;
                }
                if (line.trim()) {
                  return <p key={idx} className="my-1.5">{line}</p>;
                }
                return <div key={idx} className="h-1" />;
              })}
            </div>
          </div>
        ) : (
          !aiLoading && (
            <div className="text-xs text-ink-muted text-center py-6 border border-dashed border-border-hairline rounded-lg bg-surface-raised">
              Click the button to generate an AI explanation of this transaction network, highlighting hubs, risk levels, and circular loops.
            </div>
          )
        )}
      </div>
    </div>
  );
}
