/* 视觉编码：颜色不是装饰，每一种都对应假设的一种处境 */
(function (global) {
  'use strict';

  const STATUS = {
    untested:             { rgb: [148, 163, 190], glow: 0.30, zh: '未验证',   en: 'untested' },
    active:               { rgb: [ 96, 165, 250], glow: 0.55, zh: '进行中',   en: 'active' },
    testing:              { rgb: [ 56, 189, 248], glow: 1.00, zh: '实验中',   en: 'testing' },
    self_verified:        { rgb: [ 52, 211, 153], glow: 0.85, zh: '已验证',   en: 'verified' },
    pending_review:       { rgb: [251, 191,  36], glow: 0.95, zh: '待裁定',   en: 'pending verdict' },
    closed:               { rgb: [ 94, 104, 128], glow: 0.14, zh: '已关闭',   en: 'closed' },
    refuted:              { rgb: [251, 113, 133], glow: 0.70, zh: '已否决',   en: 'refuted' },
    superseded:           { rgb: [ 94, 104, 128], glow: 0.12, zh: '已取代',   en: 'superseded' },
    inductive_unverified: { rgb: [167, 139, 250], glow: 0.60, zh: '归纳生成', en: 'induced' },
    lit_supported:        { rgb: [244, 114, 182], glow: 0.50, zh: '文献支撑', en: 'lit-supported' },
  };

  const EVIDENCE = { pos: [110, 231, 183], neg: [251, 113, 133] };

  const css = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (a == null ? 1 : a) + ')';
  const hsl = (h, s, l, a) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')';

  function hueRgb(h, s, l) {                       // hsl → rgb 0..255，给 WebGL 用
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  // 预渲染一张柔光精灵，之后所有辉光都是 drawImage + 叠加混合
  function sprite(rgb, size, core) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, css(rgb, 1));
    grd.addColorStop(core || 0.16, css(rgb, 0.85));
    grd.addColorStop(0.42, css(rgb, 0.22));
    grd.addColorStop(1, css(rgb, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  global.Palette = { STATUS, EVIDENCE, css, hsl, hueRgb, sprite };
})(window);
