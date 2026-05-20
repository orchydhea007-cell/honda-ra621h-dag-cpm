/**
 * main.js
 * UI Controller – Honda RA621H DAG & CPM Visualizer
 * Orchestrates: data loading → algorithm → rendering → interaction
 */

'use strict';

/* ══════════════════════════════════════
   SUBSYSTEM COLOR MAP
   ══════════════════════════════════════ */
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

/* ══════════════════════════════════════
   APP STATE
   ══════════════════════════════════════ */
const App = {
  components:   [],
  pipeline:     null,   // { dag, topo, cpmResult, criticalPath, stats }
  tableFilter:  '',
  tableSub:     'all',
  tableCrit:    'all',
  sortCol:      'id',
  sortDir:      1,
};

/* ══════════════════════════════════════
   BOOT
   ══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  runAlgorithm();
  renderAll();
  wireUI();
});

/* ══════════════════════════════════════
   1. Data Loading
   ══════════════════════════════════════ */
async function loadData() {
  const res  = await fetch('data/components.json');
  App.components = await res.json();
}

/* ══════════════════════════════════════
   2. Run Pipeline
   ══════════════════════════════════════ */
function runAlgorithm() {
  App.pipeline = CPMAlgorithm.runPipeline(App.components);
  console.log('[Pipeline] Project duration:', App.pipeline.cpmResult.projectDuration, 'hrs');
  console.log('[Pipeline] Critical path nodes:', App.pipeline.criticalPath.length);
}

/* ══════════════════════════════════════
   3. Render All Sections
   ══════════════════════════════════════ */
function renderAll() {
  renderHeroStats();
  renderSubsystemBars();
  renderSubsystemLegend();
  renderComponentTable();
  renderTopoSort();
  renderCriticalPathList();
  renderFloatTable();
  renderDAGCanvas();
}

/* ─── Hero Stats ─── */
function renderHeroStats() {
  const { stats, cpmResult } = App.pipeline;
  setEl('stat-nodes',    stats.nodeCount);
  setEl('stat-edges',    stats.edgeCount);
  setEl('stat-roots',    stats.rootCount);
  setEl('stat-critical', stats.criticalCount);
  setEl('stat-duration', cpmResult.projectDuration.toLocaleString());
  setEl('stat-noncrit',  stats.nonCriticalCount);

  // header stats
  setEl('hdr-nodes',    stats.nodeCount);
  setEl('hdr-edges',    stats.edgeCount);
  setEl('hdr-critical', stats.criticalCount);
  setEl('hdr-duration', cpmResult.projectDuration.toLocaleString());
}

/* ─── Subsystem Bars ─── */
function renderSubsystemBars() {
  const { stats } = App.pipeline;
  const container = document.getElementById('subsystem-bars');
  if (!container) return;

  const maxDur = Math.max(...[...stats.subsystems.values()].map(s => s.totalDuration));
  const sorted = [...stats.subsystems.entries()].sort((a, b) => b[1].totalDuration - a[1].totalDuration);

  container.innerHTML = sorted.map(([name, s]) => {
    const color = SUBSYSTEM_COLORS[name] ?? '#555';
    const pct   = (s.totalDuration / maxDur * 100).toFixed(1);
    const shortName = name.replace('ICE – Internal Combustion Engine', 'ICE')
                         .replace('Hybrid – ', '').replace('Aerodynamics – ', 'Aero – ')
                         .replace('Suspension – ', 'Susp – ')
                         .replace('Energy Store (ES)', 'Energy Store');
    return `
      <div class="sub-row">
        <div class="sub-name" title="${name}">${shortName}</div>
        <div class="sub-bar-bg">
          <div class="sub-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="sub-count" style="color:${color}">${s.totalDuration}h</div>
      </div>`;
  }).join('');
}

