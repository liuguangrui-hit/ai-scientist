// The submission portal: sign in with an invite, hand in a task with the stages it
// should run, and follow it. Members see only their own tasks; an admin reviews all.
import { html, render, useState, useEffect, useRef, useCallback, LANG, setLang, onLang, L, I, when } from './core.js';
import { go, href, useRoute } from './router.js';
import { Hero, About } from './front.js';
import * as api from './api.js';

// Two separate sites share these pages: the lab server (campus network) and the public one.
const SITE = window.PORTAL_CONFIG.site || 'cloud';
const LAB_URL = window.PORTAL_CONFIG.labUrl || '';
const CLOUD_URL = window.PORTAL_CONFIG.cloudUrl || '';
const OTHER = SITE === 'lab' ? 'cloud' : 'lab';
const nameOf = (site) => (site === 'lab' ? L('校内站', 'Campus site') : L('校外站', 'Off-campus site'));
const siteName = () => nameOf(SITE);
const Where = ({ site }) => html`<span class=${'pt-site sm ' + site}>${site === 'lab' ? L('校内', 'Campus') : L('校外', 'Off-campus')}</span>`;

// The terms every user accepts: using the system means contributing to its shared library.
const TERMS = () => L(
  '使用 AI Scientist 即同意：你提交的任务和系统产出的研究成果纳入共享库，供系统和其他任务借鉴。',
  'By using AI Scientist you agree that your tasks and the results the system produces join the shared library, where the system and other tasks can learn from them.');

const STATUS = {
  pending: ['待审核', 'Awaiting review', 'wait'],
  queued: ['排队中', 'Queued', 'queue'],
  running: ['执行中', 'Running', 'run'],
  done: ['已完成', 'Done', 'pass'],
  rejected: ['已退回', 'Returned', 'fail'],
  failed: ['未完成', 'Failed', 'fail'],
};
const sName = (s) => L(STATUS[s]?.[0] || s, STATUS[s]?.[1] || s);
const Badge = ({ s }) => html`<span class=${'pt-badge ' + (STATUS[s]?.[2] || '')}><i></i>${sName(s)}</span>`;
const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');
const sl = (st, k) => st[k + '_' + LANG] || st[k + '_zh'];
const problem = (e) => (e instanceof TypeError ? L('网络连接失败，请稍后重试', 'Network error, please try again') : e.message || String(e));

function useLoad(fn, deps, every = 0) {
  const [state, set] = useState({ loading: true });
  const run = useCallback(() => fn().then((data) => set({ data }), (e) => set((s) => (s.data ? s : { error: problem(e) }))), deps);
  useEffect(() => {
    set({ loading: true });
    run();
    if (!every) return;
    const t = setInterval(() => { if (!document.hidden) run(); }, every);
    return () => clearInterval(t);
  }, [run]);
  return { ...state, reload: run };
}

// ---------------------------------------------------------------- frame
function Shell({ me, page, children, wide }) {
  return html`<div class="pt">
    <nav class="pt-nav">
      <a class="pt-brand" href=${href('/')}>${I('logo', { s: 19, c: '#fff', w: 1.8 })}<span>AI Scientist</span></a>
      <span class=${'pt-site ' + SITE} title=${L('两个站的账号与任务互相独立', 'The two sites keep separate accounts and tasks')}>${siteName()}</span>
      <a class=${'hide-s' + (page === 'about' ? ' on' : '')} href=${href('/about')}>${L('系统介绍', 'About')}</a>
      ${me && html`<a class=${page === 'submit' ? 'on' : ''} href=${href('/submit')}>${L('提交任务', 'Submit')}</a>
        <a class=${page === 'tasks' || page === 'task' ? 'on' : ''} href=${href('/tasks')}>${L('我的任务', 'My tasks')}</a>
        <a class=${page === 'agents' ? 'on' : ''} href=${href('/agents')}>${L('Agent 登录', 'Agent logins')}</a>`}
      ${me?.role === 'admin' && html`<a class=${page === 'admin' ? 'on' : ''} href=${href('/admin')}>${L('管理', 'Admin')}</a>`}
      <div class="grow"></div>
      <button class="pt-ghost" onClick=${() => setLang(LANG === 'zh' ? 'en' : 'zh')}>${LANG === 'zh' ? 'EN' : '中文'}</button>
      ${me && html`<span class="pt-me hide-s">${me.full_name || me.email}</span>
        <button class="pt-ghost" onClick=${() => api.signOut().then(() => go('/'))}>${L('退出', 'Sign out')}</button>`}
    </nav>
    <main class=${'pt-main' + (wide ? ' wide' : '')}>${children}</main>
  </div>`;
}
const Head = ({ title, sub, children }) => html`<header class="pt-head"><div><h1>${title}</h1>${sub && html`<p>${sub}</p>`}</div>${children}</header>`;
const Note = ({ bad, children }) => html`<div class=${'pt-note' + (bad ? ' bad' : '')}>${children}</div>`;
const Field = ({ label, hint, children }) => html`<label class="pt-field"><span class="k">${label}</span>${children}${hint && html`<span class="h">${hint}</span>`}</label>`;

// ---------------------------------------------------------------- sign in / register
function Login({ q }) {
  const [mode, setMode] = useState(q.invite ? 'up' : 'in');
  const [f, setF] = useState({ email: '', password: '', fullName: '', invite: q.invite || '' });
  const [vendor, setVendor] = useState('claude');
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const put = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { document.title = L('登录 · AI Scientist', 'Sign in · AI Scientist'); }, [LANG]);
  const done = () => go('/' + (q.next || 'tasks'), true);
  async function submit(e) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      if (mode === 'in') { await api.signIn(f); return done(); }
      if (f.password.length < 8) throw new Error(L('密码至少 8 位', 'Use at least 8 characters for the password'));
      const bad = loginProblem(vendor, login);
      if (bad) throw new Error(bad);
      const st = await api.rpc('invite_status', { invite_code: f.invite.trim(), for_email: f.email.trim() });
      if (st === 'other_email') throw new Error(L('这个邀请码是发给另一个邮箱的，请用收到邀请的邮箱注册', 'This invite was issued for another e-mail address; register with the address it was sent to'));
      if (st !== 'ok') throw new Error(L('邀请码无效或已被使用', 'This invite code is invalid or already used'));
      const r = await api.signUp({ ...f, email: f.email.trim(), fullName: f.fullName.trim(), invite: f.invite.trim() });
      if (r.signedIn) {
        // the account cannot submit until a login is saved; if this fails the Agent logins page asks again
        await api.rpc('set_agent_token', { vendor, secret: login }).catch(() => {});
        return done();
      }
      setMode('in');
      setMsg({ text: L('注册成功，点邮件里的确认链接后再登录。', 'Registered. Click the link in the e-mail, then sign in.') });
    } catch (err) {
      const m = problem(err);
      setMsg({ bad: true, text: /invalid login/i.test(m) ? L('邮箱或密码不正确', 'Wrong e-mail or password') + (SITE === 'cloud' ? L('。校内注册的账号不能在校外站登录。', '. Campus accounts cannot sign in on this site.') : '') : /already registered/i.test(m) ? L('这个邮箱已注册，请直接登录', 'This e-mail is already registered, sign in instead') : m });
    } finally { setBusy(false); }
  }
  return html`<${Shell} page="login">
    <div class="pt-auth">
      <div class="pt-card">
        <div class="pt-tabs">
          <button class=${mode === 'in' ? 'on' : ''} onClick=${() => { setMode('in'); setMsg(null); }}>${L('登录', 'Sign in')}</button>
          <button class=${mode === 'up' ? 'on' : ''} onClick=${() => { setMode('up'); setMsg(null); }}>${L('凭邀请码注册', 'Register with an invite')}</button>
        </div>
        <form onSubmit=${submit}>
          ${mode === 'up' && html`
            <${Field} label=${L('邀请码', 'Invite code')}><input required value=${f.invite} onInput=${put('invite')} autocomplete="off" spellcheck="false" /><//>
            <${Field} label=${L('姓名', 'Name')}><input required maxlength="80" value=${f.fullName} onInput=${put('fullName')} autocomplete="name" /><//>`}
          <${Field} label=${L('邮箱', 'E-mail')}><input required type="email" value=${f.email} onInput=${put('email')} autocomplete="email" /><//>
          ${mode === 'up' && html`<label class="pt-check terms"><input required type="checkbox" />
            <span><b>${L('我已阅读并同意使用协议', 'I have read and accept the terms of use')}</b><span class="h">${TERMS()}</span></span></label>`}
          <${Field} label=${L('密码', 'Password')} hint=${mode === 'up' && L('至少 8 位', 'At least 8 characters')}>
            <input required type="password" value=${f.password} onInput=${put('password')} autocomplete=${mode === 'in' ? 'current-password' : 'new-password'} /><//>
          ${mode === 'up' && html`<div class="pt-give signup">
            <span class="k">${L('你的 Agent 登录（至少一个）', 'Your agent login (at least one)')}</span>
            <p class="pt-fine left">${L('任务用你自己的订阅运行。先提供一个，另一个以后可以再加。', 'Tasks run on your own subscription. Give one now; you can add the other later.')}</p>
            <div class="pt-tabs os">${VENDORS.map((v) => html`<button type="button" class=${vendor === v.id ? 'on' : ''} onClick=${() => { setVendor(v.id); setLogin(''); }}>${v.name}</button>`)}</div>
            <${LoginSteps} key=${vendor} v=${VENDORS.find((v) => v.id === vendor)} val=${login} setVal=${setLogin} onErr=${(m) => setMsg({ bad: true, text: m })} signup />
          </div>`}
          ${msg && html`<${Note} bad=${msg.bad}>${msg.text}<//>`}
          <button class="pt-btn pri" disabled=${busy}>${busy ? L('请稍候', 'One moment') : mode === 'in' ? L('登录', 'Sign in') : L('注册', 'Register')}</button>
        </form>
      </div>
      <p class="pt-fine">${L('凭邀请码注册，邀请码向管理员索取。', 'Registration is by invite; ask the administrator for a code.')}</p>
      ${SITE === 'cloud' && html`<div class="pt-where">
        <b>${L('你现在在校外站', 'You are on the off-campus site')}</b>
        <p>${L('校内站和校外站账号分开，校内账号不能在这里登录。', 'Campus and off-campus accounts are separate; campus accounts cannot sign in here.')}</p>
        <p>${L('用校内账号：连 NTU VPN 后打开', 'For your campus account, connect to the NTU VPN and open the')} <a href=${LAB_URL} target="_blank" rel="noopener">${L('校内站', 'campus site')}</a>${L('。', '.')}</p>
        <p>${L('常在校外用：向管理员要校外站邀请码，用同一邮箱再注册一次。', 'Often off campus? Ask the administrator for an off-campus invite and register here with the same e-mail.')}</p>
      </div>`}
      ${SITE === 'lab' && html`<p class="pt-fine">${L('校内站，需在校园网或 NTU VPN 内访问。', 'Campus site, reachable on the campus network or the NTU VPN.')}</p>`}
    </div>
  <//>`;
}

