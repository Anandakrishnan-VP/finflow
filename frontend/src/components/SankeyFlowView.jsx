import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { apiClient } from '../api/client';
import { useTheme } from '../contexts/ThemeContext';

const WIDTH = 900;
const HEIGHT = 520;

function makeAcyclic(nodesCount, links) {
  const adj = Array.from({ length: nodesCount }, () => []);
  links.forEach((link, idx) => {
    adj[link.source].push({ target: link.target, idx });
  });

  const visited = new Uint8Array(nodesCount); // 0: unvisited, 1: visiting, 2: visited
  const backEdges = new Set();

  function dfs(u) {
    visited[u] = 1;
    for (const edge of adj[u]) {
      const v = edge.target;
      if (visited[v] === 1) {
        backEdges.add(edge.idx);
      } else if (visited[v] === 0) {
        dfs(v);
      }
    }
    visited[u] = 2;
  }

  for (let i = 0; i < nodesCount; i++) {
    if (visited[i] === 0) {
      dfs(i);
    }
  }

  return links.filter((_, idx) => !backEdges.has(idx));
}

export default function SankeyFlowView({ caseId, minAmount }) {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const { theme } = useTheme();

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
        links: sankeyLinks.map((l) => ({ ...l })),
      });
    } catch (e) {
      const acyclicLinks = makeAcyclic(sankeyNodes.length, sankeyLinks);
      graph = generator({
        nodes: sankeyNodes.map((d) => ({ ...d })),
        links: acyclicLinks.map((l) => ({ ...l })),
      });
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const style = getComputedStyle(document.documentElement);
    const riskHigh = `rgb(${style.getPropertyValue('--risk-high').trim()})`;
    const riskMedium = `rgb(${style.getPropertyValue('--risk-medium').trim()})`;
    const riskLow = `rgb(${style.getPropertyValue('--risk-low').trim()})`;
    const borderDefault = `rgb(${style.getPropertyValue('--border-default').trim()})`;
    const inkSecondary = `rgb(${style.getPropertyValue('--ink-secondary').trim()})`;

    const colorFor = (score) => (score >= 65 ? riskHigh : score >= 30 ? riskMedium : riskLow);

    svg.append('g')
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d) => (d.is_circular ? riskHigh : borderDefault))
      .attr('stroke-opacity', (d) => (d.is_circular ? 0.6 : 0.35))
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
      .attr('rx', 3)
      .append('title')
      .text((d) => `${d.id}${d.role_label ? ' · ' + d.role_label.replace(/_/g, ' ') : ''}`);

    node.append('text')
      .attr('x', (d) => (d.x0 < WIDTH / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr('y', (d) => (d.y0 + d.y1) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => (d.x0 < WIDTH / 2 ? 'start' : 'end'))
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-mono)')
      .attr('fill', inkSecondary)
      .text((d) => (d.value > (d3.max(graph.nodes, (n) => n.value) || 0) * 0.15 ? d.id : ''));

  }, [data, theme]);

  if (!data) return <div className="text-sm text-ink-muted py-8 text-center">Loading flow data...</div>;
  if (!data.flows.length) return <div className="text-sm text-ink-muted py-8 text-center">No flow data for this case yet — upload statements to get started.</div>;

  return (
    <div className="bg-surface-raised border border-border-hairline rounded-lg p-2">
      <div className="text-xs text-ink-muted px-2 pt-1 pb-2">
        Bar width = total amount transferred. Red links indicate money on a
        confirmed circular flow path. Hover any link or node for exact figures.
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" />
    </div>
  );
}
