/* ==========================================================================
 * BEADY · 本地存档（localStorage，无需账号 / 无需后端）
 * --------------------------------------------------------------------------
 * 两个桶：
 *   beady.settings.v1  偏好设置
 *   beady.gallery.v1   我的作品（最多 KEEP 条，超出淘汰最旧）
 *   beady.draft.v1     当前草稿（防止误刷新丢进度）
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = global.BeadyUtil;
  const Export = global.BeadyExport;

  const K_SETTINGS = 'beady.settings.v1';
  const K_GALLERY = 'beady.gallery.v1';
  const K_DRAFT = 'beady.draft.v1';
  const KEEP = 24;

  function read(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, val) {
    try {
      global.localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      // 配额溢出：淘汰最旧的作品后重试一次
      if (key === K_GALLERY && Array.isArray(val) && val.length > 4) {
        try {
          global.localStorage.setItem(key, JSON.stringify(val.slice(0, Math.floor(val.length / 2))));
          return false;
        } catch (e2) { return false; }
      }
      return false;
    }
  }

  const Store = {
    KEEP: KEEP,

    /* ---------------- 设置 ---------------- */
    settings: function () {
      return Object.assign({ sound: true, ghost: true }, read(K_SETTINGS, {}));
    },
    setSetting: function (k, v) {
      const s = Store.settings();
      s[k] = v;
      write(K_SETTINGS, s);
      return s;
    },

    /* ---------------- 作品集 ---------------- */
    gallery: function () {
      const list = read(K_GALLERY, []);
      return Array.isArray(list) ? list : [];
    },

    /**
     * 保存作品
     * @param {object} work {name, size, grid(Int16Array), mode, templateId, ironed}
     */
    saveWork: function (work) {
      const list = Store.gallery();
      const rec = {
        id: work.id || Util.uid('w'),
        name: work.name || '未命名作品',
        size: work.size,
        grid: Util.encodeGrid(work.grid),
        mode: work.mode || 'free',
        templateId: work.templateId || null,
        ironed: !!work.ironed,
        updatedAt: Date.now(),
        createdAt: work.createdAt || Date.now(),
        thumb: Export.thumb(work.grid, work.size, 132, work.ironed ? 'fused' : 'bead')
      };
      const idx = list.findIndex(function (w) { return w.id === rec.id; });
      if (idx >= 0) {
        rec.createdAt = list[idx].createdAt || rec.createdAt;
        list[idx] = rec;
      } else {
        list.unshift(rec);
      }
      while (list.length > KEEP) list.pop();
      write(K_GALLERY, list);
      return rec;
    },

    getWork: function (id) {
      return Store.gallery().find(function (w) { return w.id === id; }) || null;
    },

    deleteWork: function (id) {
      const list = Store.gallery().filter(function (w) { return w.id !== id; });
      write(K_GALLERY, list);
      return list;
    },

    /** dataURL -> work 附带的解码后网格 */
    decode: function (work) {
      return Util.decodeGrid(work.grid, work.size * work.size);
    },

    /* ---------------- 草稿 ---------------- */
    setDraft: function (d) {
      write(K_DRAFT, d ? {
        size: d.size,
        grid: Util.encodeGrid(d.grid),
        mode: d.mode,
        templateId: d.templateId || null,
        ironed: !!d.ironed,
        updatedAt: Date.now()
      } : null);
    },
    getDraft: function () { return read(K_DRAFT, null); },
    clearDraft: function () { try { global.localStorage.removeItem(K_DRAFT); } catch (e) { /* ignore */ } },

    usageKB: function () {
      try {
        let n = 0;
        [K_SETTINGS, K_GALLERY, K_DRAFT].forEach(function (k) {
          const v = global.localStorage.getItem(k);
          if (v) n += v.length;
        });
        return Math.round(n / 1024);
      } catch (e) { return 0; }
    }
  };

  global.BeadyStore = Store;
})(window);
