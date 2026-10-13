/* 力导向模拟 · 二维与三维共用
 *
 * Barnes-Hut 近似排斥 + 树边弹簧 + 簇内引力 + 向心收束，
 * 速度 Verlet 积分带阻尼。拖拽时记录指针速度，松手时注入节点，
 * 于是松手之后整片林子会跟着荡一会儿——惯性不是特效，是积分器本来的行为。
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- Barnes-Hut
  // dim=2 → 四叉树，dim=3 → 八叉树。数组式子节点，避免每帧分配对象。
  function Tree(dim) {
    this.dim = dim;
    this.kids = dim === 2 ? 4 : 8;
    this.reset();
  }
  Tree.prototype.reset = function () {
    this.n = 0; this.child = []; this.mass = []; this.com = []; this.size = []; this.min = []; this.idx = []; this.inner = [];
  };
  Tree.prototype.alloc = function (min, size) {
    const i = this.n++;
    const k = this.kids;
    const base = i * k;
    for (let j = 0; j < k; j++) this.child[base + j] = -1;
    this.mass[i] = 0;
    for (let d = 0; d < this.dim; d++) { this.com[i * 3 + d] = 0; this.min[i * 3 + d] = min[d]; }
    this.size[i] = size;
    this.idx[i] = -1;
    this.inner[i] = 0;
    return i;
  };
  Tree.prototype.octant = function (i, p, o) {
    let q = 0, half = this.size[i] / 2;
    for (let d = 0; d < this.dim; d++) if (p[o + d] >= this.min[i * 3 + d] + half) q |= (1 << d);
    return q;
  };
  Tree.prototype.build = function (pos, count) {
    this.reset();
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let d = 0; d < this.dim; d++) {
      const v = pos[i * 3 + d];
      if (v < lo[d]) lo[d] = v;
      if (v > hi[d]) hi[d] = v;
    }
    let size = 1;
    for (let d = 0; d < this.dim; d++) size = Math.max(size, hi[d] - lo[d]);
    size *= 1.02;
    const root = this.alloc(lo, size);
    for (let i = 0; i < count; i++) this.insert(root, pos, i, 0);
    this.summarise(root, pos);
    return root;
  };
  // 三种节点：空叶子、存了一个点的叶子、内部节点。内部节点必须显式标记——
  // 插入阶段它们的 mass 还是 0，只看 mass 会把第三个点误存进内部节点，
  // 汇总时这个节点被当成叶子，它下面整棵子树就从排斥力里消失了。
  // 消失哪些取决于插入顺序、每帧都在变，于是力每帧不一致，林子永远在抖。
  Tree.prototype.insert = function (node, pos, p, depth) {
    if (depth > 24) return;
    if (this.inner[node]) { this.push(node, pos, p, depth); return; }
    if (this.idx[node] === -1) { this.idx[node] = p; return; }
    const old = this.idx[node];                        // 叶子分裂
    this.idx[node] = -1; this.inner[node] = 1;
    this.push(node, pos, old, depth);
    this.push(node, pos, p, depth);
  };
  Tree.prototype.push = function (node, pos, p, depth) {
    const q = this.octant(node, pos, p * 3);
    const base = node * this.kids;
    let c = this.child[base + q];
    if (c === -1) {
      const half = this.size[node] / 2;
      const min = [];
      for (let d = 0; d < this.dim; d++) min[d] = this.min[node * 3 + d] + ((q >> d) & 1 ? half : 0);
      c = this.alloc(min, half);
      this.child[node * this.kids + q] = c;
    }
    this.insert(c, pos, p, depth + 1);
  };
  Tree.prototype.summarise = function (node, pos) {
    if (this.idx[node] !== -1) {
      for (let d = 0; d < this.dim; d++) this.com[node * 3 + d] = pos[this.idx[node] * 3 + d];
      this.mass[node] = 1;
      return 1;
    }
    let m = 0;
    const acc = [0, 0, 0];
    const base = node * this.kids;
    for (let j = 0; j < this.kids; j++) {
      const c = this.child[base + j];
      if (c === -1) continue;
      const cm = this.summarise(c, pos);
      m += cm;
      for (let d = 0; d < this.dim; d++) acc[d] += this.com[c * 3 + d] * cm;
    }
    this.mass[node] = m;
    if (m > 0) for (let d = 0; d < this.dim; d++) this.com[node * 3 + d] = acc[d] / m;
    return m;
  };
  Tree.prototype.force = function (root, pos, i, k, theta, out) {
    const dim = this.dim, stack = this._st || (this._st = []);
    let sp = 0; stack[sp++] = root;
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = dim === 3 ? pos[i * 3 + 2] : 0;
    while (sp > 0) {
      const node = stack[--sp];
      const m = this.mass[node];
      if (m === 0 || this.idx[node] === i) continue;
      let dx = this.com[node * 3] - px, dy = this.com[node * 3 + 1] - py, dz = dim === 3 ? this.com[node * 3 + 2] - pz : 0;
      let d2 = dx * dx + dy * dy + dz * dz + 0.6;
      if (this.idx[node] !== -1 || (this.size[node] * this.size[node]) / d2 < theta * theta) {
        const f = -k * m / (d2 * Math.sqrt(d2));
        out[0] += dx * f; out[1] += dy * f; if (dim === 3) out[2] += dz * f;
      } else {
        const base = node * this.kids;
        for (let j = 0; j < this.kids; j++) { const c = this.child[base + j]; if (c !== -1) stack[sp++] = c; }
      }
    }
  };

  // ---------------------------------------------------------------- 模拟
  function Sim(opts) {
    const o = this.o = Object.assign({
      dim: 2, repel: 520, spring: 0.028, springCross: 0.006, length: 34,
      gravity: 0.0016, cluster: 0.010, damping: 0.905, theta: 0.9, maxV: 26,
    }, opts);
    this.dim = o.dim;
    this.n = 0;
    this.pos = null; this.vel = null; this.frc = null;
    this.tree = new Tree(o.dim);
    this.grabbed = -1;
    // 温度（alpha）：所有力乘以它。没人碰时它冷却到零、林子真正静止；
    // 拖动、冲击波、重新生成时加热。近似计算的残差也随它一起归零。
    this.alpha = 1;
    this.alphaTarget = 0;
    this.alphaDecay = o.alphaDecay || 0.006;
    this.alphaMin = o.alphaMin || 0.004;
  }
  Sim.prototype.reheat = function (a) { this.alpha = Math.max(this.alpha, a == null ? 1 : a); };
  Object.defineProperty(Sim.prototype, 'heat', {     // 旧接口：给 heat 赋值就是加热
    get() { return this.alpha; }, set(v) { this.reheat(Math.min(1, v / 2)); },
  });
  Sim.prototype.cold = function () { return this.alpha === 0; };

  Sim.prototype.load = function (count, links, clusterOf, clusterCount) {
    this.n = count;
    this.pos = new Float64Array(count * 3);
    this.vel = new Float64Array(count * 3);
    this.frc = new Float64Array(count * 3);
    this.fixed = new Uint8Array(count);
    this.links = links;                    // [{a,b,k}]
    this.clusterOf = clusterOf;            // Int32Array, 节点 → 簇
    this.cc = clusterCount;
    this.radius = new Float64Array(count);   // 期望的离心距离：根在内，叶在外
    this.height = new Float64Array(count);   // 三维：期望的高度，深度越深越高
    this.shared = [];                          // [{i, cs:[簇…]}]：被几棵树共用的节点
    this.cpos = new Float64Array(clusterCount * 3);
    this.ccount = new Float64Array(clusterCount);
    this.canchor = new Float64Array(clusterCount * 3);
  };

  Sim.prototype.step = function (dt) {
    const { pos, vel, frc, dim, n } = this;
    const o = this.o;
    if (this.grabbed < 0 && this.alpha < this.alphaMin && this.alphaTarget === 0) {
      if (this.alpha !== 0) { this.alpha = 0; vel.fill(0); }
      return false;                                // 冷了：一动不动，也不耗电
    }
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    frc.fill(0);

    // 簇质心：簇内引力让每棵树成团，同时把被共享的节点拉向几个簇之间
    this.ccount.fill(0); this.cpos.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.clusterOf[i];
      if (c < 0) continue;
      this.ccount[c]++;
      for (let d = 0; d < dim; d++) this.cpos[c * 3 + d] += pos[i * 3 + d];
    }
    for (let c = 0; c < this.cc; c++) {
      if (this.ccount[c] > 0) for (let d = 0; d < dim; d++) this.cpos[c * 3 + d] /= this.ccount[c];
    }

    // 簇间互斥：保持各簇之间的间距
    if (this.o.separate) {
      for (let a = 0; a < this.cc; a++) {
        if (this.ccount[a] === 0) continue;
        for (let b = a + 1; b < this.cc; b++) {
          if (this.ccount[b] === 0) continue;
          const H0 = 0, H1 = o.tree3d ? 2 : 1;           // 地面的两个轴
          const dx = this.cpos[b * 3 + H0] - this.cpos[a * 3 + H0], dy = this.cpos[b * 3 + H1] - this.cpos[a * 3 + H1];
          const d2 = dx * dx + dy * dy + 1;
          const want = this.o.separate;
          if (d2 > want * want) continue;
          const d = Math.sqrt(d2), f = (want - d) / d * 0.012;
          this.canchor[a * 3 + H0] -= dx * f; this.canchor[a * 3 + H1] -= dy * f;
          this.canchor[b * 3 + H0] += dx * f; this.canchor[b * 3 + H1] += dy * f;
        }
      }
    }

    // 排斥
    const root = this.tree.build(pos, n);
    const out = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      out[0] = out[1] = out[2] = 0;
      this.tree.force(root, pos, i, o.repel, o.theta, out);
      for (let d = 0; d < dim; d++) frc[i * 3 + d] += out[d];
    }

    // 弹簧
    for (let l = 0; l < this.links.length; l++) {
      const L = this.links[l], a = L.a, b = L.b;
      let dx = pos[b * 3] - pos[a * 3], dy = pos[b * 3 + 1] - pos[a * 3 + 1], dz = dim === 3 ? pos[b * 3 + 2] - pos[a * 3 + 2] : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const rest = L.len || o.length;
      const k = L.k != null ? L.k : o.spring;
      const f = (dist - rest) * k;
      dx = dx / dist * f; dy = dy / dist * f; dz = dz / dist * f;
      frc[a * 3] += dx; frc[a * 3 + 1] += dy;
      frc[b * 3] -= dx; frc[b * 3 + 1] -= dy;
      if (dim === 3) { frc[a * 3 + 2] += dz; frc[b * 3 + 2] -= dz; }
    }

    // 簇内引力 + 簇锚点 + 向心 + 径向分层（+ 三维时的竖直分层）
    // 径向分层是这片林子长成树的原因：每个节点被推到离树心
    // 「自己深度该在的那一圈」上，根在内，叶在外。
    // 三维里再加一条竖直的：深度越深越高，于是每棵树从地面向上张开。
    const T3 = !!o.tree3d, H1 = T3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const c = this.clusterOf[i];
      for (let d = 0; d < dim; d++) {
        if (T3 && d === 1) continue;                     // 高度另算
        const p = pos[i * 3 + d];
        frc[i * 3 + d] -= p * o.gravity;
        if (c >= 0) {
          frc[i * 3 + d] += (this.cpos[c * 3 + d] - p) * o.cluster;
          // 锚点只拉「整棵树」：力按簇质心的偏离算，均匀加给每个成员。
          // 这样树整体待在自己的位置，但枝叶是自由的——甩一片叶子，
          // 它会带着惯性飞出去，拖着整棵树晃，再被枝条拉回来。
          frc[i * 3 + d] += (this.canchor[c * 3 + d] - this.cpos[c * 3 + d]) * o.anchor;
        }
      }
      if (T3) frc[i * 3 + 1] += (this.height[i] - pos[i * 3 + 1]) * o.vert;
      if (c >= 0 && o.radial && this.radius[i] > 0) {
        const dx = pos[i * 3] - this.cpos[c * 3], dy = pos[i * 3 + H1] - this.cpos[c * 3 + H1];
        const r = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const f = (this.radius[i] - r) / r * o.radial;
        frc[i * 3] += dx * f; frc[i * 3 + H1] += dy * f;
      }
    }

    // 共享节点：锚定于引用它的各簇锚点的中点，
    // 而不是挂在某一棵树旁边、再把枝条甩过整张图
    for (let s = 0; s < this.shared.length; s++) {
      const S = this.shared[s], i = S.i, cs = S.cs;
      for (let d = 0; d < dim; d++) {
        if (o.tree3d && d === 1) continue;
        let m = 0;
        for (let j = 0; j < cs.length; j++) m += this.canchor[cs[j] * 3 + d];
        m /= cs.length;
        frc[i * 3 + d] += (m - pos[i * 3 + d]) * (o.sharedK || 0.05);
      }
    }

    // 积分
    const damp = Math.pow(o.damping, dt * 60);
    const maxV = o.maxV;
    const maxF = o.maxF || Infinity;
    for (let i = 0; i < n; i++) {
      if (this.fixed[i]) { vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0; continue; }
      // 受力封顶：被甩远的节点像被橡皮筋牵着，慢慢荡回来，
      // 而不是被几根拉满的弹簧一帧拽回——惯性才看得见
      if (maxF < Infinity) {
        const fm = Math.sqrt(frc[i * 3] ** 2 + frc[i * 3 + 1] ** 2 + frc[i * 3 + 2] ** 2);
        if (fm > maxF) { const k = maxF / fm; frc[i * 3] *= k; frc[i * 3 + 1] *= k; frc[i * 3 + 2] *= k; }
      }
      for (let d = 0; d < dim; d++) {
        let v = (vel[i * 3 + d] + frc[i * 3 + d] * dt * 60 * this.alpha) * damp;
        if (v > maxV) v = maxV; else if (v < -maxV) v = -maxV;
        vel[i * 3 + d] = v;
        pos[i * 3 + d] += v * dt * 60 * 0.5;
      }
    }
    return true;
  };

  // 拖拽：跟随指针，并把指针速度攒起来，松手时交还给节点
  Sim.prototype.grab = function (i) { this.grabbed = i; this.fixed[i] = 1; this._last = null; this.alphaTarget = 0.35; this.reheat(0.35); };
  Sim.prototype.dragTo = function (i, p, dt) {
    const prev = [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
    for (let d = 0; d < this.dim; d++) this.pos[i * 3 + d] = p[d];
    const k = dt > 0 ? 1 / (dt * 60) : 1;
    this._dragV = [(p[0] - prev[0]) * k, (p[1] - prev[1]) * k, ((p[2] || 0) - prev[2]) * k];
  };
  Sim.prototype.release = function (i) {
    this.fixed[i] = 0;
    this.grabbed = -1;
    this.alphaTarget = 0;
    this.reheat(1);
    const v = this._dragV || [0, 0, 0];
    const cap = this.o.maxV * 1.6;
    for (let d = 0; d < this.dim; d++) this.vel[i * 3 + d] = Math.max(-cap, Math.min(cap, v[d] * 0.85));
    this._dragV = null;
  };

  global.Sim = Sim;
  global.Sim.Tree = Tree;
})(window);
