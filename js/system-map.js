// The system map: AI-Scientist-2 at a glance, live.
// Two forests — the real one, built only from our experiments (left, research), and the
// literature one, built only from papers (right, learning), each the front page's forest
// in a tint of its own — with the playbooks between them, the monthly literature pipeline
// on top and writing and submission below. Particles stream along every hand-off; each
// card names its role, agent and model; a click on a module, a store, a role or an agent
// (or a hover on a line) shows what it touches. Canvas draws the motion, HTML the text.
import { html, useState, useEffect, useRef, useMemo, L, LANG, view } from './core.js';
import { makeForest } from './forest-mini.js';

const W = 1600, H = 980;
const CW = 168, CH = 52;
const LANE = {
  literature: { rgb: [56, 189, 248], zh: '文献', en: 'Literature' },
  learning: { rgb: [244, 114, 182], zh: '学习', en: 'Learning' },
  research: { rgb: [52, 211, 153], zh: '研究', en: 'Research' },
  writing: { rgb: [251, 191, 36], zh: '写作', en: 'Writing' },
  publishing: { rgb: [251, 146, 60], zh: '审稿与投稿', en: 'Review & submit' },
  meta: { rgb: [167, 139, 250], zh: '经验', en: 'Playbooks' },
  maintenance: { rgb: [186, 198, 216], zh: '维护', en: 'Maintenance' },
};
// the model each agent runs today (agent_bindings records only the agent)
const MODEL = { 'Claude Code': 'Opus 5.5', Codex: 'GPT-6.1 Sol' };
const agentOf = (a) => (/claude/i.test(a || '') ? 'Claude Code' : /codex/i.test(a || '') ? 'Codex' : a);
const ROLE = { maintainer: '工程维护', lead: '科研负责人', analyst: '研究分析', support: '资料支持', engineer: '科研工程', writer: '科研写作', auditor: '独立审计', coach: '行为指导' };
const ROLE_ORDER = ['lead', 'engineer', 'support', 'maintainer', 'analyst', 'auditor', 'writer', 'coach'];

