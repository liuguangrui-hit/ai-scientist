// A small forest for the system map, drawn on a 2D canvas the way the front page draws
// its WebGL forest: the same generator (forest/lib/data.js) and force simulation
// (forest/lib/sim.js), groves on a ring, glowing nodes over a gridded ground, pools of
// light, fireflies, evidence sparks and verdict rings, every colour pulled toward one
// tint. It grows top-down — roots first, each depth a layer lower — then the hypotheses
// several trees share merge in between them, then closed branches are pruned away,
// leaving a net rather than trees.
const LAYER = 50, ROOT_Y = 12, D = 1700;
const STATUS = {
  untested: [[148, 163, 190], 0.3], active: [[96, 165, 250], 0.55], testing: [[56, 189, 248], 1], self_verified: [[52, 211, 153], 0.85],
  pending_review: [[251, 191, 36], 0.95], closed: [[94, 104, 128], 0.14], inductive_unverified: [[167, 139, 250], 0.6], lit_supported: [[244, 114, 182], 0.5],
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function hueRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
const sprites = new Map();
function glow(rgb) {
  const key = rgb.join();
  if (sprites.has(key)) return sprites.get(key);
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), r = s / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.12, rgba(rgb, 1)); grd.addColorStop(0.35, rgba(rgb, 0.35)); grd.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = grd; g.fillRect(0, 0, s, s); sprites.set(key, c); return c;
}

