// Minimal Markdown → HTML for the repo's own documents (headings, lists, tables,
// quotes, code, emphasis, links). Relative links resolve against the file they
// appear in and open inside the workbench file viewer.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function resolve(from, href) {
  if (!from) return href;
  const parts = from.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
function link(href, from) {
  if (/^(https?:|mailto:)/i.test(href)) return { href, ext: true };
  if (href.startsWith('#')) return { href };
  const [p, hash] = href.split('#');
  const path = resolve(from, decodeURIComponent(p));
  if (path.startsWith('..')) return { href: '#' };
  return { href: '/file?path=' + encodeURIComponent(path) + (hash ? '#' + hash : '') };
}
function inline(s, from) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, h) => {
    const l = link(h, from);
    const src = l.ext ? h : '/api/raw?path=' + encodeURIComponent(resolve(from, h));
    return `<img alt="${alt}" src="${esc(src)}">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, h) => {
    const l = link(h.replace(/&amp;/g, '&'), from);
    return `<a href="${esc(l.href)}"${l.ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
  });
  s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<)）]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/〔补〕/g, '<span class="tag">补</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());

export function md(src, from) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), from)}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flush(); const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      flush();
      const id = h[2].replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase();
      out.push(`<h${h[1].length} id="${esc(id)}">${inline(h[2], from)}</h${h[1].length}>`); i++; continue;
    }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      flush();
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="table-scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c, from)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, from)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      flush();
      // nested lists by indentation
      const stack = [];
      while (i < lines.length && (/^\s*([-*]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && stack.length))) {
        const m = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) { out.push(' ' + inline(lines[i].trim(), from)); i++; continue; }
        const ind = m[1].length, tag = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length && ind < stack.at(-1).ind) out.push(`</li></${stack.pop().tag}>`);
        if (!stack.length || ind > stack.at(-1).ind) { out.push(`<${tag}><li>`); stack.push({ ind, tag }); }
        else out.push('</li><li>');
        out.push(inline(m[3], from)); i++;
      }
      while (stack.length) out.push(`</li></${stack.pop().tag}>`);
      continue;
    }
    if (/^>\s?/.test(l)) {
      flush(); const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'), from)}</blockquote>`); continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }
    if (!l.trim()) { flush(); i++; continue; }
    para.push(l.trim()); i++;
  }
  flush();
  return out.join('\n');
}