// [x, y] centres; kind: module (default) | forest | crystal | human
const N = {
  conduct_survey: [124, 150], audit_survey: [316, 150], analyze_trends: [508, 150], audit_trends: [700, 150], download_papers: [985, 150],
  develop_idea: [112, 318], review_idea: [112, 440], consolidate_forest: [112, 600], human_adopt: [226, 312, 'gate'],
  grow_tree: [342, 300], test_hypothesis: [498, 470], audit_tree: [318, 690],
  forest: [318, 470, 'forest'],
  playbooks: [690, 452, 'crystal'], manage_playbooks: [690, 690],
  study_paper: [985, 300], consolidate_literature: [1150, 392], test_literature: [1150, 566], audit_literature: [985, 690],
  litforest: [975, 470, 'forest'],
  plan_paper: [190, 806], prepare_figures: [380, 806], write_paper: [570, 806], audit_paper: [380, 884],
  review_paper: [780, 806], revise_paper: [780, 884], edit_paper: [970, 806], review_style: [1150, 806], you: [1150, 884, 'gate'], submit_paper: [1150, 936], track_deadlines: [970, 936],
  maintain_backend: [1419, 834], maintain_frontend: [1419, 928],
};
const LANE_OF = {
  conduct_survey: 'literature', audit_survey: 'literature', analyze_trends: 'literature', audit_trends: 'literature', download_papers: 'literature',
  study_paper: 'learning', consolidate_literature: 'learning', test_literature: 'learning', audit_literature: 'learning', litforest: 'learning',
  manage_playbooks: 'meta', playbooks: 'meta',
  develop_idea: 'research', review_idea: 'research', human_adopt: 'research', grow_tree: 'research', test_hypothesis: 'research', audit_tree: 'research', consolidate_forest: 'research', forest: 'research',
  plan_paper: 'writing', prepare_figures: 'writing', write_paper: 'writing', audit_paper: 'writing',
  review_paper: 'publishing', revise_paper: 'publishing', edit_paper: 'publishing', review_style: 'publishing', you: 'publishing', submit_paper: 'publishing', track_deadlines: 'publishing',
  maintain_backend: 'maintenance', maintain_frontend: 'maintenance',
};
const NAME = {
  conduct_survey: ['文献采集', 'Survey'], audit_survey: ['采集审核', 'Survey audit'], analyze_trends: ['趋势分析', 'Trends'], audit_trends: ['趋势审核', 'Trend audit'], download_papers: ['论文下载', 'Downloads'],
  study_paper: ['研读论文', 'Study papers'], consolidate_literature: ['文献整合', 'Consolidate lit.'], test_literature: ['文献预测', 'Predict lit.'], audit_literature: ['预测判定', 'Judge predictions'], manage_playbooks: ['经验榜管理', 'Coach playbooks'],
  develop_idea: ['发展 Idea', 'Develop ideas'], review_idea: ['Idea 审核', 'Review ideas'], grow_tree: ['假设树', 'Grow tree'], test_hypothesis: ['假设检验', 'Test hypotheses'], audit_tree: ['假设判定', 'Audit tree'], consolidate_forest: ['整合森林', 'Consolidate forest'],
  plan_paper: ['论文提纲', 'Outline'], prepare_figures: ['论文图组', 'Figures'], write_paper: ['论文全文', 'Manuscript'], audit_paper: ['写作审计', 'Writing audit'],
  review_paper: ['内部审稿', 'Internal review'], revise_paper: ['改稿', 'Revise'], edit_paper: ['叙事编辑', 'Narrative editing'], review_style: ['编辑审稿', 'Editorial review'], submit_paper: ['投稿', 'Submit'], track_deadlines: ['刊会日期', 'Venue dates'],
  maintain_backend: ['后端维护', 'Backend upkeep'], maintain_frontend: ['前端维护', 'Frontend upkeep'],
  forest: ['真实森林', 'The forest'], litforest: ['文献森林', 'Literature forest'], playbooks: ['经验榜', 'Playbooks'], you: ['人类判定 · 投稿', 'Human decision · submit'], human_adopt: ['人类判定 · 立项', 'Human decision · adopt'],
};
// the rule or number that most shapes each module's output
const KEY = {
  conduct_survey: ['按月 · 按领域 · 白名单刊会', 'monthly · per domain · whitelisted venues'], audit_survey: ['审核只对所读的那一版有效', 'holds only for the version it read'],
  analyze_trends: ['每个领域一份月报', 'one report per domain'], audit_trends: ['待审 → 通过 / 返工', 'pending → passed / failed'],
  download_papers: ['逐篇核对全文', 'every PDF checked'], study_paper: ['冷启动入文献森林 · 热启动立复现课题', 'cold: literature forest · warm: reproduction'],
  consolidate_literature: ['只用截止月份前的文献 · 不联网', 'only papers up to the cut · offline'], test_literature: ['只看截止月份后的实验设置', 'only setups after the cut'],
  audit_literature: ['符合 / 部分符合 / 不符 / 无法判定', 'match / partial / miss / undecidable'], manage_playbooks: ['每张榜至多 20 条 · 用新论文检验', '≤20 entries · tested on new papers'],
  develop_idea: ['批量发展 · 诘问至多 3 轮', 'in batches · ≤3 rounds of questioning'], review_idea: ['通过 / 修改 / 废止 · 至多 3 轮', 'pass / revise / void · ≤3 rounds'],
  grow_tree: ['每条假设线至多改写 2 次', '≤2 rewrites per line'], test_hypothesis: ['先登记预测，再做实验', 'predict first, then run'],
  audit_tree: ['叶子置信度 80% 通过 · 至多 4 次实验', 'leaf passes at 80% · ≤4 runs'], consolidate_forest: ['更少的假设解释更多证据', 'fewer hypotheses, more evidence'],
  plan_paper: ['审计通过才做图组', 'figures only after the audit'], prepare_figures: ['审计通过才写全文', 'manuscript only after the audit'], write_paper: ['按版本交付，状态记在标记上', 'versioned; the state lives in a marker'],
  audit_paper: ['提纲、图组、全文分别审计', 'outline, figures and text audited apart'], review_paper: ['科学通过交编辑 · 三次未通过交用户裁定', 'science passed → editing · three failures → user decision'], edit_paper: ['保留科学含义 · 新版交编辑审稿', 'preserve scientific meaning · new version for editorial review'], review_style: ['通过交用户 · 退修只回叙事编辑', 'pass → user · revision → narrative editing only'], revise_paper: ['逐条回复 · 缺证据另立改稿课题', 'point by point · new evidence opens a project'],
  submit_paper: ['从投稿到正式发表', 'from submission to publication'], track_deadlines: ['白名单刊会与专刊的截稿', 'whitelist deadlines'],
  maintain_backend: ['链接 · 状态标记 · 工具', 'links · markers · tools'], maintain_frontend: ['工程约定 → 工作台', 'repo conventions → workbench'],
};
// edges: [from, to, kind, modes, [zh, en], bend | {c1, c2}]; kind: flow | loop | data | ref
const R_ = ['research'], C_ = ['cold'], WM = ['warm'], RW = ['research', 'warm'], CWM = ['cold', 'warm'];
const E = [
  ['conduct_survey', 'audit_survey', 'flow', R_, ['当月论文清单', 'monthly list']],
  ['audit_survey', 'analyze_trends', 'flow', R_, ['审核通过的清单', 'audited list']],
  ['audit_survey', 'conduct_survey', 'loop', R_, ['返工', 'rework'], 26],
  ['analyze_trends', 'audit_trends', 'flow', R_, ['趋势月报', 'trend report']],
  ['audit_trends', 'analyze_trends', 'loop', R_, ['返工', 'rework'], 26],
  ['audit_trends', 'develop_idea', 'flow', R_, ['通过的选题线索', 'passed sparks'], { c1: [700, 262], c2: [236, 226] }],
  ['audit_trends', 'download_papers', 'flow', ['research', 'cold'], ['推荐精读清单', 'reading list']],
  ['download_papers', 'study_paper', 'flow', CWM, ['论文全文', 'full text']],
  ['develop_idea', 'review_idea', 'flow', R_, ['送审的 Idea', 'Idea for review'], -28],
  ['review_idea', 'develop_idea', 'loop', R_, ['通过 / 修改 / 废止', 'pass / revise / void'], -28],
  ['review_idea', 'human_adopt', 'flow', R_, ['通过审核', 'passed review'], 18],
  ['human_adopt', 'grow_tree', 'flow', R_, ['立项', 'adopted']],
  ['consolidate_forest', 'grow_tree', 'flow', R_, ['高层假设', 'high-level hypothesis'], { c1: [226, 560], c2: [222, 340] }],
  ['grow_tree', 'test_hypothesis', 'flow', RW, ['待检验的叶子', 'leaves to test'], -40],
  ['test_hypothesis', 'audit_tree', 'flow', RW, ['证据与预测', 'evidence + prediction'], -40],
  ['audit_tree', 'test_hypothesis', 'loop', RW, ['重做实验', 'redo'], 22],
  ['audit_tree', 'grow_tree', 'loop', RW, ['改写或拆分', 'rewrite / split'], { c1: [176, 600], c2: [178, 380] }],
  ['audit_tree', 'plan_paper', 'flow', R_, ['研究通过', 'research passed'], 16],
  ['grow_tree', 'forest', 'data', RW, ['假设', 'hypotheses']],
  ['test_hypothesis', 'forest', 'data', RW, ['预测与证据', 'predictions · evidence']],
  ['audit_tree', 'forest', 'data', RW, ['判定', 'verdicts']],
  ['study_paper', 'litforest', 'data', C_, ['论文、设置、结果与主张', 'papers · setups · results · claims']],
  ['litforest', 'consolidate_literature', 'data', CWM, ['截止月份前的文献', 'papers up to the cut']],
  ['consolidate_literature', 'litforest', 'data', C_, ['高层假设', 'high-level hypotheses'], 30],
  ['litforest', 'test_literature', 'data', C_, ['之后论文的实验设置', 'setups of later papers']],
  ['consolidate_literature', 'test_literature', 'flow', C_, ['待检验的高层假设', 'hypotheses to test'], -20],
  ['test_literature', 'audit_literature', 'flow', C_, ['预测', 'predictions'], -30],
  ['audit_literature', 'litforest', 'data', C_, ['判定', 'verdicts']],
  ['audit_literature', 'manage_playbooks', 'flow', C_, ['预测命中情况', 'hits and misses']],
  ['manage_playbooks', 'playbooks', 'flow', ['cold', 'research'], ['规则、记分与排名', 'rules · scores · ranks']],
  ['study_paper', 'playbooks', 'ref', CWM, ['从论文学到的做法', 'know-how from papers'], { c1: [880, 330], c2: [790, 392] }],
  ['playbooks', 'develop_idea', 'ref', R_, ['提出与修改 Idea', 'proposing ideas'], { c1: [540, 356], c2: [266, 352] }],
  ['playbooks', 'grow_tree', 'ref', R_, ['拆分与改写假设', 'splitting hypotheses'], -30],
  ['playbooks', 'test_hypothesis', 'ref', R_, ['设计实验与总结证据', 'designing experiments'], 8],
  ['playbooks', 'consolidate_literature', 'ref', C_, ['整合假设', 'consolidating'], { c1: [820, 400], c2: [1040, 360] }],
  ['playbooks', 'consolidate_forest', 'ref', R_, ['整合假设', 'consolidating'], { c1: [580, 590], c2: [260, 640] }],
  ['study_paper', 'grow_tree', 'flow', WM, ['复现课题', 'reproduction project'], { c1: [760, 236], c2: [500, 236] }],
  ['consolidate_literature', 'grow_tree', 'flow', WM, ['整合课题', 'consolidation project'], { c1: [1110, 220], c2: [440, 206] }],
  ['audit_tree', 'study_paper', 'flow', WM, ['复现结论', 'reproduction result'], { c1: [560, 752], c2: [880, 222] }],
  ['plan_paper', 'prepare_figures', 'flow', R_, ['提纲通过', 'outline passed']],
  ['prepare_figures', 'write_paper', 'flow', R_, ['图组通过', 'figures passed']],
  ['plan_paper', 'audit_paper', 'loop', R_, ['送审', 'audit'], 0],
  ['prepare_figures', 'audit_paper', 'loop', R_, ['送审', 'audit'], 0],
  ['write_paper', 'audit_paper', 'loop', R_, ['送审', 'audit'], 0],
  ['audit_paper', 'review_paper', 'flow', R_, ['全文通过', 'manuscript passed'], 24],
  ['review_paper', 'revise_paper', 'flow', R_, ['修改意见', 'revisions'], -24],
  ['revise_paper', 'review_paper', 'loop', R_, ['修改稿', 'revised'], -24],
  ['review_paper', 'edit_paper', 'flow', R_, ['科学审稿通过', 'science review passed']],
  ['edit_paper', 'review_style', 'flow', R_, ['叙事编辑完成', 'editing complete']],
  ['review_style', 'edit_paper', 'loop', R_, ['编辑退修', 'editorial revision'], -28],
  ['review_style', 'you', 'flow', R_, ['编辑审稿通过', 'editorial review passed']],
  ['review_paper', 'you', 'flow', R_, ['三次未通过 · 用户裁定', 'three failures · user decision'], 36],
  ['you', 'edit_paper', 'loop', R_, ['裁定投稿补编辑／基线内措辞修改', 'submit decision needs editing / wording within baseline'], 30],
  ['you', 'review_paper', 'loop', R_, ['新结果动摇核心且未审', 'new results challenge core · unreviewed'], -36],
  ['you', 'revise_paper', 'loop', R_, ['其他修改／改投', 'other revisions / change venue'], -30],
  ['submit_paper', 'revise_paper', 'loop', R_, ['刊会要求修改', 'venue requests revision'], -26],
  ['revise_paper', 'grow_tree', 'flow', R_, ['改稿课题', 'revision project'], { c1: [600, 930], c2: [180, 800] }],
  ['you', 'submit_paper', 'flow', R_, ['审阅编辑稿，同意投稿', 'edited manuscript reviewed · submit approved']],
  ['track_deadlines', 'submit_paper', 'ref', R_, ['截稿日期', 'deadlines']],
  // the backend upkeep keeps the repo's conventions; the frontend upkeep follows them into the workbench
  ['maintain_backend', 'maintain_frontend', 'ref', [], ['约定变化', 'convention changes']],
  ['track_deadlines', 'plan_paper', 'ref', R_, ['选刊参考', 'venue choice'], { c1: [900, 952], c2: [260, 958] }],
];
// learning first, then research
const MODES = [
  { id: 'all', zh: '全部', en: 'Everything' },
  { id: 'cold', zh: '学习 · 冷启动', en: 'Learning · cold' },
  { id: 'warm', zh: '学习 · 热启动', en: 'Learning · warm' },
  { id: 'research', zh: '研究模式', en: 'Research' },
];
const PATH = {
  cold: ['download_papers', 'study_paper', 'litforest', 'consolidate_literature', 'test_literature', 'audit_literature', 'manage_playbooks', 'playbooks'],
  warm: ['study_paper', 'consolidate_literature', 'grow_tree', 'test_hypothesis', 'audit_tree', 'study_paper', 'playbooks'],
  research: ['conduct_survey', 'audit_survey', 'analyze_trends', 'audit_trends', 'develop_idea', 'review_idea', 'human_adopt', 'grow_tree', 'test_hypothesis', 'audit_tree', 'plan_paper', 'prepare_figures', 'write_paper', 'audit_paper', 'review_paper', 'edit_paper', 'review_style', 'you', 'submit_paper'],
};
// a module that runs a store lights the store and its lines too
const OWNS = { manage_playbooks: 'playbooks' };
const STORES = new Set(['forest', 'litforest', 'playbooks', 'you', 'human_adopt']);
// the human decisions: a gate on the flow, captioned with what is decided
const GATE = { human_adopt: ['立项', 'Adopt'], you: ['投稿', 'Submit'] };

