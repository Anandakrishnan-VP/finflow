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
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cy;
    apiClient.get(`/cases/${caseId}/graph`).then(({ data }) => {
      const rawNodes = data.nodes || [];
      const rawEdges = data.edges || [];
      const nodes = rawNodes.map(n => ({
        data: { ...n.data, risk_tier: riskTier(n.data.risk_score || 0) }
      }));
      cy = cytoscape({
        container: containerRef.current,
        elements: [...nodes, ...rawEdges],
        layout: { name: 'cose-bilkent', animate: false, nodeRepulsion: 8000 },
        style: [
          { selector: 'node', style: {
              'label': 'data(id)', 'font-size': 9, 'color': '#334155',
              'width': 'mapData(volume, 1, 50, 24, 60)',
              'height': 'mapData(volume, 1, 50, 24, 60)',
              'text-valign': 'bottom', 'text-margin-y': 4,
          }},
          { selector: 'node[risk_tier="low"]',    style: { 'shape': 'ellipse', 'background-color': '#2563eb' } },
          { selector: 'node[risk_tier="medium"]', style: { 'shape': 'diamond', 'background-color': '#d97706' } },
          { selector: 'node[risk_tier="high"]',   style: { 'shape': 'hexagon', 'background-color': '#dc2626' } },
          { selector: 'edge', style: {
              'width': 1.5, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8',
              'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
              'label': 'data(amount)', 'font-size': 7, 'color': '#64748b',
          }},
          { selector: ':selected', style: { 'border-width': 3, 'border-color': '#0f172a' } },
        ],
      });
      cy.on('tap', 'node', (evt) => setSelected({ type: 'node', data: evt.target.data() }));
      cy.on('tap', 'edge', (evt) => setSelected({ type: 'edge', data: evt.target.data() }));
    });
    return () => { if (cy) cy.destroy(); };
  }, [caseId]);

  return (
    <div className="flex gap-4">
      <div ref={containerRef} className="flex-1 h-[560px] bg-white border border-slate-200 rounded-lg" />
      <div className="w-64 bg-white border border-slate-200 rounded-lg p-4 text-sm">
        <div className="font-medium text-slate-700 mb-2">Legend</div>
        {/* RULE 14: risk encoded with shape AND color, not color alone */}
        <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 rounded-full bg-blue-600" /> Circle · Low risk</div>
        <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 bg-amber-600" style={{clipPath:'polygon(50% 0,100% 50%,50% 100%,0 50%)'}} /> Diamond · Medium risk</div>
        <div className="flex items-center gap-2 mb-4"><span className="w-3 h-3 bg-red-600" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} /> Hexagon · High risk</div>
        {selected ? (
          <div>
            <div className="font-medium text-slate-700 mb-1">{selected.type === 'node' ? 'Account' : 'Transaction'}</div>
            <pre className="text-xs text-slate-500 whitespace-pre-wrap">{JSON.stringify(selected.data, null, 2)}</pre>
          </div>
        ) : <div className="text-slate-400 text-xs">Click a node or edge for details.</div>}
      </div>
    </div>
  );
}
