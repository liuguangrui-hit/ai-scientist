// Helpers every screen uses.
import { html, useState, useEffect, useCallback, useRef, view, act as rawAct, brief, I, onRepo, onLink, LINKED, LANG, Drawer, Frag, toast, fileHref, raw, modName, SNAPSHOT, SNAPSHOT_PAPERS } from '../core.js';
import { md } from '../md.js';
export * from '../core.js';

// Loads view data and keeps it current: the server pushes every change to the
// repo (or the sandbox layer) and completed snapshots. A quiet linked stream is
// also checked once a minute; `match` narrows which repo paths matter.
export function useData(name, q = {}, { onShell, poll = 10000, match = null, skip = false } = {}) {
  const key = LANG + name + JSON.stringify(Object.entries(q).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]).sort(([a], [b]) => a.localeCompare(b)));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  // a new key (another domain, project, page) keeps the old view on screen, dimmed, until the
  // new data arrives, so a click shows at once that it was taken rather than a blank skeleton
  const [stale, setStale] = useState(false);
  const live = useRef(key); live.current = key;
  const request = useRef(0), goodKey = useRef(null), lastError = useRef(null);
  const load = useCallback(async () => {
    if (skip) return;
    const id = ++request.current;
    try {
      const d = await view(name, q);
      if (live.current !== key || request.current !== id) return;
      goodKey.current = key; lastError.current = null;
      setData(d); setStale(false); if (d.shell) onShell?.(d.shell); setErr(null);
    } catch (e) {
      if (live.current !== key || request.current !== id) return;
      // Keep a successful display during a failed background refresh, while
      // still reporting errors (and preserving full initial/navigation errors).
      if (goodKey.current === key) {
        if (lastError.current !== e.message) toast(e.message, true);
        lastError.current = e.message;
      } else setErr(e.message);
      setStale(false);
    }
  }, [key, skip]);
  useEffect(() => () => { live.current = null; request.current++; }, []);
  useEffect(() => { setStale((s) => s || data != null); load(); }, [key, skip]);
  useEffect(() => { if (!stale) return; document.body.classList.add('refetching'); return () => document.body.classList.remove('refetching'); }, [stale]);
  const matchRef = useRef(match);
  matchRef.current = match;
  useEffect(() => {
    let t = null;
    const off = onRepo((paths) => {
      const ready = paths.includes(`(view:${name})`);
      const changed = paths.filter((p) => !p.startsWith('(view:'));
      if (!ready && (!changed.length || (matchRef.current && !changed.some(matchRef.current)))) return;
      clearTimeout(t); t = setTimeout(load, 120);
    });
    return () => { off(); clearTimeout(t); };
  }, [load, name]);
  const [linked, setLinked] = useState(LINKED);
  useEffect(() => { setLinked(LINKED); return onLink(setLinked); }, []);
  useEffect(() => {
    if (SNAPSHOT || skip) return;
    const id = setInterval(() => { if (!document.hidden) load(); }, linked ? Math.max(poll, 60000) : poll);
    return () => clearInterval(id);
  }, [load, poll, linked, skip]);
  const act = useCallback(async (op, args) => { const r = await rawAct(op, args); await load(); return r; }, [load]);
  return { data, act, load, err, stale };
}
export const useScreen = (name, q, onShell, poll, match) => useData(name, q, { onShell, poll, match });

export const Loading = () => html`<div class="page"><div class="col" style="max-width:520px;gap:10px"><div class="skeleton" style="width:40%;height:22px"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:55%"></div></div></div>`;
export const ErrBox = ({ msg }) => html`<div class="page"><div class="note wait">读取失败：${msg}</div></div>`;
export const Page = ({ children, wide }) => html`<div class=${'page' + (wide ? ' wide' : '')}>${children}</div>`;
export const PH = ({ title, sub, actions, children }) => html`<div class="ph"><div style="min-width:0"><h1>${title}</h1>${sub && html`<div class="sub">${sub}</div>`}${children}</div>${actions && html`<div class="actions">${actions}</div>`}</div>`;
export const SH = ({ title, sub, right }) => html`<div class="sh"><h2>${title}</h2>${sub && html`<span class="sub">${sub}</span>`}<span class="grow"></span>${right}</div>`;
export const Card = ({ title, right, children, pad = true, style, cls = '' }) => html`<div class=${'card ' + cls} style=${style}>
  ${(title || right) && html`<div class="hd"><h3>${title}</h3><span class="grow"></span>${right}</div>`}
  ${pad ? html`<div class="bd">${children}</div>` : children}</div>`;
