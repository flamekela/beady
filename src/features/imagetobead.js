/* ==========================================================================
 * BEADY · 图片转拼豆（100% 浏览器本地处理，绝不上传）
 * --------------------------------------------------------------------------
 * 流程：裁切成正方 -> 降采样至 N×N -> 逐格平均色 -> 映射到最近拼豆色。
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = global.BeadyUtil;
  const Palette = global.BeadyPalette;
  const Export = global.BeadyExport;

  const Img2Bead = {
    /**
     * @param {HTMLImageElement|HTMLCanvasElement} src
     * @param {number} size  16/24/32/48
     * @param {object} opts {ignoreBg:boolean, contrast:number(0~1)}
     * @returns {{grid:Int16Array, size:number, canvas:HTMLCanvasElement}}
     */
    quantize: function (src, size, opts) {
      opts = opts || {};
      const sw = src.naturalWidth || src.width;
      const sh = src.naturalHeight || src.height;

      // 1) 居中裁切成正方形
      const side = Math.min(sw, sh);
      const sx = (sw - side) / 2, sy = (sh - side) / 2;

      // 2) 降采样（先缩到 2 倍目标再平均，减少锯齿）
      const twice = size * 2;
      const tmp = document.createElement('canvas');
      tmp.width = twice; tmp.height = twice;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(src, sx, sy, side, side, 0, 0, twice, twice);

      const tdata = tctx.getImageData(0, 0, twice, twice).data;

      // 3) 逐格 2x2 平均 -> 最近色
      const grid = new Int16Array(size * size).fill(Palette.EMPTY);
      const contrast = opts.contrast || 0;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const px = x * 2 + dx, py = y * 2 + dy;
              const i = (py * twice + px) * 4;
              const aa = tdata[i + 3] / 255;
              r += tdata[i] * aa; g += tdata[i + 1] * aa; b += tdata[i + 2] * aa;
              a += tdata[i + 3]; n++;
            }
          }
          const n4 = Math.max(1, n);
          const alphaAvg = a / n4;            // 0~255
          if (alphaAvg < 90) continue;        // 透明 -> 空格

          const inv = 255 / alphaAvg;         // 反预乘
          let R = Util.clamp(r / n4 * inv, 0, 255);
          let G = Util.clamp(g / n4 * inv, 0, 255);
          let B = Util.clamp(b / n4 * inv, 0, 255);

          // 轻微提对比，让像素化后的色块更明确
          if (contrast > 0) {
            const k = 1 + contrast;
            R = Util.clamp((R - 128) * k + 128, 0, 255);
            G = Util.clamp((G - 128) * k + 128, 0, 255);
            B = Util.clamp((B - 128) * k + 128, 0, 255);
          }

          const luma = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (opts.ignoreBg && luma > 0.88 && sat < 0.25) continue;   // 浅背景 -> 空格

          grid[y * size + x] = Palette.nearest(R, G, B);
        }
      }

      const canvas = document.createElement('canvas');
      Export.intoCanvasRaw ? Export.intoCanvasRaw(canvas, grid, size) : null;
      return { grid: grid, size: size, counts: Img2Bead.countColors(grid) };
    },

    countColors: function (grid) {
      const s = new Set();
      for (let i = 0; i < grid.length; i++) if (grid[i] !== Palette.EMPTY) s.add(grid[i]);
      return s.size;
    },

    /** 预览：把量化结果画成一张 N×N 的色块图（用于比例较小的预览框） */
    previewFlat: function (grid, size, px) {
      const cell = Math.max(1, Math.floor(px / size));
      const inner = cell * size;
      const cv = document.createElement('canvas');
      cv.width = inner; cv.height = inner;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#F7F1E3';
      ctx.fillRect(0, 0, inner, inner);
      for (let i = 0; i < grid.length; i++) {
        const c = grid[i];
        if (c === Palette.EMPTY) continue;
        ctx.fillStyle = Palette.hex(c);
        ctx.fillRect((i % size) * cell, ((i / size) | 0) * cell, cell, cell);
      }
      return cv;
    },

    /** 读取文件 -> HTMLImageElement */
    loadFile: function (file) {
      return new Promise(function (resolve, reject) {
        if (!/^image\//.test(file.type)) { reject(new Error('请选择 JPG / PNG 图片')); return; }
        const fr = new FileReader();
        fr.onload = function () {
          const img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject(new Error('图片解析失败')); };
          img.src = fr.result;
        };
        fr.onerror = function () { reject(new Error('读取文件失败')); };
        fr.readAsDataURL(file);
      });
    }
  };

  global.BeadyImg2Bead = Img2Bead;
})(window);