// ---------------------------------------------------------------- the flow chart
// Submitting: click a stage to include it. Following a task: each stage shows where it stands.
// Stages run in parallel: every stage started and not yet finished is running, not only the
// current one; a stage reported finished counts as done even if its start was never reported.
function stageState(task, started, finished) {
  const done = new Set(finished), open = new Set(started);
  if (task.status === 'running' && task.current_stage) open.add(task.current_stage);
  return (id) => (!task.stages.includes(id) ? null : task.status === 'done' || done.has(id) ? 'done' : task.status === 'running' && open.has(id) ? 'run' : 'wait');
}

function Flow({ stages, picked, onToggle, stateOf }) {
  return html`<div class=${'pt-flow' + (onToggle ? ' pick' : '')}>
    ${stages.map((st, i) => {
      const on = picked.includes(st.id);
      const state = stateOf ? stateOf(st.id) : null;
      const cls = 'pt-stage' + (on ? ' on' : ' off') + (state ? ' ' + state : '') + (on && i + 1 < stages.length && picked.includes(stages[i + 1].id) ? ' next' : '');
      const body = html`<span class="n">${String(i + 1).padStart(2, '0')}</span>
        <b>${sl(st, 'title')}</b>
        <span class="s">${sl(st, 'summary')}</span>
        <span class="mark">${state === 'done' ? I('check', { s: 13, w: 2.4 }) : state === 'run' ? html`<i class="pulse"></i>` : on && !stateOf ? I('check', { s: 13, w: 2.4 }) : null}</span>`;
      return onToggle
        ? html`<button type="button" class=${cls} aria-pressed=${on} onClick=${() => onToggle(st.id)}>${body}</button>`
        : html`<div class=${cls}>${body}</div>`;
    })}
  </div>`;
}

