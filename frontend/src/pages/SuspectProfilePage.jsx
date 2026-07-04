import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';

// Register cose-bilkent for Cytoscape layout
try {
  cytoscape.use(coseBilkent);
} catch (e) {
  // Already registered or not needed
}

// Helper to render account IDs as clickable router Link badges
const renderMessageContent = (text, caseId) => {
  if (!text) return '';
  const regex = /\b(ACC-[A-Za-z0-9\-]+|STATEMENT-[A-Za-z0-9\-]+|[A-Za-z0-9_\.\-]{2,}@[A-Za-z0-9_\.\-]{2,})\b/g;
  const parts = text.split(regex);
  return parts.map((part, index) => {
    if (part.includes('@') || part.startsWith('ACC-') || part.startsWith('STATEMENT-')) {
      return (
        <Link
          key={index}
          to={`/cases/${caseId}/suspects/${part}`}
          className="text-accent hover:underline font-mono bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded text-[10px] font-bold mx-0.5 inline-block align-middle"
        >
          {part}
        </Link>
      );
    }
    return part;
  });
};

const FACTOR_LABELS = {
  watchlist_hit: 'Watchlist Hit Check',
  rule_severity: 'Rule Engine Flags',
  isolation_forest: 'ML Anomaly Score',
  taint_propagation: 'Risk Taint Propagation',
  betweenness: 'Network Centrality'
};

const FACTOR_COLORS = {
  watchlist_hit: 'bg-risk-high',
  rule_severity: 'bg-risk-medium',
  isolation_forest: 'bg-accent',
  taint_propagation: 'bg-violet-500',
  betweenness: 'bg-emerald-500'
};

