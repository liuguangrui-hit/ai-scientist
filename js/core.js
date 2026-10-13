// Shared client core: API, live updates, formatting, labels, small components.
import { html, render, useState, useEffect, useRef, useMemo, useCallback } from '../vendor/preact-htm.js';
export { html, render, useState, useEffect, useRef, useMemo, useCallback };

// ---------------------------------------------------------------- language
// Interface chrome switches between Chinese and English; research content from
// the repo is shown as written. The public pages (front door, /about) choose
// strings with L(); the workbench is translated by i18n.js.
const LS = 'ais.lang';
export let LANG = (() => { try { const v = localStorage.getItem(LS); if (v === 'zh' || v === 'en') return v; } catch {} return 'zh'; })();
const langSubs = new Set();
export function setLang(l) {
  LANG = l === 'en' ? 'en' : 'zh';
  try { localStorage.setItem(LS, LANG); } catch {}
  document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
  langSubs.forEach((f) => f(LANG));
}
export const onLang = (f) => { langSubs.add(f); return () => langSubs.delete(f); };
export const L = (zh, en) => (LANG === 'zh' ? zh : en);
export const t = (v) => (v == null ? '' : typeof v === 'string' ? v : (v[LANG] ?? v.zh ?? v.en ?? ''));

// ---------------------------------------------------------------- snapshot mode
// A static copy built by tools/build-snapshot.mjs: no server; every view is a JSON
// file saved at build time under <base>data/<lang>/, actions and documents are off.
export const SNAPSHOT = document.querySelector('meta[name="ais-snapshot"]')?.content || null;   // the site's base path
export const SNAPSHOT_AT = document.querySelector('meta[name="ais-snapshot"]')?.dataset.at || null;
// the papers in a snapshot: page images too small to read, by the PDF's repo path
export let SNAPSHOT_PAPERS = {};
if (SNAPSHOT) fetch(SNAPSHOT + 'snapshot.json').then((r) => r.json()).then((j) => { SNAPSHOT_PAPERS = j.papers || {}; }).catch(() => {});
// the file a view is saved under: the screen, plus a short hash of its parameters
export function snapKey(screen, q = {}) {
  const ps = Object.entries(q).filter(([k, v]) => k !== 'lang' && v != null && v !== '').map(([k, v]) => [k, String(v)]).sort(([a], [b]) => (a < b ? -1 : 1));
  if (!ps.length) return screen;
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(ps)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${screen}-${h.toString(16).padStart(8, '0')}`;
}

// ---------------------------------------------------------------- api
export async function view(screen, q = {}) {
  if (SNAPSHOT) {
    // live servers, transcripts, raw documents and the paper browser are not in a snapshot
    if (['file', 'survey', 'session', 'transcript', 'pairs', 'gallery', 'route'].includes(screen)) throw new Error(L('演示快照不含这部分内容', 'Not included in the demo snapshot'));
    if (screen === 'gpu') q = { span: q.span || '24h' };          // captured once, at build time
    const r = await fetch(`${SNAPSHOT}data/${LANG}/${snapKey(screen, q)}.json`);
    if (!r.ok) throw new Error(L('演示快照中没有这一页的数据', 'This page is not in the demo snapshot'));
    return r.json();
  }
  const u = new URL('/api/view', location.origin);
  u.searchParams.set('screen', screen);
  u.searchParams.set('lang', LANG);
  for (const [k, v] of Object.entries(q)) if (v != null && v !== '') u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('读取失败 ' + r.status);
  return r.json();
}
export async function act(op, args = {}) {
  if (SNAPSHOT) { const body = { ok: false, msg: L('演示版只读：操作不会执行', 'Read-only demo: actions are not carried out') }; toast(body.msg, true); return body; }
  let body;
  try {
    const r = await fetch('/api/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, args }) });
    body = await r.json();
  } catch { body = { ok: false, msg: '网络错误' }; }
  toast(body.msg, !body.ok);
  return body;
}
export async function reset() {
  if (SNAPSHOT) return; await fetch('/api/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'sandbox.reset' }) }); }
export async function brief(q) {
  if (SNAPSHOT) return { ok: false, msg: L('演示版只读', 'Read-only demo') };
  const u = new URL('/api/brief', location.origin);
  for (const [k, v] of Object.entries(q)) if (v != null && v !== '') u.searchParams.set(k, v);
  return (await fetch(u)).json();
}
export const raw = (path) => '/api/raw?path=' + encodeURIComponent(path);
export const fileHref = (path) => '/file?path=' + encodeURIComponent(path);

// ---------------------------------------------------------------- live updates
// The server watches the repo and pushes the paths that changed; screens reload
// on each push. While the stream is down they fall back to polling.
const repoSubs = new Set(), linkSubs = new Set();
export let LINKED = false;
const setLinked = (v) => { if (LINKED !== v) { LINKED = v; linkSubs.forEach((f) => f(v)); } };
export const onRepo = (f) => { repoSubs.add(f); return () => repoSubs.delete(f); };
export const onLink = (f) => { linkSubs.add(f); return () => linkSubs.delete(f); };
if (typeof EventSource !== 'undefined' && !SNAPSHOT) {
  const es = new EventSource('/api/events');
  es.onopen = () => setLinked(true);
  es.onerror = () => setLinked(false);
  es.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch { return; } repoSubs.forEach((f) => f(d.paths || [])); };
}

// ---------------------------------------------------------------- toasts
let toastSub = null, toastId = 0;
export const onToast = (f) => { toastSub = f; };
export function toast(msg, bad = false) { if (msg && toastSub) toastSub({ id: ++toastId, msg, bad }); }

// ---------------------------------------------------------------- format
export const pad = (n) => String(n).padStart(2, '0');
const date = (iso) => { const d = typeof iso === 'number' ? new Date(iso) : new Date(String(iso).replace(' ', 'T')); return isNaN(d) ? null : d; };
export function when(iso) {
  const d = iso && date(iso);
  if (!d) return iso ? String(iso) : '—';
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function day(iso) { const d = iso && date(iso); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '—'; }
export function ago(iso) {
  const d = iso && date(iso);
  if (!d) return '—';
  const s = (Date.now() - d) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} 天前`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function secs(s) {
  if (s == null) return '—';
  if (s < 60) return `${Math.round(s)} 秒`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h >= 48) return `${Math.floor(h / 24)} 天${h % 24 ? ` ${h % 24} 小时` : ''}`;
  return `${h} 小时${r ? ` ${r} 分` : ''}`;
}
export function big(n) {
  if (n == null) return '—';
  if (LANG === 'en') {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(0) + 'k';
    return n.toLocaleString();
  }
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '万';
  return n.toLocaleString();
}
export const pct = (x) => (x == null ? '—' : `${Math.round(x * 10) / 10}%`);