// ---------------------------------------------------------------- submit
function Files({ files, setFiles }) {
  const input = useRef(null);
  const [warn, setWarn] = useState('');
  const add = (list) => {
    const next = [...files];
    let w = '';
    for (const f of list) {
      if (f.size > api.MAX_FILE) { w = L(`${f.name} 超过 ${api.MAX_MB} MB，请改填数据位置`, `${f.name} is over ${api.MAX_MB} MB; give its location instead`); continue; }
      if (next.length >= 10) { w = L('最多附带 10 个文件', 'At most 10 files'); break; }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setWarn(w); setFiles(next);
  };
  return html`<div class="pt-files">
    <div class="pt-drop" onClick=${() => input.current.click()}
      onDragOver=${(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
      onDragLeave=${(e) => e.currentTarget.classList.remove('over')}
      onDrop=${(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); add(e.dataTransfer.files); }}>
      ${I('plus', { s: 18 })}<span>${L(`点击或拖入文件，单个不超过 ${api.MAX_MB} MB`, `Click or drop files, up to ${api.MAX_MB} MB each`)}</span>
      <input ref=${input} type="file" multiple hidden onChange=${(e) => { add(e.target.files); e.target.value = ''; }} />
    </div>
    ${files.map((f, i) => html`<div class="pt-file">${I('file', { s: 15 })}<span class="ell">${f.name}</span><span class="mut">${size(f.size)}</span>
      <button type="button" class="pt-x" aria-label=${L('移除', 'Remove')} onClick=${() => setFiles(files.filter((_, j) => j !== i))}>${I('x', { s: 14 })}</button></div>`)}
    ${warn && html`<${Note} bad>${warn}<//>`}
  </div>`;
}

async function upload(taskId, files, onStep) {
  const failed = [];
  for (let i = 0; i < files.length; i++) {
    onStep?.(i + 1, files.length);
    try { await api.attach(taskId, files[i], i); } catch (e) { failed.push(`${files[i].name}: ${problem(e)}`); }
  }
  return failed;
}

// What the submitter allows; the planning step treats each one as a hard limit. All off by default.
const ALLOW = [
  ['allow_idea_change', ['允许修改我的想法和核心主张', 'You may change my idea and core claims'], ['不勾：想法保持原样，只给建议', 'Unticked: your idea stays as it is; only suggestions']],
  ['allow_text_rewrite', ['允许改写我已有的论文文本', 'You may rewrite my existing paper text'], ['不勾：只改必须改的地方，或只给意见', 'Unticked: only necessary edits, or comments only']],
  ['allow_new_experiments', ['允许新做实验（会使用 GPU 服务器）', 'You may run new experiments (uses GPU servers)'], ['不勾：只用你已有的结果和数据', 'Unticked: only your existing results and data']],
];

function Submit({ me }) {
  const stages = useLoad(() => api.stages(), []);
  const [f, setF] = useState({ title: '', description: '', objective: '', data_note: '' });
  const [allow, setAllow] = useState({});
  const [picked, setPicked] = useState([]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const put = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const logins = useLoad(() => api.rows(`agent_tokens?owner=eq.${me.id}&select=vendor,status,note`), [me.id]);
  const trouble = logins.data && loginTrouble(logins.data, me.token_required, true);
  useEffect(() => { document.title = L('提交任务 · AI Scientist', 'Submit a task · AI Scientist'); }, [LANG]);
  const all = stages.data || [];
  const order = (ids) => all.filter((s) => ids.includes(s.id)).map((s) => s.id);
  const toggle = (id) => setPicked((now) => order(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(L('正在提交', 'Submitting'));
    let task;
    try {
      task = await api.insert('tasks', { title: f.title.trim(), description: f.description.trim(), objective: f.objective.trim(), data_note: f.data_note.trim(), stages: picked,
        constraints: Object.fromEntries(ALLOW.map(([k]) => [k, !!allow[k]])) });
    } catch (e2) {
      setErr(/row-level security/i.test(problem(e2)) ? L('提交前请先在 Agent 登录页提供你的 Claude Code 或 Codex 登录。', 'Give your Claude Code or Codex login on the Agent logins page before submitting.') : problem(e2));
      setBusy(''); return;
    }
    const failed = await upload(task.id, files, (i, n) => setBusy(L(`正在上传附件 ${i}/${n}`, `Uploading file ${i} of ${n}`)));
    if (failed.length) { try { sessionStorage.setItem('aisp.failed.' + task.id, JSON.stringify(failed)); } catch {} }
    go('/task?id=' + task.id);
  }
  return html`<${Shell} me=${me} page="submit" wide>
    <${Head} title=${L('提交任务', 'Submit a task')} sub=${L('写清楚你想要什么，系统据此安排步骤，管理员批准后开始。', 'Say what you want; the system plans the steps, and work starts once an administrator approves.')} />
    ${stages.error && html`<${Note} bad>${stages.error}<//>`}
    ${trouble && html`<${Note} bad=${!logins.data.some((x) => x.status === 'unchecked')}>${trouble} <a href=${href('/agents')}>${L('打开 Agent 登录页', 'Open Agent logins')}</a><//>`}
    <form class="pt-form" onSubmit=${submit}>
      <section class="pt-card">
        <div class="pt-sec"><h2><em>1</em>${L('说明任务', 'Describe the task')}</h2></div>
        <${Field} label=${L('任务名', 'Task name')}><input required maxlength="120" value=${f.title} onInput=${put('title')} /><//>
        <${Field} label=${L('任务目标（最重要）', 'Objective (the most important part)')} hint=${L('想要什么结果，怎样算完成。系统以此为准，不会改动', 'What you want and what counts as done. The system follows it as written')}>
          <textarea required rows="4" maxlength="5000" value=${f.objective} onInput=${put('objective')}></textarea><//>
        <${Field} label=${L('任务描述', 'Description')} hint=${L('背景、进展、手上已有的材料', 'Background, progress, what you already have')}>
          <textarea required rows="7" maxlength="20000" value=${f.description} onInput=${put('description')}></textarea><//>
      </section>

      <section class="pt-card">
        <div class="pt-sec"><h2><em>2</em>${L('文件与数据', 'Files and data')}</h2></div>
        <p class="pt-fine left">${L('想法、草稿、实验结果、代码、审稿意见都可以附上，系统从这里接着做。', 'Attach your idea, draft, results, code or reviews; the system picks up from there.')}</p>
        <${Files} files=${files} setFiles=${setFiles} />
        <${Field} label=${L('大数据的位置', 'Where large data lives')} hint=${L(`超过 ${api.MAX_MB} MB 的数据不上传，填服务器路径或下载链接`, `Data over ${api.MAX_MB} MB is not uploaded; give a server path or a link`)}>
          <textarea rows="2" maxlength="2000" value=${f.data_note} onInput=${put('data_note')}></textarea><//>
      </section>

      <section class="pt-card">
        <div class="pt-sec"><h2><em>3</em>${L('你允许系统做什么', 'What the system may do')}</h2></div>
        <p class="pt-fine left">${L('研究成果按使用协议纳入共享库。', 'Results join the shared library under the terms of use.')}</p>
        <div class="pt-allow">${ALLOW.map(([k, label, hint]) => html`<label class=${'pt-check' + (allow[k] ? ' on' : '')}>
          <input type="checkbox" checked=${!!allow[k]} onChange=${(e) => setAllow({ ...allow, [k]: e.target.checked })} />
          <span><b>${L(...label)}</b><span class="h">${L(...hint)}</span></span></label>`)}</div>
      </section>

      <section class="pt-card">
        <div class="pt-sec"><h2><em>4</em>${L('希望经过的阶段（可选）', 'Stages you have in mind (optional)')}</h2>
          <div class="pt-quick"><button type="button" class="pt-ghost" onClick=${() => setPicked([])}>${L('清空', 'Clear')}</button></div></div>
        <p class="pt-fine left">${L('不确定可以不选，系统会按目标安排。', 'Leave it empty if unsure; the system plans from your objective.')}</p>
        ${stages.loading ? html`<div class="pt-wait">${L('载入中', 'Loading')}</div>` : html`<${Flow} stages=${all} picked=${picked} onToggle=${toggle} />`}
      </section>

      ${err && html`<${Note} bad>${err}<//>`}
      <div class="pt-actions">
        <span class="mut">${L('提交后不能修改，请核对', 'A task cannot be changed after it is submitted')}</span>
        <button class="pt-btn pri big" disabled=${!!busy}>${busy || L('提交任务', 'Submit the task')}</button>
      </div>
    </form>
  <//>`;
}

// ---------------------------------------------------------------- my tasks
function Tasks({ me }) {
  // this site's tasks, plus the copies of the member's tasks on the other site (kept by the sync job)
  const d = useLoad(() => Promise.all([
    api.rows(`tasks?owner=eq.${me.id}&select=id,title,status,stages,current_stage,created_at,updated_at&order=created_at.desc`),
    api.stages(),
    api.rows(`remote_tasks?origin=eq.${OTHER}&owner_email=eq.${encodeURIComponent((me.email || '').toLowerCase())}&select=id,origin,title,status,stages,current_stage,created_at&order=created_at.desc`).catch(() => []),
  ]), [me.id], 20000);
  useEffect(() => { document.title = L('我的任务 · AI Scientist', 'My tasks · AI Scientist'); }, [LANG]);
  const [mine, stages, remote] = d.data || [[], [], []];
  const tasks = [...mine.map((t) => ({ ...t, origin: SITE })), ...remote].sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  const title = (id) => { const s = stages.find((x) => x.id === id); return s ? sl(s, 'title') : id; };
  return html`<${Shell} me=${me} page="tasks">
    <${Head} title=${L('我的任务', 'My tasks')} sub=${L('包含校内站和校外站的任务。', 'Tasks from both the campus and off-campus sites.')}>
      <a class="pt-btn pri" href=${href('/submit')}>${I('plus', { s: 15 })}${L('提交任务', 'Submit a task')}</a><//>
    ${d.error && html`<${Note} bad>${d.error}<//>`}
    ${d.loading ? html`<div class="pt-wait">${L('载入中', 'Loading')}</div>` : !tasks.length ? html`<div class="pt-empty">
        <p>${L('还没有任务', 'No tasks yet')}</p><a class="pt-btn pri" href=${href('/submit')}>${L('提交第一个任务', 'Submit your first task')}</a>
        <p class="pt-fine">${L('两个站用同一邮箱注册，另一站的任务也会显示在这里。', 'Register on both sites with the same e-mail to see tasks from both here.')}</p></div>`
      : html`<div class="pt-list">${tasks.map((t) => html`<a class="pt-row" href=${href(t.origin === SITE ? '/task?id=' + t.id : '/task?remote=' + t.id)}>
          <div class="main"><b class="ell">${t.title}</b>
            <span class="mut">${t.stages.map(title).join(' · ')}</span></div>
          ${t.status === 'running' && t.current_stage && html`<span class="now">${title(t.current_stage)}</span>`}
          <${Where} site=${t.origin} />
          <${Badge} s=${t.status} />
          <span class="mut num hide-s">${when(t.created_at)}</span>
        </a>`)}</div>`}
  <//>`;
}

// ---------------------------------------------------------------- a task on the other site
// The lab copy of an off-campus task is complete; the off-campus copy of a campus task has
// its name and progress only, and points to the campus site for the rest.
function RemoteTask({ me, q }) {
  const d = useLoad(() => Promise.all([
    api.rows(`remote_tasks?id=eq.${q.remote}&select=*`).then((r) => r[0] || null),
    api.rows(`remote_task_files?task_id=eq.${q.remote}&select=*&order=created_at`).catch(() => []),
    api.stages(),
  ]), [q.remote], 20000);
  const [task, files, stages] = d.data || [null, [], []];
  useEffect(() => { if (task) document.title = `${task.title} · AI Scientist`; }, [task?.title]);
  if (d.loading) return html`<${Shell} me=${me} page="task"><div class="pt-wait">${L('载入中', 'Loading')}</div><//>`;
  if (!task) return html`<${Shell} me=${me} page="task"><${Note} bad>${d.error || L('没有这个任务，或你无权查看', 'No such task, or it is not yours to see')}<//><//>`;
  const title = (id) => { const s = stages.find((x) => x.id === id); return s ? sl(s, 'title') : id; };
  const stateOf = stageState(task, task.started_stages || [], task.done_stages);
  const step = STEPS.indexOf(task.status);
  const stopped = task.status === 'rejected' || task.status === 'failed';
  const there = (task.origin === 'lab' ? LAB_URL : CLOUD_URL) + '/task?id=' + task.id;
  const inputs = files.filter((x) => x.kind === 'input'), results = files.filter((x) => x.kind === 'result');
  const FileRow = (x) => html`<button class="pt-file link" onClick=${() => api.download(x.path, x.name).catch((e) => alert(problem(e)))}>
    ${I('down', { s: 15 })}<span class="ell">${x.name}</span>${x.stage && html`<span class="tagx">${title(x.stage)}</span>`}<span class="mut">${size(x.size)}</span></button>`;
  return html`<${Shell} me=${me} page="task" wide>
    <a class="pt-back" href=${href(me.role === 'admin' && task.owner_email !== (me.email || '').toLowerCase() ? '/admin' : '/tasks')}>← ${L('返回', 'Back')}</a>
    <${Head} title=${task.title} sub=${L('提交于 ', 'Submitted ') + when(task.created_at) + L('，来自', ', on the ') + nameOf(task.origin)}><${Badge} s=${task.status} /><//>
    <${Note}>${L(`这是${nameOf(task.origin)}任务的同步副本。`, `A synced copy of a task on the ${nameOf(task.origin)}.`)}
      ${task.origin === 'lab'
        ? html` ${L('说明、附件和产出在校内站，连 NTU VPN 后', 'Details and results are on the campus site; connect to the NTU VPN and')} <a href=${there} target="_blank" rel="noopener">${L('去校内站查看', 'open it there')}</a>${L('。', '.')}`
        : html` <a href=${there} target="_blank" rel="noopener">${L('到校外站打开', 'Open it on the off-campus site')}</a>${L('。', '.')}`}<//>

    <section class="pt-card">
      <div class=${'pt-steps' + (stopped ? ' stopped' : '')}>
        ${STEPS.map((s, i) => html`<div class=${'st' + (!stopped && i < step ? ' past' : '') + (!stopped && i === step ? ' now' : '')}><i>${!stopped && (i < step || task.status === 'done') ? I('check', { s: 12, w: 2.6 }) : i + 1}</i><span>${sName(s)}</span></div>`)}
      </div>
      ${stopped && html`<${Note} bad><b>${sName(task.status)}</b>${task.admin_note ? L('：', ': ') + task.admin_note : ''}<//>`}
    </section>

    <section class="pt-card">
      <div class="pt-sec"><h2>${L('阶段进度', 'Stage progress')}</h2></div>
      <${Flow} stages=${stages} picked=${task.stages} stateOf=${stateOf} />
    </section>

    ${results.length > 0 && html`<section class="pt-card glow">
      <div class="pt-sec"><h2>${L('产出', 'Results')}</h2></div>
      <div class="pt-files">${results.map(FileRow)}</div>
    </section>`}

    ${task.description && html`<section class="pt-card">
      <div class="pt-sec"><h2>${L('任务说明', 'The task')}</h2></div>
      <div class="pt-kv"><span class="k">${L('任务描述', 'Description')}</span><p>${task.description}</p></div>
      <div class="pt-kv"><span class="k">${L('任务目标', 'Objective')}</span><p>${task.objective}</p></div>
      ${task.data_note && html`<div class="pt-kv"><span class="k">${L('大数据的位置', 'Where large data lives')}</span><p>${task.data_note}</p></div>`}
      <div class="pt-kv"><span class="k">${L('附件', 'Attachments')}</span>
        ${inputs.length ? html`<div class="pt-files">${inputs.map(FileRow)}</div>` : html`<p class="mut">${L('无', 'None')}</p>`}</div>
    </section>`}
  <//>`;
}

// ---------------------------------------------------------------- one task
const STEPS = ['pending', 'queued', 'running', 'done'];
function Task({ me, q }) {
  const d = useLoad(() => Promise.all([
    api.rows(`tasks?id=eq.${q.id}&select=*`).then((r) => r[0] || null),
    api.rows(`task_events?task_id=eq.${q.id}&select=*&order=at`),
    api.rows(`task_files?task_id=eq.${q.id}&select=*&order=created_at`),
    api.stages(),
    api.rows(`tasks?id=eq.${q.id}&select=owner`).then((r) => (r[0] ? Promise.all([
      api.rows(`agent_tokens?owner=eq.${r[0].owner}&select=vendor,status,note`),
      api.rows(`profiles?id=eq.${r[0].owner}&select=token_required`).then((p) => !!p[0]?.token_required),
    ]) : [[], false])).catch(() => [[], false]),
  ]), [q.id], 15000);
  const [more, setMore] = useState([]);
  const [busy, setBusy] = useState('');
  const [failed, setFailed] = useState(() => { try { return JSON.parse(sessionStorage.getItem('aisp.failed.' + q.id)) || []; } catch { return []; } });
  const [task, events, files, stages, [logins, required] = [[], false]] = d.data || [null, [], [], []];
  useEffect(() => { if (task) document.title = `${task.title} · AI Scientist`; }, [task?.title]);
  if (d.loading) return html`<${Shell} me=${me} page="task"><div class="pt-wait">${L('载入中', 'Loading')}</div><//>`;
  if (!task) return html`<${Shell} me=${me} page="task"><${Note} bad>${d.error || L('没有这个任务，或你无权查看', 'No such task, or it is not yours to see')}<//><//>`;
  const trouble = ['pending', 'queued', 'running'].includes(task.status) && loginTrouble(logins, required, task.owner === me.id);
  const troubleBad = trouble && !logins.some((x) => x.status === 'unchecked');

  const reported = (kind) => events.filter((e) => e.kind === kind).map((e) => e.stage);
  const stateOf = stageState(task, reported('stage_started'), reported('stage_finished'));
  const running = task.stages.filter((s) => stateOf(s) === 'run');
  const title = (id) => { const s = stages.find((x) => x.id === id); return s ? sl(s, 'title') : id; };
  const step = STEPS.indexOf(task.status);
  const stopped = task.status === 'rejected' || task.status === 'failed';
  const inputs = files.filter((x) => x.kind === 'input'), results = files.filter((x) => x.kind === 'result');
  const doneCount = task.stages.filter((s) => stateOf(s) === 'done').length;
  const line = (e) => (e.kind === 'status' ? sName(e.message) : e.kind === 'stage_started' ? L('开始：', 'Started: ') + title(e.stage) : e.kind === 'stage_finished' ? L('完成：', 'Finished: ') + title(e.stage) : e.message);
  async function addFiles() {
    const bad = await upload(task.id, more, (i, n) => setBusy(L(`正在上传 ${i}/${n}`, `Uploading ${i} of ${n}`)));
    setBusy(''); setMore([]); setFailed(bad);
    try { sessionStorage.removeItem('aisp.failed.' + task.id); } catch {}
    d.reload();
  }
  const FileRow = (x) => html`<button class="pt-file link" onClick=${() => api.download(x.path, x.name).catch((e) => alert(problem(e)))}>
    ${I('down', { s: 15 })}<span class="ell">${x.name}</span>${x.stage && html`<span class="tagx">${title(x.stage)}</span>`}<span class="mut">${size(x.size)}</span></button>`;

  return html`<${Shell} me=${me} page="task" wide>
    <a class="pt-back" href=${href(me.role === 'admin' && task.owner !== me.id ? '/admin' : '/tasks')}>← ${L('返回', 'Back')}</a>
    <${Head} title=${task.title} sub=${L('提交于 ', 'Submitted ') + when(task.created_at)}><${Badge} s=${task.status} /><//>
    ${trouble && html`<${Note} bad=${troubleBad}>${trouble} ${task.owner === me.id && html`<a href=${href('/agents')}>${L('打开 Agent 登录页', 'Open Agent logins')}</a>`}<//>`}

    <section class="pt-card">
      <div class=${'pt-steps' + (stopped ? ' stopped' : '')}>
        ${STEPS.map((s, i) => html`<div class=${'st' + (!stopped && i < step ? ' past' : '') + (!stopped && i === step ? ' now' : '')}><i>${!stopped && (i < step || task.status === 'done') ? I('check', { s: 12, w: 2.6 }) : i + 1}</i><span>${sName(s)}</span></div>`)}
      </div>
      ${task.status === 'pending' && html`<p class="pt-say">${L('等待管理员审核。', 'Waiting for an administrator to review it.')}</p>`}
      ${task.status === 'queued' && html`<p class="pt-say">${L('已批准，排队等待执行。', 'Approved, waiting in the queue.')}</p>`}
      ${task.status === 'running' && html`<p class="pt-say">${L('正在执行', 'Running')}${running.length ? L('：', ': ') + running.map(title).join(L('、', ', ')) : ''}${L(`，已完成 ${doneCount}/${task.stages.length} 个阶段`, `, ${doneCount} of ${task.stages.length} stages finished`)}</p>`}
      ${task.status === 'done' && html`<p class="pt-say">${L('任务已完成，产出见下方。', 'The task is finished; its results are below.')}</p>`}
      ${stopped && html`<${Note} bad><b>${sName(task.status)}</b>${task.admin_note ? L('：', ': ') + task.admin_note : ''}<//>`}
      ${!stopped && task.admin_note && html`<${Note}>${task.admin_note}<//>`}
    </section>

    <section class="pt-card">
      <div class="pt-sec"><h2>${L('阶段进度', 'Stage progress')}</h2></div>
      ${!task.commission && html`<p class="pt-fine left">${L('开始执行时会按目标重新安排阶段。', 'The stages are set from your objective when work starts.')}</p>`}
      <${Flow} stages=${stages} picked=${task.stages} stateOf=${stateOf} />
    </section>

    ${results.length > 0 && html`<section class="pt-card glow">
      <div class="pt-sec"><h2>${L('产出', 'Results')}</h2></div>
      <div class="pt-files">${results.map(FileRow)}</div>
    </section>`}

    <div class="pt-two">
      <section class="pt-card">
        <div class="pt-sec"><h2>${L('任务说明', 'The task')}</h2></div>
        <div class="pt-kv"><span class="k">${L('任务描述', 'Description')}</span><p>${task.description}</p></div>
        <div class="pt-kv"><span class="k">${L('任务目标', 'Objective')}</span><p>${task.objective}</p></div>
        ${task.data_note && html`<div class="pt-kv"><span class="k">${L('大数据的位置', 'Where large data lives')}</span><p>${task.data_note}</p></div>`}
        <div class="pt-kv"><span class="k">${L('你允许系统做的', 'What you allowed')}</span>
          <ul class="pt-allowed">${ALLOW.map(([k, label]) => html`<li class=${task.constraints?.[k] ? 'yes' : 'no'}>${task.constraints?.[k] ? '✓' : '✕'} ${L(...label)}</li>`)}</ul></div>
        <div class="pt-kv"><span class="k">${L('附件', 'Attachments')}</span>
          ${inputs.length ? html`<div class="pt-files">${inputs.map(FileRow)}</div>` : html`<p class="mut">${L('无', 'None')}</p>`}</div>
        ${failed.length > 0 && html`<${Note} bad>${L('以下附件上传失败：', 'These files failed to upload: ')}${failed.join('；')}<//>`}
        ${task.status === 'pending' && task.owner === me.id && html`<div class="pt-kv"><span class="k">${L('补传附件（审核前可补）', 'Add files (until it is reviewed)')}</span>
          <${Files} files=${more} setFiles=${setMore} />
          ${more.length > 0 && html`<button class="pt-btn pri" disabled=${!!busy} onClick=${addFiles}>${busy || L('上传', 'Upload')}</button>`}</div>`}
      </section>
      <section class="pt-card">
        <div class="pt-sec"><h2>${L('进度记录', 'Activity')}</h2></div>
        <div class="pt-log">
          <div><span class="num mut">${when(task.created_at)}</span><span>${L('已提交', 'Submitted')}</span></div>
          ${events.map((e) => html`<div><span class="num mut">${when(e.at)}</span><span>${line(e)}${e.kind !== 'note' && e.kind !== 'status' && e.message ? ' · ' + e.message : ''}</span></div>`)}
        </div>
      </section>
    </div>
  <//>`;
}

// ---------------------------------------------------------------- admin
const newCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', b = crypto.getRandomValues(new Uint8Array(16)); return [...b].map((x, i) => (i && i % 4 === 0 ? '-' : '') + A[x % A.length]).join(''); };
function Admin({ me, q }) {
  const tab = q.tab || 'tasks';
  const d = useLoad(() => Promise.all([
    api.rows('tasks?select=id,title,status,stages,current_stage,created_at,owner,who:profiles(full_name,email)&order=created_at.desc'),
    api.rows('invites?select=*,user:profiles!invites_used_by_fkey(full_name,email)&order=created_at.desc'),
    api.rows('profiles?select=*&order=created_at'),
    api.stages(),
    api.rows('agent_tokens?select=owner,vendor,label,hint,status,updated_at&order=created_at').catch(() => []),
    // the other site's tasks and members, as copied by the sync job (summaries only)
    api.rows(`remote_tasks?origin=eq.${OTHER}&select=id,origin,owner_email,title,status,stages,current_stage,created_at&order=created_at.desc`).catch(() => []),
    api.rows(`remote_profiles?origin=eq.${OTHER}&select=*&order=created_at`).catch(() => []),
    api.rows(`remote_decisions?origin=eq.${OTHER}&applied_at=is.null&select=task_id,decision`).catch(() => []),
  ]), [], 20000);
  const [note, setNote] = useState('');
  const [mail, setMail] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { document.title = L('管理 · AI Scientist', 'Admin · AI Scientist'); }, [LANG]);
  if (me.role !== 'admin') return html`<${Shell} me=${me}><${Note} bad>${L('需要管理员权限', 'Administrators only')}<//><//>`;
  const [mine, invites, here, stages, logins, remote, others, sent] = d.data || [[], [], [], [], [], [], [], []];
  const sentFor = (id) => sent.find((x) => x.task_id === id);
  const nameOf_ = (email) => (others.find((p) => p.email === email) || {}).full_name || email;
  const tasks = [...mine.map((t) => ({ ...t, origin: SITE })),
    ...remote.map((t) => ({ ...t, who: { full_name: nameOf_(t.owner_email) } }))].sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  const people = [...here.map((p) => ({ ...p, origin: SITE })), ...others];
  const countOf = (p) => (p.origin === SITE ? mine.filter((t) => t.owner === p.id) : remote.filter((t) => t.owner_email === p.email)).length;
  const loginsOf = (id) => logins.filter((x) => x.owner === id);
  const Logins = ({ p }) => { const ls = loginsOf(p.id); return ls.length
    ? html`<span class="pt-logins">${ls.map((x) => html`<span class="pt-login sm" title=${L('提供于 ', 'Given ') + when(x.updated_at)}><b>${x.vendor === 'claude' ? 'Claude' : 'Codex'}</b>${x.label && html`<span>${x.label}</span>`}<span class="mono">${x.hint}</span><${LoginBadge} s=${x.status} /></span>`)}</span>`
    : html`<span class=${p.token_required ? 'pt-badge fail' : 'mut'}>${p.token_required ? L('未提供登录', 'No login') : L('老用户，免提供', 'Early member, exempt')}</span>`; };
  const title = (id) => { const s = stages.find((x) => x.id === id); return s ? sl(s, 'title') : id; };
  const act = (p) => p.then(() => { setErr(''); d.reload(); }, (e) => setErr(problem(e)));
  const decide = (t, status) => {
    let admin_note = '';
    if (status === 'rejected') { admin_note = prompt(L('退回原因（学生可见）', 'Reason, shown to the member')); if (admin_note == null) return; }
    const now = new Date().toISOString();
    act(api.update('tasks', `id=eq.${t.id}`, status === 'queued' ? { status, approved_at: now } : { status, admin_note, finished_at: now })
      .then(() => api.insert('task_events', { task_id: t.id, kind: 'status', message: status })));
  };
  const pending = tasks.filter((t) => t.status === 'pending' && !sentFor(t.id)).length;
  // a task of the other site: the decision is recorded here and applied there by the sync job
  const decideThere = (t, decision) => {
    let admin_note = '';
    if (decision === 'rejected') { admin_note = prompt(L('退回原因（学生可见）', 'Reason, shown to the member')); if (admin_note == null) return; }
    act(api.insert('remote_decisions', { task_id: t.id, origin: t.origin, decision, admin_note }));
  };
  const link = (code) => location.origin + href('/login?invite=' + encodeURIComponent(code));
  return html`<${Shell} me=${me} page="admin" wide>
    <${Head} title=${L('管理', 'Admin')} />
    <div class="pt-tabs line">
      <a class=${tab === 'tasks' ? 'on' : ''} href=${href('/admin')}>${L('任务', 'Tasks')}${pending > 0 && html`<em>${pending}</em>`}</a>
      <a class=${tab === 'invites' ? 'on' : ''} href=${href('/admin?tab=invites')}>${L('邀请码', 'Invites')}</a>
      <a class=${tab === 'people' ? 'on' : ''} href=${href('/admin?tab=people')}>${L('用户', 'Members')}<em class="q">${people.length}</em></a>
    </div>
    ${(err || d.error) && html`<${Note} bad>${err || d.error}<//>`}
    ${d.loading && html`<div class="pt-wait">${L('载入中', 'Loading')}</div>`}

    ${tab === 'tasks' && !d.loading && html`<div class="pt-list">${tasks.length ? tasks.map((t) => t.origin !== SITE ? html`<div class="pt-row">
        <a class="main" href=${href('/task?remote=' + t.id)}><b class="ell">${t.title}</b>
          <span class="mut">${t.who.full_name}${t.stages.length ? ' · ' + t.stages.map(title).join(' · ') : ''}</span></a>
        ${t.status === 'running' && t.current_stage && html`<span class="now">${title(t.current_stage)}</span>`}
        <${Where} site=${t.origin} />
        <${Badge} s=${t.status} />
        <span class="mut num hide-s">${when(t.created_at)}</span>
        ${t.status === 'pending' && (sentFor(t.id)
          ? html`<span class="mut">${sentFor(t.id).decision === 'queued' ? L('已批准，一分钟内生效', 'Approved, applies within a minute') : L('已退回，一分钟内生效', 'Returned, applies within a minute')}</span>`
          : html`<button class="pt-btn pri sm" onClick=${() => decideThere(t, 'queued')}>${L('批准', 'Approve')}</button>
            <button class="pt-btn sm" onClick=${() => decideThere(t, 'rejected')}>${L('退回', 'Return')}</button>`)}
      </div>` : html`<div class="pt-row">
        <a class="main" href=${href('/task?id=' + t.id)}><b class="ell">${t.title}</b>
          <span class="mut">${t.who?.full_name || t.who?.email || '—'} · ${['claude', 'codex'].map((v) => { const ls = loginsOf(t.owner).filter((x) => x.vendor === v); if (!ls.length) return ''; const ok = ls.filter((x) => x.status === 'ok').length;
            return (v === 'claude' ? 'Claude' : 'Codex') + (ls.length > 1 ? '×' + ls.length : '') + (ok ? '' : ls.some((x) => x.status === 'unchecked') ? L('（验证中）', ' (checking)') : L('（不能用）', ' (broken)')); }).filter(Boolean).join(' / ') || L('无 Agent 登录', 'no agent login')}${t.stages.length ? ' · ' + t.stages.map(title).join(' · ') : ''}</span></a>
        ${t.status === 'running' && t.current_stage && html`<span class="now">${title(t.current_stage)}</span>`}
        <${Where} site=${t.origin} />
        <${Badge} s=${t.status} />
        <span class="mut num hide-s">${when(t.created_at)}</span>
        ${t.status === 'pending' && html`<button class="pt-btn pri sm" onClick=${() => decide(t, 'queued')}>${L('批准', 'Approve')}</button>
          <button class="pt-btn sm" onClick=${() => decide(t, 'rejected')}>${L('退回', 'Return')}</button>`}
      </div>`) : html`<div class="pt-empty"><p>${L('还没有任务', 'No tasks yet')}</p></div>`}</div>`}

    ${tab === 'invites' && !d.loading && html`
      <form class="pt-inline" onSubmit=${(e) => { e.preventDefault(); act(api.insert('invites', { code: newCode(), email: mail.trim().toLowerCase(), note: note.trim(), created_by: me.id }).then(() => { setNote(''); setMail(''); })); }}>
        <input required type="email" placeholder=${L('对方的邮箱，注册时须一致', 'Their e-mail, which must match at sign-up')} maxlength="120" value=${mail} onInput=${(e) => setMail(e.target.value)} />
        <input placeholder=${L('备注：发给谁', 'Note: who it is for')} maxlength="80" value=${note} onInput=${(e) => setNote(e.target.value)} />
        <button class="pt-btn pri">${I('plus', { s: 15 })}${L('生成邀请码', 'New invite')}</button>
      </form>
      <div class="pt-list">${invites.map((v) => html`<div class="pt-row">
        <div class="main"><b class="mono">${v.code}</b><span class="mut">${v.email || L('未绑定邮箱', 'not tied to an e-mail')}${v.note ? ' · ' + v.note : ''}${v.role === 'admin' ? ' · admin' : ''}</span></div>
        ${v.used_by ? html`<span class="mut">${L('已使用：', 'Used by ')}${v.user?.full_name || v.user?.email || ''}</span>`
          : html`<button class="pt-btn sm" onClick=${(e) => { const b = e.currentTarget; navigator.clipboard.writeText(link(v.code)).then(() => { b.textContent = L('已复制', 'Copied'); }); }}>${L('复制注册链接', 'Copy sign-up link')}</button>
            <button class="pt-btn sm" onClick=${() => confirm(L('作废这个邀请码？', 'Revoke this invite?')) && act(api.remove('invites', `code=eq.${encodeURIComponent(v.code)}&used_by=is.null`))}>${L('作废', 'Revoke')}</button>`}
      </div>`)}</div>`}

    ${tab === 'people' && !d.loading && html`<div class="pt-list">${people.map((p) => html`<div class="pt-row">
        <div class="main"><b>${p.full_name || '—'}</b><span class="mut">${p.email}</span></div>
        ${p.origin === SITE && html`<${Logins} p=${p} />`}
        <${Where} site=${p.origin} />
        <span class="mut">${countOf(p)} ${L('个任务', 'tasks')}</span>
        <span class=${'pt-badge ' + (p.role === 'admin' ? 'run' : '')}>${p.role === 'admin' ? L('管理员', 'Admin') : L('成员', 'Member')}</span>
        <span class="mut num hide-s">${when(p.created_at)}</span>
      </div>`)}</div>`}
  <//>`;
}

