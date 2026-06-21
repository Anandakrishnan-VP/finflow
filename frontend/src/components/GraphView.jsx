import { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { apiClient } from '../api/client';
import SankeyFlowView from './SankeyFlowView';

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
        display_label: labeledIds.has(n.data.id) ? n.data.id : '',
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
            'label': 'data(display_label)', 'font-size': 9, 'color': 'var(--color-text-secondary)',
            'width': 'mapData(volume, 0, 10000000, 18, 56)',
            'height': 'mapData(volume, 0, 10000000, 18, 56)',
            'text-valign': 'bottom', 'text-margin-y': 4, 'text-wrap': 'none',
        }},
        { selector: 'node[risk_tier="low"]',    style: { 'shape': 'ellipse', 'background-color': '#2563eb' } },
        { selector: 'node[risk_tier="medium"]', style: { 'shape': 'diamond', 'background-color': '#d97706' } },
        { selector: 'node[risk_tier="high"]',   style: { 'shape': 'hexagon', 'background-color': '#dc2626' } },
        // RULE 29: edge width and opacity scale with log_amount, never flat
        { selector: 'edge', style: {
            'width': 'mapData(log_amount, 5, 18, 0.75, 6)',
            'opacity': 'mapData(log_amount, 5, 18, 0.25, 0.9)',
            'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
        }},
        { selector: ':selected', style: { 'border-width': 3, 'border-color': '#0f172a' } },
        { selector: '.faded', style: { 'opacity': 0.08 } },
        { selector: '.highlighted', style: { 'border-width': 3, 'border-color': '#0f172a' } },
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
  }, [raw, view, labeledIds]);

  // Search: highlight + center on matching node
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted');
    if (!search) return;
    const matches = cy.nodes().filter((n) => n.data('id').toLowerCase().includes(search.toLowerCase()));
    matches.addClass('highlighted');
    if (matches.length > 0) cy.center(matches);
  }, [search]);

  if (!raw) return <div className="text-sm text-slate-400 py-8">Loading graph...</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setView('network')}
                  className={`text-xs px-3 py-1.5 rounded-md ${view === 'network' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
            Network
          </button>
          <button onClick={() => setView('flow')}
                  className={`text-xs px-3 py-1.5 rounded-md ${view === 'flow' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
            Flow
          </button>
        </div>

        <input placeholder="Search account..." value={search} onChange={(e) => setSearch(e.target.value)}
               className="text-xs border border-slate-300 rounded px-2 py-1.5 w-44" />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Min amount</label>
          <input type="range" min="0" max="1000000" step="10000" value={minAmount}
                 onChange={(e) => setMinAmount(Number(e.target.value))} className="w-32" />
          <span className="text-xs text-slate-400 w-20">
            ₹{minAmount.toLocaleString('en-IN')}
          </span>
        </div>

        {raw.total_node_count > raw.shown_node_count && (
          <button onClick={() => setShowAll(true)}
                  className="text-xs bg-amber-50 text-amber-700 rounded px-3 py-1.5">
            Showing {raw.shown_node_count} of {raw.total_node_count} accounts — show all
          </button>
        )}
      </div>

      {view === 'network' ? (
        <div className="flex gap-4">
          <div ref={containerRef} className="flex-1 h-[560px] bg-white border border-slate-200 rounded-lg" />
          <div className="w-64 bg-white border border-slate-200 rounded-lg p-4 text-sm">
            <div className="font-medium text-slate-700 mb-2">Legend</div>
            <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 rounded-full bg-blue-600" /> Low risk</div>
            <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 bg-amber-600" style={{clipPath:'polygon(50% 0,100% 50%,50% 100%,0 50%)'}} /> Medium risk</div>
            <div className="flex items-center gap-2 mb-3"><span className="w-3 h-3 bg-red-600" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} /> High risk</div>
            <div className="text-xs text-slate-400 mb-3">
              Node size = transaction volume. Edge thickness = transferred amount.
              Only the top {LABEL_BUDGET} accounts are labeled — double-click any
              node to focus its neighborhood, click background to reset.
            </div>
            {selected ? (
              <div>
                <div className="font-medium text-slate-700 mb-1">{selected.type === 'node' ? 'Account' : 'Relationship'}</div>
                {selected.type === 'node' && selected.data.role_label && (
                  <div className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded inline-block mb-2">
                    {selected.data.role_label.replace(/_/g, ' ')}
                  </div>
                )}
                {selected.type === 'edge' && (
                  <div className="text-xs text-slate-500 mb-2">
                    {selected.data.txn_count} transaction(s) · ₹{Number(selected.data.total_amount).toLocaleString('en-IN')} total
                  </div>
                )}
                <pre className="text-xs text-slate-500 whitespace-pre-wrap">{JSON.stringify(selected.data, null, 2)}</pre>
              </div>
            ) : <div className="text-slate-400 text-xs">Click a node or edge for details.</div>}
          </div>
        </div>
      ) : (
        <SankeyFlowView caseId={caseId} minAmount={minAmount} />
      )}

      {/* AI Network Insights Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mt-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <h3 className="text-sm font-bold text-slate-800">AI Graph Explainer & Insights</h3>
          </div>
          <button
            onClick={generateAiInsights}
            disabled={aiLoading}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-sm ${
              aiLoading
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'
            }`}
          >
            {aiLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Analyzing Network...
              </span>
            ) : (
              'Explain Network Flow'
            )}
          </button>
        </div>

        {aiError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 mb-4">
            ⚠️ {aiError}
          </div>
        )}

        {aiExplanation ? (
          <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-700 leading-relaxed shadow-inner">
            <div className="prose prose-slate max-w-none prose-xs">
              {aiExplanation.split('\n').map((line, idx) => {
                if (line.startsWith('###')) {
                  return <h4 key={idx} className="font-bold text-slate-800 mt-3 mb-1 text-sm">{line.replace('###', '').trim()}</h4>;
                }
                if (line.startsWith('##')) {
                  return <h3 key={idx} className="font-bold text-slate-800 mt-4 mb-2 text-sm">{line.replace('##', '').trim()}</h3>;
                }
                if (line.startsWith('#')) {
                  return <h2 key={idx} className="font-bold text-slate-900 mt-5 mb-2 text-base">{line.replace('#', '').trim()}</h2>;
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
            <div className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg bg-white">
              Click the button to generate an AI explanation of this transaction network, highlighting hubs, risk levels, and circular loops.
            </div>
          )
        )}
      </div>
    </div>
  );
}

