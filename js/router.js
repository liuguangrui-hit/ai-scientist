// Addresses are written from the site root ("/submit"); the site may be served under a
// base path, which every link and history entry carries.
import { useState, useEffect } from './core.js';

export const BASE = document.querySelector('meta[name="ais-snapshot"]')?.content || '/';
export const href = (p) => BASE + String(p).replace(/^\//, '');
const subs = new Set();
export function go(to, replace = false) {
  const u = new URL(href(to), location.origin);
  if (u.pathname + u.search === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', u);
  subs.forEach((f) => f());
  scrollTo(0, 0);
}
addEventListener('popstate', () => subs.forEach((f) => f()));
addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const raw = a.getAttribute('href');
  if (raw[0] === '#') { e.preventDefault(); document.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const u = new URL(a.href);
  if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
  // on the lab server the backend shares this address: its paths (file downloads) are not pages
  if (a.hasAttribute('download') || /^\/(auth|rest|storage|realtime)\/v1\//.test(u.pathname)) return;
  e.preventDefault();
  go(u.pathname.slice(BASE.length) + u.search);
});
export function useRoute() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  const page = (location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname).replace(/^\/|\/$/g, '');
  return { page, q: Object.fromEntries(new URLSearchParams(location.search)) };
}