/* ─── Subsystem Legend ─── */
function renderSubsystemLegend() {
  const container = document.getElementById('subsystem-legend');
  if (!container) return;
  const subs = Object.entries(SUBSYSTEM_COLORS);
  container.innerHTML = subs.map(([name, color]) => {
    const short = name.replace('ICE – Internal Combustion Engine', 'ICE')
                      .replace('Hybrid – ', '').replace('Aerodynamics – ', '')
                      .replace('Suspension – ', '').replace('Energy Store (ES)', 'ES');
    return `<div class="legend-item" title="${name}">
      <div class="legend-dot" style="background:${color}"></div>${short}
    </div>`;
  }).join('');
}

/* ─── Component Table ─── */
function renderComponentTable() {
  const { cpmResult } = App.pipeline;
  const cpm = cpmResult.cpm;

  const filtered = App.components.filter(c => {
    const q   = App.tableFilter.toLowerCase();
    const matchQ = !q || c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.subsystem.toLowerCase().includes(q);
    const matchS = App.tableSub  === 'all' || c.subsystem === App.tableSub;
    const matchC = App.tableCrit === 'all'
      || (App.tableCrit === 'critical'     && cpm.get(c.id)?.critical)
      || (App.tableCrit === 'noncritical'  && !cpm.get(c.id)?.critical);
    return matchQ && matchS && matchC;
  });

  // Sort
  filtered.sort((a, b) => {
    let va, vb;
    switch (App.sortCol) {
      case 'id':       va = a.id; vb = b.id; break;
      case 'name':     va = a.name; vb = b.name; break;
      case 'sub':      va = a.subsystem; vb = b.subsystem; break;
      case 'duration': va = a.duration; vb = b.duration; break;
      case 'es':       va = cpm.get(a.id)?.ES ?? 0; vb = cpm.get(b.id)?.ES ?? 0; break;
      case 'ef':       va = cpm.get(a.id)?.EF ?? 0; vb = cpm.get(b.id)?.EF ?? 0; break;
      case 'float':    va = cpm.get(a.id)?.TF ?? 0; vb = cpm.get(b.id)?.TF ?? 0; break;
      default:         va = a.id; vb = b.id;
    }
    if (typeof va === 'string') return va.localeCompare(vb) * App.sortDir;
    return (va - vb) * App.sortDir;
  });

  const maxDur = Math.max(...App.components.map(c => c.duration));
  const tbody  = document.getElementById('table-body');
  if (!tbody) return;

  tbody.innerHTML = filtered.map(c => {
    const d    = cpm.get(c.id);
    const isCrit = d?.critical ?? false;
    const color  = SUBSYSTEM_COLORS[c.subsystem] ?? '#555';
    const barPct = (c.duration / maxDur * 100).toFixed(1);
    const deps   = c.deps.length ? c.deps.join(', ') : '—';
    const tf     = d?.TF ?? 0;
    const floatColor = tf === 0 ? '#E10600' : tf < 50 ? '#F57F17' : '#2E7D32';

    return `<tr class="${isCrit ? 'critical-row' : ''}">
      <td><span class="comp-id">${c.id}</span></td>
      <td>
        <div class="comp-name">${c.name}</div>
        <div class="comp-sub">${c.subsystem}</div>
      </td>
      <td>
        <div class="duration-bar">
          <div class="bar-bg"><div class="bar-fill ${isCrit ? '' : 'non-critical'}" style="width:${barPct}%"></div></div>
          <div class="dur-num">${c.duration}h</div>
        </div>
      </td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${d?.ES ?? 0}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${d?.EF ?? 0}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${d?.LS ?? 0}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${d?.LF ?? 0}</td>
      <td>
        <span style="font-family:var(--font-mono);font-size:0.72rem;color:${floatColor};font-weight:700">${tf}</span>
      </td>
      <td>${isCrit ? '<span class="badge badge-red">CRITICAL</span>' : '<span class="badge badge-gray">float</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-3);max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${deps}</td>
    </tr>`;
  }).join('');

  setEl('table-count', `${filtered.length} / ${App.components.length} components`);
}

