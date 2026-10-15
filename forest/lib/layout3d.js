/* The same 3D forest layout is shared by the viewer and its offline prewarm.
 * Rendering, simulation parameters and growth animation remain in the viewer.
 */
(function (global) {
'use strict';
const VERSION = 1;
const FIELDS = ['pos', 'vel', 'frc', 'canchor', 'cpos', 'ccount'];
function prepare(F, { count, lang = 'zh', rootY: ROOT_Y = 12, layer: LAYER = 50, random = Math.random }) {
  const N = F.hyps.length;
  const index = new Map(F.hyps.map((h, i) => [h.id, i]));
  const ideaIdx = new Map(F.ideas.map((d, i) => [d.id, i]));
  const clusterOf = new Int32Array(N);
  F.hyps.forEach((h, i) => { clusterOf[i] = h.ideas.length > 1 ? -1 : (ideaIdx.get(h.ideas[0]) ?? 0); });

  const links = F.edges.map((e) => ({ a: index.get(e.a), b: index.get(e.b), k: e.kind === 'tree' ? 0.05 : 0.0006, len: e.kind === 'tree' ? 30 : 520, kind: e.kind }))
    .filter((l) => l.a != null && l.b != null);
  const sim = new global.Sim({ dim: 3, tree3d: true, repel: 620, gravity: 0.00008, cluster: 0.002, anchor: 0.02, radial: 0.08, vert: 0.14,
    damping: 0.955, maxV: 34, maxF: 3.2, separate: 190, sharedK: 0.04, theta: 1.0 });
  sim.load(N, links, clusterOf, F.ideas.length);
  sim.shared = [];
  F.hyps.forEach((h, i) => { if (h.ideas.length > 1) sim.shared.push({ i, cs: h.ideas.map((id) => ideaIdx.get(id)).filter((x) => x != null) }); });

  // 六片林子围成一圈，林子里的树按黄金角铺开
  const themes = F.themes.map((t) => t.id);
  // a real forest has a handful of trees, not dozens: keep them close and the camera near
  const ring = F.real ? 170 : 300 + count * 9;
  const groves = [];
  themes.forEach((tid, t) => {
    const th = (t / themes.length) * Math.PI * 2;
    const gx = Math.cos(th) * ring, gz = Math.sin(th) * ring;
    const list = F.ideas.filter((d) => d.theme === tid);
    groves.push({ theme: tid, x: gx, z: gz, hue: F.themes[t].hue, name: F.themes[t][lang] });
    list.forEach((d, k) => {
      const a = k * 2.39996323 + th, r = (F.real ? 120 : 104) * Math.sqrt(k + 0.3);
      d.ax = gx + Math.cos(a) * r; d.az = gz + Math.sin(a) * r;
    });
  });
  F.ideas.forEach((d, i) => { sim.canchor[i * 3] = d.ax; sim.canchor[i * 3 + 1] = 0; sim.canchor[i * 3 + 2] = d.az; });

  for (let i = 0; i < N; i++) {
    const h = F.hyps[i], dep = h.depth || 0;
    if (clusterOf[i] < 0) {                     // 共享假设：位于引用它的各树之间，高于顶层节点
      const ds = h.ideas.map((id) => F.ideas[ideaIdx.get(id)]).filter(Boolean);
      sim.height[i] = ROOT_Y + (dep + 1.6 + h.ideas.length * 0.45) * LAYER;
      sim.pos[i * 3] = ds.reduce((a, d) => a + d.ax, 0) / ds.length;
      sim.pos[i * 3 + 2] = ds.reduce((a, d) => a + d.az, 0) / ds.length;
      sim.pos[i * 3 + 1] = sim.height[i];
      continue;
    }
    const d = F.ideas[clusterOf[i]];
    sim.height[i] = ROOT_Y + dep * LAYER + (h.leaf ? 8 : 0);
    // 窄而高的树形：一层一层往上长，像雪松
    sim.radius[i] = dep === 0 ? 0 : 6 + dep * 13 + (h.leaf ? 5 : 0);
    const a = random() * 6.2832;
    sim.pos[i * 3] = d.ax + Math.cos(a) * sim.radius[i];
    sim.pos[i * 3 + 2] = d.az + Math.sin(a) * sim.radius[i];
    sim.pos[i * 3 + 1] = 0;                      // 从地面长出来
  }
  sim.reheat(1);
  return { sim, index, ideaIdx, clusterOf, groves, ring };
}
function prewarm(sim) {
  let steps = 0;
  for (; sim.alpha > 0.25 && steps < 400; steps++) sim.step(0.016);
  return steps;
}
function checksum(bytes) {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 16777619);
  return (hash >>> 0).toString(16);
}
function signature(F, count) {
  // Include the graph, heights and grove layout inputs; never apply a demo state
  // to real research data or another generated forest with the same node count.
  const value = JSON.stringify([F.seed, count, F.real || false,
    F.themes.map(t => [t.id, t.hue]), F.ideas.map(d => [d.id, d.theme]),
    F.hyps.map(h => [h.id, h.depth, h.leaf, h.ideas]),
    F.edges.map(e => [e.a, e.b, e.kind])]);
  return checksum(new TextEncoder().encode(value));
}
function restore(sim, state, key) {
  if (!state || state.version !== VERSION || state.signature !== key || state.n !== sim.n || state.cc !== sim.cc ||
      !Number.isFinite(state.alpha) || state.alpha <= 0 || state.alpha > 0.25) return false;
  try {
    const raw = atob(state.data);
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const length = FIELDS.reduce((n, field) => n + sim[field].length, 0);
    if (bytes.byteLength !== length * 8 || checksum(bytes) !== state.checksum) return false;
    const view = new DataView(bytes.buffer);
    const values = new Float64Array(length);
    for (let i = 0; i < length; i++) {
      values[i] = view.getFloat64(i * 8, true);
      if (!Number.isFinite(values[i])) return false;
    }
    // Validate everything before touching the current state (safe fallback).
    let offset = 0;
    for (const field of FIELDS) {
      sim[field].set(values.subarray(offset, offset + sim[field].length));
      offset += sim[field].length;
    }
    sim.alpha = state.alpha;
    return true;
  } catch (_) { return false; }
}
global.Forest.layout3D = { prepare, prewarm, restore, signature, checksum, fields: FIELDS, version: VERSION };
})(window);
