/* ==========================================================================
 * BEADY · 图标（自绘 SVG 描边图标，无外部图标库、无版权风险）
 * 用法：HTML 里写 <span class="ico-back"></span>，init 时自动注入 svg。
 * ========================================================================== */
(function (global) {
  'use strict';

  const P = {
    back: '<path d="M14.5 5 8 12l6.5 7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a5.5 5.5 0 0 1 0 11H8"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9h-9a5.5 5.5 0 0 0 0 11h5"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9L17.5 7"/>',
    eye: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
    iron: '<path d="M3.5 14h17v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M6.5 14V9.5A2.5 2.5 0 0 1 9 7h4.5a2.5 2.5 0 0 1 2.5 2.5V14"/><path d="M9.5 10h1.5"/>',
    save: '<path d="M12 3.5v11"/><path d="M8 10.5l4 4 4-4"/><path d="M4.5 16.5v3.5h15v-3.5"/>',
    sound: '<path d="M4.5 9.5h3L12 5.5v13l-4.5-4h-3z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18 6.8a8 8 0 0 1 0 10.4"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M4.4 12H1.8M22.2 12h-2.6M6.6 6.6 4.8 4.8M19.2 19.2l-1.8-1.8M17.4 6.6l1.8-1.8M4.8 19.2l1.8-1.8"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    minus: '<path d="M5.5 12h13"/>',
    pen: '<path d="M4.6 19.4l1.1-4.2L16.2 4.7l3.1 3.1L8.8 18.3z"/><path d="M14.6 6.3l3.1 3.1"/>',
    eraser: '<path d="M8.5 20.5h11"/><path d="M16 4.8l4.2 4.2-8.4 8.4H7.6l-2.8-2.8z"/>',
    drop: '<path d="M12 3.2c3 4.6 5 7.4 5 9.8a5 5 0 0 1-10 0c0-2.4 2-5.2 5-9.8z"/>',
    hand: '<path d="M12 3.5v17M3.5 12h17"/><path d="M8.5 7.5 12 4l3.5 3.5M8.5 16.5 12 20l3.5-3.5M7.5 8.5 4 12l3.5 3.5M16.5 8.5 20 12l-3.5 3.5"/>',
    download: '<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M4.5 19.5h15"/>',
    free: '<circle cx="12" cy="12" r="8.2"/><circle cx="9.3" cy="9.3" r="1.3"/><circle cx="14.7" cy="9.3" r="1.3"/><circle cx="9.3" cy="14.7" r="1.3"/><circle cx="14.7" cy="14.7" r="1.3"/>',
    tpl: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/>',
    img: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="8.6" cy="9.6" r="1.7"/><path d="M4.5 17l5-5 3.6 3.6 3.2-2.8 3.7 3.2"/>',
    gal: '<rect x="3" y="6.5" width="13" height="13" rx="3"/><path d="M7.5 3.5h9.2A3.8 3.8 0 0 1 20.5 7.3v8.4"/>'
  };

  const Icons = {
    paths: P,

    /** 生成一个 svg 字符串 */
    svg: function (key, size) {
      const body = P[key];
      if (!body) return '';
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
    },

    /** 把页面里所有 class 为 ico-* 的容器注入图标 */
    apply: function (root) {
      const nodes = (root || document).querySelectorAll('[class*="ico-"]');
      Array.prototype.forEach.call(nodes, function (el) {
        if (el.dataset.iconDone) return;
        const cls = Array.prototype.find.call(el.classList, function (c) { return c.indexOf('ico-') === 0; });
        if (!cls) return;
        const svg = Icons.svg(cls.slice(4));
        if (!svg) return;
        el.innerHTML = svg;
        el.dataset.iconDone = '1';
      });
    }
  };

  global.BeadyIcons = Icons;
})(window);