// ---------------------------------------------------------------- agent logins
// A member's tasks run on the member's own Claude Code / Codex subscription. The login is kept
// encrypted; pages show only a masked hint, its state and when it was given, to the member and admins.
const LOGIN_STATE = { unchecked: ['正在验证', 'Checking', 'run'], ok: ['可用', 'Working', 'pass'], failed: ['不能用', 'Not working', 'fail'] };
// What a task page says when the submitter's logins keep it from running; null when nothing is wrong.
function loginTrouble(logins, required, mine) {
  if (!logins.length) return required ? L(mine ? '你还没有提供 Agent 登录，任务无法开始。' : '提交人还没有提供 Agent 登录，任务无法开始。', mine ? 'You have not given an agent login, so the task cannot start.' : 'The submitter has not given an agent login, so the task cannot start.') : null;
  if (logins.some((x) => x.status === 'ok')) return null;
  if (logins.some((x) => x.status === 'unchecked')) return L('正在验证 Agent 登录，一般一两分钟。', 'Checking the agent login, usually a minute or two.');
  return L(mine ? '你提供的 Agent 登录都不能用了（无效或已过期），任务暂停。请到 Agent 登录页按步骤重新提供，提供后任务会自动继续。' : '提交人的 Agent 登录都不能用了，任务暂停，等对方重新提供。',
    mine ? 'None of your agent logins work (invalid or expired), so the task is paused. Give one again on the Agent logins page and the task carries on by itself.' : 'None of the submitter\'s agent logins work; the task is paused until they give one again.');
}
const LoginBadge = ({ s }) => html`<span class=${'pt-badge ' + (LOGIN_STATE[s]?.[2] || '')}><i></i>${L(...(LOGIN_STATE[s] || [s, s]).slice(0, 2))}</span>`;
// Step-by-step, per operating system; the Codex command puts the login on the clipboard itself.
const OSES = [['mac', 'macOS'], ['win', 'Windows'], ['linux', 'Linux']];
const myOs = () => (/Win/i.test(navigator.platform) ? 'win' : /Mac|iPhone|iPad/i.test(navigator.platform) ? 'mac' : 'linux');
const TERMINAL = {
  mac: ['按 Command + 空格，输入“终端”后回车，打开终端。', 'Press Command + Space, type Terminal and press Return.'],
  win: ['在开始菜单搜索 PowerShell 并打开。', 'Search for PowerShell in the Start menu and open it.'],
  linux: ['打开一个终端。', 'Open a terminal.'],
};
const CODEX_CMD = {
  mac: 'export CODEX_HOME="$(mktemp -d)"; codex login && pbcopy < "$CODEX_HOME/auth.json" && echo "Copied. Go back to the web page and click Paste."',
  win: '$env:CODEX_HOME = (New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("codex-ais-" + [guid]::NewGuid()))).FullName; codex login; Get-Content -Raw "$env:CODEX_HOME\\auth.json" | Set-Clipboard; Write-Host "Copied. Go back to the web page and click Paste."',
  linux: 'export CODEX_HOME="$(mktemp -d)"; codex login && cat "$CODEX_HOME/auth.json"',
};
function Cmd({ text }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); });
  return html`<div class="pt-cmdrow"><pre class="pt-cmd">${text}</pre><button type="button" class="pt-btn sm" onClick=${copy}>${done ? L('已复制', 'Copied') : L('复制命令', 'Copy')}</button></div>`;
}
const VENDORS = [
  { id: 'claude', name: 'Claude Code', place: 'sk-ant-oat01-…',
    need: () => L('需要 Claude Pro 或 Max 订阅，电脑上装好 Claude Code（claude 命令）。', 'Needs a Claude Pro or Max subscription and Claude Code (the claude command) on your computer.'),
    steps: (os, signup) => [
      L(...TERMINAL[os]),
      html`${L('复制下面的命令，粘贴到终端里，按回车。', 'Copy this command, paste it into the terminal and press Return.')}<${Cmd} text="claude setup-token" />`,
      L('浏览器会打开 Claude 的授权页，登录并点同意。', 'A browser page opens: sign in to Claude and approve.'),
      L('回到终端，最后会出现一长串以 sk-ant-oat01- 开头的字符。选中这一整串，复制。', 'Back in the terminal, the last thing shown is a long string starting with sk-ant-oat01-. Select all of it and copy.'),
      signup ? L('回到这个页面，点下面的“粘贴”，填好其余各项后点“注册”。', 'Come back here, click Paste below, fill in the rest and click Register.') : L('回到这个页面，点下面的“粘贴”，再点“保存”。', 'Come back here, click Paste below, then Save.'),
    ] },
  { id: 'codex', name: 'Codex', place: '{ "tokens": { … } }', file: true,
    need: () => L('需要 ChatGPT Plus 或 Pro 订阅，电脑上装好 Codex（codex 命令）。这是单独的一次登录，不影响你平时用的 Codex。', 'Needs a ChatGPT Plus or Pro subscription and Codex (the codex command). This is a separate login; your usual Codex is not affected.'),
    steps: (os, signup) => [
      L(...TERMINAL[os]),
      html`${L('复制下面的命令，粘贴到终端里，按回车。', 'Copy this command, paste it into the terminal and press Return.')}<${Cmd} text=${CODEX_CMD[os]} />`,
      L('浏览器会打开 ChatGPT 的登录页，登录并点同意。', 'A browser page opens: sign in to ChatGPT and approve.'),
      os === 'linux'
        ? L('回到终端，会显示一段以 { 开头、以 } 结尾的内容。从 { 到 } 全部选中，复制。', 'Back in the terminal, a block from { to } is shown. Select all of it, from { to }, and copy.')
        : L('终端出现 Copied 字样，说明登录内容已经复制好了，不用再选什么。', 'When the terminal says Copied, the login is already on your clipboard; nothing to select.'),
      signup ? L('回到这个页面，点下面的“粘贴”，填好其余各项后点“注册”。', 'Come back here, click Paste below, fill in the rest and click Register.') : L('回到这个页面，点下面的“粘贴”，再点“保存”。', 'Come back here, click Paste below, then Save.'),
    ] },
];

