// The two public pages, as in the workbench (its hero.js and landing.js), with the
// ways in pointing at task submission instead of the workbench screens.
import { html, useState, useEffect, useRef, LANG, setLang, L, I } from './core.js';
import { SystemMap } from './system-map.js';
import { go, href } from './router.js';
import { user } from './api.js';

const SEEN = 'ais.hero';
const seen = (() => { try { return !!localStorage.getItem(SEEN); } catch { return false; } })();

const glyph = (d) => html`<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"
  dangerouslySetInnerHTML=${{ __html: d }}></svg>`;
const FORK = glyph('<path d="M8 3.5 3 12.5M8 3.5v9M8 3.5l5 9"/><circle cx="8" cy="3" r="1.6" fill="currentColor" stroke="none"/><circle cx="3" cy="13" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="13" r="1.3" fill="currentColor" stroke="none"/><circle cx="13" cy="13" r="1.3" fill="currentColor" stroke="none"/>');
const MERGE = glyph('<path d="M3 3.5 8 12.5M8 3.5v9M13 3.5l-5 9"/><circle cx="3" cy="3" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="3" r="1.3" fill="currentColor" stroke="none"/><circle cx="13" cy="3" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="13" r="1.6" fill="currentColor" stroke="none"/>');
const AIM = glyph('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/>');

// where "submit a task" leads: the form when signed in, the sign-in page otherwise
export const submitHref = () => href(user() ? '/submit' : '/login?next=submit');

