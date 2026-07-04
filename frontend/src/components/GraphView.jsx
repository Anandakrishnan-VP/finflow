import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { apiClient } from '../api/client';
import SankeyFlowView from './SankeyFlowView';
import PatternInsightsPanel from './PatternInsightsPanel';
import { useTheme } from '../contexts/ThemeContext';

cytoscape.use(coseBilkent);

const LABEL_BUDGET = 15;
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const [patternMembership, setPatternMembership] = useState({
    circular: { nodeIds: new Set(), edgeIds: new Set() },
    layering: { nodeIds: new Set(), edgeIds: new Set() },
    fan_out: { nodeIds: new Set(), edgeIds: new Set() },
    fan_in: { nodeIds: new Set(), edgeIds: new Set() },
    nodeIds: new Set(),
    edgeIds: new Set(),
  });
  const [focusedPattern, setFocusedPattern] = useState(null);

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

  // RULE 36 + 40: fetch pattern membership independent of graph load state
  useEffect(() => {
    apiClient.get(`/cases/${caseId}/graph/patterns`).then(({ data }) => {
      const circular = { nodeIds: new Set(), edgeIds: new Set() };
      const layering = { nodeIds: new Set(), edgeIds: new Set() };
      const fan_out = { nodeIds: new Set(), edgeIds: new Set() };
      const fan_in = { nodeIds: new Set(), edgeIds: new Set() };
      const nodeIds = new Set();
      const edgeIds = new Set();

      const addEdge = (set, a, b) => {
        set.edgeIds.add(`${a}__${b}`);
        edgeIds.add(`${a}__${b}`);
      };

      data.fan_out.forEach((p) => {
        fan_out.nodeIds.add(p.hub);
        nodeIds.add(p.hub);
        p.targets.forEach((t) => {
          fan_out.nodeIds.add(t);
          nodeIds.add(t);
          addEdge(fan_out, p.hub, t);
        });
      });

      data.fan_in.forEach((p) => {
        fan_in.nodeIds.add(p.hub);
        nodeIds.add(p.hub);
        p.sources.forEach((s) => {
          fan_in.nodeIds.add(s);
          nodeIds.add(s);
          addEdge(fan_in, s, p.hub);
        });
      });

      data.circular_flows.forEach((p) => {
        p.path.forEach((a) => {
          circular.nodeIds.add(a);
          nodeIds.add(a);
        });
        p.hops.forEach((h) => {
          addEdge(circular, h.from, h.to);
        });
      });

      data.layering_chains.forEach((p) => {
        p.path.forEach((a) => {
          layering.nodeIds.add(a);
          nodeIds.add(a);
        });
        for (let i = 0; i < p.path.length - 1; i++) {
          addEdge(layering, p.path[i], p.path[i + 1]);
        }
      });

      setPatternMembership({ circular, layering, fan_out, fan_in, nodeIds, edgeIds });
    });
  }, [caseId]);

  // RULE 37: dynamic per-case min/max, never a fixed absolute constant.
  const scaleBounds = useMemo(() => {
    if (!raw) return { volMin: 0, volMax: 1, logMin: 0, logMax: 1 };
    const vols = raw.nodes.map((n) => n.data.volume || 0);
    const logs = raw.edges.map((e) => e.data.log_amount || 0);
    return {
      volMin: Math.min(...vols, 0),
      volMax: Math.max(...vols, 1),
      logMin: Math.min(...logs, 0),
      logMax: Math.max(...logs, 1),
    };
  }, [raw]);

  // RULE 39: label fallback chain — composite_score, then degree, then volume.
  const labeledIds = useMemo(() => {
    if (!raw) return new Set();
    const allScoresZero = raw.nodes.every((n) => !(n.data.composite_score > 0));
    const sorted = [...raw.nodes].sort((a, b) => {
      if (!allScoresZero) {
        const scoreDiff = (b.data.composite_score || 0) - (a.data.composite_score || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }
      const degreeDiff = (b.data.degree || 0) - (a.data.degree || 0);
      if (degreeDiff !== 0) return degreeDiff;
      return (b.data.volume || 0) - (a.data.volume || 0);
    });
    return new Set(sorted.slice(0, LABEL_BUDGET).map((n) => n.data.id));
  }, [raw]);

  const patternStats = useMemo(() => {
    if (!raw) return null;
    return {
      accounts: raw.total_node_count,
      transfers: raw.edges.length,
    };
  }, [raw]);

  const applyFocus = useCallback((cy, pattern) => {
    cy.elements().removeClass('faded trace-step');
    cy.edges().removeData('trace_label');

    if (!pattern) {
      cy.elements().removeClass('pattern-focused');
      return;
    }

    let focusNodeIds = [], focusEdgeKeys = [];
    if (pattern.type === 'fan_out') {
      focusNodeIds = [pattern.data.hub, ...pattern.data.targets];
      focusEdgeKeys = pattern.data.targets.map((t) => `${pattern.data.hub}__${t}`);
    } else if (pattern.type === 'fan_in') {
      focusNodeIds = [pattern.data.hub, ...pattern.data.sources];
      focusEdgeKeys = pattern.data.sources.map((s) => `${s}__${pattern.data.hub}`);
    } else if (pattern.type === 'circular') {
      focusNodeIds = pattern.data.path;
      focusEdgeKeys = pattern.data.hops.map((h) => `${h.from}__${h.to}`);
    } else if (pattern.type === 'layering') {
      focusNodeIds = pattern.data.path;
      for (let i = 0; i < pattern.data.path.length - 1; i++) {
        focusEdgeKeys.push(`${pattern.data.path[i]}__${pattern.data.path[i + 1]}`);
      }
    }

    const focusNodeSet = new Set(focusNodeIds);
    const focusEdgeSet = new Set(focusEdgeKeys);

    cy.nodes().forEach((n) => { if (!focusNodeSet.has(n.data('id'))) n.addClass('faded'); });
    cy.edges().forEach((e) => {
      const key = `${e.data('source')}__${e.data('target')}`;
      if (!focusEdgeSet.has(key)) e.addClass('faded');
      else e.addClass('pattern-focused');
    });

    // RULE 38: sequential numbering + day-elapsed labels for circular flows
    if (pattern.type === 'circular') {
      pattern.data.hops.forEach((hop, i) => {
        const edge = cy.getElementById(`${hop.from}__${hop.to}`);
        if (edge.length) {
          const dayLabel = i === 0 ? 'Day 0' : `+${hop.days_elapsed}d`;
          edge.data('trace_label', `${i + 1} · ${dayLabel}`);
          if (!PREFERS_REDUCED_MOTION) edge.addClass('trace-step');
        }
      });
    }

    const focusedEles = cy.nodes().filter((n) => focusNodeSet.has(n.data('id')));
    if (focusedEles.length) cy.fit(focusedEles, 60);
  }, []);

  useEffect(() => {
    if (!raw || view !== 'network') return;
    let cy;

    const nodes = raw.nodes.map((n) => {
      let pattern_type = 'none';
      if (patternMembership.circular?.nodeIds?.has(n.data.id)) pattern_type = 'circular';
      else if (patternMembership.layering?.nodeIds?.has(n.data.id)) pattern_type = 'layering';
      else if (patternMembership.fan_out?.nodeIds?.has(n.data.id)) pattern_type = 'fan_out';
      else if (patternMembership.fan_in?.nodeIds?.has(n.data.id)) pattern_type = 'fan_in';

      return {
        data: {
          ...n.data,
          risk_tier: riskTier(n.data.composite_score || 0),
          display_label: labeledIds.has(n.data.id) ? (n.data.name || n.data.id) : '',
          role_badge: ROLE_BADGE[n.data.role_label] || '',
          pattern_type,
        },
      };
    });
    const edges = raw.edges.map((e) => {
      let pattern_type = 'none';
      if (patternMembership.circular?.edgeIds?.has(e.data.id)) pattern_type = 'circular';
      else if (patternMembership.layering?.edgeIds?.has(e.data.id)) pattern_type = 'layering';
      else if (patternMembership.fan_out?.edgeIds?.has(e.data.id)) pattern_type = 'fan_out';
      else if (patternMembership.fan_in?.edgeIds?.has(e.data.id)) pattern_type = 'fan_in';

      return {
        data: {
          ...e.data,
          pattern_type,
        },
      };
    });

    const maxDegree = raw.nodes.reduce((max, n) => Math.max(max, n.data.degree || 0), 0);

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
          spacingFactor: 1.1,
          animate: false,
        }
      : { name: 'cose-bilkent', animate: false, nodeRepulsion: 8000 };

    const { volMin, volMax, logMin, logMax } = scaleBounds;

    cy = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      layout,
      style: [
        { selector: 'node', style: {
            'label': 'data(display_label)', 'font-size': 9, 'color': 'var(--color-text-secondary)',
            'width': `mapData(volume, ${volMin}, ${volMax}, 18, 56)`,
            'height': `mapData(volume, ${volMin}, ${volMax}, 18, 56)`,
            'text-valign': 'bottom', 'text-margin-y': 4, 'text-wrap': 'none',
            'overlay-color': 'rgb(var(--accent))',
            'overlay-opacity': 0,
            'overlay-padding': 0,
        }},
        { selector: 'node[risk_tier="low"]',    style: { 'shape': 'ellipse', 'background-color': 'rgb(var(--risk-low))' } },
        { selector: 'node[risk_tier="medium"]', style: { 'shape': 'diamond', 'background-color': 'rgb(var(--risk-medium))' } },
        { selector: 'node[risk_tier="high"]',   style: { 'shape': 'hexagon', 'background-color': 'rgb(var(--risk-high))' } },
        // RULE 36: pattern membership is an ALWAYS-ON ring, independent of amount/risk
        { selector: 'node[pattern_type="fan_out"]', style: { 'border-width': 3, 'border-color': '#1a73e8', 'border-style': 'solid' } },
        { selector: 'node[pattern_type="fan_in"]',  style: { 'border-width': 3, 'border-color': '#9333ea', 'border-style': 'solid' } },
        { selector: 'node[pattern_type="circular"]',style: { 'border-width': 3, 'border-color': '#f97316', 'border-style': 'solid' } },
        { selector: 'node[pattern_type="layering"]',style: { 'border-width': 3, 'border-color': '#ec4899', 'border-style': 'solid' } },
        { selector: 'edge', style: {
            'width': `mapData(log_amount, ${logMin}, ${logMax}, 1, 6)`,
            'opacity': `mapData(log_amount, ${logMin}, ${logMax}, 0.3, 0.9)`,
            'line-color': 'var(--color-border-strong)', 'target-arrow-color': 'var(--color-border-strong)',
            'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
        }},
        // RULE 36: pattern-member edges get a visible minimum-width floor and accent color
        { selector: 'edge[pattern_type="fan_out"]', style: { 'line-color': '#1a73e8', 'target-arrow-color': '#1a73e8', 'width': 2.5, 'opacity': 0.85 } },
        { selector: 'edge[pattern_type="fan_in"]',  style: { 'line-color': '#9333ea', 'target-arrow-color': '#9333ea', 'width': 2.5, 'opacity': 0.85 } },
        { selector: 'edge[pattern_type="circular"]',style: { 'line-color': '#f97316', 'target-arrow-color': '#f97316', 'width': 2.5, 'opacity': 0.85 } },
        { selector: 'edge[pattern_type="layering"]',style: { 'line-color': '#ec4899', 'target-arrow-color': '#ec4899', 'width': 2.5, 'opacity': 0.85 } },
        { selector: 'edge.pattern-focused', style: {
            'width': 4, 'z-index': 999,
        }},
        { selector: 'edge.pattern-focused[pattern_type="fan_out"]', style: { 'line-color': '#1a73e8', 'target-arrow-color': '#1a73e8' } },
        { selector: 'edge.pattern-focused[pattern_type="fan_in"]',  style: { 'line-color': '#9333ea', 'target-arrow-color': '#9333ea' } },
        { selector: 'edge.pattern-focused[pattern_type="circular"]',style: { 'line-color': '#f97316', 'target-arrow-color': '#f97316' } },
        { selector: 'edge.pattern-focused[pattern_type="layering"]',style: { 'line-color': '#ec4899', 'target-arrow-color': '#ec4899' } },
        { selector: 'edge[trace_label]', style: {
            'label': 'data(trace_label)', 'font-size': 10, 'color': '#f97316',
            'text-background-color': 'var(--color-background-primary)',
            'text-background-opacity': 1, 'text-background-padding': 2,
            'font-weight': 'bold',
        }},
        { selector: 'edge.trace-step', style: {
            'line-style': 'dashed', 'line-dash-pattern': [6, 3],
        }},
        { selector: 'node:selected', style: {
            'border-width': 4,
            'border-color': 'rgb(var(--accent))',
        }},
        { selector: 'edge:selected', style: {
            'width': 5,
            'line-color': 'rgb(var(--accent))',
            'target-arrow-color': 'rgb(var(--accent))',
        }},
        { selector: '.faded', style: { 'opacity': 0.08 } },
        { selector: '.highlighted', style: { 'border-width': 3, 'border-color': 'rgb(var(--accent))' } },
      ],
    });

    const pulseNode = (node) => {
      if (!node || node.removed() || !node.selected()) {
        node.style({ 'overlay-opacity': 0, 'overlay-padding': 0 });
        return;
      }
      node.animate({
        style: {
          'overlay-opacity': 0.35,
          'overlay-padding': 12
        }
      }, {
        duration: 900,
        easing: 'ease-in-out',
        complete: () => {
          if (!node.selected()) {
            node.style({ 'overlay-opacity': 0, 'overlay-padding': 0 });
            return;
          }
          node.animate({
            style: {
              'overlay-opacity': 0.1,
              'overlay-padding': 4
            }
          }, {
            duration: 900,
            easing: 'ease-in-out',
            complete: () => pulseNode(node)
          });
        }
      });
    };

    cy.on('tap', 'node', (evt) => setSelected({ type: 'node', data: evt.target.data() }));
    cy.on('tap', 'edge', (evt) => setSelected({ type: 'edge', data: evt.target.data() }));

    cy.on('select', 'node', (evt) => {
      pulseNode(evt.target);
    });

    cy.on('unselect', 'node', (evt) => {
      evt.target.stop();
      evt.target.style({
        'overlay-opacity': 0,
        'overlay-padding': 0
      });
    });

    // Focus mode: double-click isolates the 1-hop neighborhood
    cy.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().difference(neighborhood).addClass('faded');
      neighborhood.removeClass('faded');
    });
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('faded');
        setSelected(null);
      }
    });

    cyRef.current = cy;
    if (focusedPattern) applyFocus(cy, focusedPattern);

    return () => { if (cy) cy.destroy(); };
  }, [raw, view, labeledIds, patternMembership, scaleBounds, theme]); // eslint-disable-line

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

  const handleFocusPattern = (pattern) => {
    setFocusedPattern(pattern);
    if (cyRef.current) applyFocus(cyRef.current, pattern);
  };

  if (!raw) return <div className="text-sm text-ink-muted py-8 text-center">Loading graph...</div>;

  return (
    <div>
      {/* RULE 40: stats strip — glanceable before any interaction */}
      {patternStats && (
        <div className="flex items-center gap-2 mb-3 text-xs text-ink-muted font-data">
          <span>{patternStats.accounts} accounts</span>
          <span>·</span>
          <span>{patternStats.transfers} transfer relationships</span>
          <span>·</span>
          <span>{patternMembership.nodeIds.size} account(s) in a detected pattern</span>
        </div>
      )}

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
          
          <div className="w-full lg:w-80 space-y-4">
            {/* Pattern Insights Panel (RULE 40) */}
            <div className="bg-surface-raised border border-border-hairline rounded-lg p-3">
              <div className="text-xs font-semibold text-ink-secondary mb-2 uppercase tracking-wide">
                Detected Patterns
              </div>
              <PatternInsightsPanel
                caseId={caseId}
                onFocusPattern={handleFocusPattern}
                focusedKey={focusedPattern?.key}
              />
            </div>

            {/* Selected Element Details Card */}
            <div className="bg-surface-raised border border-border-hairline rounded-lg p-4 text-sm flex flex-col justify-between">
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
                          <div className="font-mono text-xs text-ink-secondary break-all">
                            <Link
                              to={`/cases/${caseId}/suspects/${selected.data.account_id}`}
                              className="text-accent hover:underline hover:text-accent-hover font-bold transition-colors"
                            >
                              {selected.data.account_id}
                            </Link>
                          </div>
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
                <div className="flex items-center gap-2 mb-1.5"><span className="w-2.5 h-2.5 bg-risk-high" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} /> <span className="text-xs text-ink-secondary">High risk (Alert)</span></div>
                <div className="flex items-center gap-2 mb-1.5"><span className="w-2.5 h-2.5 rounded-full border-2" style={{borderColor:'#f97316'}} /> <span className="text-xs text-ink-secondary">Round-trip flow</span></div>
                <div className="flex items-center gap-2 mb-1.5"><span className="w-2.5 h-2.5 rounded-full border-2" style={{borderColor:'#1a73e8'}} /> <span className="text-xs text-ink-secondary">Fan-out pattern</span></div>
                <div className="flex items-center gap-2 mb-1.5"><span className="w-2.5 h-2.5 rounded-full border-2" style={{borderColor:'#9333ea'}} /> <span className="text-xs text-ink-secondary">Fan-in pattern</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border-2" style={{borderColor:'#ec4899'}} /> <span className="text-xs text-ink-secondary">Layering chain</span></div>
              </div>
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
