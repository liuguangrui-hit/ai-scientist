/* 真实森林：?src=real 时，森林不由 data.js 生成，而从工作台读取 AI-Scientist-2 的
 * 课题树、假设库与判定（/api/view?screen=forestdata），结构与 Forest.build 相同。
 * 首页（不带 src）仍用生成的演示森林。 */
(function (global) {
  'use strict';
  const REAL = new URLSearchParams(location.search).get('src') === 'real';
  const F = global.Forest;
  F.wantReal = REAL;
  F.loadReal = async function () {
    // the workbench serves it live; a static snapshot keeps it as <base>data/zh/forestdata.json beside forest/
    const snap = new URLSearchParams(location.search).has('snap');
    const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
    const r = await fetch(snap ? location.pathname.replace(/forest\/[^/]*$/, '') + `data/${lang}/forestdata.json` : `/api/view?screen=forestdata&lang=${lang}`, { headers: { accept: 'application/json' } });
    const d = await r.json();
    d.hypById = new Map(d.hyps.map((h) => [h.id, h]));
    F.REAL = d;
    F.setShow(new URLSearchParams(location.search).get('show'));
    return d;
  };
  // 核验状态 filter: h.vis is 2 for a hypothesis in the chosen states, 1 for a tree
  // ancestor kept as faint context, 0 for the rest; d.vis marks projects with any shown.
  // ?show= absent: the 已核验 preset; 'all'; or a comma list. The workbench page
  // changes it live with postMessage({ type: 'forest-show', show }).
  const CHECKED = ['confirmed', 'refuted', 'revise'];
  F.setShow = function (show) {
    const d = F.REAL;
    if (!d) return;
    const keys = show == null || show === '' ? CHECKED : show === 'all' ? null : String(show).split(',');
    const up = new Map();
    for (const e of d.edges) if (e.kind === 'tree') (up.get(e.b) || up.set(e.b, []).get(e.b)).push(e.a);
    for (const h of d.hyps) h.vis = !keys || keys.includes(h.verify) ? 2 : 0;
    const stack = d.hyps.filter((h) => h.vis === 2).map((h) => h.id), seen = new Set(stack);
    while (stack.length) for (const a of up.get(stack.pop()) || []) {
      if (seen.has(a)) continue;
      seen.add(a); stack.push(a);
      const h = d.hypById.get(a);
      if (h && h.vis === 0) h.vis = 1;
    }
    for (const i of d.ideas) i.vis = d.hyps.some((h) => h.vis === 2 && h.ideas.includes(i.id)) ? 2 : d.hyps.some((h) => h.vis && h.ideas.includes(i.id)) ? 1 : 0;
    F.show = keys;
    if (F.onShow) F.onShow();
    // the page around the forest shows how many each option holds
    const counts = {};
    for (const h of d.hyps) counts[h.verify] = (counts[h.verify] || 0) + 1;
    if (window.parent !== window) try { window.parent.postMessage({ type: 'forest-counts', counts, shown: d.hyps.filter((h) => h.vis === 2).length }, location.origin); } catch (e) {}
  };
  addEventListener('message', (e) => { if (e.data && e.data.type === 'forest-show') F.setShow(e.data.show); });
  if (!REAL) return;
  // the controls that regenerate a synthetic forest have no meaning here
  addEventListener('DOMContentLoaded', () => {
    const en = new URLSearchParams(location.search).get('lang') === 'en';
    document.getElementById('bReseed')?.remove();
    document.getElementById('rScale')?.parentElement?.remove();
    const title = document.getElementById('title');
    const is3d = /3d\.html/.test(location.pathname);
    const other = (is3d ? '2d.html' : '3d.html') + location.search;
    if (title) title.innerHTML = (en ? 'AI-Scientist-2 · live forest · ' : 'AI-Scientist-2 · 真实森林 · ') + '<b>' + (is3d ? (en ? '3D' : '三维') : (en ? '2D' : '二维')) + '</b> · <a href="' + other + '">' + (is3d ? (en ? '2D view →' : '二维视图 →') : (en ? '3D view →' : '三维视图 →')) + '</a>';
    const sub = document.querySelector('#hud .sub');
    if (sub) sub.innerHTML = en ? 'Each project is one tree; earlier versions stay beside it, faded.<br>Shared hypotheses sit between the projects that cite them.' : '每个课题是一棵树，旧版本假设淡显在旁；<br>共享假设位于引用它的各课题之间。';
  });
})(window);
