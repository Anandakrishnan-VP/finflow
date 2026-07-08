import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as d3 from 'd3';
import { apiClient } from '../api/client';
import SankeyFlowView from './SankeyFlowView';
import PatternInsightsPanel from './PatternInsightsPanel';
import { useTheme } from '../contexts/ThemeContext';

function riskTier(score) {
  if (score >= 65) return 'high';
  if (score >= 33) return 'medium'; // Changed threshold to 33 per user request
  return 'low';
}

function classifyTxnChannel(narrations) {
  if (!narrations || narrations.length === 0) return 'default';
  const text = narrations.join(' ').toUpperCase();
  if (text.includes('UPI') || text.includes('IMPS')) return 'UPI';
  if (text.includes('NEFT')) return 'NEFT';
  if (text.includes('RTGS')) return 'RTGS';
  return 'default';
}

function formatFlaggedAmount(amt) {
  if (amt >= 10000000) return `₹${(amt / 10000000).toFixed(1)}Cr`;
  if (amt >= 100000) return `₹${(amt / 100000).toFixed(1)}L`;
  return `₹${amt.toLocaleString('en-IN')}`;
}

export default function GraphView({ caseId }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const { theme } = useTheme();

  // Core Data & View States
  const [raw, setRaw] = useState(null);
  const [view, setView] = useState('network'); // 'network' | 'flow'
  const [layoutMode, setLayoutMode] = useState('force'); // 'force' | 'radial' | 'flow'
  const [riskFilter, setRiskFilter] = useState('all'); // 'all' | 'high'
  const [minAmount, setMinAmount] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [maxCircularHops, setMaxCircularHops] = useState(0);

  // Tooltip & Interactive State
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredNodePos, setHoveredNodePos] = useState({ x: 0, y: 0 });

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

  useEffect(() => {
    load(showAll ? 5000 : 150);
  }, [caseId, minAmount, showAll]);

  // Fetch Pattern Membership
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

      let maxHops = 0;
      data.circular_flows.forEach((p) => {
        if (p.hops.length > maxHops) maxHops = p.hops.length;
        p.path.forEach((a) => {
          circular.nodeIds.add(a);
          nodeIds.add(a);
        });
        p.hops.forEach((h) => {
          addEdge(circular, h.from, h.to);
        });
      });
      setMaxCircularHops(maxHops);

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

  // Compute Flagged Amount from pattern members
  const flaggedAmount = useMemo(() => {
    if (!raw) return 0;
    return raw.edges
      .filter((e) => {
        const key = `${e.data.source}__${e.data.target}`;
        return patternMembership.edgeIds.has(key);
      })
      .reduce((sum, e) => sum + (Number(e.data.total_amount) || 0), 0);
  }, [raw, patternMembership]);

  // Map raw data to D3 Nodes/Links preserving coordinates across updates
  const d3Data = useMemo(() => {
    if (!raw) return { nodes: [], links: [] };

    const existingNodesMap = new Map();
    if (simulationRef.current) {
      simulationRef.current.nodes().forEach((n) => {
        existingNodesMap.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
      });
    }

    const nodes = raw.nodes.map((n) => {
      let pattern_type = 'none';
      if (patternMembership.circular?.nodeIds?.has(n.data.id)) pattern_type = 'circular';
      else if (patternMembership.layering?.nodeIds?.has(n.data.id)) pattern_type = 'layering';
      else if (patternMembership.fan_out?.nodeIds?.has(n.data.id)) pattern_type = 'fan_out';
      else if (patternMembership.fan_in?.nodeIds?.has(n.data.id)) pattern_type = 'fan_in';

      const prev = existingNodesMap.get(n.data.id);
      return {
        ...n.data, // Copy all original data properties including account_id, name, bank to prevent UI white-screen crashes
        id: n.data.id,
        pattern_type,
        x: prev ? prev.x : undefined,
        y: prev ? prev.y : undefined,
        vx: prev ? prev.vx : undefined,
        vy: prev ? prev.vy : undefined,
      };
    });

    const links = raw.edges.map((e) => {
      let pattern_type = 'none';
      if (patternMembership.circular?.edgeIds?.has(e.data.id)) pattern_type = 'circular';
      else if (patternMembership.layering?.edgeIds?.has(e.data.id)) pattern_type = 'layering';
      else if (patternMembership.fan_out?.edgeIds?.has(e.data.id)) pattern_type = 'fan_out';
      else if (patternMembership.fan_in?.edgeIds?.has(e.data.id)) pattern_type = 'fan_in';

      return {
        ...e.data,
        id: e.data.id,
        source: e.data.source,
        target: e.data.target,
        total_amount: e.data.total_amount,
        txn_count: e.data.txn_count,
        log_amount: e.data.log_amount,
        sample_narrations: e.data.sample_narrations || [],
        pattern_type,
      };
    });

    return { nodes, links };
  }, [raw, patternMembership]);

  // Apply visual interactive filters (HIGH only vs Show all)
  const filteredD3Data = useMemo(() => {
    const { nodes, links } = d3Data;
    if (riskFilter === 'high') {
      const visibleNodes = nodes.filter((n) => n.composite_score >= 33 || n.is_primary);
      const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
      const visibleLinks = links.filter((l) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        return visibleNodeIds.has(sId) && visibleNodeIds.has(tId);
      });
      return { nodes: visibleNodes, links: visibleLinks };
    }
    return { nodes, links };
  }, [d3Data, riskFilter]);

  // Helper check for highlighting focused pattern elements
  const isNodeInPattern = useCallback((n, pattern) => {
    if (!pattern) return true;
    if (pattern.type === 'fan_out') return n.id === pattern.data.hub || pattern.data.targets.includes(n.id);
    if (pattern.type === 'fan_in') return n.id === pattern.data.hub || pattern.data.sources.includes(n.id);
    if (pattern.type === 'circular') return pattern.data.path.includes(n.id);
    if (pattern.type === 'layering') return pattern.data.path.includes(n.id);
    return true;
  }, []);

  const isLinkInPattern = useCallback((e, pattern) => {
    if (!pattern) return true;
    const sourceId = typeof e.source === 'object' ? e.source.id : e.source;
    const targetId = typeof e.target === 'object' ? e.target.id : e.target;
    if (pattern.type === 'fan_out') {
      return sourceId === pattern.data.hub && pattern.data.targets.includes(targetId);
    }
    if (pattern.type === 'fan_in') {
      return targetId === pattern.data.hub && pattern.data.sources.includes(sourceId);
    }
    if (pattern.type === 'circular') {
      return pattern.data.hops.some((hop) => hop.from === sourceId && hop.to === targetId);
    }
    if (pattern.type === 'layering') {
      const path = pattern.data.path;
      for (let i = 0; i < path.length - 1; i++) {
        if (path[i] === sourceId && path[i + 1] === targetId) return true;
      }
    }
    return false;
  }, []);

  // Zoom to Fit Action
  const fitToCanvas = useCallback(() => {
    if (!containerRef.current || !svgRef.current || !zoomRef.current || !simulationRef.current) return;
    const nodes = simulationRef.current.nodes();
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 560;

    const dx = maxX - minX || 1;
    const dy = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const scale = Math.max(0.12, Math.min(2.5, 0.72 / Math.max(dx / width, dy / height)));

    d3.select(svgRef.current)
      .transition()
      .duration(700)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(width / 2 - scale * cx, height / 2 - scale * cy).scale(scale)
      );
  }, []);

  // D3 Visualization Engine
  useEffect(() => {
    if (view !== 'network' || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 560;

    // Clear previous SVG contents
    d3.select(containerRef.current).selectAll('svg').remove();

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'select-none')
      .style('background-color', 'transparent');

    svgRef.current = svg.node();

    // Define Arrow markers
    const defs = svg.append('defs');
    const markerColors = {
      NEFT: '#10b981',
      UPI: '#3b82f6',
      RTGS: '#f97316',
      round_trip: '#ef4444',
      default: theme === 'dark' ? '#54534A' : '#cbd5e1',
    };

    Object.entries(markerColors).forEach(([key, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${key}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 0)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    });

    const zoomGroup = svg.append('g').attr('class', 'zoom-group');

    // Zoom setup
    const zoom = d3.zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    const linksGroup = zoomGroup.append('g').attr('class', 'links');
    const nodesGroup = zoomGroup.append('g').attr('class', 'nodes');

    const { nodes, links } = filteredD3Data;

    // Position new nodes at center with small offset
    nodes.forEach((n) => {
      if (n.x === undefined) {
        n.x = width / 2 + (Math.random() - 0.5) * 80;
        n.y = height / 2 + (Math.random() - 0.5) * 80;
      }
    });

    // Volume-based node size bounds
    const vols = nodes.map((n) => n.volume);
    const volMin = Math.min(...vols, 0);
    const volMax = Math.max(...vols, 1);

    const getNodeRadius = (d) => {
      if (d.is_primary) return 26;
      if (volMax === volMin) return 16;
      return 15 + ((d.volume - volMin) / (volMax - volMin)) * 14;
    };

    // Background Simulation to Compute Layout Target Coordinates (Prevents Shaking)
    const backgroundSim = d3.forceSimulation(nodes);
    const linkForce = d3.forceLink(links)
      .id((d) => d.id)
      .distance((d) => (d.pattern_type === 'circular' ? 65 : 120));

    backgroundSim.force('link', linkForce);

    // Apply layout forces
    if (layoutMode === 'radial') {
      backgroundSim
        .force('charge', d3.forceManyBody().strength(-200))
        .force('collide', d3.forceCollide((d) => getNodeRadius(d) + 24)) // Increased collision to prevent overlaps
        .force(
          'radial',
          d3.forceRadial((d) => {
            if (d.risk_tier === 'high') return 80;
            if (d.risk_tier === 'medium') return 180;
            return 280;
          }, width / 2, height / 2).strength(1.5)
        );
    } else if (layoutMode === 'flow') {
      backgroundSim
        .force('charge', d3.forceManyBody().strength(-120))
        .force('collide', d3.forceCollide((d) => getNodeRadius(d) + 20))
        .force(
          'x',
          d3.forceX((d) => {
            if (d.is_primary) return width * 0.25;
            if (d.risk_tier === 'high') return width * 0.35;
            if (d.risk_tier === 'medium') return width * 0.58;
            return width * 0.8;
          }).strength(1.5)
        )
        .force('y', d3.forceY(height / 2).strength(0.8));
    } else {
      // Force layout
      backgroundSim
        .force('charge', d3.forceManyBody().strength(-400)) // Stronger repulsion to prevent crowding
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collide', d3.forceCollide((d) => getNodeRadius(d) + 22));
    }

    // Run simulation ticks synchronously to fully settle coordinates
    backgroundSim.stop();
    for (let i = 0; i < 200; ++i) backgroundSim.tick();

    // Set target positions for D3 animations
    nodes.forEach((n) => {
      n.targetX = n.x;
      n.targetY = n.y;
    });

    // Restore original positions (so we animate FROM previous coordinates TO the new settled coordinates)
    const existingNodesMap = new Map();
    if (simulationRef.current) {
      simulationRef.current.nodes().forEach((n) => {
        existingNodesMap.set(n.id, { x: n.x, y: n.y });
      });
    }
    nodes.forEach((n) => {
      const prev = existingNodesMap.get(n.id);
      if (prev) {
        n.x = prev.x;
        n.y = prev.y;
      }
    });

    // Expose simulation ref for Zoom to Fit logic
    simulationRef.current = {
      nodes: () => nodes,
    };

    // Render Edges (Links)
    const linkSelection = linksGroup.selectAll('.link')
      .data(links, (d) => d.id)
      .join('path')
      .attr('class', 'link')
      .attr('stroke', (d) => {
        if (d.pattern_type === 'circular' || d.pattern_type === 'layering') return '#ef4444';
        const channel = classifyTxnChannel(d.sample_narrations);
        if (channel === 'NEFT') return '#10b981';
        if (channel === 'UPI') return '#3b82f6';
        if (channel === 'RTGS') return '#f97316';
        return theme === 'dark' ? '#54534A' : '#cbd5e1';
      })
      .attr('stroke-opacity', (d) => {
        if (focusedPattern) {
          return isLinkInPattern(d, focusedPattern) ? 0.95 : 0.08;
        }
        return 0.65;
      })
      .attr('stroke-width', (d) => {
        if (focusedPattern && isLinkInPattern(d, focusedPattern)) return 4.5;
        const maxLog = 15;
        return 1.2 + ((d.log_amount || 0) / maxLog) * 4;
      })
      .attr('stroke-dasharray', (d) => {
        if (d.pattern_type === 'circular' || d.pattern_type === 'layering') return '5,4';
        return null;
      })
      .attr('fill', 'none')
      .attr('marker-end', (d) => {
        if (focusedPattern && !isLinkInPattern(d, focusedPattern)) return null;
        if (d.pattern_type === 'circular' || d.pattern_type === 'layering') return 'url(#arrow-round_trip)';
        const channel = classifyTxnChannel(d.sample_narrations);
        return `url(#arrow-${channel})`;
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelected({ type: 'edge', data: d });
      });

    // Render Position Updates Function
    const updateTickPositions = () => {
      linkSelection.attr('d', (d) => {
        const sourceNode = d.source;
        const targetNode = d.target;
        if (!sourceNode || !targetNode || sourceNode.x === undefined || targetNode.x === undefined) return '';

        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return '';

        const sourceR = getNodeRadius(sourceNode);
        const targetR = getNodeRadius(targetNode);

        const x1 = sourceNode.x + (dx / dist) * sourceR;
        const y1 = sourceNode.y + (dy / dist) * sourceR;
        const x2 = targetNode.x - (dx / dist) * (targetR + 6);
        const y2 = targetNode.y - (dy / dist) * (targetR + 6);

        return `M${x1},${y1} L${x2},${y2}`;
      });

      nodeSelection.attr('transform', (d) => `translate(${d.x},${d.y})`);
    };

    // Node Drag Handlers (Keeps Graph Stationary - Other Nodes Don't Scatter)
    const drag = () => {
      function dragstarted(event, d) {
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
        d.x = event.x;
        d.y = event.y;
        updateTickPositions();
      }
      function dragended(event, d) {
        d.fx = null;
        d.fy = null;
      }
      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    };

    // Render Nodes Group
    const nodeSelection = nodesGroup.selectAll('.node')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', 'node cursor-pointer')
      .attr('opacity', (d) => {
        if (focusedPattern) {
          return isNodeInPattern(d, focusedPattern) ? 1.0 : 0.15;
        }
        return 1.0;
      })
      .call(drag())
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelected({ type: 'node', data: d });
      })
      .on('mouseenter', (event, d) => {
        const containerRect = containerRef.current.getBoundingClientRect();
        setHoveredNode(d);
        setHoveredNodePos({
          x: event.clientX - containerRect.left,
          y: event.clientY - containerRect.top - 14,
        });

        d3.select(event.currentTarget).select('.node-outline')
          .transition().duration(200)
          .attr('r', getNodeRadius(d) + 5)
          .attr('stroke-opacity', 0.9);
      })
      .on('mouseleave', (event, d) => {
        setHoveredNode(null);

        d3.select(event.currentTarget).select('.node-outline')
          .transition().duration(200)
          .attr('r', getNodeRadius(d) + 2)
          .attr('stroke-opacity', 0.4);
      });

    // Draw node layers and rings
    nodeSelection.each(function (d) {
      const g = d3.select(this);
      const r = getNodeRadius(d);

      let patternColor = null;
      if (d.pattern_type === 'circular') patternColor = '#f97316';
      else if (d.pattern_type === 'layering') patternColor = '#ec4899';
      else if (d.pattern_type === 'fan_out') patternColor = '#1a73e8';
      else if (d.pattern_type === 'fan_in') patternColor = '#9333ea';

      if (patternColor) {
        g.append('circle')
          .attr('class', 'pattern-highlight')
          .attr('r', r + 4)
          .attr('fill', 'none')
          .attr('stroke', patternColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', d.pattern_type === 'circular' ? '3,2' : null);
      }

      g.append('circle')
        .attr('class', 'node-outline')
        .attr('r', r + 2)
        .attr('fill', 'none')
        .attr('stroke', d.is_primary ? 'rgb(var(--accent))' : 'var(--color-text-secondary)')
        .attr('stroke-width', d.is_primary ? 3.5 : 1.5)
        .attr('stroke-opacity', 0.4);

      g.append('circle')
        .attr('class', 'node-fill')
        .attr('r', r)
        .attr('fill', () => {
          if (d.risk_tier === 'high') return 'rgb(var(--risk-high))';
          if (d.risk_tier === 'medium') return 'rgb(var(--risk-medium))';
          return 'rgb(var(--risk-low))';
        })
        .attr('stroke', theme === 'dark' ? '#211F16' : '#EFEDE6')
        .attr('stroke-width', 1.5);

      // Label fit logic: restrict name length to 4 chars inside the node circle to prevent overflows, otherwise fallback to ...1234
      const labelText = d.name && d.name.length <= 4 ? d.name : (d.id.length > 4 ? `...${d.id.slice(-4)}` : d.id);
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '.3em')
        .attr('fill', '#ffffff')
        .attr('font-size', '8px')
        .attr('font-weight', 'bold')
        .attr('class', 'font-sans')
        .text(labelText);
    });

    // Smooth Layout Transition Animation (Moves nodes smoothly from old to new positions)
    d3.select(svgRef.current).selectAll('.node')
      .transition()
      .duration(700)
      .ease(d3.easeCubicOut)
      .tween('position', (d) => {
        const ix = d3.interpolate(d.x || width / 2, d.targetX);
        const iy = d3.interpolate(d.y || height / 2, d.targetY);
        return (t) => {
          d.x = ix(t);
          d.y = iy(t);
          updateTickPositions();
        };
      });

    // Initial position trigger
    updateTickPositions();

    // Auto-fit coordinates
    setTimeout(fitToCanvas, 250);

  }, [filteredD3Data, layoutMode, focusedPattern, theme, view, fitToCanvas]);

  // Search Node Highlight Effect
  useEffect(() => {
    if (view !== 'network' || !containerRef.current) return;
    const matches = d3.selectAll('.node').filter((d) => {
      if (!search) return false;
      const term = search.toLowerCase();
      return d.id.toLowerCase().includes(term) || (d.name && d.name.toLowerCase().includes(term));
    });

    d3.selectAll('.node-outline')
      .attr('stroke', (d) => (d.is_primary ? 'rgb(var(--accent))' : 'var(--color-text-secondary)'))
      .attr('stroke-width', (d) => (d.is_primary ? 3.5 : 1.5))
      .attr('stroke-opacity', 0.4);

    matches.select('.node-outline')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 4)
      .attr('stroke-opacity', 1.0);
  }, [search, view]);

  const handleFocusPattern = (pattern) => {
    setFocusedPattern(pattern);
  };

  if (!raw) return <div className="text-sm text-ink-muted py-8 text-center">Loading graph...</div>;

  return (
    <div>
      {/* Dynamic forensic statistics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-sm">
          <div className="text-[10px] text-ink-muted uppercase font-semibold tracking-wider">accounts traced</div>
          <div className="text-2xl font-bold text-ink-primary mt-1 font-data">{raw.nodes.length}</div>
        </div>
        <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-sm">
          <div className="text-[10px] text-ink-muted uppercase font-semibold tracking-wider">patterns</div>
          <div className="text-2xl font-bold text-risk-high mt-1 font-data">{patternMembership.nodeIds.size}</div>
        </div>
        <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-sm">
          <div className="text-[10px] text-ink-muted uppercase font-semibold tracking-wider">flagged amount</div>
          <div className="text-2xl font-bold text-risk-medium mt-1 font-data">{formatFlaggedAmount(flaggedAmount)}</div>
        </div>
        <div className="bg-surface-raised border border-border-hairline rounded-xl p-4 shadow-sm">
          <div className="text-[10px] text-ink-muted uppercase font-semibold tracking-wider">round-trip</div>
          <div className="text-2xl font-bold text-risk-low mt-1 font-data">
            {maxCircularHops > 0 ? `${maxCircularHops}-hop` : 'None'}
          </div>
        </div>
      </div>

      {/* Control panel & Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Layout control group */}
          {view === 'network' && (
            <div className="flex bg-surface-sunken rounded-lg p-0.5 border border-border-hairline">
              <button
                onClick={() => setLayoutMode('force')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  layoutMode === 'force'
                    ? 'bg-surface-raised shadow-sm text-ink-primary font-medium'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                Force
              </button>
              <button
                onClick={() => setLayoutMode('radial')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  layoutMode === 'radial'
                    ? 'bg-surface-raised shadow-sm text-ink-primary font-medium'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                Risk rings
              </button>
              <button
                onClick={() => setLayoutMode('flow')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  layoutMode === 'flow'
                    ? 'bg-surface-raised shadow-sm text-ink-primary font-medium'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                Flow
              </button>
            </div>
          )}

          {/* Filtering pills */}
          {view === 'network' && (
            <div className="flex gap-2">
              <button
                onClick={() => setRiskFilter('high')}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                  riskFilter === 'high'
                    ? 'bg-risk-high-bg text-risk-high border-risk-high/35 shadow-sm scale-95'
                    : 'bg-surface-raised text-ink-muted border-border hover:text-ink-secondary'
                }`}
              >
                HIGH only
              </button>
              <button
                onClick={() => setRiskFilter('all')}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                  riskFilter === 'all'
                    ? 'bg-surface-raised text-ink-primary border-border-strong shadow-sm'
                    : 'bg-surface-raised text-ink-muted border-border hover:text-ink-secondary'
                }`}
              >
                Show all
              </button>
            </div>
          )}
        </div>

        {/* Action button bar */}
        <div className="flex items-center gap-2">
          {view === 'network' && (
            <button
              onClick={fitToCanvas}
              className="text-xs bg-surface-raised text-ink-secondary hover:text-ink-primary border border-border rounded px-3 py-1.5 transition-colors font-semibold"
            >
              ⛶ Fit
            </button>
          )}

          {/* Network vs Flow view tab switcher */}
          <div className="flex bg-surface-sunken rounded-lg p-0.5 border border-border-hairline">
            <button
              onClick={() => setView('network')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                view === 'network'
                  ? 'bg-surface-raised shadow-sm text-ink-primary font-medium'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Network
            </button>
            <button
              onClick={() => setView('flow')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                view === 'flow'
                  ? 'bg-surface-raised shadow-sm text-ink-primary font-medium'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Flow
            </button>
          </div>

          <input
            placeholder="Search account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs bg-surface-raised text-ink-primary border border-border rounded px-2.5 py-1.5 w-40 focus:outline-none focus:border-border-strong"
          />

          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-muted">Min amount</label>
            <input
              type="range"
              min="0"
              max="1000000"
              step="10000"
              value={minAmount}
              onChange={(e) => setMinAmount(Number(e.target.value))}
              className="w-24 accent-accent"
            />
            <span className="text-xs text-ink-muted w-16 font-data">
              ₹{minAmount.toLocaleString('en-IN')}
            </span>
          </div>

          {raw.total_node_count > raw.shown_node_count && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs bg-risk-medium-bg text-risk-medium border border-risk-medium/10 rounded px-2.5 py-1.5 font-semibold"
            >
              Show all {raw.total_node_count}
            </button>
          )}
        </div>
      </div>

      {view === 'network' ? (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Graph view area container */}
          <div className="flex-1 relative bg-surface-raised border border-border-hairline rounded-xl shadow-inner h-[560px]">
            {/* Visualizer canvas mounting node */}
            <div ref={containerRef} className="w-full h-full" />

            {/* Custom interactive floating tooltip */}
            {hoveredNode && (
              <div
                className="absolute pointer-events-none bg-surface-raised border border-border-strong rounded-xl shadow-lg p-3 z-50 text-xs w-48 transition-all duration-150"
                style={{ left: `${hoveredNodePos.x + 10}px`, top: `${hoveredNodePos.y - 45}px` }}
              >
                <div className="font-bold text-ink-primary">{hoveredNode.name || 'Unknown Holder'}</div>
                <div className="text-[10px] text-ink-muted font-mono mt-0.5">{hoveredNode.account_id || hoveredNode.id}</div>
                <div className="border-t border-border-hairline my-1.5" />
                <div className="flex justify-between">
                  <span className="text-ink-muted">Bank:</span>
                  <span className="font-semibold text-ink-secondary truncate max-w-[80px]">{hoveredNode.bank || 'Unknown'}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-ink-muted">Risk Score:</span>
                  <span
                    className={`font-bold ${
                      hoveredNode.risk_tier === 'high'
                        ? 'text-risk-high'
                        : hoveredNode.risk_tier === 'medium'
                        ? 'text-risk-medium'
                        : 'text-risk-low'
                    }`}
                  >
                    {hoveredNode.composite_score.toFixed(0)}/100
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-ink-muted">Volume:</span>
                  <span className="font-bold text-ink-secondary font-data">
                    ₹{hoveredNode.volume.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            )}

            {/* Canvas bottom-left Legend overlay */}
            <div className="absolute bottom-3 left-3 bg-surface-raised/90 backdrop-blur-sm border border-border-hairline rounded-lg p-2.5 text-[10px] space-y-1.5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-risk-high" />
                  <span className="text-ink-secondary font-medium">High</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-risk-medium" />
                  <span className="text-ink-secondary font-medium">Medium</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-risk-low" />
                  <span className="text-ink-secondary font-medium">Low</span>
                </div>
              </div>
              <div className="h-px bg-border-hairline" />
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#10b981] inline-block" />
                  <span className="text-ink-muted">NEFT</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#3b82f6] inline-block" />
                  <span className="text-ink-muted">UPI</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#f97316] inline-block" />
                  <span className="text-ink-muted">RTGS</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t border-dashed border-[#ef4444] inline-block" />
                  <span className="text-ink-muted">Round-trip</span>
                </div>
              </div>
            </div>
          </div>

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
                <div className="font-semibold text-ink-primary text-xs uppercase tracking-wider mb-3">
                  Selected Details
                </div>
                {selected ? (
                  <div className="space-y-4">
                    {selected.type === 'node' ? (
                      <>
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Account Holder</div>
                          <div className="font-bold text-ink-primary text-sm">
                            {selected.data.name || 'Unknown Counterparty'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-ink-muted uppercase font-semibold">Account Number</div>
                          <div className="font-mono text-xs text-ink-secondary break-all">
                            <Link
                              to={`/cases/${caseId}/suspects/${selected.data.account_id || selected.data.id}`}
                              className="text-accent hover:underline hover:text-accent-hover font-bold transition-colors"
                            >
                              {selected.data.account_id || selected.data.id}
                            </Link>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-ink-muted uppercase font-semibold">Bank</div>
                            <div className="text-xs text-ink-secondary font-medium">
                              {selected.data.bank || 'Unknown Bank'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-ink-muted uppercase font-semibold">Type</div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-semibold inline-block ${
                                selected.data.is_primary
                                  ? 'bg-accent-subtle text-accent border border-accent/20'
                                  : 'bg-surface-sunken text-ink-secondary border border-border-hairline'
                              }`}
                            >
                              {selected.data.is_primary ? 'Primary Account' : 'Counterparty'}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-ink-muted uppercase font-semibold">Risk Score</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  selected.data.risk_tier === 'high'
                                    ? 'bg-risk-high'
                                    : selected.data.risk_tier === 'medium'
                                    ? 'bg-risk-medium'
                                    : 'bg-risk-low'
                                }`}
                              />
                              <span className="font-bold text-ink-primary text-xs font-data">
                                {(selected.data.composite_score || 0).toFixed(0)}/100
                              </span>
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
                            <span
                              className="font-mono text-[10px] text-ink-muted truncate max-w-[90px]"
                              title={typeof selected.data.source === 'object' ? selected.data.source.id : selected.data.source}
                            >
                              {typeof selected.data.source === 'object' ? selected.data.source.id : selected.data.source}
                            </span>
                            <span>➡️</span>
                            <span
                              className="font-mono text-[10px] text-ink-muted truncate max-w-[90px]"
                              title={typeof selected.data.target === 'object' ? selected.data.target.id : selected.data.target}
                            >
                              {typeof selected.data.target === 'object' ? selected.data.target.id : selected.data.target}
                            </span>
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
                            <div className="text-[10px] text-ink-muted uppercase font-semibold mb-1">
                              Sample Narrations
                            </div>
                            <ul className="space-y-1">
                              {selected.data.sample_narrations.map((nar, idx) => (
                                <li
                                  key={idx}
                                  className="text-[10px] bg-surface-sunken border border-border-hairline rounded p-1 text-ink-secondary break-words font-mono"
                                >
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
                  return (
                    <h4 key={idx} className="font-bold text-ink-primary mt-3 mb-1 text-sm">
                      {line.replace('###', '').trim()}
                    </h4>
                  );
                }
                if (line.startsWith('##')) {
                  return (
                    <h3 key={idx} className="font-bold text-ink-primary mt-4 mb-2 text-sm">
                      {line.replace('##', '').trim()}
                    </h3>
                  );
                }
                if (line.startsWith('#')) {
                  return (
                    <h2 key={idx} className="font-bold text-ink-primary mt-5 mb-2 text-base">
                      {line.replace('#', '').trim()}
                    </h2>
                  );
                }
                if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
                  return (
                    <li key={idx} className="ml-4 list-disc my-1">
                      {line.replace(/^[\s-*]+/, '').trim()}
                    </li>
                  );
                }
                if (line.trim()) {
                  return (
                    <p key={idx} className="my-1.5">
                      {line}
                    </p>
                  );
                }
                return <div key={idx} className="h-1" />;
              })}
            </div>
          </div>
        ) : (
          !aiLoading && (
            <div className="text-xs text-ink-muted text-center py-6 border border-dashed border-border-hairline rounded-lg bg-surface-raised">
              Click the button to generate an AI explanation of this transaction network, highlighting hubs, risk levels,
              and circular loops.
            </div>
          )
        )}
      </div>
    </div>
  );
}
