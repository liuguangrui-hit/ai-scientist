// The portal's only backend: a Supabase project, reached over its REST endpoints
// (auth, tables, file storage). Who may read or write what is decided by the
// database's row-level rules, not by this file.
const { url: URL_, key: KEY, bucket: BUCKET = 'task-files' } = window.PORTAL_CONFIG;

const STORE = 'aisp.session';
let session = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; } })();
const subs = new Set();
export const onSession = (f) => { subs.add(f); return () => subs.delete(f); };
export const user = () => session?.user || null;
function keep(s) {
  session = s;
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch {}
  profileCache = null;
  subs.forEach((f) => f(s));
}

export class ApiError extends Error {}
async function read(r) {
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) throw new ApiError(body?.msg || body?.message || body?.error_description || body?.error || `HTTP ${r.status}`);
  return body;
}
const auth = (path, body, token) => fetch(`${URL_}/auth/v1/${path}`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body || {}),
}).then(read);

// ---------------------------------------------------------------- account
const withExpiry = (s) => ({ ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) });
export async function signUp({ email, password, fullName, invite }) {
  const s = await auth('signup', { email, password, data: { full_name: fullName, invite_code: invite, agree_terms: 'true' } });
  if (s?.access_token) { keep(withExpiry(s)); return { signedIn: true }; }
  return { signedIn: false };            // the project asks for e-mail confirmation first
}
export async function signIn({ email, password }) {
  keep(withExpiry(await auth('token?grant_type=password', { email, password })));
}
export async function signOut() {
  const t = session?.access_token;
  keep(null);
  if (t) await auth('logout', {}, t).catch(() => {});
}
let refreshing = null;
async function token() {
  if (!session) return null;
  if (session.expires_at - Date.now() / 1000 > 60) return session.access_token;
  refreshing ||= auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    .then((s) => keep(withExpiry(s)), () => keep(null))
    .finally(() => { refreshing = null; });
  await refreshing;
  return session?.access_token || null;
}
const headers = async (extra = {}) => { const t = await token(); return { apikey: KEY, ...(t ? { authorization: 'Bearer ' + t } : {}), ...extra }; };

// ---------------------------------------------------------------- tables
// path is a PostgREST query, e.g. "tasks?select=*&order=created_at.desc"
export async function rows(path) { return read(await fetch(`${URL_}/rest/v1/${path}`, { headers: await headers() })); }
export async function insert(table, row) {
  const r = await read(await fetch(`${URL_}/rest/v1/${table}`, { method: 'POST', headers: await headers({ 'content-type': 'application/json', prefer: 'return=representation' }), body: JSON.stringify(row) }));
  return Array.isArray(r) ? r[0] : r;
}
export async function update(table, filter, patch) {
  return read(await fetch(`${URL_}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: await headers({ 'content-type': 'application/json', prefer: 'return=representation' }), body: JSON.stringify(patch) }));
}
export async function remove(table, filter) { return read(await fetch(`${URL_}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: await headers() })); }
export async function rpc(name, args) {
  return read(await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: await headers({ 'content-type': 'application/json' }), body: JSON.stringify(args || {}) }));
}

let profileCache = null;
export const forgetProfile = () => { profileCache = null; };
export function profile() {
  if (!session) return Promise.resolve(null);
  profileCache ||= rows(`profiles?id=eq.${session.user.id}&select=*`).then((r) => r[0] || null).catch(() => { profileCache = null; return null; });
  return profileCache;
}
let stagesCache = null;
export function stages() {
  stagesCache ||= rows('stages?active=is.true&select=*&order=position').catch((e) => { stagesCache = null; throw e; });
  return stagesCache;
}

// ---------------------------------------------------------------- files
// Stored as <owner>/<task>/input/<n>-<safe name>; the name as chosen is kept in task_files.
const objectPath = (p) => p.split('/').map(encodeURIComponent).join('/');
export const MAX_MB = window.PORTAL_CONFIG.maxFileMB || 50;
export const MAX_FILE = MAX_MB * 1024 * 1024;
export async function attach(taskId, file, n) {
  const safe = file.name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-80) || 'file';
  const path = `${session.user.id}/${taskId}/input/${Date.now().toString(36)}${n}-${safe}`;
  await read(await fetch(`${URL_}/storage/v1/object/${BUCKET}/${objectPath(path)}`, {
    method: 'POST', headers: await headers({ 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'false' }), body: file,
  }));
  return insert('task_files', { task_id: taskId, path, name: file.name.slice(0, 255), size: file.size });
}
// A short-lived address for reading a stored file in the page.
export async function signedUrl(path, expiresIn = 900) {
  const r = await read(await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${objectPath(path)}`, {
    method: 'POST', headers: await headers({ 'content-type': 'application/json' }), body: JSON.stringify({ expiresIn }),
  }));
  return `${URL_}/storage/v1${r.signedURL}`;
}

export async function download(path, name) {
  const r = await read(await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${objectPath(path)}`, {
    method: 'POST', headers: await headers({ 'content-type': 'application/json' }), body: JSON.stringify({ expiresIn: 300 }),
  }));
  const a = document.createElement('a');
  a.href = `${URL_}/storage/v1${r.signedURL}&download=${encodeURIComponent(name || '')}`;
  a.rel = 'noopener';
  a.download = name || '';
  document.body.appendChild(a); a.click(); a.remove();
}