export const Stat = ({ k, v, s, href }) => html`<${href ? 'a' : 'div'} class="stat" href=${href}><div class="k">${k}</div><div class="v">${v}</div>${s && html`<div class="s">${s}</div>`}<//>`;
export const Empty = ({ children }) => html`<div class="empty">${children}</div>`;
export const Field = ({ label, hint, children }) => html`<label class="field"><span>${label}</span>${children}${hint && html`<em>${hint}</em>`}</label>`;

// Rendered repo Markdown; `from` is the file's repo path, for its relative links.
export const Md = ({ src, from, style }) => html`<div class="md" style=${style} dangerouslySetInnerHTML=${{ __html: md(src, from) }}></div>`;
export const FileLink = ({ path, children, cls }) => html`<a class=${cls || 'mono tiny'} href=${fileHref(path)}>${children || path}</a>`;

// In a snapshot a paper is shown as its pages, rendered too small to read.
export function BlurredPaper({ path }) {
  const p = SNAPSHOT_PAPERS[path] || Object.values(SNAPSHOT_PAPERS).find((x) => path.includes(`/${x.project}/`));
  if (!p) return html`<div class="empty">演示快照不含这篇论文</div>`;
  return html`<div class="blur-paper"><div class="tiny faint" style="margin-bottom:10px">${`${p.project} · ${p.version} · ${p.pages.length} 页 · 演示版正文已模糊`}</div>
    <div class="pages">${p.pages.map((src, i) => html`<img src=${src} alt=${`第 ${i + 1} 页`} loading="lazy" />`)}</div></div>`;
}

// A repo document in a side panel: the full text lives here, not in lists.
export function DocDrawer({ path, title, onClose }) {
  const isPdf = /\.pdf$/i.test(path);
  const { data } = useData('file', { path }, { match: (p) => p === path, skip: isPdf });
  const f = data?.file;
  return html`<${Drawer} wide title=${title || path.split('/').pop()} sub=${path} onClose=${onClose}
    right=${!SNAPSHOT && html`<a class="btn sm" href=${fileHref(path)}>${I('ext', { s: 13 })}完整页面</a>`}>
    ${isPdf && SNAPSHOT ? html`<${BlurredPaper} path=${path} />` : isPdf ? html`<iframe class="pdf" src=${raw(path)} title=${path}></iframe>` : !f ? html`<div class="skeleton"></div>` : f.error ? html`<div class="empty">文件不存在</div>`
      : /\.md$/i.test(path) ? html`<${Md} src=${f.text} from=${path} />` : html`<pre class="code">${f.text}</pre>`}
  <//>`;
}
// click-to-open helper: returns [open(path, title), element]
export function useDoc() {
  const [doc, setDoc] = useState(null);
  const el = doc && html`<${DocDrawer} path=${doc.path} title=${doc.title} onClose=${() => setDoc(null)} />`;
  return [(path, title) => setDoc({ path, title }), el];
}

