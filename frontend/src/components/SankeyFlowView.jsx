import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { apiClient } from '../api/client';

const WIDTH = 900;
const HEIGHT = 520;

export default function SankeyFlowView({ caseId, minAmount }) {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    apiClient.get(`/cases/${caseId}/graph/flow`, { params: { min_amount: minAmount } })
      .then((r) => setData(r.data));
  }, [caseId, minAmount]);

  useEffect(() => {
    if (!data || !data.flows.length) return;

    const accountIds = Array.from(
      new Set(data.flows.flatMap((f) => [f.source, f.target]))
    );
    const idIndex = new Map(accountIds.map((id, i) => [id, i]));

    const sankeyNodes = accountIds.map((id) => {
      const v = data.node_verdicts[id] || {};
      return { id, composite_score: v.composite_score || 0, role_label: v.role_label };
    });
    const sankeyLinks = data.flows.map((f) => ({
      source: idIndex.get(f.source),
      target: idIndex.get(f.target),
      value: Math.max(f.value, 1),
      is_circular: f.is_circular,
      txn_count: f.txn_count,
    }));

    const generator = sankey()
      .nodeId((d, i) => i)
      .nodeWidth(16)
      .nodePadding(12)
      .extent([[20, 20], [WIDTH - 20, HEIGHT - 20]]);

    let graph;
    try {
      graph = generator({
        nodes: sankeyNodes.map((d) => ({ ...d })),
        links: sankeyLinks,
      });
    } catch (e) {
      // d3-sankey throws on true cycles (round-trip money creates A->B->A).
      // Break cycles by dropping the smallest-value link in any detected loop —
      // the underlying CIRCULAR_FLOW alert and Hypothesis Engine already cover
      // tracing the exact loop; the Sankey only needs to render a DAG view.
      const linksSortedByValue = [...sankeyLinks].sort((a, b) => a.value - b.value);
      const seen = new Set();
      const acyclic = [];
      for (const link of linksSortedByValue) {
        const key = `${link.target}->${link.source}`;
        if (seen.has(key)) continue;
        seen.add(`${link.source}->${link.target}`);
        acyclic.push(link);
      }
      graph = generator({
        nodes: sankeyNodes.map((d) => ({ ...d })),
        links: acyclic,
      });
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const colorFor = (score) => (score >= 65 ? '#dc2626' : score >= 30 ? '#d97706' : '#2563eb');

    svg.append('g')
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d) => (d.is_circular ? '#dc2626' : '#94a3b8'))
      .attr('stroke-opacity', (d) => (d.is_circular ? 0.55 : 0.3))
      .attr('stroke-width', (d) => Math.max(1, d.width))
      .attr('fill', 'none')
      .append('title')
      .text((d) => `${d.source.id} -> ${d.target.id}\n₹${d.value.toLocaleString('en-IN')} · ${d.txn_count} txn(s)`);

    const node = svg.append('g')
      .selectAll('g')
      .data(graph.nodes)
      .join('g');

    node.append('rect')
      .attr('x', (d) => d.x0)
      .attr('y', (d) => d.y0)
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('fill', (d) => colorFor(d.composite_score))
      .attr('rx', 2)
      .append('title')
      .text((d) => `${d.id}${d.role_label ? ' · ' + d.role_label.replace(/_/g, ' ') : ''}`);

    node.append('text')
      .attr('x', (d) => (d.x0 < WIDTH / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr('y', (d) => (d.y0 + d.y1) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.x0 < WIDTH / 2 ? 'start' : 'end'))
      .attr('font-size', 9)
      .attr('fill', '#475569')
      .text((d) => (d.value > (d3.max(graph.nodes, (n) => n.value) || 0) * 0.15 ? d.id : ''));

  }, [data]);

  if (!data) return <div className="text-sm text-slate-400 py-8">Loading flow data...</div>;
  if (!data.flows.length) return <div className="text-sm text-slate-400 py-8">No flow data for this case yet.</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2">
      <div className="text-xs text-slate-400 px-2 pt-1 pb-2">
        Bar width = total amount transferred. Red links indicate money on a
        confirmed circular flow path. Hover any link or node for exact figures.
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" />
    </div>
  );
}