/* ─── Topological Sort (Wave View) ─── */
function renderTopoSort() {
  const { topo, cpmResult } = App.pipeline;
  const critSet = new Set(App.pipeline.criticalPath);
  const container = document.getElementById('topo-waves');
  if (!container) return;

  // Show first 15 waves
  const displayWaves = topo.waves.slice(0, 20);

  container.innerHTML = displayWaves.map((wave, i) => `
    <div class="topo-wave">
      <div class="topo-wave-label">Wave ${i + 1}</div>
      ${wave.map(id => {
        const isCrit = critSet.has(id);
        const comp   = App.pipeline.dag.nodes.get(id);
        return `<div class="topo-node ${isCrit ? 'is-critical' : ''}"
          title="${comp?.name ?? id} | dur: ${comp?.duration ?? '?'}h"
          onclick="highlightOnCanvas('${id}')">${id}</div>`;
      }).join('')}
    </div>
  `).join('');

  if (topo.waves.length > 20) {
    container.innerHTML += `<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-3);margin-top:0.5rem">… ${topo.waves.length - 20} more waves</div>`;
  }

  setEl('topo-valid', topo.valid
    ? '<span class="badge badge-red">✓ VALID DAG – No Cycles</span>'
    : '<span class="badge" style="background:rgba(255,0,0,0.3);color:#ff4444">⚠ CYCLE DETECTED</span>');
  setEl('topo-order-count', `${topo.order.length} nodes sorted | ${topo.waves.length} parallel waves`);
}

/* ─── Critical Path List ─── */
function renderCriticalPathList() {
  const { criticalPath, dag, cpmResult } = App.pipeline;
  const container = document.getElementById('critical-path-list');
  if (!container) return;

  container.innerHTML = criticalPath.map((id, i) => {
    const comp = dag.nodes.get(id);
    const d    = cpmResult.cpm.get(id);
    return `<li class="cp-item" onclick="highlightOnCanvas('${id}')">
      <span class="cp-seq">${String(i + 1).padStart(2, '0')}</span>
      <span class="cp-id">${id}</span>
      <span class="cp-name">${comp?.name ?? id}</span>
      <span class="cp-dur">${comp?.duration ?? '?'}h</span>
    </li>`;
  }).join('');

  const totalCritDur = criticalPath.reduce((s, id) => s + (dag.nodes.get(id)?.duration ?? 0), 0);
  setEl('cp-duration', `${cpmResult.projectDuration} hrs project duration`);
  setEl('cp-count', `${criticalPath.length} nodes on critical path`);
}

/* ─── Float Table ─── */
function renderFloatTable() {
  const { cpmResult, dag } = App.pipeline;
  const container = document.getElementById('float-table-body');
  if (!container) return;

  // Show all critical + those with float < 80
  const entries = [...cpmResult.cpm.entries()]
    .map(([id, d]) => ({ id, ...d, comp: dag.nodes.get(id) }))
    .filter(e => e.TF < 200)
    .sort((a, b) => a.TF - b.TF);

  const maxFloat = Math.max(...entries.map(e => e.TF));

  container.innerHTML = entries.map(e => {
    const floatPct = maxFloat > 0 ? (e.TF / maxFloat * 100) : 0;
    const color    = e.TF === 0 ? '#E10600' : e.TF < 50 ? '#F57F17' : '#2E7D32';
    return `<tr>
      <td><span class="comp-id">${e.id}</span></td>
      <td style="color:var(--text-1);font-size:0.78rem">${e.comp?.name ?? ''}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${e.ES}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${e.EF}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${e.LS}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-2)">${e.LF}</td>
      <td>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <div style="flex:1;height:4px;background:var(--bg-panel);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${floatPct}%;background:${color};border-radius:2px"></div>
          </div>
          <span style="font-family:var(--font-mono);font-size:0.7rem;color:${color};font-weight:700;min-width:28px">${e.TF}</span>
        </div>
      </td>
      <td>${e.critical ? '<span class="badge badge-red">CRITICAL</span>' : ''}</td>
    </tr>`;
  }).join('');
}