// ---------------------------------------------------------------- geometry
const size = (id) => { const k = N[id][2]; return k === 'forest' ? [250, 200] : k === 'crystal' ? [156, 236] : k === 'gate' ? [42, 42] : LANE_OF[id] === 'maintenance' ? [276, CH] : [CW, CH]; };
function border(id, toward) {
  const [cx, cy, k] = N[id];
  const dx = toward[0] - cx, dy = toward[1] - cy;
  if (k === 'forest') { const a = Math.atan2(dy, dx); return [cx + Math.cos(a) * 112, cy + Math.sin(a) * 92]; }
  const [w, h] = size(id);
  const sx = Math.abs(dx) > 1e-6 ? (w / 2) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 1e-6 ? (h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}
function buildEdge([a, b, kind, modes, label, bend = 0]) {
  const A = N[a], B = N[b];
  let c1, c2;
  if (bend && typeof bend === 'object') { c1 = bend.c1; c2 = bend.c2; }
  else {
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    c1 = [A[0] + dx * 0.33 + nx * bend, A[1] + dy * 0.33 + ny * bend];
    c2 = [A[0] + dx * 0.67 + nx * bend, A[1] + dy * 0.67 + ny * bend];
  }
  const p0 = border(a, c1), p3 = border(b, c2);
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, u = 1 - t;
    pts.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]);
  }
  let length = 0; for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { a, b, kind, modes, label, p0, c1, c2, p3, pts, length };
}
const at = (pts, t) => { const f = Math.max(0, Math.min(1, t)) * 64, i = Math.floor(f), r = f - i, p = pts[i], q = pts[Math.min(64, i + 1)]; return [p[0] + (q[0] - p[0]) * r, p[1] + (q[1] - p[1]) * r]; };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function sprite(rgb) {
  const s = 32, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), r = s / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, rgba(rgb, 0.95)); grd.addColorStop(0.45, rgba(rgb, 0.28)); grd.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = grd; g.fillRect(0, 0, s, s); return c;
}
// what a label must not cover: every card, the crystal, you, each forest's caption, the panel
const OBST = [...Object.keys(N).map((id) => {
  const [x, y, k] = N[id]; const [w, h] = size(id);
  return k === 'forest' ? [x - 160, y + 98, 320, 68] : k === 'gate' ? [x - 34, y - 25, 68, 66] : [x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8];
}), [1240, 80, 360, 700]];
let ruler;
const textW = (s) => { if (!ruler) { ruler = document.createElement('canvas').getContext('2d'); ruler.font = '11.5px "IBM Plex Sans","Noto Sans SC",system-ui,sans-serif'; } return ruler.measureText(s).width + 30; };
const hits = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
function placeLabels(list) {
  const placed = [], out = [];
  for (const e of list) {
    const text = L(...e.label), w = textW(text), h = 26;
    // along the line first, then just above or below it (short lines between close cards)
    const tries = [];
    for (const dy of [0, -30, 30, -44, 44]) for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.2, 0.8]) tries.push([t, dy]);
    for (const [t, dy] of tries) {
      const [x, y0] = at(e.pts, t), y = y0 + dy, r = [x - w / 2, y - h / 2, w, h];
      if (r[0] < 26 || r[1] < 92 || OBST.some((o) => hits(r, o)) || placed.some((o) => hits(r, o))) continue;
      placed.push(r); out.push({ x, y, text, rgb: (LANE[LANE_OF[e.a]] || LANE.meta).rgb }); break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- vendor marks
// the vendors' own marks (Simple Icons), in each vendor's colour
const LOGO = { 'Claude Code': 'img/vendors/claude.svg', Codex: 'img/vendors/openai.svg' };
const Mark = ({ agent, s = 12 }) => (LOGO[agent] ? html`<img class="vmark" src=${LOGO[agent]} width=${s} height=${s} alt=${agent} />` : null);
const Person = () => html`<svg class="person" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6" /><path d="M4.6 20.2c.9-4 3.8-6.2 7.4-6.2s6.5 2.2 7.4 6.2" /></svg>`;
// built once per page, so the forests keep turning across re-renders
const WOODS = {};
const wood = (id, o) => (WOODS[id] ||= makeForest(o));

// ---------------------------------------------------------------- component
export function SystemMap() {
  // the last map seen is drawn at once on the next visit, then refreshed
  const KEEP = 'ais.smap.' + LANG;
  const [data, setData] = useState(() => { try { return JSON.parse(localStorage.getItem(KEEP)) || null; } catch { return null; } });
  const [mode, setMode] = useState('all');
  const [sel, setSel] = useState(null);        // { type: module | store | role | agent, id }
  const [hover, setHover] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(-1);
  const [scale, setScale] = useState(1);
  // on a phone the whole map first, fitted to the width; zoomed, half size and swiped
  const [zoomed, setZoomed] = useState(false);
  const [shown, setShown] = useState(false);
  const [settled, setSettled] = useState(false);      // the entrance has played; cards no longer animate in
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setSettled(true), 2400); return () => clearTimeout(t); }, [shown]);
  const box = useRef(null), canvas = useRef(null), state = useRef({});
  useEffect(() => {
    let alive = true;
    const load = () => view('systemmap').then((d) => { if (!alive) return; setData(d.systemmap); try { localStorage.setItem(KEEP, JSON.stringify(d.systemmap)); } catch {} }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.18 });
    io.observe(el);
    // the whole map on one screen: fit the width, or the window's height below the page's top bar when that is tighter
    const fit = () => {
      const byWidth = el.clientWidth / W;
      const top = el.getBoundingClientRect().top + scrollY;          // where the map starts on the page
      const byHeight = (window.innerHeight - top - 12) / H;
      setScale(el.clientWidth < 760 ? (zoomed ? 0.5 : byWidth) : Math.max(0.5, Math.min(byWidth, byHeight)));
    };
    addEventListener('resize', fit);
    fit(); const ro = new ResizeObserver(() => requestAnimationFrame(fit)); ro.observe(el);
    return () => { io.disconnect(); ro.disconnect(); removeEventListener('resize', fit); };
  }, [zoomed]);
  const edges = useMemo(() => E.map(buildEdge), []);
  const mod = useMemo(() => Object.fromEntries((data?.modules || []).map((m) => [m.id, m])), [data]);
  // what is lit: a hovered line, else a hovered or picked thing, else a mode
  const focus = useMemo(() => {
    const ids = new Set(), on = new Set();
    const touch = (id) => edges.forEach((e, i) => { if (e.a === id || e.b === id) { on.add(i); ids.add(e.a); ids.add(e.b); } });
    const pick = hover || sel;
    if (hoverEdge >= 0) { on.add(hoverEdge); ids.add(edges[hoverEdge].a); ids.add(edges[hoverEdge].b); }
    // backend upkeep looks over every module and store; frontend upkeep over the workbench itself
    else if (pick?.id === 'maintain_backend') { Object.keys(N).forEach((k) => ids.add(k)); touch(pick.id); }
    else if (pick?.type === 'module' || pick?.type === 'store') { ids.add(pick.id); touch(pick.id); if (OWNS[pick.id]) touch(OWNS[pick.id]); }
    else if (pick?.type === 'role' || pick?.type === 'agent') {
      for (const m of data?.modules || []) if ((pick.type === 'role' ? m.role : m.agent) === pick.id) { ids.add(m.id); if (OWNS[m.id]) ids.add(OWNS[m.id]); }
      edges.forEach((e, i) => { if (ids.has(e.a) || ids.has(e.b)) on.add(i); });
    } else if (mode !== 'all') edges.forEach((e, i) => { if (e.modes.includes(mode)) { on.add(i); ids.add(e.a); ids.add(e.b); } });
    else return null;
    return { ids, on };
  }, [hover, hoverEdge, sel, mode, edges, data]);
  // labels: a hovered line shows its own; a hovered or picked module or store shows its lines'
  const labels = useMemo(() => {
    if (hoverEdge >= 0) return placeLabels([edges[hoverEdge]]);
    const pick = hover || sel;
    if (!focus || !(pick?.type === 'module' || pick?.type === 'store')) return [];
    // its own lines first, so they win the room
    const own = [...focus.on].map((i) => edges[i]).sort((x, y) => ((x.a === pick.id || x.b === pick.id) ? 0 : 1) - ((y.a === pick.id || y.b === pick.id) ? 0 : 1));
    return placeLabels(own);
  }, [focus, edges, hover, sel, hoverEdge]);
  state.current = { focus, edges, mod, scanId: hoverEdge < 0 ? (hover || sel)?.id : null };

  // ---------------------------------------------------------------- the canvas loop
  useEffect(() => {
    const cv = canvas.current; if (!cv) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
    const g = cv.getContext('2d');
    const cache = new Map();
    const spr = (rgb) => { const k = rgb.join(); if (!cache.has(k)) cache.set(k, sprite(rgb)); return cache.get(k); };
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const parts = state.current.edges.map((e) => {
      const runs = state.current.mod[e.a]?.runs || state.current.mod[e.b]?.runs || 8;
      const n = e.kind === 'data' || e.kind === 'ref' ? 3 : Math.max(3, Math.min(11, Math.round(2 + Math.log2(1 + runs) * 1.1)));
      return Array.from({ length: n }, (_, k) => ({ t: k / n + Math.random() * 0.04, v: (e.kind === 'loop' ? 70 : 105) / e.length }));
    });
    const woods = { forest: wood('forest', { seed: 20260921, hue: 158 }), litforest: wood('litforest', { seed: 7741, hue: 328 }) };
    let raf, last = performance.now(), seen = true, lastScan = null, scanAt = 0;
    const io = new IntersectionObserver(([en]) => { seen = en.isIntersecting; }); io.observe(cv);
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      raf = requestAnimationFrame(frame);
      if (!seen || document.hidden) return;
      const { focus: F, edges: ES, scanId } = state.current;
      g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      ES.forEach((e, i) => {
        const lit = !F || F.on.has(i), lane = LANE[LANE_OF[e.a]] || LANE.meta;
        const a = lit ? (F ? 0.85 : e.kind === 'flow' ? 0.42 : 0.26) : 0.05;
        g.strokeStyle = rgba(lane.rgb, a); g.lineWidth = e.kind === 'flow' ? (F && lit ? 2.4 : 1.6) : F && lit ? 1.6 : 1.1;
        g.setLineDash(e.kind === 'ref' ? [2, 5] : e.kind === 'loop' ? [5, 5] : e.kind === 'data' ? [1, 4] : []);
        g.beginPath(); g.moveTo(e.p0[0], e.p0[1]); g.bezierCurveTo(e.c1[0], e.c1[1], e.c2[0], e.c2[1], e.p3[0], e.p3[1]); g.stroke();
        // an arrowhead along the curve's last stretch, so direction reads even when still
        if (lit) {
          const [x1, y1] = at(e.pts, 0.94), [x2, y2] = e.p3, ang = Math.atan2(y2 - y1, x2 - x1);
          g.setLineDash([]); g.fillStyle = rgba(lane.rgb, Math.min(1, a + 0.2)); g.beginPath();
          g.moveTo(x2, y2); g.lineTo(x2 - 8 * Math.cos(ang - 0.42), y2 - 8 * Math.sin(ang - 0.42)); g.lineTo(x2 - 8 * Math.cos(ang + 0.42), y2 - 8 * Math.sin(ang + 0.42)); g.closePath(); g.fill();
        }
      });
      g.setLineDash([]);
      for (const id of ['forest', 'litforest']) woods[id]?.draw(g, N[id][0], N[id][1] - 4, 290, now, dt, !F || F.ids.has(id), still, scale * dpr);
      g.globalCompositeOperation = 'lighter';
      ES.forEach((e, i) => {
        if (F && !F.on.has(i)) return;
        const s = spr((LANE[LANE_OF[e.a]] || LANE.meta).rgb), big = e.kind === 'flow' ? 1 : 0.7;
        for (const p of parts[i]) {
          if (!still) p.t = (p.t + p.v * dt * (F ? 1.3 : 1)) % 1;
          for (let k = 3; k >= 0; k--) {
            const [x, y] = at(e.pts, p.t - k * (6 / e.length));
            const r = (k === 0 ? 7 : 5 - k) * big * (F ? 1.25 : 1);
            g.globalAlpha = k === 0 ? 1 : 0.5 - k * 0.12;
            g.drawImage(s, x - r, y - r, r * 2, r * 2);
          }
        }
      });
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // backend upkeep: a light sweeping across the whole system, the way a check walks the repo
      if (scanId !== lastScan) { lastScan = scanId; scanAt = now; }
      if (scanId === 'maintain_backend') {
        const u = ((now - scanAt) / 2600) % 1, x = 24 + u * 1222, grd = g.createLinearGradient(x - 70, 0, x + 70, 0);
        grd.addColorStop(0, 'rgba(203,213,225,0)'); grd.addColorStop(0.5, 'rgba(226,232,240,0.16)'); grd.addColorStop(1, 'rgba(203,213,225,0)');
        g.fillStyle = grd; g.fillRect(x - 70, 96, 140, 832);
        g.strokeStyle = 'rgba(241,245,249,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 96); g.lineTo(x, 928); g.stroke();
      }
      // frontend upkeep: the workbench's own chrome traced by a moving dashed line
      if (scanId === 'maintain_frontend') {
        g.strokeStyle = 'rgba(226,232,240,0.75)'; g.lineWidth = 1.4; g.setLineDash([8, 6]); g.lineDashOffset = -(now / 40) % 14;
        for (const [x, y, w, h, r] of [[18, 14, 1564, 70, 14], [1258, 92, 322, 676, 20], [20, 916, 1230, 52, 14], [12, 8, 1576, 964, 22]]) { g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke(); }
        g.setLineDash([]); g.lineDashOffset = 0;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [scale, data ? 1 : 0]);

  // the line under the pointer, when the pointer is not over a card
  const onMove = (e) => {
    if (e.target.closest('.smap-card,.smap-panel,.smap-hud,.smap-crystal,.smap-gate,.smap-store,.smap-tick')) { if (hoverEdge >= 0) setHoverEdge(-1); return; }
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
    let best = -1, bd = 64;
    edges.forEach((ed, i) => { if (sel && focus && !focus.on.has(i)) return; for (const p of ed.pts) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = i; } } });
    if (best !== hoverEdge) setHoverEdge(best);
  };

  const c = data?.counts || {};
  const fmt = (n) => (n == null ? '—' : n >= 1e8 ? (LANG === 'zh' ? (n / 1e8).toFixed(1) + '亿' : (n / 1e9).toFixed(1) + 'B') : n >= 1e4 ? (LANG === 'zh' ? (n / 1e4).toFixed(1) + '万' : (n / 1e3).toFixed(0) + 'k') : Math.round(n).toLocaleString());
  const dim = (id) => focus && !focus.ids.has(id);
  const pick = (type, id) => setSel(sel?.type === type && sel.id === id ? null : { type, id });
  const hit = c.litJudged ? Math.round(((c.litMatch || 0) / c.litJudged) * 100) : null;
  const scan = hoverEdge < 0 && { maintain_backend: ' scan-b', maintain_frontend: ' scan-f' }[(hover || sel)?.id] || '';
  const left = box.current && box.current.clientWidth >= 760 ? Math.max(0, (box.current.clientWidth - W * scale) / 2) : 0;
  return html`<div class=${'smap' + (shown ? ' in' : '') + (settled ? ' done' : '') + (zoomed ? ' zoomed' : '')} ref=${box} style=${{ height: H * scale + 'px' }}>
    <button class="smap-zoom" onClick=${() => { setZoomed(!zoomed); box.current?.scrollTo({ left: 0 }); }}>${zoomed ? L('全图', 'Fit') : L('放大', 'Zoom in')}</button>
    <div class=${'smap-stage' + (hoverEdge >= 0 ? ' on-edge' : '') + scan} style=${{ height: H + 'px', left: left + 'px', transform: `scale(${scale})` }} onMouseMove=${onMove} onMouseLeave=${() => setHoverEdge(-1)}
      onClick=${(e) => { if (!e.target.closest('button,.smap-panel,a')) setSel(null); }}>
      <div class="smap-bg"></div>
      ${[['literature', 24, 96, 1222, 108], ['research', 24, 222, 596, 536], ['learning', 806, 222, 440, 536], ['writing', 24, 768, 1222, 206], ['maintenance', 1262, 776, 314, 188]].map(([k, x, y, w, h]) => html`<div class=${'smap-lane ' + k} style=${{ left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }}><span>${L(LANE[k].zh, LANE[k].en)}${k === 'writing' ? ' · ' + L('审稿与投稿', 'review & submit') : ''}</span></div>`)}
      <canvas ref=${canvas} class="smap-canvas" style=${{ width: W + 'px', height: H + 'px' }}></canvas>

      <header class="smap-hud">
        <div class="smap-title"><b>AI SCIENTIST</b><span>${L('系统运转 · 实时', 'system · live')}</span></div>
        <div class="smap-stats">
          ${[[c.papers, L('篇论文', 'papers')], [c.runs, L('次模块运行', 'module runs')], [c.tokens, 'Token'], [c.hyps, L('条假设', 'hypotheses')], [c.litClaims, L('条文献主张', 'paper claims')], [c.playbook, L('条经验', 'know-how')]].map(([v, k]) => html`<div><b><${Count} v=${v} go=${shown} fmt=${fmt} /></b><span>${k}</span></div>`)}
          <div class="live"><b><i></i>${c.running ?? '—'}</b><span>${L('正在运行', 'running now')}</span></div>
        </div>
        <div class="smap-modes">${MODES.map((m) => html`<button class=${mode === m.id ? 'on' : ''} onClick=${() => { setMode(m.id); setSel(null); }}>${L(m.zh, m.en)}</button>`)}</div>
      </header>

      ${Object.keys(N).map((id) => {
        const [x, y, k] = N[id]; const [w, h] = size(id); const m = mod[id]; const lane = LANE[LANE_OF[id]];
        const order = { literature: 0, research: 1, meta: 2, learning: 3, writing: 4, publishing: 5, maintenance: 6 }[LANE_OF[id]] || 0;
        const st = { left: x - w / 2 + 'px', top: y - h / 2 + 'px', width: w + 'px', height: h + 'px', '--c': rgba(lane.rgb, 1), '--c2': rgba(lane.rgb, 0.5), '--sx': ((x - 24) / 1222).toFixed(3), '--d': (order * 0.16 + (x / W) * 0.35).toFixed(2) + 's' };
        const on = sel?.id === id || (sel && OWNS[sel.id] === id);
        const ev = { onMouseEnter: () => setHover({ type: STORES.has(id) ? 'store' : 'module', id }), onMouseLeave: () => setHover(null) };
        const cls = (base) => base + (on ? ' on' : '') + (dim(id) ? ' dim' : '');
        if (k === 'forest') {
          const sub = id === 'forest' ? [[c.hyps, L('假设', 'hypotheses')], [c.evidence, L('证据', 'evidence')], [c.verdicts, L('判定', 'verdicts')]] : [[c.litPapers, L('论文', 'papers')], [c.litClaims, L('主张', 'claims')], [c.litHigh, L('高层假设', 'high-level')]];
          return html`<button class=${cls('smap-store')} style=${st} onClick=${() => pick('store', id)} ...${ev}>
            <span class="lab"><b>${id === 'forest' && html`<i class="hcheck" title=${L('人类判定 · 核验假设', 'Human decision · verify hypotheses')}><${Person} /></i>`}${L(...NAME[id])}</b><span>${sub.map(([v, t], i) => html`${i > 0 ? ' · ' : ''}${fmt(v)} ${t}`)}</span>${id === 'litforest' && hit != null && html`<em>${L(`预测命中 ${hit}%`, `${hit}% of predictions hit`)}</em>`}</span></button>`;
        }
        if (k === 'crystal') {
          const max = Math.max(1, ...Object.values(c.behaviours || {}));
          return html`<button class=${cls('smap-crystal')} style=${st} onClick=${() => pick('store', id)} ...${ev}>
            <span class="h"><b>${L('经验榜', 'Playbooks')}</b><span>${fmt(c.playbook)}</span></span>
            ${(c.behaviourList || []).map((b) => html`<span class="row"><span>${L(...(BEH[b] || [b, b]))}</span><i><u style=${{ width: ((c.behaviours?.[b] || 0) / max) * 100 + '%' }}></u></i></span>`)}
          </button>`;
        }
        if (k === 'gate') {
          const n = id === 'you' ? c.decisions : c.ideaDecide;
          return html`<button class=${cls('smap-gate')} style=${st} onClick=${() => pick('store', id)} ...${ev} title=${L(...NAME[id])}>
            <${Person} /><span class="cap">${L(...GATE[id])}</span>${n > 0 && html`<em>${n}</em>`}</button>`;
        }
        return html`<button class=${cls('smap-card')} style=${st} onClick=${() => pick('module', id)} ...${ev}>
          <b>${L(...NAME[id])}</b>
          <span class="meta">${m ? html`<span class="role">${L(ROLE[m.role] || m.role, m.role)}</span><${Mark} agent=${m.agent} s=${11} /><span class="model">${MODEL[m.agent] || m.agent}</span>` : ''}</span>
          ${m?.running > 0 && html`<em class="run" title=${L('正在运行', 'running')}>${m.running}</em>`}
          ${m?.open > 0 && html`<em class="open" title=${L('待接手', 'open hand-offs')}>${m.open}</em>`}
        </button>`;
      })}

      ${labels.map((l) => html`<span class="smap-elab" style=${{ left: l.x + 'px', top: l.y + 'px', '--c': rgba(l.rgb, 1) }}>${l.text}</span>`)}

      <${Panel} data=${data} sel=${sel} setSel=${setSel} setHover=${setHover} edges=${edges} mode=${mode} />

      ${zoomed && html`<div class="smap-swipe">${L('← 左右滑动 →', '← swipe →')}</div>`}
      <footer class="smap-tick">
        <span class="live"><i></i>${L('实时', 'LIVE')}</span>
        <div class="track"><div class="belt">${[...(data?.recent || []), ...(data?.recent || [])].map((r) => html`<span><em>${String(r.t || '').slice(11, 16)}</em><b>${L(...(NAME[r.module] || [r.module, r.module]))}</b><${Mark} agent=${agentOf(r.agent)} s=${11} /><i>${MODEL[agentOf(r.agent)] || r.agent || ''}</i>${r.project ? html`<u>${r.project}</u>` : ''}<s class=${r.ok ? 'ok' : 'no'}>${r.ok ? '✓' : '…'}</s></span>`)}</div></div>
      </footer>
    </div>
  </div>`;
}
// a number that rolls up the first time the map is seen
function Count({ v, go, fmt }) {
  const [x, setX] = useState(0);
  useEffect(() => {
    if (!go || v == null) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setX(v); return; }
    let raf; const t0 = performance.now(), dur = 1400;
    const tick = (t) => { const f = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - f, 3); setX(v * e); if (f < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [go, v]);
  return v == null ? '—' : fmt(x);
}
const BEH = { propose_idea: ['提出 Idea', 'propose'], revise_idea: ['修改 Idea', 'revise idea'], split_hypothesis: ['拆分假设', 'split'], revise_hypothesis: ['改写假设', 'revise hyp.'], design_experiment: ['设计实验', 'design'], summarize_evidence: ['总结证据', 'summarize'], consolidate_hypotheses: ['整合假设', 'consolidate'] };

// the right-hand panel: roles and agents by default; a module or a store when one is picked
function Panel({ data, sel, setSel, setHover, edges, mode }) {
  if (!data) return html`<aside class="smap-panel"></aside>`;
  const fmt = (n) => (n >= 1e8 ? (LANG === 'zh' ? (n / 1e8).toFixed(1) + '亿' : (n / 1e9).toFixed(2) + 'B') : n >= 1e4 ? (LANG === 'zh' ? (n / 1e4).toFixed(1) + '万' : (n / 1e3).toFixed(0) + 'k') : String(n));
  const go = (id) => setSel({ type: STORES.has(id) ? 'store' : 'module', id });
  const chip = (id) => NAME[id] && html`<button class="chip" onClick=${() => go(id)} style=${{ '--c': rgba((LANE[LANE_OF[id]] || LANE.meta).rgb, 1) }}>${L(...NAME[id])}</button>`;
  const links = (id) => {
    const ins = [...new Set(edges.filter((e) => e.b === id).map((e) => e.a))], outs = [...new Set(edges.filter((e) => e.a === id).map((e) => e.b))];
    return html`${ins.length > 0 && html`<div class="p-sec"><span>${L('来自', 'from')}</span><div>${ins.map(chip)}</div></div>`}
      ${outs.length > 0 && html`<div class="p-sec"><span>${L('交给', 'to')}</span><div>${outs.map(chip)}</div></div>`}`;
  };
  const head = (lane) => html`<div class="p-head"><span class="lane">${L(lane.zh, lane.en)}</span><button class="x" onClick=${() => setSel(null)} aria-label="close">×</button></div>`;
  const c = data.counts;
  if (sel?.type === 'module') {
    const m = data.modules.find((x) => x.id === sel.id); if (!m) return null;
    const lane = LANE[LANE_OF[m.id]];
    return html`<aside class="smap-panel" style=${{ '--c': rgba(lane.rgb, 1) }}>
      ${head(lane)}
      <h3>${L(...NAME[m.id])}</h3><div class="mono">${m.id}</div>
      <div class="p-bind"><div><span>${L('角色', 'role')}</span><b>${L(ROLE[m.role] || m.role, m.role)}</b><em>${LANG === 'zh' ? m.role : ''}</em></div>
        <div><span>${L('执行端', 'agent')}</span><b><${Mark} agent=${m.agent} s=${15} />${m.agent}</b><em>${MODEL[m.agent] || ''}</em></div></div>
      ${KEY[m.id] && html`<div class="p-key">${L(...KEY[m.id])}</div>`}
      <div class="p-stats">
        <div><b>${fmt(m.runs)}</b><span>${L('次运行', 'runs')}</span></div><div><b>${fmt(m.tokens)}</b><span>Token</span></div>
        <div><b class=${m.open ? 'amber' : ''}>${m.open}</b><span>${L('待接手', 'open')}</span></div><div><b class=${m.running ? 'green' : ''}>${m.running}</b><span>${L('运行中', 'running')}</span></div>
      </div>
      ${OWNS[m.id] && html`<div class="p-sec"><span>${L('管理', 'manages')}</span><div>${chip(OWNS[m.id])}</div></div>`}
      ${links(m.id)}
      ${m.last && html`<div class="p-last">${L('最近一次运行 ', 'last run ')}${String(m.last).slice(0, 16).replace('T', ' ')}</div>`}
      <a class="p-link" href=${'/system?m=' + m.id}>${L('模块说明 →', 'module page →')}</a>
    </aside>`;
  }
  if (sel?.type === 'store') {
    const id = sel.id, lane = LANE[LANE_OF[id]];
    const rows = id === 'forest' ? [[c.hyps, L('条假设', 'hypotheses')], [c.evidence, L('条证据', 'evidence')], [c.verdicts, L('次判定', 'verdicts')], [c.passed, L('次通过', 'passes')]]
      : id === 'litforest' ? [[c.litPapers, L('篇论文', 'papers')], [c.litClaims, L('条主张', 'claims')], [c.litHigh, L('条高层假设', 'high-level')], [c.litPredictions, L('次预测', 'predictions')]]
      : id === 'playbooks' ? [[c.playbook, L('条经验', 'entries')], [c.boards, L('张榜', 'boards')], [(c.behaviourList || []).length, L('种行为', 'behaviours')], [Object.keys(c.behaviours || {}).length, L('种已有条目', 'with entries')]]
      : id === 'human_adopt' ? [[c.ideaDecide, L('个待立项', 'to decide')], [c.ideaAdopted, L('个已立项', 'adopted')], [c.ideas, L('个 Idea', 'Ideas')]]
      : [[c.decisions, L('篇待判定', 'to decide')], [c.manuscripts, L('篇全文', 'manuscripts')]];
    const owner = Object.keys(OWNS).find((k) => OWNS[k] === id);
    return html`<aside class="smap-panel" style=${{ '--c': rgba(lane.rgb, 1) }}>
      ${head(lane)}
      <h3>${L(...NAME[id])}</h3>
      <div class="p-stats">${rows.map(([v, t]) => html`<div><b>${fmt(v ?? 0)}</b><span>${t}</span></div>`)}</div>
      ${id === 'litforest' && c.litJudged > 0 && html`<div class="p-key">${L(`预测命中 ${Math.round((c.litMatch / c.litJudged) * 100)}% · 含部分符合 ${Math.round(((c.litMatch + c.litPartial) / c.litJudged) * 100)}%`, `${Math.round((c.litMatch / c.litJudged) * 100)}% hit · ${Math.round(((c.litMatch + c.litPartial) / c.litJudged) * 100)}% incl. partial`)}</div>`}
      ${owner && html`<div class="p-sec"><span>${L('管理', 'managed by')}</span><div>${chip(owner)}</div></div>`}
      ${id === 'forest' && html`<div class="p-sec"><span>${L('人类判定', 'human decision')}</span><div><span class="chip human"><${Person} />${L('核验假设', 'verify hypotheses')}</span></div></div>`}
      ${links(id)}
      <a class="p-link" href=${{ forest: '/forest', litforest: '/litforest', playbooks: '/playbook', you: '/papers', human_adopt: '/ideas' }[id]}>${L('打开 →', 'open →')}</a>
    </aside>`;
  }
  const by = {}; for (const m of data.modules) (by[m.role] = by[m.role] || []).push(m.id);
  const agents = [...new Set(ROLE_ORDER.map((r) => data.bindings[r]).filter(Boolean))];
  const path = PATH[mode];
  return html`<aside class="smap-panel">
    ${path && html`<div class="p-mode"><div class="chain">${path.map((id, i) => html`${i > 0 && html`<i>›</i>`}<button onClick=${() => go(id)} style=${{ '--c': rgba((LANE[LANE_OF[id]] || LANE.meta).rgb, 1) }}>${L(...NAME[id])}</button>`)}</div></div>`}
    <div class="p-head"><span class="lane plain">${L('角色与执行端', 'roles & agents')}</span></div>
    ${agents.map((a) => html`<div class="p-agent">
      <button class=${'a-head' + (sel?.type === 'agent' && sel.id === a ? ' on' : '')} onClick=${() => setSel(sel?.type === 'agent' && sel.id === a ? null : { type: 'agent', id: a })} onMouseEnter=${() => setHover({ type: 'agent', id: a })} onMouseLeave=${() => setHover(null)}>
        <${Mark} agent=${a} s=${20} /><span class="who"><b>${a}</b><em>${MODEL[a] || ''}</em></span><span class="n">${data.modules.filter((m) => m.agent === a).length}</span></button>
      ${ROLE_ORDER.filter((r) => data.bindings[r] === a).map((r) => html`<button class=${'r-row' + (sel?.type === 'role' && sel.id === r ? ' on' : '')} onClick=${() => setSel(sel?.type === 'role' && sel.id === r ? null : { type: 'role', id: r })} onMouseEnter=${() => setHover({ type: 'role', id: r })} onMouseLeave=${() => setHover(null)}>
        <b>${L(ROLE[r], r)}</b><em>${LANG === 'zh' ? r : ''}</em><span>${(by[r] || []).length}</span></button>`)}
    </div>`)}
    <div class="p-legend">
      <div><i class="l-flow"></i>${L('交接', 'hand-off')}</div><div><i class="l-loop"></i>${L('返回', 'loop back')}</div>
      <div><i class="l-data"></i>${L('读写森林', 'forest read / write')}</div><div><i class="l-ref"></i>${L('经验', 'know-how')}</div>
      <div><span class="l-gate"><${Person} /></span>${L('人类判定', 'human decision')}</div>
    </div>
  </aside>`;
}