// The same checks the database makes in set_agent_token, so a mistake shows before anything is saved.
function loginProblem(vendor, text) {
  const t = text.trim();
  if (vendor === 'claude') return /^sk-ant-oat01-[A-Za-z0-9_-]{20,}$/.test(t) && t.length <= 500 ? ''
    : L('这不是 Claude Code 令牌：应该是一整串以 sk-ant-oat01- 开头的字符。', 'This is not a Claude Code token: it should be one string starting with sk-ant-oat01-.');
  try { if (JSON.parse(t)?.tokens?.refresh_token) return ''; } catch {}
  return L('这不是完整的 Codex 登录内容：请按步骤重新运行命令，再点“粘贴”。', 'This is not a complete Codex login: run the command again as described, then click Paste.');
}

function LoginSteps({ v, val, setVal, onErr, signup }) {
  const [os, setOs] = useState(myOs);
  const paste = () => navigator.clipboard.readText().then((t) => setVal(t.trim()), () => onErr(L('浏览器不允许读剪贴板，请点下面的输入框按 Command+V 粘贴，Windows 按 Ctrl+V。', 'The browser blocked clipboard access; click the box below and press Command+V, or Ctrl+V on Windows.')));
  return html`<p>${v.need()}</p>
    <div class="pt-tabs os">${OSES.map(([k, n]) => html`<button type="button" class=${os === k ? 'on' : ''} onClick=${() => setOs(k)}>${n}</button>`)}</div>
    <ol class="pt-steps-list">${v.steps(os, signup).map((x) => html`<li>${x}</li>`)}</ol>
    <textarea required rows=${v.file ? 6 : 2} spellcheck="false" autocomplete="off" placeholder=${v.place} value=${val} onInput=${(e) => setVal(e.target.value)}></textarea>
    <div class="pt-actions"><button type="button" class="pt-btn sm" onClick=${paste}>${L('粘贴', 'Paste')}</button></div>`;
}