// ---------------------------------------------------------------- labels
export const MOD = {
  conduct_survey: '文献采集', audit_survey: '采集审核', analyze_trends: '趋势分析', audit_trends: '趋势审核', download_papers: '论文下载',
  study_paper: '研读论文', consolidate_literature: '文献整合', test_literature: '文献预测', audit_literature: '预测判定', manage_playbooks: '经验榜管理',
  develop_idea: '发展 Idea', review_idea: 'Idea 审核', grow_tree: '假设树', test_hypothesis: '假设检验', audit_tree: '假设判定', consolidate_forest: '整合森林',
  score_idea: 'Idea 评分（旧）', reproduce_paper: '论文复现（旧）',
  plan_paper: '论文提纲', prepare_figures: '论文图组', write_paper: '论文全文', audit_paper: '写作审计',
  review_paper: '内部审稿', revise_paper: '改稿', edit_paper: '叙事编辑', review_style: '编辑审稿', submit_paper: '投稿', track_deadlines: '刊会日期', human: '人类判定',
  check_workspace: '后端维护', maintain_frontend: '前端维护',
};
// record text written by the agents names modules by id: show their names instead
const MOD_ID = new RegExp(`\\b(${Object.keys(MOD).join('|')}|test_hyp)\\b`, 'g');
// and role ids, handoff states and file paths; English text arrives translated, where
// those words are ordinary English ("lead to", "tests passed"), so only ids and paths change
export const humanize = (text) => {
  let s = String(text || '')
    .replace(/`?\bpaper_decisions(?:\.md)?\b`?/g, () => L('用户审稿与裁定表', 'the review and decision table'))
    .replace(/`?(?:[\w.-]+\/)*[\w-]+\.(?:md|ya?ml|jsonl)\b`?/g, () => L('相关记录', 'the related record'))
    .replace(MOD_ID, (m) => (LANG === 'en' ? (m === 'test_hyp' ? 'test hypothesis' : m.replace(/_/g, ' ')) : MOD[m] || MOD.test_hypothesis));
  if (LANG === 'zh') s = s
    .replace(/\b(maintainer|lead|analyst|support|engineer|writer|auditor|coach)\b/g, (r) => ROLE[r])
    .replace(/\b(pending|taken|done|passed|failed)\b/g, (w) => STATUS[w][0]);
  return s;
};

