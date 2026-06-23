import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { apiClient } from '../api/client';

cytoscape.use(coseBilkent);

function riskTier(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

export default function GraphView({ caseId }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  
  const [selected, setSelected] = useState(null);
  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  
  // Custom workstation state
  const [mergedMap, setMergedMap] = useState({}); // source -> target
  const [customEdges, setCustomEdges] = useState([]); // [{ source, target, amount }]
  const [annotations, setAnnotations] = useState([]); // persistent notes from database
  
  // Input fields state
  const [mergeSrc, setMergeSrc] = useState('');
  const [mergeDst, setMergeDst] = useState('');
  const [edgeSrc, setEdgeSrc] = useState('');
  const [edgeDst, setEdgeDst] = useState('');
  const [edgeAmount, setEdgeAmount] = useState('');
  const [noteText, setNoteText] = useState('');

  // Fetch initial graph and annotations
  useEffect(() => {
    apiClient.get(`/cases/${caseId}/graph`).then(({ data }) => {
      setRawNodes(data.nodes || []);
      setRawEdges(data.edges || []);
    });
    fetchAnnotations();
  }, [caseId]);

  const fetchAnnotations = () => {
    apiClient.get(`/cases/${caseId}/annotations`).then(({ data }) => {
      setAnnotations(data || []);
    });
  };

  // Derive current node notes map from persistent annotations
  const nodeNotes = {};
  annotations.forEach(a => {
    if (a.account_id) {
      if (!nodeNotes[a.account_id]) {
        nodeNotes[a.account_id] = a.annotation;
      }
    }
  });

  // Rebuild and initialize Cytoscape when data, theme or annotations change
  useEffect(() => {
    if (rawNodes.length === 0) return;

    const redirect = (id) => {
      let current = id;
      while (mergedMap[current]) {
        current = mergedMap[current];
      }
      return current;
    };

    const mergedSources = new Set(Object.keys(mergedMap));
    
    // Filter and label nodes
    const finalNodes = rawNodes
      .filter(n => !mergedSources.has(n.data.id))
      .map(n => {
        const nid = n.data.id;
        const note = nodeNotes[nid];
        const label = note ? `${nid}\n(${note})` : nid;
        return {
          data: {
            ...n.data,
            label: label,
            risk_tier: riskTier(n.data.risk_score || 0)
          }
        };
      });

    // Remap and filter edges
    const finalEdges = [];
    rawEdges.forEach(e => {
      const newSrc = redirect(e.data.source);
      const newDst = redirect(e.data.target);
      if (newSrc !== newDst) {
        finalEdges.push({
          data: {
            ...e.data,
            source: newSrc,
            target: newDst
          }
        });
      }
    });

    // Add custom connection edges
    customEdges.forEach((e, idx) => {
      const newSrc = redirect(e.source);
      const newDst = redirect(e.target);
      if (newSrc !== newDst) {
        finalEdges.push({
          data: {
            id: `custom-edge-${idx}`,
            source: newSrc,
            target: newDst,
            amount: e.amount,
            isCustom: true
          }
        });
      }
    });

    // Dark theme awareness check
    const isDark = document.documentElement.classList.contains('dark');

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...finalNodes, ...finalEdges],
      layout: { name: 'cose-bilkent', animate: false, nodeRepulsion: 8000 },
      style: [
        { selector: 'node', style: {
            'label': 'data(label)', 
            'font-size': 9, 
            'color': isDark ? '#E2E8F0' : '#0F172A',
            'width': 'mapData(volume, 1, 50, 28, 64)',
            'height': 'mapData(volume, 1, 50, 28, 64)',
            'text-valign': 'bottom', 
            'text-margin-y': 4,
            'text-wrap': 'wrap'
        }},
        { selector: 'node[risk_tier="low"]',    style: { 'shape': 'ellipse', 'background-color': '#3B82F6' } },
        { selector: 'node[risk_tier="medium"]', style: { 'shape': 'diamond', 'background-color': '#F59E0B' } },
        { selector: 'node[risk_tier="high"]',   style: { 'shape': 'hexagon', 'background-color': '#EF4444' } },
        { selector: 'edge', style: {
            'width': 1.8, 
            'line-color': isDark ? '#334155' : '#CBD5E1', 
            'target-arrow-color': isDark ? '#475569' : '#CBD5E1',
            'target-arrow-shape': 'triangle', 
            'curve-style': 'bezier',
            'label': 'data(amount)', 
            'font-size': 7, 
            'color': isDark ? '#94A3B8' : '#475569',
        }},
        { selector: 'edge[isCustom]', style: {
            'line-style': 'dashed',
            'line-color': '#3B82F6',
            'target-arrow-color': '#3B82F6',
            'width': 2.2
          }
        },
        { selector: ':selected', style: { 
            'border-width': 3.5, 
            'border-color': isDark ? '#60A5FA' : '#0F172A',
            'border-opacity': 0.8
          } 
        },
      ],
    });

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data();
      setSelected({ type: 'node', data: nodeData });
      setNoteText(nodeNotes[nodeData.id] || '');
    });
    
    cy.on('tap', 'edge', (evt) => {
      setSelected({ type: 'edge', data: evt.target.data() });
    });

    cyRef.current = cy;

    return () => {
      if (cy) cy.destroy();
    };
  }, [rawNodes, rawEdges, mergedMap, customEdges, annotations]);

  // Actions handlers
  const handleMerge = () => {
    if (!mergeSrc || !mergeDst || mergeSrc === mergeDst) return;
    setMergedMap(prev => ({
      ...prev,
      [mergeSrc]: mergeDst
    }));
    setMergeSrc('');
    setMergeDst('');
    setSelected(null);
  };

  const handleAddEdge = () => {
    if (!edgeSrc || !edgeDst || edgeSrc === edgeDst) return;
    setCustomEdges(prev => [
      ...prev,
      { source: edgeSrc, target: edgeDst, amount: edgeAmount ? `₹${Number(edgeAmount).toLocaleString('en-IN')}` : 'Custom' }
    ]);
    setEdgeSrc('');
    setEdgeDst('');
    setEdgeAmount('');
  };

  const handleSaveNote = () => {
    if (!selected || selected.type !== 'node') return;
    const accountId = selected.data.id;
    apiClient.post(`/cases/${caseId}/annotations`, {
      annotation: noteText,
      account_id: accountId
    }).then(() => {
      fetchAnnotations();
    });
  };

  const handleResetGraph = () => {
    setMergedMap({});
    setCustomEdges([]);
    setSelected(null);
  };

  const activeNodeIds = rawNodes
    .map(n => n.data.id)
    .filter(id => !mergedMap[id]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      
      {/* COLUMN 1: Left Workstation filters & tools panel (3 cols) */}
      <div className="lg:col-span-3 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 text-xs flex flex-col justify-between shadow-sm space-y-4">
        <div className="space-y-4">
          
          {/* Header */}
          <div className="border-b border-borderLight dark:border-borderDark pb-2.5">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">Forensic Workbench</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Control tools for structural graph edits.</p>
          </div>
          
          {/* Visual Legend */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-borderLight dark:border-borderDark/60">
            <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Visual Indicator Legend</span>
            <div className="space-y-2 text-[10px] text-slate-600 dark:text-slate-400 font-medium">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-accent" />
                <span>Blue Circle · Low Risk Mark</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-warning" style={{clipPath:'polygon(50% 0,100% 50%,50% 100%,0 50%)'}} />
                <span>Amber Diamond · Medium Risk Mark</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-danger" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} />
                <span>Red Hexagon · High Risk Mark</span>
              </div>
              <div className="flex items-center gap-2 border-t border-borderLight dark:border-borderDark pt-1.5 mt-1">
                <span className="w-4 h-0.5 border-t-2 border-accent border-dashed" />
                <span>Dashed Edge · Manual connection</span>
              </div>
            </div>
          </div>

          {/* Merge Accounts Tool */}
          <div className="space-y-2">
            <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Merge Target Accounts</span>
            <div className="flex gap-2">
              <select
                className="w-1/2 p-2 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                value={mergeSrc}
                onChange={e => setMergeSrc(e.target.value)}
              >
                <option value="">Source...</option>
                {activeNodeIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
              <select
                className="w-1/2 p-2 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                value={mergeDst}
                onChange={e => setMergeDst(e.target.value)}
              >
                <option value="">Target...</option>
                {activeNodeIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
            <button
              onClick={handleMerge}
              disabled={!mergeSrc || !mergeDst || mergeSrc === mergeDst}
              className="w-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold py-2 px-3 rounded-btn disabled:opacity-40 transition-opacity"
            >
              Merge Source Into Target
            </button>
          </div>

          {/* Draw Custom Edge Connection Tool */}
          <div className="space-y-2 border-t border-borderLight dark:border-borderDark pt-4">
            <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Draw Manual Connection</span>
            <div className="flex gap-2">
              <select
                className="w-1/2 p-2 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                value={edgeSrc}
                onChange={e => setEdgeSrc(e.target.value)}
              >
                <option value="">From...</option>
                {activeNodeIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
              <select
                className="w-1/2 p-2 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                value={edgeDst}
                onChange={e => setEdgeDst(e.target.value)}
              >
                <option value="">To...</option>
                {activeNodeIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
            <input
              type="number"
              placeholder="Amount (₹)..."
              className="w-full p-2 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              value={edgeAmount}
              onChange={e => setEdgeAmount(e.target.value)}
            />
            <button
              onClick={handleAddEdge}
              disabled={!edgeSrc || !edgeDst || edgeSrc === edgeDst}
              className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2 px-3 rounded-btn disabled:opacity-40 transition-opacity shadow-md shadow-accent/15"
            >
              Add Connection Edge
            </button>
          </div>

        </div>

        {/* Global Reset */}
        <button
          onClick={handleResetGraph}
          className="w-full bg-danger hover:bg-rose-600 text-white font-bold py-2.5 px-3 rounded-btn transition-colors"
        >
          Reset Structure Edits
        </button>
      </div>

      {/* COLUMN 2: Center Graph canvas (6 cols) */}
      <div className="lg:col-span-6 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-2 shadow-sm flex flex-col min-h-[550px] relative overflow-hidden">
        
        {/* Helper layout tags */}
        <div className="absolute top-4 left-4 z-10 bg-white/70 dark:bg-cardDark backdrop-blur-sm border border-borderLight dark:border-borderDark px-2.5 py-1 rounded-lg text-[9px] font-bold text-slate-500 uppercase">
          Network Visualization Area
        </div>

        <div ref={containerRef} className="flex-1 w-full rounded-xl bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-borderDark shadow-inner" />
      </div>

      {/* COLUMN 3: Right selected account inspection details & annotations (3 cols) */}
      <div className="lg:col-span-3 bg-white dark:bg-cardDark border border-borderLight dark:border-borderDark rounded-enterprise p-5 text-xs flex flex-col justify-between shadow-sm space-y-4">
        
        <div className="space-y-4">
          
          <div className="border-b border-borderLight dark:border-borderDark pb-2.5">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">Account Inspector</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Examine credentials and active logs.</p>
          </div>

          {selected ? (
            <div className="space-y-4">
              <div>
                <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                  Selected Type: {selected.type.toUpperCase()}
                </span>
                <div className="font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  {selected.data.id}
                </div>
              </div>

              {/* Data fields render */}
              <div>
                <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Attribute Ledger</span>
                <pre className="text-[9px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-borderLight dark:border-borderDark/60 overflow-x-auto max-h-56">
                  {JSON.stringify(selected.data, null, 2)}
                </pre>
              </div>

              {/* Persistent annotations */}
              {selected.type === 'node' && (
                <div className="space-y-2 border-t border-borderLight dark:border-borderDark pt-4">
                  <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Account Notes</span>
                  <textarea
                    rows={4}
                    className="w-full p-2.5 border border-borderLight dark:border-borderDark rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="Enter persistent note for this account..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                  />
                  <button
                    onClick={handleSaveNote}
                    className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2 px-3 rounded-btn transition-colors shadow-md shadow-accent/15"
                  >
                    Save Persistent Note
                  </button>
                </div>
              )}

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 space-y-2">
              <svg className="w-8 h-8 text-slate-300 dark:text-slate-700 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <p className="italic">Click any node or transaction line inside the network visualization to inspect attributes.</p>
            </div>
          )}

        </div>

        {selected && (
          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-4">
            <span className="text-accent">ℹ</span> Selected node is locked in inspector.
          </div>
        )}
      </div>

    </div>
  );
}
