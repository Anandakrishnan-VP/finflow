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
      // Since it's sorted by created_at DESC in router, first note found is the latest one
      if (!nodeNotes[a.account_id]) {
        nodeNotes[a.account_id] = a.annotation;
      }
    }
  });

  // Rebuild and initialize Cytoscape when data, merges, custom edges, or notes change
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

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...finalNodes, ...finalEdges],
      layout: { name: 'cose-bilkent', animate: false, nodeRepulsion: 8000 },
      style: [
        { selector: 'node', style: {
            'label': 'data(label)', 
            'font-size': 9, 
            'color': '#334155',
            'width': 'mapData(volume, 1, 50, 28, 64)',
            'height': 'mapData(volume, 1, 50, 28, 64)',
            'text-valign': 'bottom', 
            'text-margin-y': 4,
            'text-wrap': 'wrap'
        }},
        { selector: 'node[risk_tier="low"]',    style: { 'shape': 'ellipse', 'background-color': '#2563eb' } },
        { selector: 'node[risk_tier="medium"]', style: { 'shape': 'diamond', 'background-color': '#d97706' } },
        { selector: 'node[risk_tier="high"]',   style: { 'shape': 'hexagon', 'background-color': '#dc2626' } },
        { selector: 'edge', style: {
            'width': 1.8, 
            'line-color': '#94a3b8', 
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle', 
            'curve-style': 'bezier',
            'label': 'data(amount)', 
            'font-size': 7, 
            'color': '#475569',
        }},
        { selector: 'edge[isCustom]', style: {
            'line-style': 'dashed',
            'line-color': '#4f46e5',
            'target-arrow-color': '#4f46e5',
            'width': 2.2
        }},
        { selector: ':selected', style: { 'border-width': 3.5, 'border-color': '#0f172a' } },
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
      { source: edgeSrc, target: edgeDst, amount: edgeAmount ? `₹${Number(edgeAmount).toLocaleString()}` : 'Custom' }
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

  // Extract non-merged active nodes
  const activeNodeIds = rawNodes
    .map(n => n.data.id)
    .filter(id => !mergedMap[id]);

  return (
    <div className="flex gap-4">
      {/* Canvas */}
      <div ref={containerRef} className="flex-1 h-[600px] bg-slate-50 border border-slate-200 rounded-xl shadow-inner relative overflow-hidden" />
      
      {/* Sidebar Workstation */}
      <div className="w-80 bg-white border border-slate-200 rounded-xl p-4 text-sm flex flex-col justify-between shadow-sm overflow-y-auto max-h-[600px]">
        <div>
          {/* Header */}
          <div className="font-bold text-slate-800 text-base mb-3 border-b border-slate-100 pb-2">Forensic Workstation</div>
          
          {/* Legend */}
          <div className="mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <div className="font-semibold text-slate-700 text-xs mb-1.5 uppercase tracking-wider">Visual Legend</div>
            <div className="flex items-center gap-2 mb-1 text-xs text-slate-600">
              <span className="w-3 h-3 rounded-full bg-blue-600" /> Circle · Low risk
            </div>
            <div className="flex items-center gap-2 mb-1 text-xs text-slate-600">
              <span className="w-3 h-3 bg-amber-600" style={{clipPath:'polygon(50% 0,100% 50%,50% 100%,0 50%)'}} /> Diamond · Medium risk
            </div>
            <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-600">
              <span className="w-3 h-3 bg-red-600" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} /> Hexagon · High risk
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600 border-t border-slate-200 pt-1 mt-1">
              <span className="w-4 h-0.5 border-t-2 border-indigo-600 border-dashed" /> Custom Connection
            </div>
          </div>

          {/* Merge Nodes Tool */}
          <div className="border-t border-slate-100 pt-3">
            <div className="font-semibold text-slate-700 text-xs mb-1.5 uppercase tracking-wider">Merge Accounts</div>
            <div className="flex gap-1.5 mb-2">
              <select
                className="w-1/2 p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white"
                value={mergeSrc}
                onChange={e => setMergeSrc(e.target.value)}
              >
                <option value="">Source...</option>
                {activeNodeIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
              <select
                className="w-1/2 p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white"
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
              className="w-full bg-slate-800 text-white font-medium py-1.5 px-3 rounded-lg text-xs hover:bg-slate-700 disabled:opacity-40 transition-opacity"
            >
              Merge Source into Target
            </button>
          </div>

          {/* Custom Edge Tool */}
          <div className="border-t border-slate-100 pt-3 mt-3">
            <div className="font-semibold text-slate-700 text-xs mb-1.5 uppercase tracking-wider">Draw Connection</div>
            <div className="flex gap-1.5 mb-1.5">
              <select
                className="w-1/2 p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white"
                value={edgeSrc}
                onChange={e => setEdgeSrc(e.target.value)}
              >
                <option value="">From...</option>
                {activeNodeIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
              <select
                className="w-1/2 p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white"
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
              className="w-full p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white mb-2"
              value={edgeAmount}
              onChange={e => setEdgeAmount(e.target.value)}
            />
            <button
              onClick={handleAddEdge}
              disabled={!edgeSrc || !edgeDst || edgeSrc === edgeDst}
              className="w-full bg-indigo-600 text-white font-medium py-1.5 px-3 rounded-lg text-xs hover:bg-indigo-500 disabled:opacity-40 transition-opacity"
            >
              Add Custom Connection
            </button>
          </div>

          {/* Persistent Annotation Tool */}
          {selected && selected.type === 'node' && (
            <div className="border-t border-slate-100 pt-3 mt-3">
              <div className="font-semibold text-slate-700 text-xs mb-1.5 uppercase tracking-wider">Account Notes</div>
              <textarea
                rows={2}
                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white mb-1.5"
                placeholder="Enter persistent note for this account..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
              />
              <button
                onClick={handleSaveNote}
                className="w-full bg-blue-600 text-white font-medium py-1.5 px-3 rounded-lg text-xs hover:bg-blue-500 transition-colors"
              >
                Save Persistent Note
              </button>
            </div>
          )}
        </div>

        {/* Selected Info / Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          {selected ? (
            <div className="mb-3">
              <div className="font-semibold text-slate-700 mb-1 text-xs uppercase tracking-wider">
                Selected {selected.type === 'node' ? 'Account' : 'Transaction'}
              </div>
              <pre className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 overflow-x-auto max-h-36">
                {JSON.stringify(selected.data, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="text-slate-400 text-xs italic mb-3">Click any node or edge to inspect details.</div>
          )}
          
          <button
            onClick={handleResetGraph}
            className="w-full bg-rose-600 text-white font-medium py-1.5 px-3 rounded-lg text-xs hover:bg-rose-500 transition-colors"
          >
            Reset All Customizations
          </button>
        </div>
      </div>
    </div>
  );
}