export const KIND = { idea: 'Idea 课题', consolidation: '整合课题', revision: '改稿课题', reproduction: '复现课题' };
export const modName = (id) => MOD[id] || id;
export const LANE = { literature: '文献', learning: '学习', research: '研究', writing: '写作', publishing: '审稿与投稿', maintenance: '维护', other: '其他' };
export const ROLE = { maintainer: '工程维护', lead: '科研负责人', analyst: '研究分析', support: '资料支持', engineer: '科研工程', writer: '科研写作', auditor: '独立审计', coach: '行为指导' };
// status → [label, tone]
export const STATUS = {
  pass: ['已通过', 'pass'], fail: ['未通过', 'fail'], revise: ['需改进', 'wait'], open: ['尚无判定', ''],
  testing: ['实验中', 'run'], judging: ['待判定', 'wait'], rewriting: ['改写中', 'rew'],
  pending: ['待接手', 'wait'], taken: ['处理中', 'run'], done: ['已完成', 'pass'],
  passed: ['已通过', 'pass'], failed: ['未通过', 'fail'], draft: ['草稿', ''],
  todo: ['未开始', ''], active: ['进行中', 'run'], rework: ['返工', 'fail'], stale: ['版本已变', 'wait'], ready: ['可开始', 'run'],
  developing: ['立项中', 'run'], researching: ['研究中', 'run'], idle: ['待安排', 'wait'], stopped: ['已停止', 'fail'],
  writing: ['写作中', 'rew'], reviewing: ['审稿与改稿', 'rew'], decision: ['待人类判定', 'wait'], submitting: ['待投稿', 'run'], submitted: ['已投稿', 'run'],
  accepted: ['已录用', 'pass'], final: ['终稿已提交，待发表', 'run'], published: ['已正式发表', 'pass'], concluded: ['已完成', 'pass'],
  revise_: ['待改稿', 'wait'], research: ['等补证据', 'rew'], revised: ['待复审', 'run'], human: ['待人类审稿', 'wait'], conflict: ['状态不唯一', 'fail'],
  completed: ['已完成', 'pass'], blocked: ['受阻', 'fail'], in_progress: ['进行中', 'run'], running: ['运行中', 'run'],
  pass_: ['通过', 'pass'], unknown: ['未识别', ''], insufficient: ['证据不足', 'wait'],
};
// stage of a project → label; "passed" there means research passed, before writing
export const STAGE = { ...STATUS, passed: ['研究已通过', 'pass'] };
// manuscript file-name states (projects/README.md)
export const MS = {
  pending: ['待写作审计', 'wait'], failed: ['写作审计未通过', 'fail'], passed: ['待内部审稿', 'run'], revise: ['待改稿', 'wait'], research: ['等改稿课题补证据', 'rew'],
  edit: ['待叙事编辑或编辑退修', 'wait'], edited: ['待编辑审稿', 'run'],
  revised: ['改稿完成待复审', 'run'], human: ['待人类审稿或判定', 'wait'], ready: ['同意投稿待提交', 'run'], submitted: ['已提交待结果', 'run'], accepted: ['已录用', 'pass'],
  final: ['终稿已提交，待发表', 'run'], published: ['已正式发表', 'pass'],
  conflict: ['状态文件不唯一', 'fail'], draft: ['草稿', ''],
};
export const tone = (s) => (STATUS[s]?.[1] ? 's-' + STATUS[s][1] : '');
export const Pill = ({ s, label, map = STATUS, title }) => html`<span class=${'pill ' + (map[s]?.[1] ? 's-' + map[s][1] : '')} title=${title}>${label || map[s]?.[0] || s}</span>`;
export const Dot = ({ s }) => html`<span class=${'dot ' + tone(s)}></span>`;
export const Tag = ({ children, cls = '', ...p }) => html`<span class=${'tag ' + cls} ...${p}>${children}</span>`;