export default function SuspectProfilePage() {
  const { caseId, accountId } = useParams();
  const [activeTab, setActiveTab] = useState('overview');

  // Overview Data State
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Expanded flags in Overview
  const [expandedFlags, setExpandedFlags] = useState({});

  // Chat Assistant State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Graph Tab State
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [hops, setHops] = useState(1);
  const [roundTripOnly, setRoundTripOnly] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Linked Accounts State
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  // Transactions Tab State
  const [txns, setTxns] = useState([]);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [filters, setFilters] = useState({
    channel: '',
    date_from: '',
    date_to: '',
    amount_min: '',
    amount_max: '',
    direction: '',
    flagged_only: false,
    counterparty: ''
  });

  // Timeline State
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // 1. Fetch Overview Data on mount / ID change
  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const res = await apiClient.get(`/cases/${caseId}/suspects/${accountId}/overview`);
      setOverview(res.data);
      // Pre-seed chat history
      setChatHistory([
        {
          role: 'assistant',
          content: `Hello Investigator. I have loaded the forensic profile for suspect ${res.data.account_holder} (Account: ${accountId}). They hold a composite risk score of ${res.data.composite_score}/100 and are classified as a "${res.data.role_label}". How can I assist you with this suspect's trail?`
        }
      ]);
    } catch (e) {
      console.error("Failed to load suspect overview:", e);
    } finally {
      setOverviewLoading(false);
    }
  };

  // Load Linked Accounts
  const loadLinkedAccounts = async () => {
    setLinkedLoading(true);
    try {
      const res = await apiClient.get(`/cases/${caseId}/suspects/${accountId}/linked-accounts`);
      setLinkedAccounts(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLinkedLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    loadLinkedAccounts();
  }, [caseId, accountId]);

  // Load Transactions
  const loadTransactions = async () => {
    setTxnsLoading(true);
    try {
      const params = {};
      Object.keys(filters).forEach(k => {
        if (filters[k] !== '' && filters[k] !== false) {
          params[k] = filters[k];
        }
      });
      const res = await apiClient.get(`/cases/${caseId}/suspects/${accountId}/transactions`, { params });
      setTxns(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setTxnsLoading(false);
    }
  };

  // Load Timeline
  const loadTimeline = async () => {
    setTimelineLoading(true);
    try {
      const res = await apiClient.get(`/cases/${caseId}/suspects/${accountId}/timeline`);
      setTimelineData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setTimelineLoading(false);
    }
  };

  // Load Graph Elements
  const loadGraph = async () => {
    setGraphLoading(true);
    try {
      const res = await apiClient.get(`/cases/${caseId}/suspects/${accountId}/graph`, {
        params: { hops, round_trip_only: roundTripOnly }
      });
      setGraphData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setGraphLoading(false);
    }
  };

  // Trigger loads based on active tab
  useEffect(() => {
    if (activeTab === 'linked') {
      loadLinkedAccounts();
    } else if (activeTab === 'txns') {
      loadTransactions();
    } else if (activeTab === 'timeline') {
      loadTimeline();
    } else if (activeTab === 'graph') {
      loadGraph();
    }
  }, [activeTab, hops, roundTripOnly]);

  // Cytoscape initialization and updates
  useEffect(() => {
    if (activeTab !== 'graph' || !graphData || !containerRef.current) return;

    const cyNodes = graphData.nodes.map(n => ({
      data: {
        ...n.data,
        risk_tier: n.data.composite_score >= 65 ? 'high' : n.data.composite_score >= 30 ? 'medium' : 'low',
        display_label: n.data.name || n.data.account_id
      }
    }));

    const cyEdges = graphData.edges.map(e => ({
      data: { ...e.data }
    }));

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...cyNodes, ...cyEdges],
      layout: {
        name: 'cose-bilkent',
        animate: false,
        nodeRepulsion: 6000
      },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(display_label)',
            'font-size': 9,
            'color': 'var(--ink-secondary)',
            'width': 28,
            'height': 28,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'overlay-color': 'rgb(var(--accent))',
            'overlay-opacity': 0,
            'overlay-padding': 0
          }
        },
        {
          selector: 'node[risk_tier="low"]',
          style: { 'shape': 'ellipse', 'background-color': 'rgb(var(--risk-low))' }
        },
        {
          selector: 'node[risk_tier="medium"]',
          style: { 'shape': 'diamond', 'background-color': 'rgb(var(--risk-medium))' }
        },
        {
          selector: 'node[risk_tier="high"]',
          style: { 'shape': 'hexagon', 'background-color': 'rgb(var(--risk-high))' }
        },
        {
          selector: 'node[is_suspect]',
          style: {
            'border-width': 3,
            'border-color': 'rgb(var(--accent))',
            'border-style': 'solid'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': 'rgb(var(--border-default))',
            'target-arrow-color': 'rgb(var(--border-default))',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': 8,
            'color': 'var(--ink-muted)'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': 'rgb(var(--accent))'
          }
        }
      ]
    });

    cyRef.current = cy;

    // Pulse node helper
    const pulseNode = (node) => {
      if (!node || node.removed() || !node.selected()) {
        node.style({ 'overlay-opacity': 0, 'overlay-padding': 0 });
        return;
      }
      node.animate({
        style: {
          'overlay-opacity': 0.3,
          'overlay-padding': 10
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
              'overlay-opacity': 0.05,
              'overlay-padding': 3
            }
          }, {
            duration: 900,
            easing: 'ease-in-out',
            complete: () => pulseNode(node)
          });
        }
      });
    };

    cy.on('tap', 'node', (evt) => {
      setSelectedNode(evt.target.data());
    });

    cy.on('select', 'node', (evt) => {
      pulseNode(evt.target);
    });

    cy.on('unselect', 'node', (evt) => {
      evt.target.stop();
      evt.target.style({ 'overlay-opacity': 0, 'overlay-padding': 0 });
    });

    return () => {
      cy.destroy();
    };
  }, [activeTab, graphData]);

  // AI Chat submission handler
  const sendChatMessage = async (msgText) => {
    if (!msgText.trim()) return;
    setChatLoading(true);
    const newHistory = [...chatHistory, { role: 'user', content: msgText }];
    setChatHistory(newHistory);
    setChatInput('');

    try {
      const res = await apiClient.post(`/cases/${caseId}/chat`, {
        message: msgText,
        history: newHistory.slice(-10),
        suspect_id: accountId
      });
      setChatHistory([...newHistory, { role: 'assistant', content: res.data.response }]);
    } catch (e) {
      console.error(e);
      setChatHistory([...newHistory, { role: 'assistant', content: 'Apologies, I encountered an error communicating with the forensic agent.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Download PDF Dossier
  const downloadDossier = () => {
    window.open(`${apiClient.defaults.baseURL}/case/${caseId}/suspect/${accountId}/dossier.pdf`, '_blank');
  };

  // Recharts Data Prep for Balance Timeline
  const formattedChartData = () => {
    if (!timelineData || !timelineData.transactions.length) return [];
    
    // Sort transactions chronologically
    const sortedTxns = [...timelineData.transactions].sort((a,b) => new Date(a.txn_date) - new Date(b.txn_date));
    
    const accountLastBal = {};
    const chartSeries = [];

    sortedTxns.forEach(t => {
      const dateStr = String(t.txn_date).slice(0, 10);
      const accId = t.account_id;
      const bal = t.balance_after !== null ? Number(t.balance_after) : 0;
      
      accountLastBal[accId] = bal;

      chartSeries.push({
        date: dateStr,
        ...accountLastBal
      });
    });

    return chartSeries;
  };

  if (overviewLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] py-12">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-ink-muted mt-3">Compiling suspect intelligence dossier...</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-8 text-center text-risk-high">
        Profile not found for account {accountId}. Please ensure statements are analyzed.
      </div>
    );
  }

  // Choose color styles based on risk score
  const scoreColorClass = overview.composite_score >= 65 
    ? 'text-risk-high border-risk-high/30 bg-risk-high-bg/50' 
    : overview.composite_score >= 30 
      ? 'text-risk-medium border-risk-medium/30 bg-risk-medium-bg/50' 
      : 'text-risk-low border-risk-low/30 bg-risk-low-bg/50';

  return (
    <div className="space-y-6">
      {/* Back link & breadcrumbs */}
      <div className="flex items-center justify-between">
        <Link 
          to={`/cases/${caseId}`} 
          className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors flex items-center gap-1.5"
        >
          <span>←</span> Back to Case Dashboard
        </Link>
        <span className="text-[10px] text-ink-muted font-mono uppercase bg-surface-sunken px-2 py-0.5 rounded border border-border-hairline">
          Suspect View
        </span>
      </div>

      {/* Suspect profile summary banner */}
      <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card premium-card flex flex-col md:flex-row gap-5 items-start md:items-center justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-ink-primary">{overview.account_holder}</h1>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-full ${scoreColorClass}`}>
              {overview.role_label}
            </span>
          </div>
          <p className="text-xs font-mono text-ink-secondary">
            Primary Account: {overview.account_id} ({overview.bank_name})
          </p>
          <p className="text-xs text-ink-muted">
            Linked Identities resolved across {overview.linked_accounts_count} accounts.
          </p>
        </div>

        <div className="flex items-center gap-6 self-stretch md:self-auto border-t md:border-t-0 md:border-l border-border-hairline pt-4 md:pt-0 md:pl-6">
          <div className="text-center">
            <p className="text-[10px] text-ink-muted uppercase font-bold tracking-wider">Composite Score</p>
            <div className={`mt-1 font-mono text-3xl font-extrabold w-16 h-16 rounded-full border-2 flex items-center justify-center mx-auto ${
              overview.composite_score >= 65 ? 'border-risk-high text-risk-high bg-risk-high-bg animate-pulse-slow' : 
              overview.composite_score >= 30 ? 'border-risk-medium text-risk-medium bg-risk-medium-bg' : 
              'border-risk-low text-risk-low bg-risk-low-bg'
            }`}>
              {overview.composite_score}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-ink-muted">Total In:</span>
              <p className="font-data font-bold text-accent">₹{overview.metrics.total_received.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <span className="text-ink-muted">Total Out:</span>
              <p className="font-data font-bold text-ink-secondary">₹{overview.metrics.total_sent.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <span className="text-ink-muted">Counterparties:</span>
              <p className="font-data font-bold text-ink-secondary">{overview.metrics.counterparty_count} accounts</p>
            </div>
            <div>
              <span className="text-ink-muted">Net Retained:</span>
              <p className={`font-data font-bold ${overview.metrics.net_retained > 0 ? 'text-accent' : 'text-risk-high'}`}>
                ₹{overview.metrics.net_retained.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <span className="text-ink-muted">Retained %:</span>
              <p className="font-data font-bold text-ink-secondary">{overview.metrics.net_retained_pct.toFixed(2)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs list */}
      <div className="border-b border-border-hairline flex items-center gap-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'graph', label: 'Money Flow' },
          { id: 'linked', label: 'All Accounts' },
          { id: 'txns', label: 'Transactions' },
          { id: 'timeline', label: 'Timeline & CUSUM' },
          { id: 'reports', label: 'Evidence & Dossier' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === t.id 
                ? 'border-accent text-accent' 
                : 'border-transparent text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab content container */}
      <div className="space-y-6">
        
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 cols: Profile & Flags */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Verdict details card */}
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card">
                <h3 className="text-sm font-bold text-ink-primary mb-2">Forensic Assessment</h3>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  {overview.reasoning || "No automatic verdict reasoning was generated. Run the algorithmic review to get the LLM analysis."}
                </p>
              </div>

              {/* Extracted Identifiers Card */}
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Extracted Suspect Identifiers</h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Fuzzy identifiers resolved by mining transaction narrations and bank records.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* PAN Cards */}
                  <div className="bg-surface-sunken/30 border border-border-hairline/50 p-3.5 rounded-lg space-y-2">
                    <span className="text-[10px] uppercase font-bold text-ink-muted block tracking-wider">PAN Cards</span>
                    <div className="flex flex-wrap gap-1.5">
                      {overview.extracted_pans && overview.extracted_pans.length > 0 ? (
                        overview.extracted_pans.map(pan => (
                          <span key={pan} className="font-mono text-xs font-bold text-ink-primary bg-surface-raised border border-border px-2 py-0.5 rounded shadow-sm">
                            {pan}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted italic">No PANs extracted</span>
                      )}
                    </div>
                  </div>

                  {/* Phone Numbers */}
                  <div className="bg-surface-sunken/30 border border-border-hairline/50 p-3.5 rounded-lg space-y-2">
                    <span className="text-[10px] uppercase font-bold text-ink-muted block tracking-wider">Phone Numbers</span>
                    <div className="flex flex-wrap gap-1.5">
                      {overview.extracted_phones && overview.extracted_phones.length > 0 ? (
                        overview.extracted_phones.map(phone => (
                          <span key={phone} className="font-mono text-xs font-bold text-ink-primary bg-surface-raised border border-border px-2 py-0.5 rounded shadow-sm">
                            {phone}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted italic">No phones extracted</span>
                      )}
                    </div>
                  </div>

                  {/* UPI IDs */}
                  <div className="bg-surface-sunken/30 border border-border-hairline/50 p-3.5 rounded-lg space-y-2">
                    <span className="text-[10px] uppercase font-bold text-ink-muted block tracking-wider">UPI IDs</span>
                    <div className="flex flex-wrap gap-1.5">
                      {overview.extracted_upis && overview.extracted_upis.length > 0 ? (
                        overview.extracted_upis.map(upi => (
                          <span key={upi} className="font-mono text-xs font-bold text-ink-primary bg-surface-raised border border-border px-2 py-0.5 rounded shadow-sm break-all">
                            {upi}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted italic">No UPI IDs extracted</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Algorithmic Risk Scoring Signals Breakdown */}
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Algorithmic Risk Scoring Signals</h3>
                  <p className="text-xs text-ink-muted mt-0.5">Weighted factor breakdown showing why this suspect is flagged.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(FACTOR_LABELS).map(([key, label]) => {
                    const breakdown = overview.score_breakdown || {};
                    const value = breakdown[key] || 0.0;
                    const maxVal = key === 'watchlist_hit' ? 25 : key === 'betweenness' ? 15 : 20;
                    const pct = Math.min(100, (value / maxVal) * 100);
                    return (
                      <div key={key} className="space-y-1 bg-surface-sunken/20 border border-border-hairline/50 p-3 rounded-lg">
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className="text-ink-secondary">{label}</span>
                          <span className="text-ink-primary font-bold">{value} pts</span>
                        </div>
                        <div className="w-full bg-surface-sunken rounded-full h-2 overflow-hidden border border-border-hairline/20">
                          <div
                            className={`${FACTOR_COLORS[key] || 'bg-accent'} h-full rounded-full`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-ink-muted">
                          Max Weight: {maxVal} points
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Risk Flags list */}
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card">
                <h3 className="text-sm font-bold text-ink-primary mb-3">Triggered Risk Indicators</h3>
                <div className="space-y-3">
                  {overview.flags.map(flg => (
                    <div 
                      key={flg.flag} 
                      className="border border-border-hairline rounded-lg overflow-hidden transition-all"
                    >
                      <button
                        onClick={() => setExpandedFlags(prev => ({ ...prev, [flg.flag]: !prev[flg.flag] }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-surface-sunken/30 hover:bg-surface-sunken/60 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-risk-high bg-risk-high-bg px-2 py-0.5 rounded border border-risk-high/10">
                            {flg.flag}
                          </span>
                          <span className="text-[10px] text-ink-muted font-semibold">
                            ({flg.count} events)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-ink-secondary">
                            Confidence: {(flg.confidence * 100).toFixed(0)}%
                          </span>
                          <span className="text-xs text-ink-muted">
                            {expandedFlags[flg.flag] ? '▲' : '▼'}
                          </span>
                        </div>
                      </button>

                      {expandedFlags[flg.flag] && (
                        <div className="px-4 py-3 border-t border-border-hairline bg-surface-raised overflow-x-auto">
                          <table className="w-full text-[10px] text-left">
                            <thead>
                              <tr className="text-ink-muted border-b border-border-hairline uppercase font-bold">
                                <th className="pb-1.5">Date</th>
                                <th className="pb-1.5">Amount</th>
                                <th className="pb-1.5">Narration</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-hairline font-mono">
                              {flg.evidence_list.map((ev, idx) => (
                                <tr key={idx} className="hover:bg-surface-sunken/20 transition-colors">
                                  <td className="py-2 text-ink-secondary whitespace-nowrap">
                                    {ev.date || 'N/A'}
                                  </td>
                                  <td className="py-2 text-risk-high font-bold">
                                    ₹{ev.amount ? Number(ev.amount).toLocaleString('en-IN') : 'N/A'}
                                  </td>
                                  <td className="py-2 text-ink-primary leading-normal font-sans">
                                    {ev.narration || ev.accounts?.join(' → ') || 'N/A'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  {overview.flags.length === 0 && (
                    <p className="text-xs text-ink-muted italic">No risk indicators triggered for this profile.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Right col: Sidebar with Linked Accounts & Scoped AI Assistant */}
            <div className="space-y-6">
              
              {/* Linked Suspect Accounts (Same Identity) */}
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Linked Suspect Accounts</h3>
                  <p className="text-xs text-ink-muted mt-0.5">Other accounts resolved to this identity across statements.</p>
                </div>
                
                {linkedLoading ? (
                  <div className="text-center py-6 text-xs text-ink-muted italic">Resolving connected profiles...</div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {linkedAccounts.filter(la => la.account_id !== accountId).length === 0 ? (
                      <div className="text-xs text-ink-muted italic py-4 text-center bg-surface-sunken/20 border border-dashed border-border rounded-lg">
                        No other linked accounts identified in this case.
                      </div>
                    ) : (
                      linkedAccounts
                        .filter(la => la.account_id !== accountId)
                        .map(la => (
                          <div 
                            key={la.account_id}
                            className="p-3 bg-surface-sunken/40 border border-border-hairline rounded-lg hover:border-accent/40 transition-colors flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Link
                                to={`/cases/${caseId}/suspects/${la.account_id}`}
                                className="font-mono text-xs font-bold text-accent hover:underline hover:text-accent-hover"
                              >
                                {la.account_id}
                              </Link>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                                la.match_confidence === 'Confirmed' 
                                  ? 'bg-accent-subtle-bg text-accent border-accent/20' 
                                  : 'bg-risk-medium-bg text-risk-medium border-risk-medium/20'
                              }`}>
                                {la.match_confidence}
                              </span>
                            </div>
                            
                            <div className="text-xs space-y-0.5">
                              <div className="font-semibold text-ink-primary">{la.account_holder}</div>
                              <div className="text-ink-muted font-mono text-[10px]">{la.bank_name}</div>
                            </div>
                            
                            <div className="text-[10px] text-ink-secondary leading-relaxed bg-surface-sunken/60 border border-border-hairline/40 p-1.5 rounded">
                              <b>Reason:</b> {la.match_reason}
                            </div>
                            
                            <div className="text-right">
                              <Link
                                to={`/cases/${caseId}/suspects/${la.account_id}`}
                                className="text-[10px] font-bold text-accent hover:underline uppercase tracking-wider inline-flex items-center gap-1"
                              >
                                Jump to Profile →
                              </Link>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>

              {/* Scoped AI Assistant */}
              <div className="bg-surface-raised border border-border-hairline rounded-xl shadow-card overflow-hidden flex flex-col h-[500px]">
                {/* Header */}
                <div className="p-4 border-b border-border-hairline bg-surface-sunken/30">
                  <h3 className="text-xs font-bold text-ink-primary">AI Suspect Assistant</h3>
                  <p className="text-[10px] text-ink-muted mt-0.5">Ask questions about this specific suspect's financial activity.</p>
                </div>

                {/* Chat Log container */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 scrollbar">
                  {chatHistory.map((chat, idx) => (
                    <div 
                      key={idx} 
                      className={`flex flex-col max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed ${
                        chat.role === 'user' 
                          ? 'bg-accent/10 border border-accent/20 text-ink-primary ml-auto' 
                          : 'bg-surface-sunken/70 border border-border-hairline text-ink-secondary mr-auto'
                      }`}
                    >
                      <span className="text-[9px] uppercase font-bold text-ink-muted mb-1">
                        {chat.role === 'user' ? 'You' : 'Assistant'}
                      </span>
                      <p className="whitespace-pre-wrap">{renderMessageContent(chat.content, caseId)}</p>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="bg-surface-sunken/70 border border-border-hairline text-ink-secondary mr-auto max-w-[85%] rounded-lg p-2.5 text-xs flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce delay-75"></span>
                      <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce delay-150"></span>
                    </div>
                  )}
                </div>

                {/* Suggestion Chips */}
                <div className="px-4 py-2 border-t border-border-hairline bg-surface-sunken/10 flex flex-wrap gap-1.5 shrink-0">
                  {[
                    { text: 'Summarize their role', val: 'Summarize this suspect\'s role in the case' },
                    { text: 'Strongest evidence', val: 'Show me the strongest single piece of evidence against them' },
                    { text: 'Describe money trail', val: 'What does the money trail into and out of this account look like?' }
                  ].map(chip => (
                    <button
                      key={chip.text}
                      onClick={() => sendChatMessage(chip.val)}
                      disabled={chatLoading}
                      className="text-[10px] font-semibold text-accent hover:bg-accent/15 border border-accent/35 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                    >
                      {chip.text}
                    </button>
                  ))}
                </div>

                {/* Input box */}
                <form 
                  onSubmit={(e) => { e.preventDefault(); sendChatMessage(chatInput); }}
                  className="p-3 border-t border-border-hairline bg-surface-raised flex gap-2 shrink-0"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask the suspect assistant..."
                    className="flex-1 border border-border rounded-lg px-3 py-1.5 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                    disabled={chatLoading}
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: MONEY FLOW */}
        {activeTab === 'graph' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Controls Panel */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-card space-y-4">
                <h3 className="text-xs font-bold text-ink-primary uppercase tracking-wider">Graph Controls</h3>
                
                {/* Hops toggle */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-ink-muted uppercase font-bold">Hops Distance</label>
                  <div className="flex gap-2">
                    {[1, 2].map(h => (
                      <button
                        key={h}
                        onClick={() => setHops(h)}
                        className={`flex-1 py-1.5 text-xs font-semibold border rounded-lg transition-all ${
                          hops === h 
                            ? 'bg-accent/15 border-accent text-accent' 
                            : 'border-border text-ink-muted hover:text-ink-secondary'
                        }`}
                      >
                        {h} Hop{h > 1 ? 's' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Round trip checkbox */}
                <label className="flex items-center gap-2 cursor-pointer py-1 select-none">
                  <input
                    type="checkbox"
                    checked={roundTripOnly}
                    onChange={(e) => setRoundTripOnly(e.target.checked)}
                    className="rounded text-accent focus:ring-accent w-4 h-4"
                  />
                  <div className="text-xs font-semibold text-ink-secondary">
                    Show Round-Trip Only
                  </div>
                </label>
              </div>

              {/* Selected Node Details Card */}
              {selectedNode ? (
                <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-card space-y-2.5 animate-slide-in">
                  <div className="flex items-center justify-between border-b border-border-hairline pb-2">
                    <h3 className="text-xs font-bold text-ink-primary uppercase">Selected Node</h3>
                    <button 
                      onClick={() => setSelectedNode(null)}
                      className="text-xs text-ink-muted hover:text-ink-secondary"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-ink-muted">Account ID:</p>
                    <p className="font-mono font-bold text-ink-primary">{selectedNode.account_id}</p>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-ink-muted">Account Holder:</p>
                    <p className="font-semibold text-ink-primary">{selectedNode.name}</p>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-ink-muted">Bank Name:</p>
                    <p className="text-ink-secondary">{selectedNode.bank}</p>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-ink-muted">Risk Score:</p>
                    <p className={`font-mono font-bold ${
                      selectedNode.composite_score >= 65 ? 'text-risk-high' : 
                      selectedNode.composite_score >= 30 ? 'text-risk-medium' : 'text-risk-low'
                    }`}>
                      {selectedNode.composite_score}/100 ({selectedNode.tier_label})
                    </p>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-ink-muted">Syndicate Role:</p>
                    <p className="font-semibold text-accent">{selectedNode.role_label}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 text-center text-xs text-ink-muted italic shadow-card">
                  Click a node in the graph to inspect forensic details.
                </div>
              )}
            </div>

            {/* Graph Visualizer container */}
            <div className="lg:col-span-3 bg-surface-raised border border-border-hairline rounded-xl shadow-card h-[500px] overflow-hidden relative">
              {graphLoading && (
                <div className="absolute inset-0 bg-surface-raised/85 flex items-center justify-center z-10">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <div ref={containerRef} className="w-full h-full"></div>
            </div>

          </div>
        )}

        {/* TAB 3: ALL ACCOUNTS (LINKED IDENTITIES) */}
        {activeTab === 'linked' && (
          <div className="bg-surface-raised border border-border-hairline rounded-xl overflow-hidden shadow-card">
            {linkedLoading ? (
              <div className="p-12 text-center text-xs text-ink-muted">Resolving connected profiles...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-ink-muted bg-surface-sunken/40 border-b border-border-hairline uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Account ID</th>
                      <th className="px-5 py-3">Bank Name</th>
                      <th className="px-5 py-3">Account Holder</th>
                      <th className="px-5 py-3">Match Confidence</th>
                      <th className="px-5 py-3">Match Reason</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-hairline">
                    {linkedAccounts.map(la => (
                      <tr key={la.account_id} className="hover:bg-surface-sunken/20 transition-colors">
                        <td className="px-5 py-3.5 font-mono font-semibold text-ink-primary">
                          {la.account_id}
                        </td>
                        <td className="px-5 py-3.5 text-ink-secondary">{la.bank_name}</td>
                        <td className="px-5 py-3.5 font-semibold text-ink-primary">{la.account_holder}</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            la.match_confidence === 'Confirmed' 
                              ? 'bg-accent/10 border border-accent/20 text-accent' 
                              : 'bg-risk-medium-bg border border-risk-medium/20 text-risk-medium'
                          }`}>
                            {la.match_confidence}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-ink-secondary leading-relaxed">{la.match_reason}</td>
                        <td className="px-5 py-3.5 text-right">
                          {la.account_id !== accountId && (
                            <Link 
                              to={`/cases/${caseId}/suspects/${la.account_id}`}
                              className="text-[10px] font-bold text-accent hover:underline uppercase tracking-wider"
                            >
                              Jump to Profile
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TRANSACTIONS */}
        {activeTab === 'txns' && (
          <div className="space-y-4">
            
            {/* Filter Form bar */}
            <form 
              onSubmit={(e) => { e.preventDefault(); loadTransactions(); }}
              className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-card grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3"
            >
              <div>
                <label className="text-[9px] text-ink-muted font-bold uppercase block mb-1">Channel</label>
                <select
                  value={filters.channel}
                  onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-xs bg-surface-raised text-ink-primary outline-none"
                >
                  <option value="">All Channels</option>
                  {['UPI', 'IMPS', 'NEFT', 'RTGS', 'CASH', 'CHQ'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[9px] text-ink-muted font-bold uppercase block mb-1">Direction</label>
                <select
                  value={filters.direction}
                  onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-xs bg-surface-raised text-ink-primary outline-none"
                >
                  <option value="">All Directions</option>
                  <option value="inbound">Inbound (Credit)</option>
                  <option value="outbound">Outbound (Debit)</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] text-ink-muted font-bold uppercase block mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1 text-xs bg-surface-raised text-ink-primary outline-none"
                />
              </div>

              <div>
                <label className="text-[9px] text-ink-muted font-bold uppercase block mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1 text-xs bg-surface-raised text-ink-primary outline-none"
                />
              </div>

              <div>
                <label className="text-[9px] text-ink-muted font-bold uppercase block mb-1">Min Amount</label>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.amount_min}
                  onChange={(e) => setFilters({ ...filters, amount_min: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1 text-xs bg-surface-raised text-ink-primary outline-none"
                />
              </div>

              <div>
                <label className="text-[9px] text-ink-muted font-bold uppercase block mb-1">Max Amount</label>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.amount_max}
                  onChange={(e) => setFilters({ ...filters, amount_max: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1 text-xs bg-surface-raised text-ink-primary outline-none"
                />
              </div>

              <div>
                <label className="text-[9px] text-ink-muted font-bold uppercase block mb-1">Counterparty</label>
                <input
                  placeholder="Search name/ID"
                  value={filters.counterparty}
                  onChange={(e) => setFilters({ ...filters, counterparty: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1 text-xs bg-surface-raised text-ink-primary outline-none"
                />
              </div>

              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filters.flagged_only}
                    onChange={(e) => setFilters({ ...filters, flagged_only: e.target.checked })}
                    className="rounded text-accent focus:ring-accent w-3.5 h-3.5"
                  />
                  <span className="text-[10px] font-semibold text-ink-secondary">Flagged Only</span>
                </label>
                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-hover text-accent-fg text-[11px] font-bold py-1 px-3 rounded transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </form>

            {/* Transactions Table */}
            <div className="bg-surface-raised border border-border-hairline rounded-xl overflow-hidden shadow-card">
              {txnsLoading ? (
                <div className="p-12 text-center text-xs text-ink-muted">Reading ledger records...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-ink-muted bg-surface-sunken/40 border-b border-border-hairline uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-5 py-3">Txn Date</th>
                        <th className="px-5 py-3">Source Account</th>
                        <th className="px-5 py-3">Counterparty Name</th>
                        <th className="px-5 py-3">Counterparty Account</th>
                        <th className="px-5 py-3">Amount</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Narration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-hairline">
                      {txns.map(t => (
                        <tr key={t.txn_hash} className="hover:bg-surface-sunken/20 transition-colors">
                          <td className="px-5 py-3.5 font-mono text-ink-secondary whitespace-nowrap">
                            {t.txn_date ? String(t.txn_date).slice(0, 10) : 'N/A'}
                          </td>
                          <td className="px-5 py-3.5 font-mono font-semibold text-ink-primary">{t.account_id}</td>
                          <td className="px-5 py-3.5 font-semibold text-ink-primary">{t.counterparty_name || 'N/A'}</td>
                          <td className="px-5 py-3.5 font-mono text-ink-secondary">{t.counterparty_account || 'N/A'}</td>
                          <td className="px-5 py-3.5 font-data font-bold text-ink-primary">
                            ₹{Number(t.amount).toLocaleString('en-IN')}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.txn_type === 'CR' 
                                ? 'bg-accent-subtle-bg text-accent' 
                                : 'bg-surface-sunken text-ink-secondary'
                            }`}>
                              {t.txn_type}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-ink-secondary leading-normal max-w-xs truncate" title={t.narration}>
                            {t.narration}
                          </td>
                        </tr>
                      ))}
                      {txns.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-ink-muted italic">
                            No transactions match the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: TIMELINE & CUSUM */}
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            
            {/* Balance Progression line chart */}
            {timelineLoading ? (
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-8 text-center text-xs text-ink-muted shadow-card">
                Plotting transaction history...
              </div>
            ) : timelineData && timelineData.transactions.length ? (
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">Account Balance Progression</h3>
                  <p className="text-xs text-ink-muted mt-0.5">Unified chronological view of running balances across all linked accounts.</p>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={formattedChartData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-default))" opacity={0.4} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: 'rgb(var(--ink-secondary))', fontFamily: 'var(--font-mono)' }}
                      stroke="rgb(var(--border-default))"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'rgb(var(--ink-secondary))', fontFamily: 'var(--font-mono)' }}
                      stroke="rgb(var(--border-default))"
                      tickFormatter={(v) => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgb(var(--surface-raised))',
                        borderColor: 'rgb(var(--border-default))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'rgb(var(--ink-primary))', fontWeight: 'bold', fontSize: 11 }}
                      itemStyle={{ fontSize: 11 }}
                      formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Balance']}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                    {Array.from(new Set(timelineData.transactions.map(t => t.account_id))).map((accId, i) => {
                      const colorsPalette = ['#0f766e', '#1e293b', '#b45309', '#be123c', '#9333ea'];
                      const strokeColor = colorsPalette[i % colorsPalette.length];
                      return (
                        <Line
                          key={accId}
                          type="monotone"
                          dataKey={accId}
                          name={accId}
                          stroke={strokeColor}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-surface-raised border border-border-hairline rounded-xl p-8 text-center text-xs text-ink-muted shadow-card">
                No timeline records available.
              </div>
            )}

            {/* Significant balance changes / CUSUM list */}
            <div className="bg-surface-raised border border-border-hairline rounded-xl p-5 shadow-card">
              <h3 className="text-sm font-bold text-ink-primary mb-3">Significant Activity Changes (CUSUM Detection)</h3>
              <div className="space-y-3">
                {timelineData?.significant_changes.map((chg, idx) => (
                  <div key={idx} className="flex gap-4 items-start p-3 bg-risk-medium-bg/25 border border-risk-medium/10 rounded-lg">
                    <div className="mt-0.5 w-2 h-2 rounded-full bg-risk-medium shrink-0 animate-ping"></div>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-ink-primary">{chg.date}</span>
                        <span className="text-[10px] uppercase font-bold text-risk-medium">Break Point</span>
                      </div>
                      <p className="text-ink-secondary">
                        CUSUM analysis detected a critical deviation in cumulative sum balance. 
                        Triggered on transaction of <b>₹{Number(chg.amount).toLocaleString('en-IN')}</b> ({chg.narration}).
                      </p>
                    </div>
                  </div>
                ))}
                {(!timelineData || timelineData.significant_changes.length === 0) && (
                  <p className="text-xs text-ink-muted italic">No sudden change points or CUSUM break alerts found.</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 6: EVIDENCE & DOSSIER */}
        {activeTab === 'reports' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PDF Dossier download block */}
            <div className="bg-surface-raised border border-border-hairline rounded-xl p-6 shadow-card flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-accent text-xl font-bold">
                  PDF
                </div>
                <h3 className="text-sm font-bold text-ink-primary">Generate Forensic Dossier</h3>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Export a comprehensive, print-ready PDF containing the full financial profiles, risk breakdowns, 
                  linked accounts mapping, triggered rules, and the largest transaction records of suspect {overview.account_holder}.
                </p>
              </div>
              <button
                onClick={downloadDossier}
                className="mt-6 w-full bg-accent hover:bg-accent-hover text-accent-fg font-bold text-xs py-2.5 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <span>📥</span> Download Dossier PDF
              </button>
            </div>

            {/* Audit log trail summary for the suspect */}
            <div className="bg-surface-raised border border-border-hairline rounded-xl p-6 shadow-card space-y-4">
              <h3 className="text-sm font-bold text-ink-primary">Case File Evidence Checklist</h3>
              <div className="space-y-3.5 text-xs text-ink-secondary leading-relaxed">
                <div className="flex gap-3">
                  <span className="text-accent font-bold">✔</span>
                  <div>
                    <p className="font-bold text-ink-primary">Identity Resolution Verified</p>
                    <p className="text-[11px] text-ink-muted">{overview.linked_accounts_count} separate accounts grouped to this identity.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-accent font-bold">✔</span>
                  <div>
                    <p className="font-bold text-ink-primary">Risk Indicators Annotated</p>
                    <p className="text-[11px] text-ink-muted">{overview.flags.length} distinct rules triggered in statement logs.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-accent font-bold">✔</span>
                  <div>
                    <p className="font-bold text-ink-primary">Account Verdict Recorded</p>
                    <p className="text-[11px] text-ink-muted">Algorithmic risk is {overview.composite_score}/100 ({overview.tier_label}).</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