export function Hero() {
  const frame = useRef(null);
  const root = useRef(null);
  const copy = useRef(null);
  const [busy, setBusy] = useState(false);
  const [top] = useState(() => matchMedia('(max-width:760px), (orientation:portrait)').matches);
  useEffect(() => {
    const el = copy.current, r = root.current, f = frame.current;
    if (!el || !r || !top) return;
    const fit = () => {
      const h = Math.ceil(el.getBoundingClientRect().height), bottom = el.getBoundingClientRect().bottom;
      r.style.setProperty('--copy-h', h + 'px');
      r.style.setProperty('--copy-b', Math.round(innerHeight - bottom) + 'px');
      const nav = r.querySelector('.fh-nav')?.getBoundingClientRect().bottom || 52;
      const region = [nav / innerHeight, (bottom - h + 20) / innerHeight];
      try { if (f?.contentWindow) f.contentWindow.__heroRegion = region; } catch {}
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    f?.addEventListener('load', fit);
    addEventListener('resize', fit);
    return () => { ro.disconnect(); f?.removeEventListener('load', fit); removeEventListener('resize', fit); };
  }, [top]);
  useEffect(() => { try { localStorage.setItem(SEEN, '1'); } catch {} }, []);
  // Any sign of intent plays the rest of the entrance out at speed; Enter opens the form.
  const hurry = useRef(null);
  useEffect(() => {
    let sped = false;
    const speed = () => {
      if (sped) return;
      sped = true;
      for (const a of root.current?.getAnimations?.({ subtree: true }) || []) if (a.playState !== 'finished') a.updatePlaybackRate(7);
    };
    const key = (e) => {
      if (e.key === 'Enter' && !e.target.closest?.('a,button,input,textarea')) { go(user() ? '/submit' : '/login?next=submit'); return; }
      speed();
    };
    hurry.current = { speed, key };
    const evs = ['pointerdown', 'wheel', 'touchstart'];
    evs.forEach((n) => addEventListener(n, speed, { passive: true }));
    addEventListener('keydown', key);
    return () => { evs.forEach((n) => removeEventListener(n, speed)); removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { document.title = L('AI 科学家：动态 假设-证据 森林', 'AI Scientist: A Dynamic Hypothesis–Evidence Forest'); }, [LANG]);
  useEffect(() => {
    const f = frame.current;
    let win = null;
    const down = () => { setBusy(true); hurry.current?.speed(); }, up = () => setBusy(false);
    const wheel = () => hurry.current?.speed(), key = (e) => hurry.current?.key(e);
    const on = [['pointerdown', down], ['pointerup', up], ['pointercancel', up], ['wheel', wheel], ['keydown', key]];
    const hook = () => {
      win = f?.contentWindow;
      if (win) on.forEach(([n, h]) => win.addEventListener(n, h, { passive: true }));
    };
    f?.addEventListener('load', hook);
    return () => {
      f?.removeEventListener('load', hook);
      if (win) on.forEach(([n, h]) => win.removeEventListener(n, h));
    };
  }, []);
  const me = user();
  return html`<div ref=${root} class=${'fh' + (top ? ' top' : '') + (seen ? ' quick' : '') + (busy ? ' busy' : '')}>
    <iframe ref=${frame} class="fh-gl" src=${'forest/3d.html?mode=hero&lang=' + LANG + (seen ? '&quick' : '') + (top ? '&fit=top' : '')} title=${L('动态 假设-证据 森林三维视图', 'The hypothesis–evidence forest in 3D')}></iframe>
    <div class="fh-shade" aria-hidden="true"></div>

    <nav class="fh-nav">
      <a class="fh-brand" href=${href('/')}>${I('logo', { s: 17, c: 'currentColor', w: 1.8 })}<span>AI Scientist</span></a>
      <div class="grow"></div>
      <a href=${href('/about')}>${L('系统介绍', 'About')}</a>
      ${me ? html`<a href=${href('/tasks')}>${L('我的任务', 'My tasks')}</a>` : html`<a href=${href('/login')}>${L('登录', 'Sign in')}</a>`}
      <button class="fh-lang" onClick=${() => setLang(LANG === 'zh' ? 'en' : 'zh')}>${LANG === 'zh' ? 'EN' : '中文'}</button>
      <a class="fh-enter" href=${submitHref()}>${L('提交任务', 'Submit a task')}<span aria-hidden="true">→</span></a>
    </nav>

    <header class="fh-copy" ref=${copy}>
      <div class="fh-eye">Dynamic Hypothesis–Evidence Forest</div>
      <h1>
        <span class="fh-k">${L('AI 科学家', 'AI Scientist')}</span><span class="sr">${L('：', ': ')}</span>
        <span class="fh-m">${L('动态 假设-证据 森林', 'A Dynamic Hypothesis–Evidence Forest')}</span>
      </h1>
      <div class="fh-idea">
        <div class="fh-f">
          <div class="fh-fk">${FORK}${L('展开', 'Expand')}</div>
          <b>${L('苏格拉底诘问', 'Socratic questioning')}</b>
          <span>${L('多 Agent 诘问，将主张拆分为可验证假设', 'Agents question each claim and split it into testable hypotheses')}</span>
        </div>
        <div class="fh-f">
          <div class="fh-fk">${MERGE}${L('收敛', 'Converge')}</div>
          <b>${L('奥卡姆剃刀', "Occam's razor")}</b>
          <span>${L('模仿人类科研经验，将具体假设抽象整合', 'Learns from human research practice to abstract specific hypotheses into general ones')}</span>
        </div>
      </div>
      <div class="fh-goal">
        <div class="fh-fk">${AIM}${L('整体目标', 'Objective')}</div>
        <b>${L('在 AI 可以全自动科研的未来，寻找人类在科研环节中的定位', 'In a future where AI can do research end to end, find where humans belong in it')}</b>
      </div>
      <div class="fh-cta">
        <a class="fh-go" href=${submitHref()}>${L('提交任务', 'Submit a task')}<span aria-hidden="true">→</span></a>
        <a class="fh-link" href=${href('/about')}>${L('系统原理', 'How it works')}</a>
      </div>
    </header>

    <div class="fh-foot">
      <div class="fh-keys"><kbd>Enter</kbd>${L('提交任务 · 拖动节点 · 拖动空白处旋转视角 · 滚轮缩放 · 双击复位', 'submit a task · drag a node · drag empty space to rotate · scroll to zoom · double-click to reset')}</div>
    </div>
  </div>`;
}

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const show = (e) => e.classList.add('in');
    const all = () => ref.current?.querySelectorAll('.reveal:not(.in)') || [];
    if (!('IntersectionObserver' in window)) { all().forEach(show); return; }
    const io = new IntersectionObserver((rows) => rows.forEach((r) => r.isIntersecting && (show(r.target), io.unobserve(r.target))), { rootMargin: '-40px' });
    all().forEach((e) => io.observe(e));
    const sweep = () => { for (const e of all()) { const r = e.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) show(e); } };
    addEventListener('scroll', sweep, { passive: true });
    const t = setTimeout(sweep, 300);
    return () => { io.disconnect(); removeEventListener('scroll', sweep); clearTimeout(t); };
  }, []);
  return ref;
}

const Section = ({ id, cls = '', children, style }) => html`<section id=${id} class=${'band ' + cls} style=${style}><div class="sec reveal">${children}</div></section>`;
const Tiles = ({ items }) => html`<div class="feat tiles">${items.map(([ic, title, chain, sep = '→']) => html`
  <div class="f tile">${I(ic, { s: 22, c: 'var(--acc)' })}<h3>${L(...title)}</h3>
    <div class="chain">${chain.map((k, i) => html`${i > 0 && html`<i>${sep}</i>`}<span>${L(...k)}</span>`)}</div></div>`)}</div>`;

