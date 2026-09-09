/* ==========================================================================
 * BEADY · 拼豆精灵 renderer
 * --------------------------------------------------------------------------
 * 目标：一眼看出是「真实的圆柱形小拼豆」，而不是像素方块。
 * 做法：每颗豆 = 接触阴影 + 径向渐变球面明暗 + 外缘暗边 + 底部反射光 +
 *       中心孔（孔壁暗部 + 孔下缘高光）+ 左上椭圆镜面高光。
 * 熨烫融合态 ironed：圆角方形、几乎铺满格子，孔缩小变浅 -> 呈现连片融合感。
 *
 * 性能：按 (颜色, 形态, 格边长) 缓存离屏 canvas，主循环只做 drawImage。
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = global.BeadyUtil;
  const Palette = global.BeadyPalette;
  const TAU = Math.PI * 2;

  const cache = new Map();
  let cacheGen = 0;

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ------------------------- 形态一：原始拼豆 ------------------------- */
  function drawBead(ctx, S, hex) {
    const cx = S / 2, cy = S / 2;
    const r = S * 0.435;
    const light = Util.shade(hex, 0.55);
    const mid = Util.shade(hex, -0.10);
    const dark = Util.shade(hex, -0.30);
    const darker = Util.shade(hex, -0.48);

    // 1) 落在板面上的接触阴影
    ctx.beginPath();
    ctx.ellipse(cx + S * 0.018, cy + S * 0.052, r * 1.0, r * 0.94, 0, 0, TAU);
    const sh = ctx.createRadialGradient(cx, cy + S * 0.05, r * 0.45, cx, cy + S * 0.05, r * 1.2);
    sh.addColorStop(0, 'rgba(72,54,34,0.30)');
    sh.addColorStop(0.65, 'rgba(72,54,34,0.12)');
    sh.addColorStop(1, 'rgba(72,54,34,0)');
    ctx.fillStyle = sh;
    ctx.fill();

    // 2) 珠子本体：球面渐变
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    const g = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.38, r * 0.10, cx, cy, r * 1.08);
    g.addColorStop(0, light);
    g.addColorStop(0.34, hex);
    g.addColorStop(0.74, mid);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fill();

    // 3) 外缘暗边（勾出个体边界）
    ctx.lineWidth = Math.max(1, S * 0.028);
    ctx.strokeStyle = Util.rgba(darker, 0.42);
    ctx.stroke();

    // 4) 右下侧内壁反射光
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.90, 0.12 * Math.PI, 0.92 * Math.PI);
    ctx.lineWidth = Math.max(1, S * 0.05);
    ctx.strokeStyle = Util.rgba(light, 0.30);
    ctx.stroke();
    ctx.restore();

    // 5) 中心孔
    const hr = r * 0.365;
    ctx.beginPath();
    ctx.arc(cx, cy, hr, 0, TAU);
    const hg = ctx.createRadialGradient(cx, cy - hr * 0.3, hr * 0.08, cx, cy, hr * 1.08);
    hg.addColorStop(0, Util.shade(hex, -0.66));
    hg.addColorStop(0.62, Util.shade(hex, -0.48));
    hg.addColorStop(1, Util.shade(hex, -0.26));
    ctx.fillStyle = hg;
    ctx.fill();

    // 5a) 孔壁上方暗影（体现孔径有深度）
    ctx.beginPath();
    ctx.arc(cx, cy, hr * 0.82, 1.12 * Math.PI, 1.88 * Math.PI);
    ctx.lineWidth = Math.max(1, hr * 0.42);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.stroke();

    // 5b) 孔下缘透光
    ctx.beginPath();
    ctx.arc(cx, cy, hr * 0.80, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.lineWidth = Math.max(1, hr * 0.30);
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.stroke();

    // 6) 左上镜面高光
    const sx = cx - r * 0.40, sy = cy - r * 0.44;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 0.40, r * 0.27, -0.55, 0, TAU);
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.40);
    sg.addColorStop(0, 'rgba(255,255,255,0.66)');
    sg.addColorStop(0.55, 'rgba(255,255,255,0.20)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fill();
  }

  /* ---------------------- 形态二：熨烫融合后的豆 ---------------------- */
  function drawFused(ctx, S, hex) {
    const pad = S * 0.035;
    const w = S - pad * 2;
    const rad = w * 0.26;
    const light = Util.shade(hex, 0.42);
    const mid = Util.shade(hex, -0.13);
    const darker = Util.shade(hex, -0.45);

    // 底部投影（整体压扁后贴板）
    ctx.beginPath();
    roundRect(ctx, pad + S * 0.02, pad + S * 0.035, w, w, rad);
    ctx.fillStyle = 'rgba(72,54,34,0.16)';
    ctx.fill();

    // 本体
    roundRect(ctx, pad, pad, w, w, rad);
    const g = ctx.createLinearGradient(pad, pad, pad + w * 0.35, pad + w);
    g.addColorStop(0, light);
    g.addColorStop(0.42, hex);
    g.addColorStop(1, mid);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.strokeStyle = Util.rgba(darker, 0.30);
    ctx.stroke();

    // 上缘柔光
    ctx.save();
    roundRect(ctx, pad, pad, w, w, rad);
    ctx.clip();
    ctx.beginPath();
    roundRect(ctx, pad + S * 0.06, pad + S * 0.05, w - S * 0.12, w * 0.55, rad * 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = Math.max(1, S * 0.035);
    ctx.stroke();
    ctx.restore();

    // 缩小的孔（熨烫后孔被压小）
    const cx = S / 2, cy = S / 2;
    const hr = w * 0.115;
    ctx.beginPath();
    ctx.arc(cx, cy, hr, 0, TAU);
    const hg = ctx.createRadialGradient(cx, cy - hr * 0.3, hr * 0.1, cx, cy, hr * 1.1);
    hg.addColorStop(0, Util.shade(hex, -0.58));
    hg.addColorStop(0.7, Util.shade(hex, -0.40));
    hg.addColorStop(1, Util.shade(hex, -0.20));
    ctx.fillStyle = hg;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, hr * 0.85, 1.10 * Math.PI, 1.9 * Math.PI);
    ctx.lineWidth = Math.max(1, hr * 0.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke();

    // 大面积柔和的光泽（塑料感）
    const sx = pad + w * 0.22, sy = pad + w * 0.20;
    ctx.beginPath();
    ctx.ellipse(sx, sy, w * 0.30, w * 0.20, -0.5, 0, TAU);
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.30);
    sg.addColorStop(0, 'rgba(255,255,255,0.42)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fill();
  }

  /* ----------------------------- 缓存层 ----------------------------- */

  /**
   * 取得某种颜色的拼豆精灵。
   * @param {number} colorIndex 调色板索引
   * @param {'bead'|'fused'} kind
   * @param {number} cellDev   格子边长（设备像素）
   */
  function get(colorIndex, kind, cellDev) {
    const S = Math.max(8, Math.round(cellDev / 2) * 2);
    const key = colorIndex + '|' + kind + '|' + S;
    let cv = cache.get(key);
    if (cv) return cv;

    const color = Palette.get(colorIndex);
    const hex = color ? color.hex : '#CCCCCC';
    cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');
    if (kind === 'fused') drawFused(ctx, S, hex);
    else drawBead(ctx, S, hex);

    if (cache.size > 700) { cache.clear(); cacheGen++; }
    cache.set(key, cv);
    return cv;
  }

  const Sprites = {
    TAU: TAU,
    roundRect: roundRect,
    get: get,
    generation: function () { return cacheGen; },
    clear: function () { cache.clear(); },

    /**
     * 把一颗豆画到任意 target ctx。
     * x,y 为格子左上角，cell 为目标尺寸（设备像素）
     */
    draw: function (ctx, colorIndex, kind, x, y, cell) {
      const sp = get(colorIndex, kind, cell);
      ctx.drawImage(sp, x, y, cell, cell);
    },

    /** 供 UI 色卡 / 缩略图使用：在给定 canvas 上画一颗豆 */
    chip: function (canvas, colorIndex, kind) {
      const dpr = Math.min(global.devicePixelRatio || 1, 3);
      const size = canvas.clientWidth || canvas.width;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sp = get(colorIndex, kind || 'bead', size * dpr);
      ctx.drawImage(sp, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
  };

  global.BeadySprites = Sprites;
})(window);