/* ─── DAG Canvas ─── */
function renderDAGCanvas() {
  const canvas = document.getElementById('dag-canvas');
  if (!canvas || !App.pipeline) return;

  const { dag, cpmResult, criticalPath } = App.pipeline;
  const tooltip = document.getElementById('tooltip');

  DAGVisualizer.init(canvas, {
    dag,
    cpm: cpmResult.cpm,
    criticalPath
  }, (comp, cpmData, mouseEvent) => {
    if (!comp || !tooltip) return;
    const tf = cpmData?.TF ?? 0;
    tooltip.style.display = 'block';
    tooltip.style.left    = (mouseEvent.clientX + 16) + 'px';
    tooltip.style.top     = (mouseEvent.clientY - 10) + 'px';
    tooltip.innerHTML = `
      <div class="tt-id">${comp.id}</div>
      <div class="tt-name">${comp.name}</div>
      <div class="tt-sub">${comp.subsystem}</div>
      <div class="tt-row">Duration: <span>${comp.duration}h</span></div>
      <div class="tt-row">ES / EF: <span>${cpmData?.ES ?? '?'} / ${cpmData?.EF ?? '?'}</span></div>
      <div class="tt-row">LS / LF: <span>${cpmData?.LS ?? '?'} / ${cpmData?.LF ?? '?'}</span></div>
      <div class="tt-row">Float: <span class="${tf === 0 ? 'tt-crit' : ''}">${tf} hrs</span></div>
      ${cpmData?.critical ? '<div class="tt-row tt-crit">★ ON CRITICAL PATH</div>' : ''}
      ${comp.deps.length ? `<div class="tt-row">Needs: <span>${comp.deps.slice(0,4).join(', ')}${comp.deps.length > 4 ? '…' : ''}</span></div>` : ''}
    `;
  });

  document.addEventListener('mousemove', e => {
    if (!tooltip) return;
    const canvas = document.getElementById('dag-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) {
      tooltip.style.display = 'none';
    } else {
      tooltip.style.left = (e.clientX + 16) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
    }
  });
}

/* ══════════════════════════════════════
   4. Wire UI Events
   ══════════════════════════════════════ */
function wireUI() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab)?.classList.add('active');

      // Re-render canvas when DAG tab is opened
      if (btn.dataset.tab === 'dag') {
        setTimeout(() => DAGVisualizer.render(), 50);
      }
    });
  });

  // Table search
  const searchEl = document.getElementById('table-search');
  if (searchEl) searchEl.addEventListener('input', e => {
    App.tableFilter = e.target.value;
    renderComponentTable();
  });

  // Table subsystem filter – populate options
  const subSelect = document.getElementById('table-sub-filter');
  if (subSelect) {
    const subs = [...new Set(App.components.map(c => c.subsystem))].sort();
    subs.forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      subSelect.appendChild(o);
    });
    subSelect.addEventListener('change', e => {
      App.tableSub = e.target.value;
      renderComponentTable();
    });
  }

  // Critical filter
  const critSelect = document.getElementById('table-crit-filter');
  if (critSelect) critSelect.addEventListener('change', e => {
    App.tableCrit = e.target.value;
    renderComponentTable();
  });

  // Table sort headers
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (App.sortCol === col) App.sortDir *= -1;
      else { App.sortCol = col; App.sortDir = 1; }
      document.querySelectorAll('[data-sort]').forEach(h => {
        h.classList.remove('sorted-asc', 'sorted-desc');
      });
      th.classList.add(App.sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
      renderComponentTable();
    });
  });

  // Canvas controls
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => DAGVisualizer.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => DAGVisualizer.zoomOut());
  document.getElementById('btn-fit')?.addEventListener('click', () => DAGVisualizer.fitView());
  document.getElementById('btn-reset')?.addEventListener('click', () => DAGVisualizer.resetView());
}

/* ══════════════════════════════════════
   Helpers
   ══════════════════════════════════════ */
function setEl(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function highlightOnCanvas(id) {
  // Switch to DAG tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="dag"]')?.classList.add('active');
  document.getElementById('panel-dag')?.classList.add('active');
  setTimeout(() => {
    DAGVisualizer.highlightNode(id);
  }, 80);
}

window.highlightOnCanvas = highlightOnCanvas;
