/* ==========================================================================
 * BEADY · 导出 / 缩略图渲染
 * --------------------------------------------------------------------------
 * 导出 PNG 只包含「拼豆作品 + 干净背景」，不含任何网页 UI。
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = global.BeadyUtil;
  const Palette = global.BeadyPalette;
  const Sprites = global.BeadySprites;

  /** 画一幅静默(dom-less)的作品到 ctx 上 */
  function paint(ctx, grid, size, cell, pad, kind) {
    for (let i = 0; i < grid.length; i++) {
      const c = grid[i];
      if (c === Palette.EMPTY) continue;
      const col = i % size, row = (i / size) | 0;
      Sprites.draw(ctx, c, kind || 'fused', pad + col * cell, pad + row * cell, cell);
    }
  }

  /** 生成整幅作品的剪影（用于投影） */
  function silhouette(size, cell, pad, grid) {
    const W = size * cell + pad * 2;
    const H = W;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === Palette.EMPTY) continue;
      const col = i % size, row = (i / size) | 0;
      const inset = cell * 0.035;
      Sprites.roundRect(ctx, pad + col * cell + inset, pad + row * cell + inset,
        cell - inset * 2, cell - inset * 2, cell * 0.26);
      ctx.fill();
    }
    return cv;
  }

  const Export = {
    /**
     * 渲染为独立 canvas
     * @param {Int16Array} grid
     * @param {number} size
     * @param {object} opts {cell, bg:'cream'|'none', padding, shadow, kind}
     */
    render: function (grid, size, opts) {
      opts = opts || {};
      const cell = opts.cell || Util.clamp(Math.floor(1500 / size), 14, 56);
      const pad = Math.round(cell * (opts.padding == null ? 0.55 : opts.padding));
      const W = Math.round(size * cell + pad * 2);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = W;
      const ctx = cv.getContext('2d');

      if (opts.bg !== 'none') {
        const g = ctx.createRadialGradient(W * 0.42, W * 0.34, W * 0.05, W * 0.5, W * 0.5, W * 0.78);
        g.addColorStop(0, '#FFFDF7');
        g.addColorStop(0.62, '#FAF4E8');
        g.addColorStop(1, '#F1E9D8');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, W);
      }

      if (opts.shadow !== false) {
        const sil = silhouette(size, cell, pad, grid);
        const off = Math.round(cell * 0.34);
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = W;
        const tctx = tmp.getContext('2d');
        tctx.shadowColor = 'rgba(92,70,42,0.34)';
        tctx.shadowBlur = cell * 0.85;
        tctx.shadowOffsetY = W + off;
        tctx.drawImage(sil, 0, -W);
        ctx.drawImage(tmp, 0, 0);
      }

      paint(ctx, grid, size, cell, pad, opts.kind || 'fused');
      return cv;
    },

    /** 生成 dataURL 缩略图（-square px 逻辑尺寸，内部 2x 高清） */
    thumb: function (grid, size, px, kind) {
      const dpr = 2;
      const W = Math.round(px * dpr);
      const cell = Math.floor(W / size) || 1;
      const inner = cell * size;
      const cv = document.createElement('canvas');
      cv.width = inner; cv.height = inner;
      const ctx = cv.getContext('2d');
      paint(ctx, grid, size, cell, 0, kind || 'fused');
      return cv.toDataURL('image/png');
    },

    /** 把一幅 grid 画进已有 canvas 元素（按 CSS 尺寸自适应） */
    intoCanvas: function (canvas, grid, size, opts) {
      opts = opts || {};
      const dpr = Math.min(global.devicePixelRatio || 1, 3);
      const cssW = canvas.clientWidth || canvas.width || 120;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssW * dpr);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cell = Math.floor(canvas.width / size) || 1;
      const inner = cell * size;
      const ox = Math.round((canvas.width - inner) / 2);
      const oy = Math.round((canvas.height - inner) / 2);
      paint(ctx, grid, size, cell, 0, opts.kind || 'fused');
      if (ox || oy) {
        // 居中修正
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width; tmp.height = canvas.height;
        tmp.getContext('2d').drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tmp, ox, oy);
      }
      return canvas;
    },

    /** 下载 PNG */
    download: function (grid, size, filename, opts) {
      const self = this;
      const cv = Export.render(grid, size, opts);
      return new Promise(function (resolve) {
        if (cv.toBlob) {
          cv.toBlob(function (blob) {
            Util.downloadBlob(blob, filename);
            resolve(true);
          }, 'image/png');
        } else {
          Util.downloadBlob(Util.dataURLToBlob(cv.toDataURL('image/png')), filename);
          resolve(true);
        }
      });
    }
  };

  global.BeadyExport = Export;
})(window);
