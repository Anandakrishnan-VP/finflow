import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { apiClient } from '../api/client';
import SankeyFlowView from './SankeyFlowView';
import PatternInsightsPanel from './PatternInsightsPanel';
import { useTheme } from '../contexts/ThemeContext';

function riskTier(score) {
  if (score >= 65) return 'high';
  if (score >= 33) return 'medium';
  return 'low';
}

function formatAmount(amt) {
  if (!amt || isNaN(amt)) return '₹0';
  if (amt >= 10000000) return `₹${(amt / 10000000).toFixed(2)} Cr`;
  if (amt >= 100000) return `₹${(amt / 100000).toFixed(2)} L`;
  return `₹${amt.toLocaleString('en-IN')}`;
}

export default function GraphView({ caseId }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { theme } = useTheme();

  // Core Data States
  const [raw, setRaw] = useState(null);
  const [view, setView] = useState('network'); // 'network' | 'sankey'
  const [layoutMode, setLayoutMode] = useState('concentric'); // 'concentric' | 'rank_physics' | 'force'
  const [riskFilter, setRiskFilter] = useState('suspects'); // 'suspects' | 'high' | 'all'
  const [minAmount, setMinAmount] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 650 });
  const [loading, setLoading] = useState(true);

  // Transform States (Pan & Zoom)
  const transformRef = useRef({ k: 1, x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef(null);

  // Particle Animation State
  const particlesRef = useRef([]);
  const animFrameRef = useRef(null);

  const [patternMembership, setPatternMembership] = useState({
    circular: { nodeIds: new Set(), edgeIds: new Set() },
    layering: { nodeIds: new Set(), edgeIds: new Set() },
    fan_out: { nodeIds: new Set(), edgeIds: new Set() },
    fan_in: { nodeIds: new Set(), edgeIds: new Set() },
    nodeIds: new Set(),
    edgeIds: new Set(),
  });
  const [focusedPattern, setFocusedPattern] = useState(null);

  // AI Insights State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');

  // Update Canvas Container Dimensions & Center Origin
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || 800;
        const h = containerRef.current.clientHeight || 650;
        setDimensions({ width: w, height: h });
        transformRef.current = { k: 1, x: w / 2, y: h / 2 };
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Fetch Graph Data
  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get(`/cases/${caseId}/graph`, { params: { min_amount: minAmount, node_limit: 250 } })
      .then((r) => {
        setRaw(r.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Graph fetch error:", err);
        setLoading(false);
      });
  }, [caseId, minAmount]);

  useEffect(() => {
    load();
  }, [load]);

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

      if (data.fan_out) {
        data.fan_out.forEach((p) => {
          fan_out.nodeIds.add(p.hub);
          nodeIds.add(p.hub);
          p.targets.forEach((t) => {
            fan_out.nodeIds.add(t);
            nodeIds.add(t);
            addEdge(fan_out, p.hub, t);
          });
        });
      }

      if (data.fan_in) {
        data.fan_in.forEach((p) => {
          fan_in.nodeIds.add(p.hub);
          nodeIds.add(p.hub);
          p.sources.forEach((s) => {
            fan_in.nodeIds.add(s);
            nodeIds.add(s);
            addEdge(fan_in, s, p.hub);
          });
        });
      }

      if (data.circular_flows) {
        data.circular_flows.forEach((p) => {
          p.path.forEach((a) => {
            circular.nodeIds.add(a);
            nodeIds.add(a);
          });
          p.hops.forEach((h) => {
            addEdge(circular, h.from, h.to);
          });
        });
      }

      if (data.layering_chains) {
        data.layering_chains.forEach((p) => {
          p.path.forEach((a) => {
            layering.nodeIds.add(a);
            nodeIds.add(a);
          });
          for (let i = 0; i < p.path.length - 1; i++) {
            addEdge(layering, p.path[i], p.path[i + 1]);
          }
        });
      }

      setPatternMembership({ circular, layering, fan_out, fan_in, nodeIds, edgeIds });
    }).catch((e) => console.error("Patterns fetch error:", e));
  }, [caseId]);

  // AI Graph Explainer
  const generateAiInsights = async () => {
    setAiLoading(true);
    try {
      const response = await apiClient.post(`/cases/${caseId}/graph/explain`);
      setAiExplanation(response.data.explanation);
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  // Process Nodes & Links
  const graphData = useMemo(() => {
    if (!raw || !raw.nodes || !raw.edges) return { nodes: [], links: [] };

    const nodesMap = new Map();
    raw.nodes.forEach((n) => {
      const nd = n.data || n;
      let pattern_type = 'none';
      if (patternMembership.circular?.nodeIds?.has(nd.id)) pattern_type = 'circular';
      else if (patternMembership.layering?.nodeIds?.has(nd.id)) pattern_type = 'layering';
      else if (patternMembership.fan_out?.nodeIds?.has(nd.id)) pattern_type = 'fan_out';
      else if (patternMembership.fan_in?.nodeIds?.has(nd.id)) pattern_type = 'fan_in';

      const score = Number(nd.composite_score) || 0;
      const calculatedRadius = Math.max(8, Math.min(22, 7 + (score / 100) * 15));
      const radius = nd.is_primary ? 22 : calculatedRadius;

      let tier = nd.agreement_tier || (score >= 65 ? 'HIGH' : score >= 33 ? 'MEDIUM' : 'LOW');
      let color = '#475569'; // Neutral Slate (LOW)
      if (tier === 'HIGH' || score >= 65 || pattern_type !== 'none') {
        color = '#ef4444'; // Neon Red (HIGH)
      } else if (tier === 'MEDIUM' || score >= 33) {
        color = '#f59e0b'; // Amber (MEDIUM)
      } else if (String(nd.id).toLowerCase().includes('upi') || String(nd.name).toLowerCase().includes('upi')) {
        color = '#00f2fe'; // Cyan Digital Wallet
      }

      const nodeObj = {
        ...nd,
        id: nd.id || nd.account_id,
        name: nd.name || nd.account_holder || nd.id || nd.account_id,
        bank: nd.bank_name || nd.bank || 'Bank Account',
        score,
        tier,
        color,
        pattern_type,
        inflow: nd.inflow || nd.total_credit || 0,
        outflow: nd.outflow || nd.total_debit || 0,
        radius,
        x: (Math.random() - 0.5) * 400,
        y: (Math.random() - 0.5) * 400,
      };
      nodesMap.set(nodeObj.id, nodeObj);
    });

    const links = [];
    raw.edges.forEach((e) => {
      const ed = e.data || e;
      const sId = ed.source;
      const tId = ed.target;
      if (nodesMap.has(sId) && nodesMap.has(tId)) {
        let pattern_type = 'none';
        const key = `${sId}__${tId}`;
        if (patternMembership.circular?.edgeIds?.has(key)) pattern_type = 'circular';
        else if (patternMembership.layering?.edgeIds?.has(key)) pattern_type = 'layering';
        else if (patternMembership.fan_out?.edgeIds?.has(key)) pattern_type = 'fan_out';
        else if (patternMembership.fan_in?.edgeIds?.has(key)) pattern_type = 'fan_in';

        const total_amount = Number(ed.total_amount) || 0;
        const width = Math.max(1.5, Math.min(5.5, Math.log10(total_amount || 1)));

        links.push({
          ...ed,
          source: nodesMap.get(sId),
          target: nodesMap.get(tId),
          total_amount,
          txn_count: ed.txn_count || 1,
          pattern_type,
          width,
        });
      }
    });

    // Dynamically sum inflow and outflow for each node from actual transaction links
    links.forEach((l) => {
      const amt = Number(l.total_amount) || 0;
      if (l.source && typeof l.source === 'object') {
        l.source.outflow = (l.source.outflow || 0) + amt;
      }
      if (l.target && typeof l.target === 'object') {
        l.target.inflow = (l.target.inflow || 0) + amt;
      }
    });

    let filteredNodes = Array.from(nodesMap.values());

    // Pattern Card Focus Filter
    if (focusedPattern && focusedPattern.data) {
      const pData = focusedPattern.data;
      const patternNodeIds = new Set();
      if (pData.hub) patternNodeIds.add(pData.hub);
      if (pData.targets) pData.targets.forEach((t) => patternNodeIds.add(t));
      if (pData.sources) pData.sources.forEach((s) => patternNodeIds.add(s));
      if (pData.path) pData.path.forEach((p) => patternNodeIds.add(p));

      filteredNodes = filteredNodes.filter((n) => patternNodeIds.has(n.id) || patternNodeIds.has(n.account_id));
    } else if (riskFilter === 'suspects') {
      // DEFAULT POLICE FORENSIC MODE: Primary Target, Fraud Pattern Entities, & Top Suspect Hubs
      let priorityNodes = filteredNodes.filter(
        (n) => n.is_primary || n.pattern_type !== 'none' || n.score >= 60 || (n.inflow + n.outflow) >= 250000
      );
      if (priorityNodes.length > 18) {
        const primary = priorityNodes.find((n) => n.is_primary);
        const nonPrimary = priorityNodes.filter((n) => !n.is_primary);
        nonPrimary.sort((a, b) => b.score - a.score);
        priorityNodes = [primary, ...nonPrimary.slice(0, 17)].filter(Boolean);
      }
      filteredNodes = priorityNodes;
    } else if (riskFilter === 'high') {
      filteredNodes = filteredNodes.filter((n) => n.is_primary || n.score >= 65);
    }

    let filteredLinks = links;
    if (minAmount > 0) {
      filteredLinks = links.filter((l) => l.total_amount >= minAmount);
    }

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
    filteredLinks = filteredLinks.filter((l) => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      return visibleNodeIds.has(sId) && visibleNodeIds.has(tId);
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }, [raw, patternMembership, riskFilter, minAmount, focusedPattern]);

  // MULTI-ISLAND SUBGRAPH CLUSTERING & CONCENTRIC & FORCE LAYOUT CALCULATIONS
  const simulationRef = useRef(null);
  const islandsRef = useRef([]);

  useEffect(() => {
    if (!graphData.nodes.length) return;

    // 1. Calculate Connected Subgraph Components (Islands)
    const adjMap = new Map();
    graphData.nodes.forEach((n) => adjMap.set(n.id, new Set()));

    graphData.links.forEach((l) => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      if (adjMap.has(sId) && adjMap.has(tId)) {
        adjMap.get(sId).add(tId);
        adjMap.get(tId).add(sId);
      }
    });

    const visited = new Set();
    const components = [];

    graphData.nodes.forEach((node) => {
      if (!visited.has(node.id)) {
        const comp = [];
        const queue = [node.id];
        visited.add(node.id);

        while (queue.length > 0) {
          const currId = queue.shift();
          const currNode = graphData.nodes.find((n) => n.id === currId);
          if (currNode) comp.push(currNode);

          const neighbors = adjMap.get(currId) || new Set();
          neighbors.forEach((neighId) => {
            if (!visited.has(neighId)) {
              visited.add(neighId);
              queue.push(neighId);
            }
          });
        }
        components.push(comp);
      }
    });

    // Primary Island contains the Primary Target
    components.sort((a, b) => {
      const aHasPrimary = a.some((n) => n.is_primary);
      const bHasPrimary = b.some((n) => n.is_primary);
      if (aHasPrimary) return -1;
      if (bHasPrimary) return 1;
      return b.length - a.length;
    });

    islandsRef.current = components.map((comp, idx) => ({
      id: idx,
      isPrimary: comp.some((n) => n.is_primary),
      nodeCount: comp.length,
      hasLinks: comp.some((n) => adjMap.get(n.id).size > 0),
    }));

    if (layoutMode === 'concentric') {
      // Primary Island (Center Orbit)
      const primaryComp = components[0] || [];
      const secondaryComps = components.slice(1);

      const primaryNode = primaryComp.find((n) => n.is_primary) || primaryComp[0];
      if (primaryNode) {
        primaryNode.fx = 0;
        primaryNode.fy = 0;
        primaryNode.x = 0;
        primaryNode.y = 0;
      }

      const connectedToPrimary = primaryComp.filter((n) => n !== primaryNode && adjMap.get(n.id).size > 0);
      const disconnectedInPrimary = primaryComp.filter((n) => n !== primaryNode && adjMap.get(n.id).size === 0);

      // Place connected nodes in a clean 360-degree orbit around Primary Target
      connectedToPrimary.forEach((node, index) => {
        const radius = node.score >= 65 ? 170 : 220;
        const angle = (index / Math.max(1, connectedToPrimary.length)) * 2 * Math.PI - Math.PI / 2;
        node.fx = radius * Math.cos(angle);
        node.fy = radius * Math.sin(angle);
        node.x = node.fx;
        node.y = node.fy;
      });

      // Place disconnected nodes in a separate "Island #2" cluster orbit offset to the side
      const allSecondaryNodes = [...disconnectedInPrimary];
      secondaryComps.forEach((comp) => allSecondaryNodes.push(...comp));

      allSecondaryNodes.forEach((node, index) => {
        const islandCenterX = 380;
        const islandCenterY = -120;
        const radius = Math.min(160, 60 + Math.floor(index / 8) * 45);
        const angle = (index / Math.max(1, allSecondaryNodes.length)) * 2 * Math.PI;
        node.fx = islandCenterX + radius * Math.cos(angle);
        node.fy = islandCenterY + radius * Math.sin(angle);
        node.x = node.fx;
        node.y = node.fy;
      });
    } else if (layoutMode === 'rank_physics') {
      const simulation = d3
        .forceSimulation(graphData.nodes)
        .force(
          'link',
          d3.forceLink(graphData.links).id((d) => d.id).distance(150).strength(0.3)
        )
        .force('charge', d3.forceManyBody().strength(-650))
        .force(
          'y',
          d3.forceY().y((d) => {
            if (d.is_primary) return 0;
            if (d.pattern_type === 'circular' || d.pattern_type === 'layering') return 240;
            if (d.score >= 65) return -20;
            if (d.inflow > d.outflow) return -180;
            return 170;
          }).strength(0.6)
        )
        .force('x', d3.forceX(0).strength(0.08))
        .force(
          'collision',
          d3.forceCollide().radius((d) => d.radius + 36).iterations(3)
        )
        .alphaDecay(0.035);

      simulation.on('end', () => {
        graphData.nodes.forEach((n) => {
          n.fx = n.x;
          n.fy = n.y;
        });
      });

      simulationRef.current = simulation;
    } else {
      graphData.nodes.forEach((n) => {
        if (!n.is_primary) {
          n.fx = null;
          n.fy = null;
        }
      });

      const simulation = d3
        .forceSimulation(graphData.nodes)
        .force('link', d3.forceLink(graphData.links).id((d) => d.id).distance(200))
        .force('charge', d3.forceManyBody().strength(-900))
        .force('center', d3.forceCenter(0, 0))
        .force('collision', d3.forceCollide().radius((d) => d.radius + 36))
        .alphaDecay(0.04);

      simulation.on('end', () => {
        graphData.nodes.forEach((n) => {
          n.fx = n.x;
          n.fy = n.y;
        });
      });

      simulationRef.current = simulation;
    }

    // Dynamic Money Particle Throttling
    const sortedLinks = [...graphData.links].sort((a, b) => b.total_amount - a.total_amount).slice(0, 60);
    particlesRef.current = sortedLinks.map((link) => ({
      link,
      progress: Math.random(),
      speed: 0.003 + (link.total_amount > 100000 ? 0.005 : 0.002),
    }));

    return () => {
      if (simulationRef.current) simulationRef.current.stop();
    };
  }, [graphData, layoutMode]);

  // NON-PASSIVE Native Wheel Event Listener to STOP Page Scrolling Collision Completely
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      const currentK = transformRef.current.k;
      const newK = Math.max(0.2, Math.min(5, currentK * zoomFactor));

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * (newK / currentK);
      transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * (newK / currentK);
      transformRef.current.k = newK;
    };

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  // Main 60 FPS HTML5 Canvas Render Loop with Directed Line Arrows & Island Guides
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const { width, height } = dimensions;
      const { k, x, y } = transformRef.current;

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Dark Cyber Background
      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, width, height);

      // Draw Island Labels in Concentric Mode
      if (layoutMode === 'concentric' && islandsRef.current.length > 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        ctx.fillStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('🎯 PRIMARY TARGET NETWORK', -80, -250);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.fillText('🏝️ DISCONNECTED SUSPECT ISLAND #2', 260, -250);
        ctx.restore();
      }

      // Apply Pan & Zoom Transform
      ctx.translate(x, y);
      ctx.scale(k, k);

      // 1. Draw Links with Pattern Lines & Directed Arrowheads
      graphData.links.forEach((link) => {
        const source = link.source;
        const target = link.target;
        if (!source || !target || isNaN(source.x) || isNaN(target.x)) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (link.pattern_type === 'circular') {
          ctx.strokeStyle = '#ef4444'; // Red
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = Math.max(2, link.width);
        } else if (link.pattern_type === 'layering') {
          ctx.strokeStyle = '#f59e0b'; // Amber
          ctx.setLineDash([8, 3, 2, 3]);
          ctx.lineWidth = Math.max(2, link.width);
        } else if (link.pattern_type === 'fan_out') {
          ctx.strokeStyle = '#06b6d4'; // Cyan
          ctx.setLineDash([]);
          ctx.lineWidth = Math.max(2.5, link.width);
        } else if (link.pattern_type === 'fan_in') {
          ctx.strokeStyle = '#3b82f6'; // Blue
          ctx.setLineDash([]);
          ctx.lineWidth = Math.max(1.8, link.width);
        } else {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
          ctx.setLineDash([]);
          ctx.lineWidth = link.width;
        }

        ctx.stroke();

        // 🏹 DRAW CRISP DIRECTED ARROWHEAD pointing towards target node
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowLength = 9 + link.width;
        const arrowX = target.x - (target.radius + 3) * Math.cos(angle);
        const arrowY = target.y - (target.radius + 3) * Math.sin(angle);

        ctx.fillStyle = ctx.strokeStyle;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      });

      // 2. Draw Animated Money Trail Particles
      particlesRef.current.forEach((p) => {
        const { link, progress } = p;
        const source = link.source;
        const target = link.target;
        if (!source || !target || isNaN(source.x) || isNaN(target.x)) return;

        p.progress = (progress + p.speed) % 1;
        const px = source.x + (target.x - source.x) * p.progress;
        const py = source.y + (target.y - source.y) * p.progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00f2fe';
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      });

      // 3. Draw Nodes with Scaled Radius & 3-Tier Colors
      graphData.nodes.forEach((node) => {
        if (isNaN(node.x) || isNaN(node.y)) return;

        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const color = node.color;

        ctx.save();

        // Node Glow Halo
        if (isSelected || isHovered || node.is_primary) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = color + '40';
          ctx.fill();
        }

        // Main Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected ? 16 : (node.score >= 65 ? 10 : 4);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ffffff' : '#05070a';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Smart Level-of-Detail Text Labels
        const showLabel = node.is_primary || node.score >= 65 || isSelected || isHovered || k >= 0.9;
        if (showLabel) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `${isSelected || node.is_primary ? 'bold 12px' : '10px'} Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.shadowBlur = 0;
          const labelName = node.name.length > 18 ? node.name.substring(0, 16) + '..' : node.name;
          ctx.fillText(labelName, node.x, node.y + node.radius + 14);
        }

        ctx.restore();
      });

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [dimensions, graphData, selectedNode, hoveredNode, layoutMode]);

  // Coordinate Conversion Helper: Screen to World
  const screenToWorld = useCallback((screenX, screenY) => {
    const { k, x, y } = transformRef.current;
    return {
      x: (screenX - x) / k,
      y: (screenY - y) / k,
    };
  }, []);

  // Find Node at Screen Coordinates
  const findNodeAt = useCallback(
    (screenX, screenY) => {
      const worldPos = screenToWorld(screenX, screenY);
      return graphData.nodes.find((n) => {
        const dx = n.x - worldPos.x;
        const dy = n.y - worldPos.y;
        return Math.sqrt(dx * dx + dy * dy) <= n.radius + 6;
      });
    },
    [graphData.nodes, screenToWorld]
  );

  // Mouse Drag Handlers
  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const clickedNode = findNodeAt(mouseX, mouseY);
    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      clickedNode.fx = clickedNode.x;
      clickedNode.fy = clickedNode.y;
      setSelectedNode(clickedNode);
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: mouseX - transformRef.current.x, y: mouseY - transformRef.current.y };
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      const worldPos = screenToWorld(mouseX, mouseY);
      draggedNodeRef.current.x = worldPos.x;
      draggedNodeRef.current.y = worldPos.y;
      draggedNodeRef.current.fx = worldPos.x;
      draggedNodeRef.current.fy = worldPos.y;
    } else if (isDraggingRef.current) {
      transformRef.current.x = mouseX - dragStartRef.current.x;
      transformRef.current.y = mouseY - dragStartRef.current.y;
    }
  };

  const handleMouseUp = () => {
    if (draggedNodeRef.current) {
      draggedNodeRef.current.fx = draggedNodeRef.current.x;
      draggedNodeRef.current.fy = draggedNodeRef.current.y;
      draggedNodeRef.current = null;
    }
    isDraggingRef.current = false;
  };

  // Center Camera View
  const centerCamera = () => {
    const { width, height } = dimensions;
    transformRef.current = { k: 1, x: width / 2, y: height / 2 };
  };

  // Search & Camera Focus
  const handleSearch = (query) => {
    setSearch(query);
    if (!query.trim() || !graphData.nodes.length) return;
    const q = query.toLowerCase();
    const match = graphData.nodes.find(
      (n) =>
        (n.id && String(n.id).toLowerCase().includes(q)) ||
        (n.name && String(n.name).toLowerCase().includes(q)) ||
        (n.account_id && String(n.account_id).toLowerCase().includes(q))
    );
    if (match) {
      setSelectedNode(match);
      const { width, height } = dimensions;
      transformRef.current = {
        k: 1.8,
        x: width / 2 - match.x * 1.8,
        y: height / 2 - match.y * 1.8,
      };
    }
  };

  // Connected Counter-Parties
  const connectedInfo = useMemo(() => {
    if (!selectedNode || !graphData.links.length) return { inflowNodes: [], outflowNodes: [] };
    const selId = selectedNode.id;
    const inflowNodes = [];
    const outflowNodes = [];

    graphData.links.forEach((l) => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;

      if (tId === selId) {
        const sNode = graphData.nodes.find((n) => n.id === sId);
        if (sNode) inflowNodes.push({ node: sNode, amount: l.total_amount });
      }
      if (sId === selId) {
        const tNode = graphData.nodes.find((n) => n.id === tId);
        if (tNode) outflowNodes.push({ node: tNode, amount: l.total_amount });
      }
    });

    return { inflowNodes, outflowNodes };
  }, [selectedNode, graphData]);

  return (
    <div className="space-y-4">
      <PatternInsightsPanel caseId={caseId} onFocusPattern={setFocusedPattern} focusedKey={focusedPattern?.key} />

      <div className="bg-white dark:bg-[#0c1017] p-4 rounded-xl border border-gray-200 dark:border-cyan-500/20 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* View & Layout Switcher */}
            <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex gap-1 border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setLayoutMode('concentric');
                  setView('network');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  view === 'network' && layoutMode === 'concentric'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                🎯 Concentric Risk Rings
              </button>
              <button
                onClick={() => {
                  setLayoutMode('rank_physics');
                  setView('network');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  view === 'network' && layoutMode === 'rank_physics'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                ⚡ Organic Rank Physics
              </button>
              <button
                onClick={() => {
                  setLayoutMode('force');
                  setView('network');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  view === 'network' && layoutMode === 'force'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                🌀 Dynamic Physics Force
              </button>
              <button
                onClick={() => setView('sankey')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  view === 'sankey'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                📊 Cash Flow Sankey
              </button>
            </div>

            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold"
            >
              <option value="suspects">🚨 Suspects & Fraud Patterns Only ({graphData.nodes.length} nodes)</option>
              <option value="high">🔥 Severe High Risk Only (Score 65+)</option>
              <option value="all">🌐 Show All Accounts (Include Background Noise)</option>
            </select>

            <button
              onClick={centerCamera}
              className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-cyan-500 transition-all font-medium"
            >
              🎯 Center Canvas
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search Account / UPI / Name..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded-lg pl-8 pr-3 py-1.5 w-64 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
            </div>

            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Min Amount:</span>
              <input
                type="range"
                min="0"
                max="500000"
                step="10000"
                value={minAmount}
                onChange={(e) => setMinAmount(Number(e.target.value))}
                className="w-24 accent-cyan-500 cursor-pointer"
              />
              <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 font-bold">{formatAmount(minAmount)}</span>
            </div>

            <button
              onClick={generateAiInsights}
              disabled={aiLoading}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {aiLoading ? '🤖 Analyzing...' : '🤖 AI Graph Explainer'}
            </button>
          </div>
        </div>
      </div>

      {aiExplanation && (
        <div className="bg-indigo-950/80 border border-indigo-500/30 p-4 rounded-xl text-indigo-100 text-sm leading-relaxed shadow-xl relative">
          <button
            onClick={() => setAiExplanation('')}
            className="absolute top-3 right-3 text-indigo-300 hover:text-white text-xs bg-indigo-900/50 px-2 py-1 rounded"
          >
            ✕ Close
          </button>
          <div className="font-bold text-indigo-300 mb-1 flex items-center gap-2">
            <span>🤖 AI Financial Intelligence Breakdown</span>
          </div>
          <p className="whitespace-pre-wrap text-xs text-indigo-200">{aiExplanation}</p>
        </div>
      )}

      {view === 'sankey' ? (
        <SankeyFlowView caseId={caseId} minAmount={minAmount} />
      ) : (
        <div ref={containerRef} className="relative w-full h-[650px] bg-[#05070a] rounded-2xl border border-cyan-500/30 shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none">
          {loading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#05070a]/80 backdrop-blur-sm text-cyan-400 font-mono text-sm">
              🌌 Loading Cyber-Graph Nodes & Transactions...
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="w-full h-full block touch-none"
          />

          {/* 2D Graph Legend Overlay */}
          <div className="absolute bottom-4 left-4 bg-[#0c1017]/90 backdrop-blur-md p-3.5 rounded-xl border border-cyan-500/30 text-xs text-gray-300 space-y-2 shadow-xl select-none z-20">
            <div className="font-bold text-cyan-400 text-[11px] uppercase tracking-wider">3-Tier Risk & Pattern Legend</div>
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-[#ef4444] shadow-[0_0_8px_#ef4444]"></span> High Risk Suspect (Score 65+)</div>
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_#f59e0b]"></span> Medium Risk Account (Score 33-64)</div>
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-[#475569]"></span> Low Risk Account (Score 0-32)</div>
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]"></span> Digital Wallet / UPI</div>
            <div className="pt-1 border-t border-gray-800 text-[10px] text-cyan-300 space-y-0.5">
              <div>🔴 Dashed Red Line: Circular Money Ring</div>
              <div>🟡 Dash-Dot Amber Line: Layering Chain</div>
              <div>🏹 Directed Arrowhead: Money Flow Vector</div>
            </div>
          </div>

          {/* RIGHT-SIDE SLIDE-OVER NODE INSPECTOR DRAWER */}
          {selectedNode && (
            <div className="absolute top-0 right-0 w-96 h-full bg-[#0c1017]/95 backdrop-blur-xl border-l border-cyan-500/30 shadow-2xl p-6 overflow-y-auto space-y-5 z-40 text-gray-100">
              <div className="flex items-start justify-between border-b border-gray-800 pb-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">Node Inspector</span>
                  <h3 className="text-base font-bold text-white truncate max-w-[220px]">{selectedNode.name}</h3>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedNode.account_id || selectedNode.id}</p>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-all text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="flex items-center justify-between bg-gray-900/80 p-3 rounded-xl border border-gray-800">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Bank Name</span>
                  <p className="text-xs font-semibold text-cyan-300">{selectedNode.bank}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Risk Rating</span>
                  <div>
                    <span
                      className={`inline-block px-2.5 py-0.5 text-[11px] font-bold rounded-full uppercase shadow-md ${
                        selectedNode.score >= 65
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                          : selectedNode.score >= 33
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                          : 'bg-slate-500/20 text-slate-400 border border-slate-500/40'
                      }`}
                    >
                      {riskTier(selectedNode.score)} ({selectedNode.score}/100)
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold">Total Inflow (Credit)</span>
                  <p className="text-sm font-extrabold text-emerald-300 mt-1">{formatAmount(selectedNode.inflow)}</p>
                </div>
                <div className="bg-rose-950/30 p-3 rounded-xl border border-rose-500/30">
                  <span className="text-[10px] text-rose-400 uppercase font-semibold">Total Outflow (Debit)</span>
                  <p className="text-sm font-extrabold text-rose-300 mt-1">{formatAmount(selectedNode.outflow)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Connected Counter-Parties</h4>

                {connectedInfo.inflowNodes.length > 0 && (
                  <div>
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">Incoming Money From ({connectedInfo.inflowNodes.length})</span>
                    <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
                      {connectedInfo.inflowNodes.map(({ node, amount }, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedNode(node);
                            const { width, height } = dimensions;
                            transformRef.current = {
                              k: 1.8,
                              x: width / 2 - node.x * 1.8,
                              y: height / 2 - node.y * 1.8,
                            };
                          }}
                          className="flex items-center justify-between p-2 rounded-lg bg-gray-900/60 hover:bg-gray-800 cursor-pointer border border-gray-800/80 transition-all text-xs"
                        >
                          <span className="text-gray-200 font-medium truncate max-w-[150px]">{node.name}</span>
                          <span className="text-emerald-400 font-bold font-mono">{formatAmount(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {connectedInfo.outflowNodes.length > 0 && (
                  <div className="mt-3">
                    <span className="text-[10px] text-rose-400 font-semibold uppercase">Outgoing Money To ({connectedInfo.outflowNodes.length})</span>
                    <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
                      {connectedInfo.outflowNodes.map(({ node, amount }, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedNode(node);
                            const { width, height } = dimensions;
                            transformRef.current = {
                              k: 1.8,
                              x: width / 2 - node.x * 1.8,
                              y: height / 2 - node.y * 1.8,
                            };
                          }}
                          className="flex items-center justify-between p-2 rounded-lg bg-gray-900/60 hover:bg-gray-800 cursor-pointer border border-gray-800/80 transition-all text-xs"
                        >
                          <span className="text-gray-200 font-medium truncate max-w-[150px]">{node.name}</span>
                          <span className="text-rose-400 font-bold font-mono">{formatAmount(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
