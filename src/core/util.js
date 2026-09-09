/* ==========================================================================
 * BEADY · 通用工具
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = {
    /** 夹取；非数字一律返回下界，避免 NaN 蔓延到 canvas API */
    clamp: function (v, lo, hi) {
      if (typeof v !== 'number' || Number.isNaN(v)) return lo;
      return v < lo ? lo : (v > hi ? hi : v);
    },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    now: function () { return (global.performance && performance.now) ? performance.now() : Date.now(); },
    uid: function (p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

    debounce: function (fn, ms) {
      let t = null;
      return function () {
        const args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms);
      };
    },

    el: function (id) { return document.getElementById(id); },

    /** 创建元素的语法糖 */
    make: function (tag, cls, html) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      return n;
    },

    /* ---------- 颜色 ---------- */

    /** '#RRGGBB' -> [r,g,b] */
    rgb: function (hex) {
      const h = hex.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    },

    /**
     * 明暗调整：amount > 0 变亮，< 0 变暗（-1 ~ 1）
     */
    shade: function (hex, amount) {
      const c = Util.rgb(hex);
      const t = amount > 0 ? 255 : 0;
      const p = Math.abs(amount);
      const out = c.map(function (v) { return Math.round(Util.lerp(v, t, p)); });
      return Util.toHex(out);
    },

    toHex: function (c) {
      return '#' + c.map(function (v) {
        return Util.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
      }).join('');
    },

    rgba: function (hex, a) {
      const c = Util.rgb(hex);
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    },

    /* ---------- 其它 ---------- */

    /** 触发浏览器下载 */
    downloadBlob: function (blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    },

    /** 格式化日期 YYYY-MM-DD HH:mm */
    formatDate: function (ts) {
      const d = new Date(ts);
      const p = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    },

    /** 相对时间（刚刚 / N 分钟前 / N 小时前 / 日期） */
    relTime: function (ts) {
      const diff = Date.now() - ts;
      if (diff < 60e3) return '刚刚';
      if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
      if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
      if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
      return Util.formatDate(ts).slice(0, 10);
    },

    /** Grid(Int16Array) -> 紧凑字符串（每格一个字符，便于 localStorage） */
    encodeGrid: function (grid) {
      let s = '';
      for (let i = 0; i < grid.length; i++) s += String.fromCharCode(48 + (grid[i] + 1));
      return s;
    },

    /** encodeGrid 的逆运算 */
    decodeGrid: function (str, len) {
      const g = new Int16Array(len).fill(-1);
      if (!str) return g;
      const n = Math.min(str.length, len);
      for (let i = 0; i < n; i++) g[i] = str.charCodeAt(i) - 49;
      return g;
    },

    isTouch: function () {
      return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }
  };

  global.BeadyUtil = Util;
})(window);
