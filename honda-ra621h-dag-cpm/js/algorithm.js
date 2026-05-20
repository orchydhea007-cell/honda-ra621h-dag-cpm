/**
 * algorithm.js
 * DAG + Kahn's Topological Sort + Critical Path Method (CPM)
 * Honda RA621H Assembly Scheduling
 * ─────────────────────────────────────────────────────────
 * Complexity: O(V + E) for both topological sort and CPM passes
 */

'use strict';

/* ══════════════════════════════════════
   1. DAG Construction
   ══════════════════════════════════════ */

/**
 * Build adjacency list representation of the DAG.
 * @param {Array} components  – array of component objects
 * @returns {{ adj, radj, inDegree, nodes }}
 */
function buildDAG(components) {
  const nodes    = new Map();   // id → component
  const adj      = new Map();   // id → Set of successor ids
  const radj     = new Map();   // id → Set of predecessor ids
  const inDegree = new Map();   // id → number

  // Initialise maps
  for (const c of components) {
    nodes.set(c.id, c);
    adj.set(c.id, new Set());
    radj.set(c.id, new Set());
    inDegree.set(c.id, 0);
  }

  // Build edges from dependency list
  for (const c of components) {
    for (const depId of c.deps) {
      if (!nodes.has(depId)) continue;           // guard against bad data
      adj.get(depId).add(c.id);                  // depId → c.id
      radj.get(c.id).add(depId);
      inDegree.set(c.id, inDegree.get(c.id) + 1);
    }
  }

  return { nodes, adj, radj, inDegree };
}

/* ══════════════════════════════════════
   2. Kahn's Algorithm – Topological Sort
   O(V + E)
   ══════════════════════════════════════ */

/**
 * Execute Kahn's BFS-based topological sort.
 * Also returns "waves" – each wave is a batch of nodes
 * with no remaining predecessors (parallelism groups).
 *
 * @param {{ nodes, adj, inDegree }} dag
 * @returns {{ order: string[], waves: string[][], valid: boolean }}
 */
function kahnSort(dag) {
  const { nodes, adj, inDegree } = dag;

  const degree = new Map(inDegree);   // working copy
  const queue  = [];
  const order  = [];
  const waves  = [];

  // Seed queue with root nodes (in-degree 0)
  for (const [id, deg] of degree) {
    if (deg === 0) queue.push(id);
  }

  while (queue.length > 0) {
    // All nodes in queue right now form one "wave" (parallel batch)
    const wave = [...queue];
    waves.push(wave);
    queue.length = 0;

    for (const id of wave) {
      order.push(id);
      for (const succ of adj.get(id)) {
        const d = degree.get(succ) - 1;
        degree.set(succ, d);
        if (d === 0) queue.push(succ);
      }
    }
  }

  // If order length < node count → cycle detected (should not happen in valid DAG)
  const valid = order.length === nodes.size;

  return { order, waves, valid };
}

/* ══════════════════════════════════════
   3. Critical Path Method (CPM)
   Forward pass → Backward pass → Float
   ══════════════════════════════════════ */

/**
 * Run CPM on the DAG using topological order.
 *
 * Returns per-node:
 *   ES  – Earliest Start
 *   EF  – Earliest Finish  = ES + duration
 *   LS  – Latest Start
 *   LF  – Latest Finish    = LS + duration
 *   TF  – Total Float      = LS - ES  (0 = on critical path)
 *
 * @param {{ nodes, adj, radj }} dag
 * @param {string[]} topoOrder
 * @returns {Map<string, {ES,EF,LS,LF,TF,critical}>}
 */
function computeCPM(dag, topoOrder) {
  const { nodes, adj, radj } = dag;
  const cpm = new Map();

  // ── Forward Pass ──────────────────────
  for (const id of topoOrder) {
    const comp = nodes.get(id);
    let es = 0;
    for (const predId of radj.get(id)) {
      const ef = cpm.get(predId)?.EF ?? 0;
      if (ef > es) es = ef;
    }
    cpm.set(id, {
      ES: es,
      EF: es + comp.duration,
      LS: 0, LF: 0, TF: 0,
      critical: false
    });
  }

  // Project finish = max EF across all nodes
  let projectDuration = 0;
  for (const [, v] of cpm) {
    if (v.EF > projectDuration) projectDuration = v.EF;
  }

  // ── Backward Pass ─────────────────────
  // Initialise leaf nodes (no successors) with LF = projectDuration
  for (const id of [...topoOrder].reverse()) {
    const comp  = nodes.get(id);
    const succs = adj.get(id);
    let lf;
    if (succs.size === 0) {
      lf = projectDuration;
    } else {
      lf = Infinity;
      for (const succId of succs) {
        const ls = cpm.get(succId)?.LS ?? projectDuration;
        if (ls < lf) lf = ls;
      }
    }
    const entry = cpm.get(id);
    entry.LF = lf;
    entry.LS = lf - comp.duration;
    entry.TF = entry.LS - entry.ES;
    entry.critical = entry.TF === 0;
  }

  return { cpm, projectDuration };
}