// Hand one module step to the agent bound to its role: the single-task brief,
// editable, then started in the Agent console. Starting is simulated by the
// server's sandbox driver in this build; the brief itself is real.
export function BriefButton({ module, project, target, month, domain, queueId, spark, stage, label, cls }) {
  const [b, setB] = useState(null);
  const [text, setText] = useState('');
  const [agent, setAgent] = useState('');
  const [access, setAccess] = useState('write');
  const [busy, setBusy] = useState(false);
  const open = async (e) => { e?.stopPropagation(); const r = await brief({ module, project, target, month, domain, queueId, spark, stage }); setB(r); setText(r.text); setAgent(r.agent); };
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('任务简报已复制'); } catch { toast('复制失败，请手动选择', true); } };
  const start = async () => {
    setBusy(true);
    try {
      const r = await rawAct('ctl.start', { module: b.module, role: b.role, project: b.project, queueId: b.queueId, agent, access, prompt: text, title: `${modName(b.module)}${target || month ? ' · ' + (target || month) : ''}` });
      if (r.ok) { setB(null); history.pushState({}, '', '/agents?id=' + r.id); dispatchEvent(new PopStateEvent('popstate')); }
    } finally { setBusy(false); }
  };
  return html`<${Frag}>
    <button class=${cls || 'btn sm'} onClick=${open} title="把本模块这一次任务交给执行端">${I('play', { s: 12 })}${label || '启动'}</button>
    ${b && html`<${Drawer} title=${`启动 ${modName(b.module)}`} sub=${`角色 ${b.role}${b.project ? ' · ' + b.project : ''}`} onClose=${() => setB(null)} wide
      foot=${html`<span class="sim-badge">沙盒模拟</span><span class="tiny mut grow">启动后在 Agent 控制台查看过程</span>
        <button class="btn" onClick=${copy}>${I('copy', { s: 14 })}复制简报</button>
        <button class="btn acc" disabled=${busy || !text.trim()} onClick=${start}>${I('play', { s: 13 })}启动</button>`}>
      <div class="col gap12">
        <div class="row gap8">
          <label class="field" style="flex:1"><span>执行端</span><select value=${agent} onChange=${(e) => setAgent(e.target.value)}>${(b.agents || [b.agent]).map((x) => html`<option value=${x}>${x}${x === b.agent ? '（当前绑定）' : ''}</option>`)}</select></label>
          <label class="field" style="flex:1"><span>权限</span><select value=${access} onChange=${(e) => setAccess(e.target.value)}><option value="read">只读</option><option value="write">可写（工作区）</option><option value="full">完全权限</option></select></label>
        </div>
        <label class="field"><span>任务简报（只含本模块本次任务，可修改）</span><textarea class="brief-edit" rows="18" value=${text} onInput=${(e) => setText(e.target.value)}></textarea></label>
      </div><//>`}
  <//>`;
}

// A drawer form that runs one op and closes on success.
export function FormDrawer({ title, sub, onClose, onSubmit, submit = '写入', note, children, wide }) {
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { const r = await onSubmit(); if (r?.ok) onClose(); } finally { setBusy(false); } };
  return html`<${Drawer} title=${title} sub=${sub} onClose=${onClose} wide=${wide}
    foot=${html`<span class="tiny mut grow">${note}</span><button class="btn" onClick=${onClose}>取消</button><button class="btn acc" disabled=${busy} onClick=${go}>${busy ? html`<span class="spin"></span>` : null}${submit}</button>`}>
    <div class="col gap16">${children}</div><//>`;
}

// Progress through fixed stages: each step is done / cur / bad / warn / ''.
export const Steps = ({ steps }) => html`<div class="steps">${steps.map((s, i) => html`<${Frag}>
  ${i > 0 && html`<span class=${'ln' + (steps[i - 1].state === 'done' && s.state ? ' done' : '')}></span>`}
  <span class=${'step ' + (s.state || '')} title=${s.title}><span class="c">${s.state === 'done' ? '✓' : s.state === 'bad' ? '!' : i + 1}</span>${s.label}</span><//>`)}</div>`;
export const MiniSteps = ({ steps }) => html`<span class="mini-steps" title=${steps.map((s) => `${s.label}${s.state === 'done' ? ' ✓' : ''}`).join(' → ')}>${steps.map((s) => html`<i class=${s.state || ''}></i>`)}</span>`;

