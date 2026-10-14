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
  '使用 AI Scientist 即表示同意：你提交的任务、附件，以及系统为你产生的研究成果，将纳入系统共享库，可被系统与其他任务借鉴和使用。是否允许修改你的想法、改写你的论文、新做实验，由你在每次提交时选择。',
  'Using AI Scientist means you agree that the tasks and attachments you submit, and the research results the system produces for you, join the shared library, where the system and other tasks may learn from and use them. Whether your idea may be changed, your paper rewritten or new experiments run is your choice on each submission.');

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
        <a class=${page === 'tasks' || page === 'task' ? 'on' : ''} href=${href('/tasks')}>${L('我的任务', 'My tasks')}</a>`}
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
      const st = await api.rpc('invite_status', { invite_code: f.invite.trim(), for_email: f.email.trim() });
      if (st === 'other_email') throw new Error(L('这个邀请码是发给另一个邮箱的，请用收到邀请的邮箱注册', 'This invite was issued for another e-mail address; register with the address it was sent to'));
      if (st !== 'ok') throw new Error(L('邀请码无效或已被使用', 'This invite code is invalid or already used'));
      const r = await api.signUp({ ...f, email: f.email.trim(), fullName: f.fullName.trim(), invite: f.invite.trim() });
      if (r.signedIn) return done();
      setMode('in');
      setMsg({ text: L('注册成功。请先点击邮件中的确认链接，再回到这里登录。', 'Registered. Confirm the link in the e-mail we sent, then sign in here.') });
    } catch (err) {
      const m = problem(err);
      setMsg({ bad: true, text: /invalid login/i.test(m) ? L('邮箱或密码不正确', 'Wrong e-mail or password') + (SITE === 'cloud' ? L('。如果你的账号是在校内注册的，它不能在校外站登录，见下方说明。', '. If you registered on campus, that account does not work on this site; see the note below.') : '') : /already registered/i.test(m) ? L('这个邮箱已注册，请直接登录', 'This e-mail is already registered, sign in instead') : m });
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
          ${msg && html`<${Note} bad=${msg.bad}>${msg.text}<//>`}
          <button class="pt-btn pri" disabled=${busy}>${busy ? L('请稍候', 'One moment') : mode === 'in' ? L('登录', 'Sign in') : L('注册', 'Register')}</button>
        </form>
      </div>
      <p class="pt-fine">${L('本系统为邀请制，邀请码由管理员发放。', 'Access is by invitation. Invite codes come from the administrator.')}</p>
      ${SITE === 'cloud' && html`<div class="pt-where">
        <b>${L('你现在在校外站', 'You are on the off-campus site')}</b>
        <p>${L('校内站和校外站的账号是分开的，在校内注册的账号不能在这里登录，校内提交的任务也不在这里显示。', 'The campus site and this one keep separate accounts: an account registered on campus cannot sign in here, and tasks submitted there are not shown here.')}</p>
        <p>${L('要用校内账号：连接 NTU VPN 后打开', 'To use your campus account: connect to the NTU VPN, then open the')} <a href=${LAB_URL} target="_blank" rel="noopener">${L('校内站', 'campus site')}</a>${L('。', '.')}</p>
        <p>${L('经常在校外使用：向管理员要一个校外站邀请码，在这里另注册一次，可以用同一个邮箱。', 'If you often work off campus: ask the administrator for an off-campus invite and register here as well; the same e-mail is fine.')}</p>
      </div>`}
      ${SITE === 'lab' && html`<p class="pt-fine">${L('这里是校内站，只能在校园网或 NTU VPN 内访问。校外站的账号与这里分开。', 'This is the campus site, reachable only on the campus network or the NTU VPN. Off-campus accounts are separate.')}</p>`}
    </div>
  <//>`;
}