export function About() {
  const ref = useReveal();
  useEffect(() => { document.title = L('系统介绍 · AI Scientist', 'About · AI Scientist'); }, [LANG]);
  const me = user();
  return html`<div class="lp pt-about" ref=${ref}>
    <a class="sr" href="#main">${L('跳至正文', 'Skip to content')}</a>
    <nav class="lnav">
      <a class="brand" href=${href('/')} style="color:#fff">${I('logo', { s: 21, c: '#fff', w: 1.8 })}<span style="font-size:15px;font-weight:600;color:#fff">AI Scientist</span></a>
      <div class="grow"></div>
      <a href=${href('/')} class="hide-s">${L('首页', 'Home')}</a>
      ${me ? html`<a href=${href('/tasks')}>${L('我的任务', 'My tasks')}</a>` : html`<a href=${href('/login')}>${L('登录', 'Sign in')}</a>`}
      <button class="btn xs" style="background:transparent;color:#98A2B3;border-color:rgba(255,255,255,.18)" onClick=${() => setLang(LANG === 'zh' ? 'en' : 'zh')}>${LANG === 'zh' ? 'EN' : '中文'}</button>
      <a class="cta" href=${submitHref()}>${L('提交任务', 'Submit a task')}</a>
    </nav>

    <section class="smap-band" id="main">
      <${SystemMap} />
    </section>

    <${Section} id="human" cls="">
      <div class="eyebrow">${L('人类判定接口', 'Where humans decide')}</div>
      <${Tiles} items=${[
        ['check', ['立项', 'Adopt'], [['Idea', 'Idea'], ['课题', 'Project']]],
        ['pen', ['投稿', 'Submit'], [['全文', 'Manuscript'], ['刊会', 'Venue']]],
        ['tree', ['核验', 'Verify'], [['真实森林', 'Forest'], ['假设', 'Hypothesis']]],
      ]} />
    <//>

    <${Section} id="aims" cls="alt">
      <div class="eyebrow">${L('森林网的两个优化目标', 'Two aims of the forest')}</div>
      <${Tiles} items=${[
        ['bulb', ['经验学习', 'Learning from experience'], [['AI 认知', 'AI cognition'], ['人类认知', 'human cognition']], L('对齐', 'aligns with')],
        ['gavel', ['证据审计', 'Auditing evidence'], [['人类认知', 'human cognition'], ['客观世界', 'the objective world']], L('对齐', 'aligns with')],
      ]} />
    <//>

    <${Section} id="pipeline" cls="">
      <div class="eyebrow">${L('启动方式', 'Ways in')}</div>
      <${Tiles} items=${[
        ['book', ['学习 · 冷启动', 'Learning · cold'], [['研读', 'Study'], ['整合', 'Consolidate'], ['预测', 'Predict'], ['判定', 'Judge']]],
        ['fork', ['学习 · 热启动', 'Learning · warm'], [['主张', 'Claim'], ['课题', 'Project'], ['实验', 'Test'], ['判定', 'Verdict']]],
        ['flask', ['研究模式', 'Research'], [['选题', 'Idea'], ['实验', 'Test'], ['写作', 'Write'], ['投稿', 'Submit']]],
      ]} />
    <//>

    <${Section} cls="" style=${{ background: 'var(--dark)' }}>
      <div class="dark" style="text-align:center">
        <div class="eyebrow" style="color:#7DA2FF">${L('整体目标', 'Objective')}</div>
        <h2 style="color:#fff;margin-top:12px">${L('在 AI 可以全自动科研的未来，寻找人类在科研环节中的定位', 'In a future where AI can do research end to end, find where humans belong in it')}</h2>
        <div class="hbtns"><a class="hbtn" href=${submitHref()}>${L('提交任务', 'Submit a task')}</a>
          ${me && html`<a class="hbtn ghost" href=${href('/tasks')}>${L('我的任务', 'My tasks')}</a>`}</div>
      </div>
    <//>

    <footer class="foot">
      <div class="in">
        <div class="row" style="color:#fff">${I('logo', { s: 20, c: '#fff', w: 1.8 })}<span style="font-weight:600">AI Scientist</span></div>
        <div>${L('语言', 'Language')}: <a href="#" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); setLang(LANG === 'zh' ? 'en' : 'zh'); }}>${LANG === 'zh' ? 'English' : '中文'}</a></div>
      </div>
    </footer>
  </div>`;
}