export function makeForest({ seed, hue, ideas = 20 }) {
  const { Forest, Sim } = window;
  if (!Forest || !Sim) return null;
  const t0 = performance.now();
  const tint = hueRgb(hue, 85, 64);
  const F = Forest.build({ ideas, seed });
  const rnd = Forest.mulberry32(seed + 1);
  const col = Object.fromEntries(Object.entries(STATUS).map(([k, [c, gl]]) => [k, { c: mix(c, tint, 0.6), gl }]));
  const N = F.hyps.length;
  const index = new Map(F.hyps.map((h, i) => [h.id, i]));
  const ideaIdx = new Map(F.ideas.map((d, i) => [d.id, i]));
  const clusterOf = new Int32Array(N);
  F.hyps.forEach((h, i) => { clusterOf[i] = h.ideas.length > 1 ? -1 : (ideaIdx.get(h.ideas[0]) ?? 0); });
  const themeRgb = {}; F.themes.forEach((t, k) => { themeRgb[t.id] = hueRgb(hue + (k - 2.5) * 9, 80, 62); });
  // the front page's simulation, with its settings: repulsion, tree springs, clusters, shared nodes pulled between trees
  const links = F.edges.map((e) => ({ a: index.get(e.a), b: index.get(e.b), k: e.kind === 'tree' ? 0.05 : 0.0006, len: e.kind === 'tree' ? 30 : 520, kind: e.kind })).filter((l) => l.a != null && l.b != null);
  const sim = new Sim({ dim: 3, tree3d: true, repel: 620, gravity: 0.00008, cluster: 0.002, anchor: 0.02, radial: 0.08, vert: 0.14, damping: 0.955, maxV: 34, maxF: 3.2, separate: 190, sharedK: 0.04, theta: 1.0 });
  sim.load(N, links, clusterOf, F.ideas.length);
  F.hyps.forEach((h, i) => { if (h.ideas.length > 1) sim.shared.push({ i, cs: h.ideas.map((id) => ideaIdx.get(id)).filter((x) => x != null) }); });
  // groves on a ring, trees at golden-angle spots inside each grove
  const ring = 300 + ideas * 9, groves = [];
  F.themes.forEach((t, k) => {
    const th = (k / F.themes.length) * Math.PI * 2, gx = Math.cos(th) * ring, gz = Math.sin(th) * ring;
    groves.push({ x: gx, z: gz, rgb: themeRgb[t.id] });
    F.ideas.filter((d) => d.theme === t.id).forEach((d, j) => { const a = j * 2.39996 + th, r = 104 * Math.sqrt(j + 0.3); d.ax = gx + Math.cos(a) * r; d.az = gz + Math.sin(a) * r; });
  });
  F.ideas.forEach((d, i) => { sim.canchor[i * 3] = d.ax; sim.canchor[i * 3 + 1] = 0; sim.canchor[i * 3 + 2] = d.az; });
  // top-down: the root hangs highest, each depth a layer lower; hypotheses shared by
  // several trees sit lower still, between the trees that cite them
  const TOP = ROOT_Y + 5 * LAYER;
  for (let i = 0; i < N; i++) {
    const h = F.hyps[i], dep = h.depth || 0;
    if (clusterOf[i] < 0) {
      const ds = h.ideas.map((id) => F.ideas[ideaIdx.get(id)]).filter(Boolean);
      sim.height[i] = Math.max(ROOT_Y, TOP - (dep + 1.4 + h.ideas.length * 0.35) * LAYER);
      sim.pos.set([ds.reduce((a, d) => a + d.ax, 0) / ds.length, sim.height[i], ds.reduce((a, d) => a + d.az, 0) / ds.length], i * 3);
      continue;
    }
    const d = F.ideas[clusterOf[i]], a = rnd() * 6.2832;
    sim.height[i] = TOP - dep * LAYER - (h.leaf ? 8 : 0);
    sim.radius[i] = dep === 0 ? 0 : 6 + dep * 13 + (h.leaf ? 5 : 0);
    sim.pos.set([d.ax + Math.cos(a) * sim.radius[i], TOP, d.az + Math.sin(a) * sim.radius[i]], i * 3);
  }
  sim.reheat(1);
  let settleSteps = 0;                // the violent first settling runs off screen, a few steps a frame
  // growth (top-down by depth, shared nodes last), then pruning of closed branches
  const GROW = { step: 170, shared: 420, dur: 1100 };
  const delay = new Float32Array(N); let growEnd = 0;
  for (let i = 0; i < N; i++) { delay[i] = (F.hyps[i].depth || 0) * GROW.step + (clusterOf[i] < 0 ? GROW.shared : 0); growEnd = Math.max(growEnd, delay[i] + GROW.dur); }
  const closed = new Uint8Array(N); F.hyps.forEach((h, i) => { closed[i] = h.status === 'closed' ? 1 : 0; });
  const lines = links.map((l) => ({ a: l.a, b: l.b, kind: l.kind }));
  const flies = groves.flatMap((g) => Array.from({ length: 10 }, () => ({ x: g.x + (rnd() - 0.5) * 520, y: 20 + rnd() * 240, z: g.z + (rnd() - 0.5) * 520, r: 20 + rnd() * 60, p: 2200 + rnd() * 3000, o: rnd() * 100, c: hueRgb(hue + (rnd() - 0.5) * 40, 90, 72) })));
  const sparks = [], rings = [], pending = F.hyps.map((h, i) => i).filter((i) => F.hyps[i].status === 'pending_review');
  const evPos = mix([110, 231, 183], tint, 0.5), evNeg = mix([251, 113, 133], tint, 0.5);
  const cpos = new Float32Array(F.ideas.length * 2), shown = new Float32Array(N), V = new Float32Array(N * 3);
  const lineRgb = mix(tint, [255, 255, 255], 0.12), vineRgb = mix(tint, [200, 215, 255], 0.4);
  let yaw = 0.6, ringAt = 0, born = 0;
  const ext = ring + 260;
  window.__forestMs = (window.__forestMs || []).concat(Math.round(performance.now() - t0));

  // each forest renders into its own small buffer at ~30 fps; the map blits it every frame
  const buf = document.createElement('canvas'), bg = buf.getContext('2d');
  let lastPaint = -1e9, lastLit = null, acc = 0;
  function draw(main, cx, cy, size, t, dt, lit, still, res = 1) {
    const w = size * 1.1, h = size * 0.86, bw = Math.round(w * res), bh = Math.round(h * res);
    if (sim.alpha > 0.25 && settleSteps < 400) { for (let k = 0; k < 30; k++, settleSteps++) sim.step(0.016); return; }
    acc += dt;
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; lastPaint = -1e9; }
    if (t - lastPaint > 32 || lit !== lastLit) {
      bg.setTransform(res, 0, 0, res, -(cx - w / 2) * res, -(cy - h / 2) * res);
      bg.clearRect(cx - w / 2, cy - h / 2, w, h);
      paint(bg, cx, cy, size, t, acc, lit, still);
      lastPaint = t; lastLit = lit; acc = 0;
    }
    main.drawImage(buf, cx - w / 2, cy - h / 2, w, h);
  }
  function paint(g, cx, cy, size, t, dt, lit, still) {
    if (!born) born = still ? t - growEnd - 3000 : t;
    const age = t - born;
    if (sim.alpha > 0) sim.step(0.016);
    if (!still) yaw += dt * 0.07;
    // growth: each node drops from the root's height to its own, and fans out from its tree
    for (let i = 0; i < F.ideas.length; i++) { cpos[i * 2] = F.ideas[i].ax; cpos[i * 2 + 1] = F.ideas[i].az; }
    const prune = Math.min(1, Math.max(0, (age - growEnd - 600) / 1600));
    for (let i = 0; i < N; i++) {
      const u = Math.min(1, Math.max(0, (age - delay[i]) / GROW.dur)), e = 1 - (1 - u) ** 3, c = clusterOf[i];
      const p = sim.pos, s = c < 0 ? 1 : 0.25 + 0.75 * e, ox = c < 0 ? p[i * 3] : cpos[c * 2], oz = c < 0 ? p[i * 3 + 2] : cpos[c * 2 + 1];
      V[i * 3] = ox + (p[i * 3] - ox) * s; V[i * 3 + 1] = TOP + (p[i * 3 + 1] - TOP) * e; V[i * 3 + 2] = oz + (p[i * 3 + 2] - oz) * s;
      shown[i] = Math.min(1, u * 3) * (closed[i] ? 1 - prune * 0.9 : 1);
    }
    const k = size / (ext * 2), pitch = 0.5, sp = Math.sin(pitch), cp = Math.cos(pitch), cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, y, z) => {
      const x1 = x * cs - z * sn, z1 = x * sn + z * cs, d = z1 * cp + y * sp, f = D / (D - d);
      return [cx + x1 * k * f, cy + (z1 * sp - (y - 110) * cp) * k * f, f];
    };
    const A = lit ? 1 : 0.22;
    // ground: a fading grid
    g.lineWidth = 1;
    const gridR = (P(0, 0, 0)), gridG = g.createRadialGradient(gridR[0], gridR[1], 0, gridR[0], gridR[1], ext * k * 1.05);
    gridG.addColorStop(0, rgba(tint, 0.13 * A)); gridG.addColorStop(1, rgba(tint, 0));
    g.strokeStyle = gridG; g.beginPath();
    for (let v = -ext; v <= ext; v += 120) for (const dir of [0, 1]) {
      const a = P(dir ? v : -ext, 0, dir ? -ext : v), b = P(dir ? v : ext, 0, dir ? ext : v);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    for (const d of F.ideas) {
      const live = d.status === 'running' || d.status === 'candidate', [x, y, f] = P(d.ax, 0, d.az), R = (46 + d.nodes.length * 1.4) * 2.2 * k * f;
      g.globalAlpha = (live ? 0.42 : 0.14) * A; g.drawImage(glow(themeRgb[d.theme]), x - R, y - R * sp, R * 2, R * 2 * sp);
    }
    if (!still && pending.length && age > growEnd && t - ringAt > 4200) { ringAt = t; const i = pending[(Math.random() * pending.length) | 0]; rings.push({ x: V[i * 3], z: V[i * 3 + 2], r: 0, a: 1 }); }
    for (let j = rings.length - 1; j >= 0; j--) {
      const r = rings[j]; r.r += (300 - r.r) * 2.2 * dt; r.a -= dt * 0.5; if (r.a <= 0) { rings.splice(j, 1); continue; }
      const [x, y, f] = P(r.x, 0, r.z);
      g.globalAlpha = r.a * A; g.strokeStyle = rgba(mix(col.pending_review.c, [255, 255, 255], 0.2), 0.8); g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(x, y, r.r * k * f, r.r * k * f * sp, 0, 0, Math.PI * 2); g.stroke();
    }
    const S = new Array(N);
    for (let i = 0; i < N; i++) S[i] = P(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]);
    // tree edges as the front page draws them; long ones between trees as faint arcs
    g.lineWidth = 1;
    const paths = [new Path2D(), new Path2D(), new Path2D()];       // tree edges: full, fading; vines
    for (const l of lines) {
      const vis = Math.min(shown[l.a], shown[l.b]); if (vis < 0.05) continue;
      const a = S[l.a], b = S[l.b];
      const len = Math.hypot(V[l.a * 3] - V[l.b * 3], V[l.a * 3 + 1] - V[l.b * 3 + 1], V[l.a * 3 + 2] - V[l.b * 3 + 2]);
      if (l.kind === 'tree' && len < 200) { const q = paths[vis > 0.6 ? 0 : 1]; q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); }
      else { const lift = (60 + len * 0.28) * k; paths[2].moveTo(a[0], a[1]); paths[2].quadraticCurveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - lift, b[0], b[1]); }
    }
    g.strokeStyle = rgba(lineRgb, 1);
    g.globalAlpha = 0.58 * A; g.stroke(paths[0]);
    g.globalAlpha = 0.2 * A; g.stroke(paths[1]);
    g.strokeStyle = rgba(vineRgb, 1); g.globalAlpha = 0.13 * A; g.stroke(paths[2]);
    // evidence: rising from the soil under a tree and arcing into a hypothesis
    if (!still && lit && age > growEnd) {
      while (sparks.length < 70) {
        const e = F.evidence[(Math.random() * F.evidence.length) | 0], b = index.get(e.hyp); if (b == null || closed[b]) break;
        const d = F.ideas[ideaIdx.get(e.idea)] || F.ideas[0], a = Math.random() * 6.28, r = 30 + Math.random() * 60;
        sparks.push({ b, t: 0, v: 0.22 + Math.random() * 0.35, pos: e.delta > 0, d: Math.abs(e.delta), x0: d.ax + Math.cos(a) * r, z0: d.az + Math.sin(a) * r, arc: 20 + Math.random() * 70 });
      }
    }
    for (let j = sparks.length - 1; j >= 0; j--) {
      const s = sparks[j]; if (!still) s.t += s.v * dt; if (s.t >= 1) { sparks.splice(j, 1); continue; }
      const bx = V[s.b * 3], by = V[s.b * 3 + 1], bz = V[s.b * 3 + 2], img = glow(s.pos ? evPos : evNeg);
      for (let q = 0; q < 4; q++) {
        const u = Math.max(0, s.t - q * 0.035), e = u * u * (3 - 2 * u);
        const [x, y, f] = P(s.x0 + (bx - s.x0) * e, by * e + Math.sin(e * Math.PI) * s.arc, s.z0 + (bz - s.z0) * e);
        const R = (3 + s.d * 3.4) * (q ? 0.75 : 1) * k * f * 2.4;
        g.globalAlpha = (q ? 0.45 / q : 1) * A; g.drawImage(img, x - R, y - R, R * 2, R * 2);
      }
    }
    // nodes: a wide halo and a bright core
    for (let i = 0; i < N; i++) {
      if (shown[i] < 0.02) continue;
      const h = F.hyps[i], c = col[h.status], shared = h.ideas.length > 1, [x, y, f] = S[i];
      const sz = (3.2 + Math.min(4, h.evidence.length * 0.45)) * (shared ? 1.5 + h.ideas.length * 0.22 : 1);
      let gl = c.gl * (shared ? 1.35 : 1);
      if (h.status === 'testing') gl *= 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(t / 300 + i));
      const img = glow(shared ? mix(c.c, [255, 244, 214], 0.25) : c.c), R1 = sz * 2.6 * k * f * 2.2, R2 = sz * 0.9 * k * f * 2.2;
      g.globalAlpha = Math.min(1, 0.5 * gl) * A * shown[i]; g.drawImage(img, x - R1, y - R1, R1 * 2, R1 * 2);
      g.globalAlpha = A * shown[i]; g.drawImage(img, x - R2, y - R2, R2 * 2, R2 * 2);
    }
    for (const fl of flies) {
      const [x, y, f] = P(fl.x + Math.sin(t / fl.p + fl.o) * fl.r, fl.y + Math.sin(t / (fl.p * 1.3) + fl.o * 2) * 18, fl.z + Math.cos(t / fl.p + fl.o) * fl.r);
      const R = 2.6 * k * f * 2.4;
      g.globalAlpha = (0.35 + 0.35 * Math.sin(t / 400 + fl.o * 5)) * A; g.drawImage(glow(fl.c), x - R, y - R, R * 2, R * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  return { draw };
}
