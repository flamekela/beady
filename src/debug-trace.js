/* ==========================================================================
 * BEADY · 临时调试追踪（仅 ?debug=1 或 window.__BEADY_DEBUG 时启用）
 * --------------------------------------------------------------------------
 * 目的：在【真实 OS 鼠标】路径下，把每次点击的完整链路记录下来，定位
 *       「第一次点击究竟在哪一步失效」。
 *
 * 记录链路：
 *   pointerdown(时间, pointerId, button, buttons)
 *     -> cellAt 得到的 idx
 *     -> grid[idx] before -> setCell 后 grid[idx]
 *     -> requestRender 是否被 _raf 早退挡掉
 *     -> _paintNow 是否真的 render、render 是否抛异常、本帧画了哪些格
 *     -> canvas 上该格像素是否已有豆（与点击前基线比较）
 *   pointerup -> grid[idx] after
 *
 * 默认关闭：不影响正常体验；仅暴露 window.__beadyTrace / window.__beadyDebug。
 * ========================================================================== */
(function (global) {
  'use strict';

  let enabled = false;
  try {
    const q = new URLSearchParams(global.location.search);
    enabled = q.get('debug') === '1' || q.get('debug') === 'true' || q.get('debug') === '';
  } catch (e) { enabled = false; }
  if (global.__BEADY_DEBUG) enabled = true;

  const MAX = 600;

  const Trace = {
    enabled: enabled,
    entries: [],
    frame: null,
    el: null,
    body: null,

    _now: function () {
      return (global.performance && performance.now) ? Math.round(performance.now() * 10) / 10 : Date.now();
    },

    log: function (o) {
      if (!enabled) return;
      const e = Object.assign({ t: Trace._now() }, o);
      Trace.entries.push(e);
      if (Trace.entries.length > MAX) Trace.entries.shift();
      global.__beadyTrace = Trace.entries;
      Trace._line(e);
    },

    /* ---------- 帧内「本帧到底画了哪些格」 ---------- */
    frameStart: function (seq) { if (enabled) Trace.frame = { seq: seq, drew: [] }; },
    drew: function (i) { if (enabled && Trace.frame) Trace.frame.drew.push(i); },

    /* ---------- 像素取样：canvas 上某格中心是否已有豆 ---------- */
    sampleCell: function (idx) {
      try {
        const b = global.BeadyApp && global.BeadyApp.board;
        if (!b) return null;
        const cv = b.canvas;
        const col = idx % b.size, row = (idx / b.size) | 0;
        const x = Math.round((b.ox + (col + 0.5) * b.cell) * b.dpr);
        const y = Math.round((b.oy + (row + 0.5) * b.cell) * b.dpr);
        const d = cv.getContext('2d').getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      } catch (e) { return null; }
    },

    pixelDiff: function (a, b) {
      if (!a || !b) return null;
      return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);
    },

    /* ---------- 覆盖层 ---------- */
    _ensureDom: function () {
      if (Trace.el || !global.document || !global.document.body) return;
      const d = global.document.createElement('div');
      d.id = 'beady-debug';
      d.style.cssText = [
        'position:fixed', 'right:8px', 'top:8px', 'z-index:2147483647',
        'max-width:520px', 'max-height:88vh', 'overflow:auto',
        'background:rgba(18,16,14,.90)', 'color:#9CFFB0',
        'font:11px/1.45 ui-monospace,Consolas,monospace',
        'padding:8px 10px', 'border-radius:8px', 'white-space:pre-wrap',
        'pointer-events:none', 'box-shadow:0 8px 30px rgba(0,0,0,.4)'
      ].join(';');
      d.textContent = '[beady debug] waiting...\n';
      global.document.body.appendChild(d);
      Trace.el = d;
      Trace.body = d;
    },

    _fmt: function (e) {
      const parts = [];
      if (e.ev) parts.push('#' + (e.n != null ? e.n + ' ' : '') + e.ev);
      Object.keys(e).forEach(function (k) {
        if (k === 'ev' || k === 't' || k === 'n') return;
        parts.push(k + '=' + (typeof e[k] === 'object' ? JSON.stringify(e[k]) : e[k]));
      });
      return parts.join(' ');
    },

    _line: function (e) {
      Trace._ensureDom();
      if (!Trace.el) return;
      const div = global.document.createElement('div');
      div.textContent = '[' + e.t.toFixed(0) + '] ' + Trace._fmt(e);
      if (e.ev === 'render' && e.threw) div.style.color = '#FF6B6B';
      if (e.ev === 'pointerdown') div.style.color = '#FFD866';
      if (e.ev === 'paintNow') div.style.color = '#7BD1FF';
      Trace.el.appendChild(div);
      while (Trace.el.childNodes.length > 120) Trace.el.removeChild(Trace.el.firstChild);
      Trace.el.scrollTop = Trace.el.scrollHeight;
    }
  };

  global.__beadyTrace = Trace.entries;

  /* 供复现台使用：给出某格中心在页面 client 坐标系下的位置 */
  global.__beadyDebug = {
    cellClient: function (idx) {
      const b = global.BeadyApp && global.BeadyApp.board;
      if (!b) return null;
      const r = b.canvas.getBoundingClientRect();
      const col = idx % b.size, row = (idx / b.size) | 0;
      return { cx: r.left + b.ox + (col + 0.5) * b.cell, cy: r.top + b.oy + (row + 0.5) * b.cell };
    },
    state: function () {
      const b = global.BeadyApp && global.BeadyApp.board;
      if (!b) return null;
      return { size: b.size, cell: b.cell, ox: b.ox, oy: b.oy, dpr: b.dpr, raf: b._raf,
               layerKey: b._layerKey, interactive: b.interactive, tool: b.tool, anims: b.anims.size };
    }
  };

  global.BeadyTrace = Trace;
  if (enabled) {
    if (global.document && global.document.body) Trace._ensureDom();
    else if (global.document) global.document.addEventListener('DOMContentLoaded', Trace._ensureDom);
    console.log('[BEADY] debug trace ON');
  }
})(window);