const MAX_LOGINS = 5;
function Agents({ me, setup, onDone }) {
  const d = useLoad(() => api.rows(`agent_tokens?owner=eq.${me.id}&select=id,vendor,label,hint,status,note,created_at,updated_at,checked_at&order=created_at`), [me.id], 10000);
  const [open, setOpen] = useState(null);          // { vendor, id } being given (id null: a new one)
  const [val, setVal] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { document.title = L('Agent 登录 · AI Scientist', 'Agent logins · AI Scientist'); }, [LANG]);
  const have = d.data || [];
  const begin = (vendor, t) => { setOpen(open && open.vendor === vendor && open.id === (t?.id || null) ? null : { vendor, id: t?.id || null }); setVal(''); setName(t?.label || ''); setErr(''); };
  async function save(e) {
    e.preventDefault();
    const bad = loginProblem(open.vendor, val);
    if (bad) { setErr(bad); return; }
    setBusy(true); setErr('');
    try { await api.rpc('set_agent_token', { vendor: open.vendor, secret: val, login: open.id, label: name }); setVal(''); setOpen(null); d.reload(); onDone?.(); }
    catch (e2) { setErr(/already saved/.test(problem(e2)) ? L('这个登录已经添加过了。要加另一个订阅，请先用那个账号登录再生成。', 'This login is already saved. For another subscription, sign in with that account first, then make the login.') : problem(e2)); }
    finally { setBusy(false); }
  }
  const drop = (v, t) => confirm(L(`删除${v.name}登录「${t.label || t.hint}」？之后你的任务不能再用它运行。`, `Remove the ${v.name} login "${t.label || t.hint}"? Your tasks can no longer run on it.`))
    && api.rpc('delete_agent_token', { login: t.id }).then(d.reload, (e) => setErr(problem(e)));
  const rename = (t) => { const x = prompt(L('给这个登录起个名字，方便区分（最多 40 字）', 'A name for this login, to tell it apart (up to 40 characters)'), t.label || ''); if (x != null) api.rpc('rename_agent_token', { login: t.id, label: x }).then(d.reload, (e) => setErr(problem(e))); };
  const form = (v) => html`<form class="pt-give" onSubmit=${save}>
    <${Field} label=${L('名字（可不填）', 'Name (optional)')} hint=${L('比如：实验室 Max 号、我的 Plus。只有你和管理员看得到。', 'For example: lab Max plan, my Plus. Only you and the administrators see it.')}>
      <input maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} /><//>
    <${LoginSteps} v=${v} val=${val} setVal=${setVal} onErr=${setErr} />
    <div class="pt-actions"><button type="button" class="pt-btn sm" onClick=${() => setOpen(null)}>${L('取消', 'Cancel')}</button>
      <button class="pt-btn pri" disabled=${busy || !val.trim()}>${busy ? L('正在保存', 'Saving') : L('保存', 'Save')}</button></div>
  </form>`;
  return html`<${Shell} me=${me} page="agents">
    <${Head} title=${L('Agent 登录', 'Agent logins')} sub=${L('你的任务用你自己的 Claude Code 或 Codex 订阅运行。至少提供一个；有多个订阅可以都加上，每种最多 5 个，一个额度用完时任务自动换下一个。', 'Your tasks run on your own Claude Code or Codex subscriptions. Give at least one; if you have several subscriptions, add them all, up to 5 of each, and tasks move to the next when one runs out.')} />
    ${setup && html`<${Note}>${L('提交任务前，请先提供一个 Agent 登录。', 'Before you submit a task, give one agent login.')}<//>`}
    ${!setup && !me.token_required && html`<p class="pt-fine left">${L('你的账号注册得早，不提供也能照常提交；提供以后，你的任务就用你自己的订阅运行。', 'Your account predates this requirement, so you can submit without a login; once you give one, your tasks run on your own subscription.')}</p>`}
    ${(err || d.error) && html`<${Note} bad>${err || d.error}<//>`}
    ${d.loading ? html`<div class="pt-wait">${L('载入中', 'Loading')}</div>` : VENDORS.map((v) => {
      const mine = have.filter((x) => x.vendor === v.id);
      const adding = open && open.vendor === v.id && !open.id;
      return html`<section class="pt-card">
        <div class="pt-sec"><h2>${v.name}${mine.length > 0 && html` <em class="q">${mine.length}</em>`}</h2>
          <div class="pt-quick">${mine.length < MAX_LOGINS && html`<button type="button" class=${'pt-btn sm' + (mine.length ? '' : ' pri')} onClick=${() => begin(v.id, null)}>${mine.length ? L('再加一个', 'Add another') : L('提供', 'Give')}</button>`}</div></div>
        ${!mine.length && !adding && html`<p class="mut">${L('还没有提供', 'Not given yet')}</p>`}
        ${mine.map((t) => html`<div class="pt-loginrow">
          <div class="pt-login info">${t.label && html`<b>${t.label}</b>`}<span class="mono">${t.hint}</span><${LoginBadge} s=${t.status} />
            <span class="mut num">${L('提供于 ', 'Given ') + when(t.updated_at)}${t.checked_at ? L('，最近使用 ', ', last used ') + when(t.checked_at) : ''}</span>
            </div>
          <div class="pt-loginact"><button type="button" class="pt-ghost" onClick=${() => rename(t)}>${L('改名', 'Rename')}</button>
            <button type="button" class="pt-ghost" onClick=${() => begin(v.id, t)}>${L('更换', 'Replace')}</button>
            <button type="button" class="pt-ghost" onClick=${() => drop(v, t)}>${L('删除', 'Remove')}</button></div>
          ${t.status === 'unchecked' && html`<p class="pt-fine left">${L('保存后系统会用它做一次很小的真实调用，确认能用，通常一两分钟内出结果，本页自动刷新。', 'After saving, the system makes one tiny real call with it to confirm it works. The result usually comes within a minute or two; this page refreshes by itself.')}</p>`}
          ${t.status === 'failed' ? html`<${Note} bad>${t.note || L('这个登录不能用。', 'This login does not work.')}${L('点“更换”，按步骤重新提供。', ' Click Replace and follow the steps again.')}<//>`
            : t.note && html`<p class="pt-fine left">${t.note}</p>`}
          ${open && open.id === t.id && form(v)}
        </div>`)}
        ${adding && form(v)}
        ${mine.length > 0 && v.id === 'codex' && html`<p class="pt-fine left">${L('加另一个 ChatGPT 账号时，先在浏览器里退出当前的 ChatGPT，再运行命令，用另一个账号登录。', 'To add another ChatGPT account, sign out of ChatGPT in the browser first, then run the command and sign in with the other account.')}</p>`}
        ${mine.length > 0 && v.id === 'claude' && html`<p class="pt-fine left">${L('加另一个 Claude 账号时，先在浏览器里退出当前的 Claude，再运行命令，用另一个账号授权。', 'To add another Claude account, sign out of Claude in the browser first, then run the command and approve with the other account.')}</p>`}
      </section>`;
    })}
    <${Note}>${L('任务和你平时使用共用同一份订阅额度：任务跑得多时，你自己在手机或电脑上用 Claude、Codex 可能更早碰到额度上限；反过来你用得多，任务也会暂停等待额度恢复。这里提供的是单独的一份登录，不会让你其他设备上的 Claude、Codex 掉线。', 'Tasks and your own use share one subscription quota: when tasks run a lot, you may reach your limit sooner on your phone or computer, and when you use a lot, tasks wait for the quota to come back. The login given here is a separate one; it does not sign out Claude or Codex on your other devices.')}<//>
    <p class="pt-fine left">${L('登录加密保存。页面上只显示开头和结尾几位：你和管理员能看到你提供了哪些登录，看不到完整内容。系统只用它们运行你本人提交的任务；额度都用完时任务暂停，等额度恢复后继续，不会换用别人的账号。你可以随时在这里删除，或在 Claude、ChatGPT 的账户设置里注销这次登录。', 'Logins are stored encrypted. Pages show only the first and last few characters: you and the administrators can see which logins you gave, never the whole of them. They are used only for tasks you submit; when all run out the task waits for them to come back and never moves to someone else\'s account. Remove them here at any time, or sign these logins out in your Claude or ChatGPT account settings.')}</p>
  <//>`;
}

