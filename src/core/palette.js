/* ==========================================================================
 * BEADY · 调色板 (Palette)
 * --------------------------------------------------------------------------
 * 数据驱动。每个拼豆颜色用一个「单字符 id」表示，字符串 rows 即可描述图案。
 * '.' 代表空格（不放豆）。pixelToIndex / charToIndex 供模板与图片转换复用。
 * ========================================================================== */
(function (global) {
  'use strict';

  /**
   * 36 色拼豆调色板。
   * id: 单字符键 | zh/en: 名称 | hex: 基础色 | group: 分组（用于 UI 分区）
   */
  const RAW = [
    // ── 基础色 ──────────────────────────────────────────────────────────
    { id: 'a', zh: '黑',     en: 'Black',      hex: '#22201F', group: 'basic' },
    { id: 'b', zh: '白',     en: 'White',      hex: '#FDFBF5', group: 'basic' },
    { id: 'c', zh: '灰',     en: 'Gray',       hex: '#B3AFA8', group: 'basic' },
    { id: 'd', zh: '深灰',   en: 'Dark Gray',  hex: '#6E6A67', group: 'basic' },
    { id: 'e', zh: '红',     en: 'Red',        hex: '#E0473F', group: 'basic' },
    { id: 'f', zh: '橙',     en: 'Orange',     hex: '#F5902F', group: 'basic' },
    { id: 'g', zh: '黄',     en: 'Yellow',     hex: '#F8D134', group: 'basic' },
    { id: 'h', zh: '绿',     en: 'Green',      hex: '#54B356', group: 'basic' },
    { id: 'i', zh: '青',     en: 'Cyan',       hex: '#45BFCA', group: 'basic' },
    { id: 'j', zh: '蓝',     en: 'Blue',       hex: '#3E7FD6', group: 'basic' },
    { id: 'k', zh: '紫',     en: 'Purple',     hex: '#8C5FCB', group: 'basic' },

    // ── 柔和色 ──────────────────────────────────────────────────────────
    { id: 'l', zh: '粉红',   en: 'Pink',       hex: '#F5A2B8', group: 'soft'  },
    { id: 'm', zh: '淡粉',   en: 'Light Pink', hex: '#FCCBD8', group: 'soft'  },
    { id: 'n', zh: '奶黄',   en: 'Cream',      hex: '#F9E6A2', group: 'soft'  },
    { id: 'o', zh: '薄荷绿', en: 'Mint',       hex: '#A9DFC3', group: 'soft'  },
    { id: 'p', zh: '天蓝',   en: 'Sky',        hex: '#A8D6F3', group: 'soft'  },
    { id: 'q', zh: '淡紫',   en: 'Lavender',   hex: '#C8B6E9', group: 'soft'  },

    // ── 深色 ────────────────────────────────────────────────────────────
    { id: 'r', zh: '深红',   en: 'Dark Red',   hex: '#A12B36', group: 'dark'  },
    { id: 's', zh: '深蓝',   en: 'Dark Blue',  hex: '#2B4F91', group: 'dark'  },
    { id: 't', zh: '深绿',   en: 'Dark Green', hex: '#2F6D43', group: 'dark'  },
    { id: 'u', zh: '深紫',   en: 'Dark Purple',hex: '#5C3B84', group: 'dark'  },
    { id: 'v', zh: '棕',     en: 'Brown',      hex: '#8D5B3C', group: 'dark'  },
    { id: 'I', zh: '巧克力', en: 'Chocolate',  hex: '#5A3A28', group: 'dark'  },

    // ── 其他 ────────────────────────────────────────────────────────────
    { id: 'w', zh: '米白',   en: 'Ivory',      hex: '#F0E8D7', group: 'extra' },
    { id: 'x', zh: '肤色',   en: 'Skin',       hex: '#F3C7A2', group: 'extra' },
    { id: 'y', zh: '桃色',   en: 'Peach',      hex: '#F8B78C', group: 'extra' },
    { id: 'z', zh: '金黄',   en: 'Gold',       hex: '#E9B43D', group: 'extra' },
    { id: 'A', zh: '青绿',   en: 'Teal',       hex: '#2E8C8A', group: 'extra' },
    { id: 'B', zh: '珊瑚',   en: 'Coral',      hex: '#EF6D5A', group: 'extra' },
    { id: 'C', zh: '苹果绿', en: 'Apple',      hex: '#A8D95B', group: 'extra' },
    { id: 'D', zh: '芥末黄', en: 'Mustard',    hex: '#D2A02A', group: 'extra' },
    { id: 'E', zh: '玫红',   en: 'Rose',       hex: '#D9547C', group: 'extra' },
    { id: 'F', zh: '石板蓝', en: 'Slate Blue', hex: '#6C86B8', group: 'extra' },
    { id: 'G', zh: '森林绿', en: 'Forest',     hex: '#1F6B3B', group: 'extra' },
    { id: 'H', zh: '银',     en: 'Silver',     hex: '#DCD9D2', group: 'extra' },
    { id: 'J', zh: '冰蓝',   en: 'Ice',        hex: '#D9F1F5', group: 'extra' }
  ];

  const GROUP_META = [
    { key: 'basic', zh: '基础色', en: 'Basic' },
    { key: 'soft',  zh: '柔和色', en: 'Soft'  },
    { key: 'dark',  zh: '深色',   en: 'Dark'  },
    { key: 'extra', zh: '点缀色', en: 'Accent'}
  ];

  const EMPTY = -1;

  /** id -> 索引 */
  const idToIdx = Object.create(null);
  /** 索引 -> 颜色对象 */
  const list = RAW.map(function (c, i) {
    idToIdx[c.id] = i;
    return Object.assign({ index: i }, c);
  });

  const Palette = {
    EMPTY: EMPTY,
    list: list,
    groups: GROUP_META,
    size: list.length,

    /** 字符 -> 索引；未知字符（含 '.'）返回 EMPTY */
    fromChar: function (ch) {
      if (!ch || ch === '.' || ch === ' ' || ch === '0') return EMPTY;
      const i = idToIdx[ch];
      return i === undefined ? EMPTY : i;
    },

    /** 索引 -> 颜色对象（无则 null） */
    get: function (idx) {
      return idx >= 0 && idx < list.length ? list[idx] : null;
    },

    /** 索引 -> hex；空格返回 null */
    hex: function (idx) {
      const c = Palette.get(idx);
      return c ? c.hex : null;
    },

    /** 索引列表 -> hex 列表 */
    hexList: function (indices) {
      return indices.map(function (i) { return Palette.hex(i); });
    },

    /**
     * 感知接近的最近色索引（加权欧氏距离，近似 Lab）。
     * 供「图片转拼豆」使用。
     */
    nearest: function (r, g, b) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < list.length; i++) {
        const c = Palette.rgbCache[i];
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        // 近似感知权重：绿 > 红 > 蓝
        const d = 2 * dr * dr + 3 * dg * dg + 1.5 * db * db;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    },

    /** 把 rows 字符串数组解析为 Int16Array 网格 */
    parseRows: function (rows, w, h) {
      const grid = new Int16Array(w * h).fill(EMPTY);
      for (let y = 0; y < h; y++) {
        const row = rows[y] || '';
        for (let x = 0; x < w; x++) grid[y * w + x] = Palette.fromChar(row[x]);
      }
      return grid;
    }
  };

  // RGB 缓存（避免反复解析 hex）
  Palette.rgbCache = list.map(function (c) {
    const h = c.hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  });

  global.BeadyPalette = Palette;
})(window);