// Progress of a project along the path its kind takes.
const MS_STEP = { passed: 4, revise: 4, research: 4, revised: 4, edit: 4, edited: 4, human: 5, ready: 5, submitted: 6, accepted: 7, final: 8, published: 9 };
export function projectSteps(p) {
  const research = p.stage === 'stopped' ? 'bad' : p.root ? (['developing', 'researching', 'idle'].includes(p.stage) ? 'cur' : 'done') : '';
  if (p.kind === 'reproduction') return [{ label: '立项', state: p.root ? 'done' : 'cur' }, { label: '实验与判定', state: p.stage === 'concluded' ? 'done' : research }, { label: '复现结论', state: p.stage === 'concluded' ? 'done' : '' }];
  if (p.kind === 'revision') return [{ label: '立项', state: p.root ? 'done' : 'cur' }, { label: '补证据', state: research }, { label: '挂回原课题', state: p.stage === 'concluded' ? 'done' : '' }];
  if (p.kind === 'consolidation') return [{ label: '立项', state: p.root ? 'done' : 'cur' }, { label: '验证', state: research }, { label: '成为 spark', state: p.stage === 'concluded' ? 'done' : '' }];
  const paper = Object.fromEntries((p.paper || []).map((s) => [s.id, s.latest?.status]));
  const w = (id) => (paper[id] === 'passed' ? 'done' : paper[id] === 'pending' ? 'cur' : paper[id] === 'failed' ? 'warn' : '');
  const ms = p.manuscript?.status, k = MS_STEP[ms] ?? (paper.manuscript ? 3 : -1);
  const st = (i) => (k > i ? 'done' : k === i ? (ms === 'human' ? 'warn' : 'cur') : '');
  return [
    { label: '立项', state: p.root ? 'done' : 'cur' },
    { label: '研究', state: research, title: p.rootVerdict ? `根假设：${p.rootVerdict}` : '' },
    { label: '提纲', state: w('plan') },
    { label: '图组', state: w('figures') },
    { label: '全文', state: k >= 4 ? 'done' : w('manuscript') },
    { label: '审稿', state: st(4) },
    { label: '投稿', state: st(5) === 'done' ? 'done' : st(5) || st(6) },
    { label: '录用', state: k >= 7 ? 'done' : '' },
    { label: '终稿', state: k >= 8 ? 'done' : k === 7 ? 'cur' : '' },
    { label: '发表', state: ms === 'published' ? 'done' : ms === 'final' ? 'cur' : '' },
  ];
}

// ---------------------------------------------------------------- long lists
// Lists are cut into pages, and time lists into months first, so no page scrolls
// on forever. Both live in the URL (?p=, ?m=) to survive reloads and links.
const withQ = (patch) => {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) v == null || v === '' ? u.searchParams.delete(k) : u.searchParams.set(k, v);
  return u.pathname + (u.search || '');
};
export function paged(rows, q, size = 40, key = 'p') {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Number(q[key]) || 1));
  return { rows: rows.slice((page - 1) * size, page * size), page, pages, total: rows.length, size, key };
}
export function Pager({ pg, top }) {
  if (pg.pages <= 1) return null;
  const href = (n) => withQ({ [pg.key]: n === 1 ? null : n });
  const show = [...new Set([1, pg.page - 1, pg.page, pg.page + 1, pg.pages])].filter((n) => n >= 1 && n <= pg.pages).sort((a, b) => a - b);
  const nums = [];
  show.forEach((n, i) => { if (i && n - show[i - 1] > 1) nums.push(html`<span class="pager-gap">…</span>`); nums.push(html`<a class=${n === pg.page ? 'on' : ''} href=${href(n)} aria-current=${n === pg.page ? 'page' : undefined}>${n}</a>`); });
  const from = (pg.page - 1) * pg.size + 1, to = Math.min(pg.total, pg.page * pg.size);
  return html`<nav class=${'pager' + (top ? ' top' : '')} aria-label="分页">
    <span class="pager-info num">${from}–${to} / ${pg.total}</span><span class="grow"></span>
    <a class=${'pager-step' + (pg.page === 1 ? ' off' : '')} href=${pg.page === 1 ? undefined : href(pg.page - 1)} aria-label="上一页">${I('chev', { s: 13 })}</a>
    ${nums}
    <a class=${'pager-step next' + (pg.page === pg.pages ? ' off' : '')} href=${pg.page === pg.pages ? undefined : href(pg.page + 1)} aria-label="下一页">${I('chev', { s: 13 })}</a>
  </nav>`;
}
export function byMonth(rows, q, at = (x) => x.t) {
  const counts = new Map();
  for (const r of rows) { const m = String(at(r) || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) counts.set(m, (counts.get(m) || 0) + 1); }
  const months = [...counts.keys()].sort().reverse();
  const cur = q.m === 'all' || !months.length ? 'all' : counts.has(q.m) ? q.m : months[0];
  return { rows: cur === 'all' ? rows : rows.filter((r) => String(at(r) || '').startsWith(cur)), cur, months: months.map((m) => ({ m, n: counts.get(m) })), total: rows.length };
}
export function MonthBar({ per }) {
  if (per.months.length <= 1) return null;
  const years = [...new Set(per.months.map((x) => x.m.slice(0, 4)))];
  const y = per.cur === 'all' ? null : per.cur.slice(0, 4);
  const go_ = (m) => withQ({ m, p: null });
  return html`<div class="period">
    <div class="seg">${years.map((yy) => html`<a class=${yy === y ? 'on' : ''} href=${go_(per.months.find((x) => x.m.startsWith(yy)).m)}>${yy}</a>`)}<a class=${per.cur === 'all' ? 'on' : ''} href=${go_('all')}>全部</a></div>
    ${y && html`<div class="period-m">${per.months.filter((x) => x.m.startsWith(y)).map((x) => html`<a class=${x.m === per.cur ? 'on' : ''} href=${go_(x.m)}>${`${Number(x.m.slice(5))} 月`}<span class="num">${x.n}</span></a>`)}</div>`}
  </div>`;
}