// ---------------------------------------------------------------- terms, once, for accounts made before them
function Terms({ me, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const accept = () => { setBusy(true); api.rpc('accept_terms', {}).then(() => { api.forgetProfile(); onDone(); }, (e) => { setErr(problem(e)); setBusy(false); }); };
  return html`<${Shell} me=${me} page="terms">
    <div class="pt-auth"><div class="pt-card">
      <h2 class="pt-terms-h">${L('使用协议', 'Terms of use')}</h2>
      <p class="pt-terms">${TERMS()}</p>
      ${err && html`<${Note} bad>${err}<//>`}
      <button class="pt-btn pri" disabled=${busy} onClick=${accept}>${L('同意并继续', 'Accept and continue')}</button>
      <button class="pt-btn" style="margin-top:8px" onClick=${() => api.signOut().then(() => go('/'))}>${L('不同意，退出', 'Decline and sign out')}</button>
    </div></div>
  <//>`;
}

// ---------------------------------------------------------------- app
const PRIVATE = { submit: Submit, tasks: Tasks, task: Task, admin: Admin, agents: Agents };
function App() {
  const { page, q } = useRoute();
  const [, bump] = useState(0);
  const [me, setMe] = useState(undefined);       // undefined: not known yet; null: signed out
  const [logins, setLogins] = useState(undefined); // how many agent logins a new account has given
  useEffect(() => onLang(() => bump((x) => x + 1)), []);
  useEffect(() => {
    const load = () => api.profile().then((p) => setMe(p ? p : api.user() ? { id: api.user().id, email: api.user().email, role: 'member' } : null));
    load();
    return api.onSession(load);
  }, []);
  useEffect(() => {
    if (me?.token_required) api.rows(`agent_tokens?owner=eq.${me.id}&select=vendor`).then((r) => setLogins(r.length), () => setLogins(undefined));
  }, [me?.id, me?.token_required, page]);
  const Page = page === 'task' && q.remote ? RemoteTask : PRIVATE[page];
  useEffect(() => {
    if (Page && me === null) go('/login?next=' + encodeURIComponent(page + location.search), true);
    if (page === 'login' && me) go('/' + (q.next || 'tasks'), true);
  }, [page, me]);
  if (page === '') return html`<${Hero} key=${LANG + (me ? 1 : 0)} />`;
  if (page === 'about') return html`<${About} />`;
  if (page === 'login') return me ? null : html`<${Login} q=${q} />`;
  if (Page && me && me.agreed_at === null) return html`<${Terms} me=${me} onDone=${() => api.profile().then(setMe)} />`;
  if (Page && me?.token_required && logins === 0 && page !== 'agents') return html`<${Agents} me=${me} setup onDone=${() => setLogins(1)} />`;
  if (Page) return me ? html`<${Page} me=${me} q=${q} key=${page + (q.id || q.remote || '')} />` : html`<${Shell} page=${page}><div class="pt-wait">${L('载入中', 'Loading')}</div><//>`;
  return html`<${Shell} me=${me}><div class="pt-empty"><p>${L('没有这个页面', 'Page not found')}</p><a class="pt-btn pri" href=${href('/')}>${L('回首页', 'Home')}</a></div><//>`;
}

document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
render(html`<${App} />`, document.getElementById('app'));