/* ══════════════════════════════════════
   4. Critical Path Extraction
   ══════════════════════════════════════ */

/**
 * Trace the critical path from start to finish.
 * Returns ordered array of node ids on the longest path.
 * @param {{ nodes, adj, radj }} dag
 * @param {Map} cpm
 * @returns {string[]}
 */
function extractCriticalPath(dag, cpm) {
  const { nodes, adj } = dag;

  // Find the root critical node with earliest ES=0
  let start = null;
  for (const [id, v] of cpm) {
    if (v.critical && v.ES === 0) {
      if (!start || v.EF > cpm.get(start).EF) start = id;
    }
  }
  if (!start) return [];

  // Greedily follow critical successors in order of EF
  const path = [start];
  let current = start;
  const visited = new Set([start]);

  while (true) {
    const succs = [...adj.get(current)].filter(s => cpm.get(s)?.critical && !visited.has(s));
    if (succs.length === 0) break;
    // Pick successor whose ES equals current EF (tight link)
    const curEF = cpm.get(current).EF;
    const next = succs.find(s => cpm.get(s).ES === curEF) ?? succs[0];
    path.push(next);
    visited.add(next);
    current = next;
  }

  return path;
}

/* ══════════════════════════════════════
   5. Graph Statistics
   ══════════════════════════════════════ */

function computeStats(dag, cpm) {
  const { nodes, adj, radj, inDegree } = dag;
  const roots   = [...inDegree].filter(([, d]) => d === 0).map(([id]) => id);
  const leaves  = [...adj].filter(([, s]) => s.size === 0).map(([id]) => id);
  const criticals = [...cpm.cpm].filter(([, v]) => v.critical).map(([id]) => id);

  // Out-degree distribution
  const outDegrees = [...adj].map(([, s]) => s.size);
  const maxOutDeg  = Math.max(...outDegrees);

  // Subsystem summary
  const subMap = new Map();
  for (const [id, comp] of nodes) {
    if (!subMap.has(comp.subsystem)) {
      subMap.set(comp.subsystem, { count: 0, totalDuration: 0, criticalCount: 0 });
    }
    const s = subMap.get(comp.subsystem);
    s.count++;
    s.totalDuration += comp.duration;
    if (cpm.cpm.get(id)?.critical) s.criticalCount++;
  }

  return {
    nodeCount: nodes.size,
    edgeCount: [...adj].reduce((acc, [, s]) => acc + s.size, 0),
    rootCount: roots.length,
    leafCount: leaves.length,
    criticalCount: criticals.length,
    nonCriticalCount: nodes.size - criticals.length,
    projectDuration: cpm.projectDuration,
    maxOutDeg,
    subsystems: subMap,
    roots,
    leaves
  };
}

/* ══════════════════════════════════════
   6. Main Entry – Run Full Pipeline
   ══════════════════════════════════════ */

/**
 * Run full DAG + Kahn + CPM pipeline on component list.
 * @param {Array} components
 * @returns {{ dag, topo, cpmResult, criticalPath, stats }}
 */
function runPipeline(components) {
  const dag          = buildDAG(components);
  const topo         = kahnSort(dag);

  if (!topo.valid) {
    console.error('[CPM] Cycle detected in dependency graph!');
  }

  const cpmResult    = computeCPM(dag, topo.order);
  const criticalPath = extractCriticalPath(dag, cpmResult.cpm);
  const stats        = computeStats(dag, cpmResult);

  return { dag, topo, cpmResult, criticalPath, stats };
}

/* Export for browser (global) and potential module use */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildDAG, kahnSort, computeCPM, extractCriticalPath, computeStats, runPipeline };
} else {
  window.CPMAlgorithm = { buildDAG, kahnSort, computeCPM, extractCriticalPath, computeStats, runPipeline };
}