// ---------------------------------------------------------------- icons
export const Icon = ({ d, s = 16, w = 1.8, c = 'currentColor' }) => html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke=${c} stroke-width=${w} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: d }}></svg>`;
export const ICONS = {
  logo: '<circle cx="12" cy="5" r="2.4"/><circle cx="5.5" cy="18" r="2.4"/><circle cx="18.5" cy="18" r="2.4"/><path d="M12 7.4v4.2M10.6 13.4 7 15.8M13.4 13.4 17 15.8"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2.5z"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2h8.7A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  net: '<circle cx="5" cy="7" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="19" cy="17" r="2"/><path d="M7 8 10.3 11M7 16l3.3-3M13.7 11 17 8M13.7 13 17 16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  board: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9c-.3.3-.5.7-.5 1.1H9c0-.4-.2-.8-.5-1.1A6 6 0 0 1 12 3z"/>',
  flask: '<path d="M9 3v6.5L4.5 18A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-3L15 9.5V3M8 3h8M8.5 14h7"/>',
  gavel: '<path d="M14 4l6 6M11 7l6 6M4 20l7-7M9.5 5.5l9 9"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-6 6-2-2-5 5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  tree: '<path d="M12 3v4M6 21v-6M18 21v-6M6 15h12M12 7v8"/><rect x="9" y="1" width="6" height="4" rx="1"/>',
  check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17.2v.1"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  fork: '<circle cx="12" cy="4.5" r="2"/><circle cx="4.5" cy="19.5" r="1.7"/><circle cx="12" cy="19.5" r="1.7"/><circle cx="19.5" cy="19.5" r="1.7"/><path d="M12 6.5v11.3M11 6.3 5.3 17.9M13 6.3l5.7 11.6"/>',
  merge: '<circle cx="4.5" cy="4.5" r="1.7"/><circle cx="12" cy="4.5" r="1.7"/><circle cx="19.5" cy="4.5" r="1.7"/><circle cx="12" cy="19.5" r="2"/><path d="M12 6.2v11.3M5.3 6.1 11 17.7M18.7 6.1 13 17.7"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  term: '<path d="m5 7 5 5-5 5M12 17h7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  cube: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
};
export const I = (k, p = {}) => html`<${Icon} d=${ICONS[k]} ...${p} />`;

// ---------------------------------------------------------------- overlays
function useEsc(onClose) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
}
// Dialogs render into their own host at the end of #app: an ancestor with a backdrop
// filter or transform (the sticky top bar) would otherwise clip a fixed-position box.
export function Portal({ children }) {
  const host = useRef(null);
  if (!host.current) host.current = document.createElement('div');
  useEffect(() => { (document.getElementById('app') || document.body).appendChild(host.current); return () => { render(null, host.current); host.current.remove(); }; }, []);
  useEffect(() => { render(children, host.current); });
  return null;
}
export function Drawer(props) { return html`<${Portal}><${DrawerBox} ...${props} /><//>`; }
function DrawerBox({ title, sub, onClose, children, foot, wide, right }) {
  useEsc(onClose);
  return html`<${Frag}><div class="scrim" onClick=${onClose}></div>
    <aside class=${'drawer' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
      <div class="dh"><div class="grow" style="min-width:0">${sub && html`<div class="tiny faint" style="margin-bottom:4px">${sub}</div>`}<h2>${title}</h2></div>${right}
        <button class="btn ghost xs" onClick=${onClose} aria-label="关闭">${I('x', { s: 15 })}</button></div>
      <div class="db">${children}</div>
      ${foot && html`<div class="df">${foot}</div>`}
    </aside><//>`;
}
export function Modal(props) { return html`<${Portal}><${ModalBox} ...${props} /><//>`; }
function ModalBox({ title, onClose, children, foot }) {
  useEsc(onClose);
  return html`<${Frag}><div class="scrim" onClick=${onClose}></div>
    <div class="modal" role="dialog" aria-modal="true"><div class="dh">${title}<span class="grow"></span><button class="btn ghost xs" onClick=${onClose} aria-label="关闭">${I('x', { s: 15 })}</button></div>
      <div class="db">${children}</div>${foot && html`<div class="df">${foot}</div>`}</div><//>`;
}
export const Frag = ({ children }) => children;
