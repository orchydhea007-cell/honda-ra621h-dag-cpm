/**
 * visualizer.js
 * Canvas-based DAG Visualizer with pan/zoom
 * Honda RA621H Assembly Scheduling
 */

'use strict';

const DAGVisualizer = (() => {

  /* ── Config ── */
  const NODE_W     = 90;
  const NODE_H     = 32;
  const H_GAP      = 50;
  const V_GAP      = 18;
  const FONT_ID    = '700 9px "JetBrains Mono"';
  const FONT_NAME  = '300 8px "Barlow"';
  const RED        = '#E10600';
  const RED_DIM    = '#8B0000';
  const GOLD       = '#C9A84C';
  const BG_CARD    = '#111111';
  const BG_PANEL   = '#161616';
  const BORDER     = 'rgba(255,255,255,0.07)';
  const TEXT1      = '#F0F0F0';
  const TEXT2      = '#707070';

  /* ── Subsystem Color Map ── */
  const SUBSYSTEM_COLORS = {
    'ICE – Internal Combustion Engine': '#CC0000',
    'Turbocharger System':              '#E65100',
    'Hybrid – MGU-H':                  '#6A1B9A',
    'Hybrid – MGU-K':                  '#1565C0',
    'Energy Store (ES)':               '#2E7D32',
    'Lubrication System':              '#5D4037',
    'Cooling System':                  '#00695C',
    'Fuel System':                     '#F57F17',
    'Electronics & Control':           '#37474F',
    'Chassis & Monocoque':             '#424242',
    'Suspension – Front':              '#880E4F',
    'Suspension – Rear':               '#AD1457',
    'Aerodynamics – Front':            '#0277BD',
    'Aerodynamics – Rear':             '#01579B',
    'Gearbox & Drivetrain':            '#4A148C',
    'Braking System':                  '#B71C1C',
    'Wheels & Tyres':                  '#33691E',
    'Cockpit & Safety':                '#006064',
    'Final Assembly':                  '#212121',
  };

  /* ── State ── */
  let canvas, ctx;
  let _dag, _cpm, _critPath, _critSet;
  let positions = new Map();   // id → {x, y}
  let panX = 0, panY = 0, scale = 1;
  let isDragging = false, lastMX = 0, lastMY = 0;
  let hoveredNode = null;
  let onHover = null;

  /* ══════════════
     Layout: Layered (Sugiyama-lite)
     Assign each node a column = max depth from roots.
     ══════════════ */
  function computeLayout(dag, topoOrder) {
    const { nodes, adj, radj } = dag;
    const depth = new Map();

    // Forward depth assignment
    for (const id of topoOrder) {
      let d = 0;
      for (const pred of radj.get(id)) {
        d = Math.max(d, (depth.get(pred) ?? 0) + 1);
      }
      depth.set(id, d);
    }

    // Group by depth (column)
    const cols = new Map();
    for (const [id, d] of depth) {
      if (!cols.has(d)) cols.set(d, []);
      cols.get(d).push(id);
    }

    // Sort within each column by number of predecessors (barycenter heuristic)
    for (const [, ids] of cols) {
      ids.sort((a, b) => {
        const aAvg = [...radj.get(a)].reduce((s, p) => s + (depth.get(p) ?? 0), 0) / Math.max(radj.get(a).size, 1);
        const bAvg = [...radj.get(b)].reduce((s, p) => s + (depth.get(p) ?? 0), 0) / Math.max(radj.get(b).size, 1);
        return aAvg - bAvg;
      });
    }

    // Assign pixel positions
    const sortedCols = [...cols.entries()].sort((a, b) => a[0] - b[0]);
    positions = new Map();
    for (const [col, ids] of sortedCols) {
      const x = col * (NODE_W + H_GAP) + 20;
      ids.forEach((id, row) => {
        const y = row * (NODE_H + V_GAP) + 20;
        positions.set(id, { x, y });
      });
    }

    // Total canvas logical size
    let maxX = 0, maxY = 0;
    for (const { x, y } of positions.values()) {
      if (x + NODE_W > maxX) maxX = x + NODE_W;
      if (y + NODE_H > maxY) maxY = y + NODE_H;
    }
    return { maxX: maxX + 40, maxY: maxY + 40 };
  }

  /* ══════════════
     Draw Helpers
     ══════════════ */
  function drawArrow(x1, y1, x2, y2, color, width = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x1, y1);

    // Cubic bezier for curved edges
    const dx = (x2 - x1) * 0.4;
    ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const aLen  = 6;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - aLen * Math.cos(angle - 0.4), y2 - aLen * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - aLen * Math.cos(angle + 0.4), y2 - aLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawNode(id, pos, comp, isCrit, isOnPath, isHovered) {
    const { x, y } = pos;
    const color = SUBSYSTEM_COLORS[comp.subsystem] ?? '#555';
    const isFinal = id === 'C103';

    ctx.save();

    // Shadow for critical nodes
    if (isCrit || isHovered) {
      ctx.shadowColor = isCrit ? RED : '#ffffff';
      ctx.shadowBlur  = isHovered ? 12 : 6;
    }

    // Background
    ctx.fillStyle   = BG_CARD;
    ctx.strokeStyle = isOnPath ? RED : (isCrit ? RED_DIM : BORDER);
    ctx.lineWidth   = isOnPath ? 1.5 : (isCrit ? 1 : 0.5);
    roundRect(ctx, x, y, NODE_W, NODE_H, 3);
    ctx.fill();
    ctx.stroke();

    // Left accent bar
    ctx.fillStyle = color;
    roundRect(ctx, x, y, 3, NODE_H, [3, 0, 0, 3]);
    ctx.fill();

    // Top highlight for final node
    if (isFinal) {
      ctx.fillStyle = GOLD;
      roundRect(ctx, x + 3, y, NODE_W - 3, 2, [0, 3, 0, 0]);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // ID label
    ctx.font        = FONT_ID;
    ctx.fillStyle   = isCrit ? RED : TEXT2;
    ctx.textAlign   = 'left';
    ctx.fillText(id, x + 8, y + 13);

    // Name label (truncated)
    const maxChars = 10;
    const shortName = comp.name.length > maxChars
      ? comp.name.slice(0, maxChars) + '…'
      : comp.name;
    ctx.font      = FONT_NAME;
    ctx.fillStyle = isHovered ? TEXT1 : TEXT2;
    ctx.fillText(shortName, x + 8, y + 24);

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r = 3) {
    if (typeof r === 'number') r = [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + r[0], y);
    ctx.lineTo(x + w - r[1], y);
    ctx.arcTo(x + w, y, x + w, y + r[1], r[1]);
    ctx.lineTo(x + w, y + h - r[2]);
    ctx.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
    ctx.lineTo(x + r[3], y + h);
    ctx.arcTo(x, y + h, x, y + h - r[3], r[3]);
    ctx.lineTo(x, y + r[0]);
    ctx.arcTo(x, y, x + r[0], y, r[0]);
    ctx.closePath();
  }

  /* ══════════════
     Main Render
     ══════════════ */
  function render() {
    if (!ctx || !_dag) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0E0E0E';
    ctx.fillRect(0, 0, W, H);

    // Grid dots
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    const gStep = 30 * scale;
    for (let gx = (panX % gStep); gx < W; gx += gStep) {
      for (let gy = (panY % gStep); gy < H; gy += gStep) {
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    const { adj } = _dag;

    // ── Draw Edges ──
    for (const [fromId, succs] of adj) {
      const fromPos = positions.get(fromId);
      if (!fromPos) continue;
      for (const toId of succs) {
        const toPos = positions.get(toId);
        if (!toPos) continue;

        const isPathEdge = _critSet.has(fromId) && _critSet.has(toId);
        const color = isPathEdge ? RED : 'rgba(255,255,255,0.12)';
        const width = isPathEdge ? 1.5 : 0.7;

        // Connect right-center of from to left-center of to
        drawArrow(
          fromPos.x + NODE_W, fromPos.y + NODE_H / 2,
          toPos.x,            toPos.y + NODE_H / 2,
          color, width
        );
      }
    }

    // ── Draw Nodes ──
    for (const [id, pos] of positions) {
      const comp     = _dag.nodes.get(id);
      const cpmData  = _cpm.get(id);
      const isCrit   = cpmData?.critical ?? false;
      const isOnPath = _critSet.has(id);
      const isHov    = hoveredNode === id;
      drawNode(id, pos, comp, isCrit, isOnPath, isHov);
    }

    ctx.restore();
  }

  /* ══════════════
     Hit Testing
     ══════════════ */
  function hitTest(mx, my) {
    const lx = (mx - panX) / scale;
    const ly = (my - panY) / scale;
    for (const [id, pos] of positions) {
      if (lx >= pos.x && lx <= pos.x + NODE_W &&
          ly >= pos.y && ly <= pos.y + NODE_H) {
        return id;
      }
    }
    return null;
  }

  /* ══════════════
     Pan / Zoom
     ══════════════ */
  function initInteraction() {
    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      lastMX = e.clientX;
      lastMY = e.clientY;
    });

    window.addEventListener('mousemove', e => {
      if (isDragging) {
        panX += e.clientX - lastMX;
        panY += e.clientY - lastMY;
        lastMX = e.clientX;
        lastMY = e.clientY;
        render();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const hit  = hitTest(mx, my);

      if (hit !== hoveredNode) {
        hoveredNode = hit;
        render();
        if (onHover) onHover(hit ? _dag.nodes.get(hit) : null, _cpm.get(hit) ?? null, e);
      }
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta  = e.deltaY < 0 ? 1.12 : 0.89;
      const rect   = canvas.getBoundingClientRect();
      const mx     = e.clientX - rect.left;
      const my     = e.clientY - rect.top;
      panX = mx - (mx - panX) * delta;
      panY = my - (my - panY) * delta;
      scale *= delta;
      scale = Math.min(Math.max(scale, 0.08), 3);
      render();
    }, { passive: false });

    // Touch support
    let lastTouchDist = null;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMX = e.touches[0].clientX;
        lastMY = e.touches[0].clientY;
      }
    });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        panX += e.touches[0].clientX - lastMX;
        panY += e.touches[0].clientY - lastMY;
        lastMX = e.touches[0].clientX;
        lastMY = e.touches[0].clientY;
        render();
      } else if (e.touches.length === 2) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastTouchDist !== null) {
          const delta = dist / lastTouchDist;
          scale *= delta;
          scale = Math.min(Math.max(scale, 0.08), 3);
          render();
        }
        lastTouchDist = dist;
      }
    }, { passive: false });
    canvas.addEventListener('touchend', () => {
      isDragging = false;
      lastTouchDist = null;
    });
  }

  /* ══════════════
     Public API
     ══════════════ */
  function init(canvasEl, { dag, cpm, criticalPath }, hoverCallback) {
    canvas  = canvasEl;
    ctx     = canvas.getContext('2d');
    _dag    = dag;
    _cpm    = cpm;
    _critPath = criticalPath;
    _critSet  = new Set(criticalPath);
    onHover   = hoverCallback;

    // Responsive canvas size
    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width  = rect.width;
      canvas.height = Math.max(500, window.innerHeight * 0.6);
      render();
    }
    window.addEventListener('resize', resize);

    const { maxX, maxY } = computeLayout(dag, [...dag.nodes.keys()]);

    // Fit to view initially
    resize();
    const fitScale = Math.min(
      (canvas.width  - 40) / maxX,
      (canvas.height - 40) / maxY,
      1
    );
    scale = fitScale;
    panX  = 20;
    panY  = 20;

    initInteraction();
    render();
  }

  function zoomIn()  { scale = Math.min(scale * 1.25, 3); render(); }
  function zoomOut() { scale = Math.max(scale * 0.8, 0.06); render(); }
  function resetView() {
    scale = 0.18; panX = 20; panY = 20; render();
  }
  function fitView() {
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const { x, y } of positions.values()) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + NODE_W > maxX) maxX = x + NODE_W;
      if (y + NODE_H > maxY) maxY = y + NODE_H;
    }
    const W = canvas.width, H = canvas.height;
    scale = Math.min((W - 40) / (maxX - minX), (H - 40) / (maxY - minY), 1);
    panX  = -minX * scale + 20;
    panY  = -minY * scale + 20;
    render();
  }

  function highlightNode(id) {
    if (!positions.has(id)) return;
    const pos = positions.get(id);
    panX = canvas.width  / 2 - (pos.x + NODE_W / 2) * scale;
    panY = canvas.height / 2 - (pos.y + NODE_H / 2) * scale;
    hoveredNode = id;
    render();
  }

  return { init, zoomIn, zoomOut, resetView, fitView, highlightNode, render };
})();

window.DAGVisualizer = DAGVisualizer;
