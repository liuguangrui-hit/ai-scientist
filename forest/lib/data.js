/* 动态假设-证据森林 · 数据生成
 *
 * 这里长出来的不是随机噪声，而是一片真的森林：每个 idea 是一棵论证树，
 * 树与树之间靠共享假设缝合，证据带符号地累积，裁定沿着角色传播。
 * 所有视觉上的美，都来自这层结构——不是画上去的。
 *
 * 经典脚本，无模块：双击 html 就能跑，不需要服务器。
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 确定性随机
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- 六个研究方向
  // 前四个属于 AI 安全，后两个属于 AI 科学家，与 conduct_survey 的 topics.md 对应
  const THEMES = [
    { id: 'INJ', zh: '提示注入', en: 'Prompt injection', hue: 344 },
    { id: 'JBK', zh: '越狱与对齐', en: 'Jailbreak & alignment', hue: 286 },
    { id: 'PRV', zh: '隐私与投毒', en: 'Privacy & poisoning', hue: 38 },
    { id: 'TRU', zh: '幻觉与可信', en: 'Hallucination & trust', hue: 214 },
    { id: 'HYP', zh: '假设生成', en: 'Hypothesis generation', hue: 168 },
    { id: 'EVA', zh: '自动实验与评审', en: 'Automated experiments & review', hue: 192 },
  ];

  // 断言的构件：主语 + 关系 + 对象 + 形态 + 条件
  const SUBJ = {
    INJ: ['注入成功率', '工具返回值信任度', '隔离标记强度', '指令服从率', '检测漏报率', '注入片段注意力', '多轮注入累积', '外泄成功率'],
    JBK: ['越狱成功率', '护栏覆盖面', '拒答率', '越狱链路长度', '对齐税', '奖励误设程度', '过度拒答率', '红队发现率'],
    PRV: ['成员推断优势', '投毒样本占比', '后门触发率', '训练数据提取率', '遗忘完整度', '水印检出率', '隐私预算', '窃取保真度'],
    TRU: ['幻觉率', '引用准确率', '校准误差', '事实一致性', '不确定性质量', '自洽率', '检索命中率', '对抗鲁棒半径'],
    HYP: ['假设新颖度', '可检验比例', '文献覆盖率', '假设复用率', '归纳正确率', '追问深度', '假设树规模', '抽象层级'],
    EVA: ['实验复现率', '审稿一致性', '代码可运行率', '实验成本', '失败自愈率', '结论可追溯率', '意见采纳率', '基准污染度'],
  };
  const REL = ['随', '与', '在', '相对', '对'];
  const OBJ = ['模型规模', '上下文长度', '工具调用数', '追问轮数', '采样温度', '检索片段数', '训练数据规模', '会话轮数', '推理预算', 'agent 数量'];
  const SHAPE = ['呈幂律关系', '存在拐点', '单调下降', '先升后降', '趋于饱和', '近似线性', '出现相变', '方差显著增大', '与理论上界吻合', '不受影响'];
  const COND = ['', '（多轮会话中）', '（黑盒设定下）', '（固定推理预算下）', '（去掉安全对齐后）', '（跨三个基准）', '（长上下文条件下）', '（同种子重复）'];

  const EN_SUBJ = {
    INJ: ['injection success rate', 'tool-return trust', 'delimiter strength', 'instruction-following rate', 'detection miss rate', 'attention on injected span', 'multi-turn accumulation', 'exfiltration success'],
    JBK: ['jailbreak success rate', 'guardrail coverage', 'refusal rate', 'jailbreak chain length', 'alignment tax', 'reward misspecification', 'over-refusal rate', 'red-team discovery rate'],
    PRV: ['membership-inference advantage', 'poisoned fraction', 'backdoor trigger rate', 'training-data extraction rate', 'unlearning completeness', 'watermark detection rate', 'privacy budget', 'stealing fidelity'],
    TRU: ['hallucination rate', 'citation accuracy', 'calibration error', 'factual consistency', 'uncertainty quality', 'self-consistency', 'retrieval hit rate', 'robust radius'],
    HYP: ['hypothesis novelty', 'testable fraction', 'literature coverage', 'hypothesis reuse', 'induction accuracy', 'questioning depth', 'tree size', 'abstraction level'],
    EVA: ['reproduction rate', 'review agreement', 'code run rate', 'experiment cost', 'failure self-repair rate', 'claim traceability', 'comment adoption rate', 'benchmark contamination'],
  };
  const EN_SHAPE = ['follows a power law', 'has an elbow', 'decreases monotonically', 'rises then falls', 'saturates', 'is nearly linear', 'shows a phase transition', 'grows in variance', 'matches the theoretical bound', 'is unaffected'];
  const EN_OBJ = ['model scale', 'context length', 'number of tool calls', 'questioning rounds', 'sampling temperature', 'retrieved chunks', 'training-data scale', 'session turns', 'inference budget', 'number of agents'];

  // idea i 属于方向 i % 6，所以名字按方向交错排列
  const NAMES = {
    INJ: [['返回值隔离', 'Tool-return isolation'], ['注入检测', 'Injection detection'], ['注入面定位', 'Injection surface'], ['多轮注入', 'Multi-turn injection'], ['外泄防护', 'Exfiltration defence'], ['工具链审计', 'Tool-chain audit'], ['检索投毒', 'Retrieval poisoning']],
    JBK: [['越狱评测', 'Jailbreak evaluation'], ['护栏迁移', 'Guardrail transfer'], ['多轮越狱', 'Multi-turn jailbreak'], ['拒答校准', 'Refusal calibration'], ['对齐税度量', 'Alignment tax'], ['奖励误设', 'Reward misspecification'], ['红队自动化', 'Automated red-teaming']],
    PRV: [['后门检测', 'Backdoor detection'], ['成员推断', 'Membership inference'], ['数据提取', 'Data extraction'], ['机器遗忘', 'Machine unlearning'], ['模型水印', 'Model watermarking'], ['隐私预算', 'Privacy budget'], ['模型窃取', 'Model stealing']],
    TRU: [['幻觉检测', 'Hallucination detection'], ['引用核验', 'Citation checking'], ['置信校准', 'Confidence calibration'], ['事实一致', 'Factual consistency'], ['检索增强', 'Retrieval augmentation'], ['对抗鲁棒', 'Adversarial robustness'], ['不确定性', 'Uncertainty estimation']],
    HYP: [['苏格拉底追问', 'Socratic questioning'], ['假设归纳', 'Hypothesis induction'], ['文献发现', 'Literature discovery'], ['新颖度评估', 'Novelty assessment'], ['可检验性', 'Testability'], ['假设抽象', 'Hypothesis abstraction']],
    EVA: [['复现评测', 'Reproduction evaluation'], ['自动审稿', 'Automated review'], ['自动实验', 'Automated experiments'], ['失败自愈', 'Failure self-repair'], ['基准污染', 'Benchmark contamination'], ['负结果评测', 'Negative-result evaluation']],
  };
  const IDEA_ZH = [], IDEA_EN = [];
  for (let r = 0; IDEA_ZH.length < 40; r++) for (const t of THEMES) {
    const n = NAMES[t.id][r];
    if (n && IDEA_ZH.length < 40) { IDEA_ZH.push(n[0]); IDEA_EN.push(n[1]); }
  }

  // ---------------------------------------------------------------- 生成
  function build(opts) {
    const o = Object.assign({ ideas: 38, seed: 20260921, share: 0.3, depth: 4, branch: 3.1, evidence: 3.4 }, opts || {});
    const rnd = mulberry32(o.seed);
    const pick = (a) => a[(rnd() * a.length) | 0];
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.1;

    const ideas = [], hyps = [], hypById = new Map(), edges = [], evidence = [], experiments = [];
    const byTheme = new Map(THEMES.map((t) => [t.id, []]));

    // ---- ideas
    for (let i = 0; i < o.ideas; i++) {
      const theme = THEMES[i % THEMES.length];
      const r = rnd();
      const status = r < 0.34 ? 'running' : r < 0.52 ? 'candidate' : r < 0.86 ? 'done' : 'parked';
      ideas.push({
        id: 'P-' + String(101 + i),
        idx: i,
        theme: theme.id,
        hue: theme.hue + gauss() * 9,
        name: { zh: IDEA_ZH[i % IDEA_ZH.length], en: IDEA_EN[i % IDEA_EN.length] },
        status,
        nodes: [],
      });
    }

    // ---- 每个 idea 长一棵树，节点或者新建假设，或者复用已有的（森林的缝合处）
    let hid = 1;
    const newHyp = (theme, idea) => {
      const s = SUBJ[theme], es = EN_SUBJ[theme];
      const k = (rnd() * s.length) | 0, sh = (rnd() * SHAPE.length) | 0, ob = (rnd() * OBJ.length) | 0;
      const h = {
        id: 'H-' + String(hid++).padStart(4, '0'),
        theme,
        claim: {
          zh: s[k] + pick(REL) + OBJ[ob] + SHAPE[sh] + pick(COND),
          en: es[k] + ' ' + EN_SHAPE[sh] + ' in ' + EN_OBJ[ob],
        },
        ideas: [], evidence: [], score: 0, status: 'untested', born: idea.idx,
        induced: rnd() < 0.05, lit: rnd() < 0.08,
      };
      hyps.push(h); hypById.set(h.id, h); byTheme.get(theme).push(h);
      return h;
    };

    for (const idea of ideas) {
      const pool = byTheme.get(idea.theme);
      const size = Math.round(9 + rnd() * 22);
      const nodes = [];
      // 根
      const root = newHyp(idea.theme, idea);
      nodes.push({ k: '1', hyp: root.id, parent: null, role: 'own_to_prove', depth: 0 });
      while (nodes.length < size) {
        const parent = nodes[(rnd() * nodes.length) | 0];
        if (parent.depth >= o.depth) continue;
        const sibs = nodes.filter((n) => n.parent === parent.k).length;
        if (sibs > o.branch + gauss()) continue;
        // 复用：优先复用同方向的已有假设，少量跨方向复用
        let h = null;
        if (pool.length > 6 && rnd() < o.share) {
          const cross = rnd() < 0.22;
          const src = cross ? hyps : pool;
          for (let t = 0; t < 8 && !h; t++) {
            const c = src[(rnd() * src.length) | 0];
            if (c && c.born !== idea.idx && !nodes.some((n) => n.hyp === c.id) && c.ideas.length < 6) h = c;
          }
        }
        if (!h) h = newHyp(idea.theme, idea);
        nodes.push({
          k: parent.k + '.' + (sibs + 1), hyp: h.id, parent: parent.k, depth: parent.depth + 1,
          role: h.born !== idea.idx || rnd() < 0.12 ? 'borrowed_assumption' : 'own_to_prove',
        });
      }
      idea.nodes = nodes;
      for (const n of nodes) {
        const h = hypById.get(n.hyp);
        if (!h.ideas.includes(idea.id)) h.ideas.push(idea.id);
        if (h.depth == null || h.ideas[0] === idea.id) h.depth = n.depth;
        h.leaf = !nodes.some((m) => m.parent === n.k);
      }
    }

    // ---- 证据：带符号，累积，状态由此派生
    let eid = 1;
    for (const h of hyps) {
      const live = h.ideas.some((id) => { const i = ideas.find((x) => x.id === id); return i && (i.status === 'running' || i.status === 'candidate'); });
      let n = Math.max(0, Math.round(gauss() * 1.6 + o.evidence * (live ? 1 : 0.6)));
      if (h.lit) n = Math.max(1, n);
      const bias = rnd();
      for (let i = 0; i < n; i++) {
        const positive = rnd() < (bias < 0.18 ? 0.25 : bias > 0.82 ? 0.92 : 0.66);
        const delta = Math.round((positive ? 0.2 + rnd() * 0.6 : -(0.2 + rnd() * 0.7)) * 10) / 10;
        const idea = h.ideas[(rnd() * h.ideas.length) | 0];
        const e = { id: 'e_' + eid++, hyp: h.id, idea, delta, at: rnd() };
        h.evidence.push(e); evidence.push(e);
      }
      h.score = Math.round(h.evidence.reduce((s, e) => s + e.delta, 0) * 10) / 10;
      const pivots = h.evidence.slice(-3).every((e) => e.delta < 0) && h.evidence.length >= 3;
      h.status = h.score >= 1.0 ? 'self_verified'
        : h.score <= -1.0 || pivots ? 'pending_review'
        : h.induced ? 'inductive_unverified'
        : h.lit ? 'lit_supported'
        : h.evidence.length ? 'active' : 'untested';
      if (!live && h.status !== 'self_verified' && rnd() < 0.5) h.status = 'closed';
    }
    // 少数正在跑
    const runnable = hyps.filter((h) => h.status === 'active' || h.status === 'untested');
    for (let i = 0; i < Math.min(runnable.length, Math.round(hyps.length * 0.035)); i++) {
      const h = runnable[(rnd() * runnable.length) | 0];
      h.status = 'testing';
      experiments.push({ id: 'x_' + (100 + i), hyp: h.id, idea: h.ideas[0], prog: rnd() });
    }

    // ---- 边：树边、跨 idea 依赖、归纳边
    const nodeKey = new Map(); // idea|k -> hyp
    for (const idea of ideas) for (const n of idea.nodes) nodeKey.set(idea.id + '|' + n.k, n.hyp);
    for (const idea of ideas) {
      for (const n of idea.nodes) {
        if (!n.parent) continue;
        const a = nodeKey.get(idea.id + '|' + n.parent), b = n.hyp;
        if (a && b && a !== b) edges.push({ a, b, kind: 'tree', idea: idea.id, role: n.role });
      }
    }
    const seen = new Set(edges.map((e) => e.a + '>' + e.b));
    for (const h of hyps) {
      if (h.induced) {
        for (let i = 0; i < 2; i++) {
          const src = hyps[(rnd() * hyps.length) | 0];
          if (src.id !== h.id && !seen.has(src.id + '>' + h.id)) { edges.push({ a: src.id, b: h.id, kind: 'induced' }); seen.add(src.id + '>' + h.id); }
        }
      }
      if (h.ideas.length > 1 && rnd() < 0.5) {
        const pool2 = byTheme.get(h.theme);
        const c = pool2[(rnd() * pool2.length) | 0];
        if (c && c.id !== h.id && !seen.has(h.id + '>' + c.id)) { edges.push({ a: h.id, b: c.id, kind: 'cross' }); seen.add(h.id + '>' + c.id); }
      }
    }

    // ---- 裁定队列
    const verdicts = hyps.filter((h) => h.status === 'pending_review');

    const shared = hyps.filter((h) => h.ideas.length > 1);
    return {
      themes: THEMES, ideas, hyps, hypById, edges, evidence, experiments, verdicts,
      stats: {
        ideas: ideas.length, running: ideas.filter((i) => i.status === 'running').length,
        hyps: hyps.length, shared: shared.length,
        maxShare: shared.reduce((m, h) => Math.max(m, h.ideas.length), 0),
        edges: edges.length, evidence: evidence.length,
        verified: hyps.filter((h) => h.status === 'self_verified').length,
        pending: verdicts.length, testing: hyps.filter((h) => h.status === 'testing').length,
      },
      seed: o.seed,
    };
  }

  global.Forest = { build, THEMES, mulberry32 };
})(window);