// ---------------------------------------------------------------- the flow chart
// Submitting: click a stage to include it. Following a task: each stage shows where it stands.
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
      ${I('plus', { s: 18 })}<span>${L(`点击选择或拖入文件，单个不超过 ${api.MAX_MB} MB`, `Click or drop files here, up to ${api.MAX_MB} MB each`)}</span>
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
  ['allow_idea_change', ['允许修改我的想法和核心主张', 'You may change my idea and core claims'], ['不勾选时，你的想法原样保留，系统只在其基础上工作并给出建议', 'Unticked: your idea is kept as it is; the system builds on it and only suggests changes']],
  ['allow_text_rewrite', ['允许改写我已有的论文文本', 'You may rewrite my existing paper text'], ['不勾选时，只在必须修改处改动，或只给修改意见', 'Unticked: only necessary edits, or comments only']],
  ['allow_new_experiments', ['允许新做实验（会使用 GPU 服务器）', 'You may run new experiments (uses GPU servers)'], ['不勾选时，只使用你已有的结果和数据', 'Unticked: only your existing results and data are used']],
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
    } catch (e2) { setErr(problem(e2)); setBusy(''); return; }
    const failed = await upload(task.id, files, (i, n) => setBusy(L(`正在上传附件 ${i}/${n}`, `Uploading file ${i} of ${n}`)));
    if (failed.length) { try { sessionStorage.setItem('aisp.failed.' + task.id, JSON.stringify(failed)); } catch {} }
    go('/task?id=' + task.id);
  }
  return html`<${Shell} me=${me} page="submit" wide>
    <${Head} title=${L('提交任务', 'Submit a task')} sub=${L('写清楚你想得到什么。系统会按你的目标和已有材料规划要做的步骤，管理员审核通过后开始。', 'Say what you want back. The system plans the steps from your objective and what you already have; work starts once an administrator approves it.')} />
    ${stages.error && html`<${Note} bad>${stages.error}<//>`}
    <form class="pt-form" onSubmit=${submit}>
      <section class="pt-card">
        <div class="pt-sec"><h2><em>1</em>${L('说明任务', 'Describe the task')}</h2></div>
        <${Field} label=${L('任务名', 'Task name')}><input required maxlength="120" value=${f.title} onInput=${put('title')} /><//>
        <${Field} label=${L('任务目标（最重要）', 'Objective (the most important part)')} hint=${L('希望最终得到什么，怎样算完成。系统以这一栏为第一准则，原文执行，不会改写', 'What you want in the end and what counts as done. The system takes this as its first rule, word for word')}>
          <textarea required rows="4" maxlength="5000" value=${f.objective} onInput=${put('objective')}></textarea><//>
        <${Field} label=${L('任务描述', 'Description')} hint=${L('背景，已经做到哪一步，手上有什么材料', 'Background, how far you have got, what you already have')}>
          <textarea required rows="7" maxlength="20000" value=${f.description} onInput=${put('description')}></textarea><//>
      </section>

      <section class="pt-card">
        <div class="pt-sec"><h2><em>2</em>${L('文件与数据', 'Files and data')}</h2></div>
        <p class="pt-fine left">${L('已有的想法、论文草稿、实验结果、代码、审稿意见都可以附上，系统会从你已有的部分接着做。', 'Attach whatever you already have: idea, draft, results, code, reviews. The system continues from there.')}</p>
        <${Files} files=${files} setFiles=${setFiles} />
        <${Field} label=${L('大数据的位置', 'Where large data lives')} hint=${L(`超过 ${api.MAX_MB} MB 的数据不上传，填服务器路径或下载链接`, `Data over ${api.MAX_MB} MB is not uploaded; give a server path or a link`)}>
          <textarea rows="2" maxlength="2000" value=${f.data_note} onInput=${put('data_note')}></textarea><//>
      </section>

      <section class="pt-card">
        <div class="pt-sec"><h2><em>3</em>${L('你允许系统做什么', 'What the system may do')}</h2></div>
        <p class="pt-fine left">${L('按使用协议，本任务的研究成果会纳入系统共享库。', 'Under the terms of use, the research results of this task join the shared library.')}</p>
        <div class="pt-allow">${ALLOW.map(([k, label, hint]) => html`<label class=${'pt-check' + (allow[k] ? ' on' : '')}>
          <input type="checkbox" checked=${!!allow[k]} onChange=${(e) => setAllow({ ...allow, [k]: e.target.checked })} />
          <span><b>${L(...label)}</b><span class="h">${L(...hint)}</span></span></label>`)}</div>
      </section>

      <section class="pt-card">
        <div class="pt-sec"><h2><em>4</em>${L('希望经过的阶段（可选）', 'Stages you have in mind (optional)')}</h2>
          <div class="pt-quick"><button type="button" class="pt-ghost" onClick=${() => setPicked([])}>${L('清空', 'Clear')}</button></div></div>
        <p class="pt-fine left">${L('不确定可以不选。系统会按你的目标自行规划，你的选择只作参考。', 'Leave it empty if unsure. The system plans from your objective; your choice is only a hint.')}</p>
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
    <${Head} title=${L('我的任务', 'My tasks')} sub=${L('校内站与校外站的任务合并显示，几分钟同步一次。', 'Tasks from the campus and off-campus sites together, synced every few minutes.')}>
      <a class="pt-btn pri" href=${href('/submit')}>${I('plus', { s: 15 })}${L('提交任务', 'Submit a task')}</a><//>
    ${d.error && html`<${Note} bad>${d.error}<//>`}
    ${d.loading ? html`<div class="pt-wait">${L('载入中', 'Loading')}</div>` : !tasks.length ? html`<div class="pt-empty">
        <p>${L('还没有任务', 'No tasks yet')}</p><a class="pt-btn pri" href=${href('/submit')}>${L('提交第一个任务', 'Submit your first task')}</a>
        <p class="pt-fine">${L('两个站用同一个邮箱注册后，另一个站的任务也会显示在这里。', 'Once you register on both sites with the same e-mail, tasks from the other site appear here too.')}</p></div>`
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
  const stateOf = (id) => (!task.stages.includes(id) ? null : task.status === 'done' || task.done_stages.includes(id) ? 'done' : task.status === 'running' && task.current_stage === id ? 'run' : 'wait');
  const step = STEPS.indexOf(task.status);
  const stopped = task.status === 'rejected' || task.status === 'failed';
  const there = (task.origin === 'lab' ? LAB_URL : CLOUD_URL) + '/task?id=' + task.id;
  const inputs = files.filter((x) => x.kind === 'input'), results = files.filter((x) => x.kind === 'result');
  const FileRow = (x) => html`<button class="pt-file link" onClick=${() => api.download(x.path, x.name).catch((e) => alert(problem(e)))}>
    ${I('down', { s: 15 })}<span class="ell">${x.name}</span>${x.stage && html`<span class="tagx">${title(x.stage)}</span>`}<span class="mut">${size(x.size)}</span></button>`;
  return html`<${Shell} me=${me} page="task" wide>
    <a class="pt-back" href=${href('/tasks')}>← ${L('返回', 'Back')}</a>
    <${Head} title=${task.title} sub=${L('提交于 ', 'Submitted ') + when(task.created_at) + L('，来自', ', on the ') + nameOf(task.origin)}><${Badge} s=${task.status} /><//>
    <${Note}>${L(`这个任务是在${nameOf(task.origin)}提交的，这里显示的是同步过来的副本，几分钟更新一次。`, `This task was submitted on the ${nameOf(task.origin)}; what you see is a synced copy, refreshed every few minutes.`)}
      ${task.origin === 'lab'
        ? html` ${L('任务说明、附件与产出只保存在校内，请连接 NTU VPN 后', 'Its description, attachments and results stay on campus: connect to the NTU VPN and')} <a href=${there} target="_blank" rel="noopener">${L('到校内站查看', 'open it on the campus site')}</a>${L('。', '.')}`
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
  ]), [q.id], 15000);
  const [more, setMore] = useState([]);
  const [busy, setBusy] = useState('');
  const [failed, setFailed] = useState(() => { try { return JSON.parse(sessionStorage.getItem('aisp.failed.' + q.id)) || []; } catch { return []; } });
  const [task, events, files, stages] = d.data || [null, [], [], []];
  useEffect(() => { if (task) document.title = `${task.title} · AI Scientist`; }, [task?.title]);
  if (d.loading) return html`<${Shell} me=${me} page="task"><div class="pt-wait">${L('载入中', 'Loading')}</div><//>`;
  if (!task) return html`<${Shell} me=${me} page="task"><${Note} bad>${d.error || L('没有这个任务，或你无权查看', 'No such task, or it is not yours to see')}<//><//>`;

  const finished = new Set(events.filter((e) => e.kind === 'stage_finished').map((e) => e.stage));
  const stateOf = (id) => (!task.stages.includes(id) ? null : task.status === 'done' || finished.has(id) ? 'done' : task.status === 'running' && task.current_stage === id ? 'run' : 'wait');
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

    <section class="pt-card">
      <div class=${'pt-steps' + (stopped ? ' stopped' : '')}>
        ${STEPS.map((s, i) => html`<div class=${'st' + (!stopped && i < step ? ' past' : '') + (!stopped && i === step ? ' now' : '')}><i>${!stopped && (i < step || task.status === 'done') ? I('check', { s: 12, w: 2.6 }) : i + 1}</i><span>${sName(s)}</span></div>`)}
      </div>
      ${task.status === 'pending' && html`<p class="pt-say">${L('等待管理员审核。审核通过后进入排队。', 'Waiting for an administrator to review it. Once approved it joins the queue.')}</p>`}
      ${task.status === 'queued' && html`<p class="pt-say">${L('已通过审核，正在排队等待执行。', 'Approved and waiting in the queue.')}</p>`}
      ${task.status === 'running' && html`<p class="pt-say">${L('正在执行', 'Running')}${task.current_stage ? L('：', ': ') + title(task.current_stage) : ''}${L(`，已完成 ${doneCount}/${task.stages.length} 个阶段`, `, ${doneCount} of ${task.stages.length} stages finished`)}</p>`}
      ${task.status === 'done' && html`<p class="pt-say">${L('任务已完成，产出见下方。', 'The task is finished; its results are below.')}</p>`}
      ${stopped && html`<${Note} bad><b>${sName(task.status)}</b>${task.admin_note ? L('：', ': ') + task.admin_note : ''}<//>`}
      ${!stopped && task.admin_note && html`<${Note}>${task.admin_note}<//>`}
    </section>

    <section class="pt-card">
      <div class="pt-sec"><h2>${L('阶段进度', 'Stage progress')}</h2></div>
      ${!task.commission && html`<p class="pt-fine left">${L('开始执行时，系统会按你的目标重新规划阶段，这里会随之更新。', 'When work starts, the system plans the stages from your objective and this chart follows.')}</p>`}
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
  ]), [], 20000);
  const [note, setNote] = useState('');
  const [mail, setMail] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { document.title = L('管理 · AI Scientist', 'Admin · AI Scientist'); }, [LANG]);
  if (me.role !== 'admin') return html`<${Shell} me=${me}><${Note} bad>${L('需要管理员权限', 'Administrators only')}<//><//>`;
  const [tasks, invites, people, stages] = d.data || [[], [], [], []];
  const title = (id) => { const s = stages.find((x) => x.id === id); return s ? sl(s, 'title') : id; };
  const act = (p) => p.then(() => { setErr(''); d.reload(); }, (e) => setErr(problem(e)));
  const decide = (t, status) => {
    let admin_note = '';
    if (status === 'rejected') { admin_note = prompt(L('退回原因（学生可见）', 'Reason, shown to the member')); if (admin_note == null) return; }
    const now = new Date().toISOString();
    act(api.update('tasks', `id=eq.${t.id}`, status === 'queued' ? { status, approved_at: now } : { status, admin_note, finished_at: now })
      .then(() => api.insert('task_events', { task_id: t.id, kind: 'status', message: status })));
  };
  const pending = tasks.filter((t) => t.status === 'pending').length;
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

    ${tab === 'tasks' && !d.loading && html`<div class="pt-list">${tasks.length ? tasks.map((t) => html`<div class="pt-row">
        <a class="main" href=${href('/task?id=' + t.id)}><b class="ell">${t.title}</b>
          <span class="mut">${t.who?.full_name || t.who?.email || '—'} · ${t.stages.map(title).join(' · ')}</span></a>
        <${Badge} s=${t.status} />
        <span class="mut num hide-s">${when(t.created_at)}</span>
        ${t.status === 'pending' && html`<button class="pt-btn pri sm" onClick=${() => decide(t, 'queued')}>${L('批准', 'Approve')}</button>
          <button class="pt-btn sm" onClick=${() => decide(t, 'rejected')}>${L('退回', 'Return')}</button>`}
      </div>`) : html`<div class="pt-empty"><p>${L('还没有任务', 'No tasks yet')}</p></div>`}</div>`}

    ${tab === 'invites' && !d.loading && html`
      <form class="pt-inline" onSubmit=${(e) => { e.preventDefault(); act(api.insert('invites', { code: newCode(), email: mail.trim().toLowerCase(), note: note.trim(), created_by: me.id }).then(() => { setNote(''); setMail(''); })); }}>
        <input required type="email" placeholder=${L('对方的邮箱，只有它能用这个码注册', 'Their e-mail: only this address can use the code')} maxlength="120" value=${mail} onInput=${(e) => setMail(e.target.value)} />
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
        <span class="mut">${tasks.filter((t) => t.owner === p.id).length} ${L('个任务', 'tasks')}</span>
        <span class=${'pt-badge ' + (p.role === 'admin' ? 'run' : '')}>${p.role === 'admin' ? L('管理员', 'Admin') : L('成员', 'Member')}</span>
        <span class="mut num hide-s">${when(p.created_at)}</span>
      </div>`)}</div>`}
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
const PRIVATE = { submit: Submit, tasks: Tasks, task: Task, admin: Admin };
function App() {
  const { page, q } = useRoute();
  const [, bump] = useState(0);
  const [me, setMe] = useState(undefined);       // undefined: not known yet; null: signed out
  useEffect(() => onLang(() => bump((x) => x + 1)), []);
  useEffect(() => {
    const load = () => api.profile().then((p) => setMe(p ? p : api.user() ? { id: api.user().id, email: api.user().email, role: 'member' } : null));
    load();
    return api.onSession(load);
  }, []);
  const Page = page === 'task' && q.remote ? RemoteTask : PRIVATE[page];
  useEffect(() => {
    if (Page && me === null) go('/login?next=' + encodeURIComponent(page + location.search), true);
    if (page === 'login' && me) go('/' + (q.next || 'tasks'), true);
  }, [page, me]);
  if (page === '') return html`<${Hero} key=${LANG + (me ? 1 : 0)} />`;
  if (page === 'about') return html`<${About} />`;
  if (page === 'login') return me ? null : html`<${Login} q=${q} />`;
  if (Page && me && me.agreed_at === null) return html`<${Terms} me=${me} onDone=${() => api.profile().then(setMe)} />`;
  if (Page) return me ? html`<${Page} me=${me} q=${q} key=${page + (q.id || q.remote || '')} />` : html`<${Shell} page=${page}><div class="pt-wait">${L('载入中', 'Loading')}</div><//>`;
  return html`<${Shell} me=${me}><div class="pt-empty"><p>${L('没有这个页面', 'Page not found')}</p><a class="pt-btn pri" href=${href('/')}>${L('回首页', 'Home')}</a></div><//>`;
}

document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
render(html`<${App} />`, document.getElementById('app'));