// ---------------------------------------------------------------- 核验状态 filter (forests)
// Where each hypothesis stands in checking; the forests share one multi-select, kept
// in the address as ?show=a,b (absent: the 已核验 preset).
export const VERIFY = [
  ['confirmed', '已证实', '#34d399'], ['refuted', '已否决', '#fb7185'], ['revise', '需改写', '#60a5fa'],
  ['judging', '待裁定', '#fbbf24'], ['testing', '检验中', '#38bdf8'], ['untested', '待核验', '#94a3be'], ['superseded', '已取代', '#5e6880'],
];
export const VERIFY_PRESETS = [
  ['checked', '已核验', ['confirmed', 'refuted', 'revise']], ['confirmed', '已证实', ['confirmed']],
  ['open', '待核验', ['judging', 'testing', 'untested']], ['all', '全部', VERIFY.map((v) => v[0])],
];
export const parseShow = (s) => (s == null || s === '' ? VERIFY_PRESETS[0][2] : s === 'all' ? VERIFY_PRESETS[3][2] : s.split(',').filter((k) => VERIFY.some((v) => v[0] === k)));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
// value: the selected keys; counts: per key (optional); onChange(keys)
export function VerifyFilter({ value, counts, onChange }) {
  const toggle = (k) => { const next = value.includes(k) ? value.filter((x) => x !== k) : [...value, k]; onChange(VERIFY.map((v) => v[0]).filter((x) => next.includes(x))); };
  return html`<div class="vf">
    <div class="seg">${VERIFY_PRESETS.map(([id, label, keys]) => html`<button class=${sameSet(value, keys) ? 'on' : ''} onClick=${() => onChange(keys)}>${label}</button>`)}</div>
    <div class="vf-chips">${VERIFY.map(([k, label, color]) => html`<button class=${'vf-chip' + (value.includes(k) ? ' on' : '')} aria-pressed=${value.includes(k)} onClick=${() => toggle(k)}>
      <i style=${{ background: color }}></i>${label}${counts && html`<span class="num">${counts[k] || 0}</span>`}</button>`)}</div>
  </div>`;
}
// what the address should carry for a selection
export const showParam = (keys) => (sameSet(keys, VERIFY_PRESETS[0][2]) ? null : sameSet(keys, VERIFY_PRESETS[3][2]) ? 'all' : keys.join(',') || 'none');
