/* ==========================================================================
 * BEADY · 应用层（路由 / 各屏 UI / 编辑器编排）
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = global.BeadyUtil;
  const Palette = global.BeadyPalette;
  const Sprites = global.BeadySprites;
  const Export = global.BeadyExport;
  const Store = global.BeadyStore;
  const Audio = global.BeadyAudio;
  const Img2Bead = global.BeadyImg2Bead;
  const Board = global.BeadyBoard;

  const $ = function (id) { return document.getElementById(id); };
  const SIZES = [16, 24, 32];

  /* ------------------------- 模板数据读取与校验 ------------------------- */
  const Templates = {
    list: [],
    load: function () {
      const raw = global.BEADY_TEMPLATES;
      if (!Array.isArray(raw)) return [];
      const ok = [];
      raw.forEach(function (t) {
        if (!t || !t.pixels || !Array.isArray(t.pixels)) return;
        const size = t.size || t.width || 0;
        let valid = size > 0 && t.pixels.length === size;
        for (let i = 0; i < t.pixels.length && valid; i++) {
          if (typeof t.pixels[i] !== 'string' || t.pixels[i].length !== size) valid = false;
        }
        if (valid) ok.push(t);
        else console.warn('[BEADY] 模板数据无效，已跳过：', t && t.id);
      });
      return ok;
    },
    byId: function (id) {
      return Templates.list.find(function (t) { return t.id === id; }) || null;
    }
  };

  /* --------------------------- 首页装饰：爱心 --------------------------- */
  /** 由隐函数生成的心形拼豆稿（保证对称、比例好看） */
  function heartGrid(n) {
    const g = new Int16Array(n * n).fill(Palette.EMPTY);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
      const px = (x + 0.5) / n * 2.45 - 1.225;
      const py = 1.32 - (y + 0.5) / n * 2.75;
        const v = Math.pow(px * px + py * py - 1, 3) - px * px * Math.pow(py, 3);
        if (v > 0) continue;
        const d = -v;
        let ch = 'm';
        if (d < 0.09) ch = 'r';
        else if (d < 0.38) ch = 'e';
        else if (d < 0.72) ch = 'l';
        const hx = px + 0.50, hy = py - 0.55;
        if (hx * hx + hy * hy < 0.075) ch = 'b';
        const hx2 = px + 0.74, hy2 = py - 0.44;
        if (hx2 * hx2 + hy2 * hy2 < 0.026) ch = 'b';
        g[y * n + x] = Palette.fromChar(ch);
      }
    }
    return g;
  }

  /* ================================ App ================================ */
  const App = {
    screen: 'home',
    board: null,
    curColor: 0,
    curTool: 'bead',
    session: { mode: 'free', size: 24, templateId: null, workId: null, name: '' },
    pendingImage: null,
    imageResult: null,
    _baseCell: 24,
    _uiRaf: 0,

    init: function () {
      Templates.list = Templates.load();
      App.settings = Store.settings();
      Audio.setEnabled(App.settings.sound !== false);
      if (global.BeadyIcons) global.BeadyIcons.apply(document);
      App._cacheDom();
      App._buildPalette();
      App._bindHome();
      App._bindTemplates();
      App._bindEditor();
      App._bindGallery();
      App._bindImage();
      App._bindSettings();
      App.paintHero();
      App.startHomeBeads();
      App.refreshHomeResume();
      App.syncSoundUI();
      App.go('home');
      console.log('[BEADY] ready · templates=' + Templates.list.length + ' colors=' + Palette.size);
    },

    /* ------------------------------ DOM ------------------------------ */
    _cacheDom: function () {
      App.dom = {
        screens: {
          home: $('screen-home'),
          templates: $('screen-templates'),
          editor: $('screen-editor'),
          gallery: $('screen-gallery'),
          image: $('screen-image')
        },
        heroArt: $('hero-art'),
        homeBeads: $('home-beads'),
        tplGrid: $('tpl-grid'),
        galGrid: $('gal-grid'),
        galEmpty: $('gal-empty'),
        edCanvas: $('ed-canvas'),
        edStage: $('ed-stage'),
        palList: $('pal-list'),
        palCur: $('pal-cur-cv'),
        edColors: $('ed-colors')
      };
    },

    /* ------------------------------ 路由 ------------------------------ */
    go: function (name) {
      Object.keys(App.dom.screens).forEach(function (k) {
        App.dom.screens[k].classList.toggle('is-active', k === name);
      });
      App.screen = name;
      if (name === 'editor') App.onEnterEditor();
      if (name === 'home') App.refreshHomeResume();
      if (name === 'gallery') App.renderGallery();
      if (name === 'templates') App.renderTemplates();
      global.scrollTo(0, 0);
    },

    toast: function (msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.add('is-on');
      clearTimeout(App._toastT);
      App._toastT = setTimeout(function () { t.classList.remove('is-on'); }, 1900);
    },

    confirm: function (title, text) {
      return new Promise(function (resolve) {
        const m = $('modal-confirm');
        $('confirm-title').textContent = title;
        $('confirm-text').textContent = text || '';
        m.hidden = false;
        const done = function (v) {
          m.hidden = true;
          $('confirm-yes').onclick = null;
          $('confirm-no').onclick = null;
          resolve(v);
        };
        $('confirm-yes').onclick = function () { done(true); };
        $('confirm-no').onclick = function () { done(false); };
      });
    },

    openModal: function (id) { $(id).hidden = false; },
    closeModal: function (id) { $(id).hidden = true; },

    /* ------------------------------ 首页 ------------------------------ */
    paintHero: function () {
      const cv = App.dom.heroArt;
      if (!cv) return;
      const size = 20;
      const g = heartGrid(size);
      // 用 CSS 尺寸直接绘制
      const dpr = Math.min(global.devicePixelRatio || 1, 3);
      const cssW = cv.clientWidth || 280;
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssW * dpr);
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      const cell = cv.width / size;
      for (let i = 0; i < g.length; i++) {
        const c = g[i];
        if (c === Palette.EMPTY) continue;
        Sprites.draw(ctx, c, 'bead', (i % size) * cell, ((i / size) | 0) * cell, cell);
      }
    },

    startHomeBeads: function () {
      const cv = App.dom.homeBeads;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      let beads = [], W = 0, H = 0, dpr = 1, raf = 0;

      function resize() {
        dpr = Math.min(global.devicePixelRatio || 1, 2);
        W = cv.clientWidth; H = cv.clientHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        const count = Util.clamp(Math.round(W * H / 22000), 20, 40);
        beads = [];
        for (let i = 0; i < count; i++) {
          const ci = (Math.random() * Palette.size) | 0;
          beads.push({
            x: Math.random() * W, y: Math.random() * H,
            r: 7 + Math.random() * 13,
            c: ci,
            vy: -(0.05 + Math.random() * 0.14),
            vx: (Math.random() - 0.5) * 0.06,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.0006,
            ph: Math.random() * Math.PI * 2,
            a: 0.30 + Math.random() * 0.32
          });
        }
      }

      function frame(t) {
        raf = requestAnimationFrame(frame);
        if (App.screen !== 'home') return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < beads.length; i++) {
          const b = beads[i];
          b.y += b.vy; b.x += b.vx; b.rot += b.vr;
          if (b.y < -b.r * 2) b.y = H + b.r * 2;
          if (b.x < -b.r * 2) b.x = W + b.r * 2;
          if (b.x > W + b.r * 2) b.x = -b.r * 2;
          const dy = Math.sin(t / 1400 + b.ph) * b.r * 0.22;
          const sp = Sprites.get(b.c, 'bead', b.r * 2 * dpr);
          ctx.save();
          ctx.globalAlpha = b.a;
          ctx.translate(b.x, b.y + dy);
          ctx.rotate(b.rot);
          ctx.drawImage(sp, -b.r, -b.r, b.r * 2, b.r * 2);
          ctx.restore();
        }
      }

      resize();
      App._resizeHome = function () { resize(); };
      global.addEventListener('resize', App._resizeHome);
      raf = requestAnimationFrame(frame);
    },

    refreshHomeResume: function () {
      const d = Store.getDraft();
      const box = $('home-resume');
      if (!d || !d.grid) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      const name = App.session.name || '未完成的作品';
      $('home-resume-text').textContent = '有未完成的作品 · ' + d.size + '×' + d.size;
    },

    _bindHome: function () {
      const tap = function (id, fn) {
        $(id).addEventListener('click', function () { Audio.unlock(); Audio.tap(); fn(); });
      };
      tap('btn-free', function () { App.startFree(); });
      tap('btn-templates', function () { App.go('templates'); });
      tap('btn-image', function () { App.go('image'); });
      tap('btn-gallery', function () { App.go('gallery'); });
      tap('btn-open-settings', function () {
        $('set-sound').checked = App.settings.sound !== false;
        $('set-usage').textContent = Store.usageKB() + ' KB';
        App.openModal('modal-settings');
      });
      $('home-resume-btn').addEventListener('click', function () {
        Audio.unlock();
        const d = Store.getDraft();
        if (!d) return;
        App.session = {
          mode: d.mode || 'free',
          size: d.size,
          templateId: d.templateId || null,
          workId: null,
          name: d.mode === 'free' ? '我的拼豆作品' : (App.tplName(d.templateId) || '我的拼豆作品')
        };
        App.openEditor(true);
      });
    },

    _bindSettings: function () {
      $('set-close').addEventListener('click', function () { App.closeModal('modal-settings'); });
      $('set-sound').addEventListener('change', function (e) {
        App.settings = Store.setSetting('sound', e.target.checked);
        Audio.setEnabled(e.target.checked);
        App.syncSoundUI();
        if (e.target.checked) Audio.tap();
      });
      $('set-clear').addEventListener('click', function () {
        App.confirm('清空全部作品？', '这会删除本机保存的所有作品，无法恢复。').then(function (yes) {
          if (!yes) return;
          Store.deleteWork('__all__');
          try { global.localStorage.removeItem('beady.gallery.v1'); } catch (e) { /* ignore */ }
          Store.clearDraft();
          App.refreshHomeResume();
          App.renderGallery();
          App.toast('已清空作品库');
        });
      });
      $('set-credits').addEventListener('click', function () {
        App.closeModal('modal-settings');
        App.toast('素材均为本项目自绘 · 详见 CREDITS.md');
      });
      ['modal-settings', 'modal-confirm'].forEach(function (id) {
        $(id).addEventListener('click', function (e) { if (e.target === $(id)) $(id).hidden = true; });
      });
    },

    syncSoundUI: function () {
      const on = App.settings.sound !== false;
      ['ed-sound', 'm-sound'].forEach(function (id) {
        const el = $(id);
        if (el) el.classList.toggle('is-off', !on);
      });
    },

    /* ---------------------------- 模板列表 ---------------------------- */
    tplName: function (id) {
      const t = Templates.byId(id);
      return t ? t.name : null;
    },

    renderTemplates: function (diff) {
      const grid = App.dom.tplGrid;
      grid.innerHTML = '';
      const list = Templates.list.filter(function (t) { return !diff || t.difficulty === diff; });

      if (!Templates.list.length) {
        grid.innerHTML = '<div class="empty"><h3>模板尚未加载</h3><p>assets/templates/templates.js 没有可用数据</p></div>';
        return;
      }
      if (!list.length) {
        grid.innerHTML = '<div class="empty"><h3>暂无该难度模板</h3></div>';
        return;
      }

      list.forEach(function (t) {
        const size = t.size;
        const target = Palette.parseRows(t.pixels, size, size);
        const card = Util.make('article', 'tpl-card');
        card.innerHTML =
          '<div class="tpl-thumb"><canvas></canvas></div>' +
          '<div class="tpl-meta">' +
            '<h3>' + t.name + '</h3>' +
            '<div class="tpl-diff diff' + t.difficulty + '">' +
              '<i></i><i></i><i></i>' +
              '<span>' + ['', '简单', '中等', '较复杂'][t.difficulty] + '</span>' +
            '</div>' +
            '<p class="tpl-info"><b>' + size + '×' + size + '</b> · 约 ' + (t.minutes || 8) + ' 分钟 · ' +
              App.colorCount(target) + ' 色</p>' +
          '</div>';
        card.addEventListener('click', function () {
          Audio.unlock(); Audio.tap();
          App.startTemplate(t);
        });
        grid.appendChild(card);
        const cv = card.querySelector('canvas');
        requestAnimationFrame(function () { Export.intoCanvas(cv, target, size, { kind: 'bead' }); });
      });
    },

    colorCount: function (target) {
      const s = new Set();
      for (let i = 0; i < target.length; i++) if (target[i] !== Palette.EMPTY) s.add(target[i]);
      return s.size;
    },

    _bindTemplates: function () {
      $('tpl-back').addEventListener('click', function () { Audio.tap(); App.go('home'); });
      $('tpl-filter').addEventListener('click', function (e) {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        Array.prototype.forEach.call(this.querySelectorAll('.chip'), function (c) { c.classList.remove('is-on'); });
        chip.classList.add('is-on');
        Audio.tap();
        App.renderTemplates(parseInt(chip.dataset.diff, 10) || 0);
      });
    },

    /* ------------------------------ 编辑器 ------------------------------ */
    startFree: function () {
      App.session = { mode: 'free', size: 24, templateId: null, workId: null, name: '我的拼豆作品' };
      App.openEditor(false);
    },

    startTemplate: function (t) {
      App.session = { mode: 'template', size: t.size, templateId: t.id, workId: null, name: t.name };
      App.openEditor(false);
    },

    openEditor: function (restoreDraft) {
      App.go('editor');
      const sess = App.session;
      const b = App.board;
      $('stage-hint').textContent = '';

      // 四条入口的语义在此明确区分：
      //   首页「自由拼豆」/ 我的作品空态「开始拼豆」/ 图片转拼豆 / 模板挑战 → 新板
      //   首页「继续上次」(restoreDraft=true)                              → 恢复草稿
      //   「我的作品 → 继续编辑」→ 不走这里，由 editWork() 自行装载指定作品
      if (sess.mode === 'template') {
        const t = Templates.byId(sess.templateId);
        if (t) { b.loadTemplate(t); }
        else if (restoreDraft && Store.getDraft()) { App._loadDraftIntoBoard(); }
        else { b.newBoard(sess.size); }        // 模板数据缺失时退化为空白板
      } else {
        b.target = null;                       // 自由创作没有目标图
        // 必须用 newBoard 而非 setSize：自由模式尺寸恒为 24，而 setSize(24)
        // 在同尺寸时是 no-op，表达不出「新建空白板」，会把上一张板的内容带进来。
        if (restoreDraft && Store.getDraft()) App._loadDraftIntoBoard();
        else b.newBoard(sess.size);
      }
      b.ironed = !!(restoreDraft && Store.getDraft() && Store.getDraft().ironed);
      b.showGhost = true;
      b.setTool('bead');
      App.curTool = 'bead';
      App.syncToolButtons();
      App.rebuildSideColors();
      App.updateEdUINow();
    },

    _loadDraftIntoBoard: function () {
      const d = Store.getDraft();
      if (!d) return;
      App.session.size = d.size;
      App.board.size = d.size;
      App.board.loadGrid(Util.decodeGrid(d.grid, d.size * d.size), d.size);
    },

    onEnterEditor: function () {
      const b = App.board;
      requestAnimationFrame(function () {
        b.resize();
        b.fit(0.88);
        App._baseCell = b.cell;
        App.updateEdUINow();
      });
    },

    /** 由 Board 回调：progress / title / 按钮可用性 */
    updateEdUI: function () {
      const b = App.board;
      if (!b) return;
      // 拖动时 onChange 可能每移动一格就触发一次；输入热路径只负责画板，
      // 这里把 DOM 写入合并到下一帧，保证连续点按 / 拖动不被 UI 工作拖慢。
      App.saveDraft();
      if (App._uiRaf) return;
      App._uiRaf = requestAnimationFrame(function () {
        App._uiRaf = 0;
        App._syncEdUI();
      });
    },

    /** 立即执行（不合并）——用于进入编辑器、载入作品、熨烫完成等需要同步外观的场合 */
    updateEdUINow: function () {
      if (App._uiRaf) { cancelAnimationFrame(App._uiRaf); App._uiRaf = 0; }
      App._syncEdUI();
    },

    _syncEdUI: function () {
      const b = App.board;
      if (!b) return;
      const sess = App.session;
      $('ed-undo').disabled = !b.canUndo();
      $('ed-redo').disabled = !b.canRedo();
      const isTpl = !!b.target;
      $('ed-progress').classList.toggle('hidden', !isTpl);
      $('m-progress').classList.toggle('hidden', !isTpl);
      $('ed-side').classList.toggle('is-free', !isTpl);

      if (isTpl) {
        const t = Templates.byId(sess.templateId);
        const pg = b.getProgress();
        const label = pg.done + ' / ' + pg.total;
        $('ed-progress-num').textContent = label;
        $('ed-progress-pct').textContent = pg.pct + '%';
        $('ed-progress-bar').style.width = pg.pct + '%';
        $('m-progress-num').textContent = label;
        $('m-progress-pct').textContent = pg.pct + '%';
        $('ed-title').textContent = (t ? t.name : '照图拼豆');
      } else {
        const filled = b.filledCount();
        $('ed-title').textContent = '自由拼豆 · ' + b.size + '×' + b.size;
        $('ed-title').setAttribute('data-filled', filled);
      }
      const pct = Math.round(b.cell / (App._baseCell || 24) * 100);
      $('ed-zoom-val').textContent = pct + '%';
    },

    rebuildSideColors: function () {
      const b = App.board;
      const box = App.dom.edColors;
      box.innerHTML = '';
      const list = b.target ? b.templateColors() : [];
      if (!list.length) {
        $('ed-tip').textContent = '选一个颜色，点格子放豆；拖动可以连续画。';
      } else {
        $('ed-tip').textContent = '浅浅的底色是目标提示，放错不会阻止你，只是闪一下红框。';
      }
      list.forEach(function (ci) {
        const item = Util.make('button', 'sc');
        item.innerHTML = '<canvas></canvas><span>' + Palette.get(ci).zh + '</span>';
        item.title = '选择颜色：' + Palette.get(ci).zh;
        item.addEventListener('click', function () {
          Audio.tap();
          App.setTool('bead');
          App.setColor(ci, true);
        });
        box.appendChild(item);
        const cv = item.querySelector('canvas');
        requestAnimationFrame(function () { Sprites.chip(cv, ci, 'bead'); });
      });
    },

    saveDraft: Util ? null : null,

    _buildPalette: function () {
      const box = App.dom.palList;
      box.innerHTML = '';
      Palette.groups.forEach(function (g) {
        const ids = Palette.list.filter(function (c) { return c.group === g.key; });
        if (!ids.length) return;
        const wrap = Util.make('div', 'pal-group');
        wrap.innerHTML = '<span class="pal-label">' + g.zh + '</span>';
        const row = Util.make('div', 'pal-row');
        ids.forEach(function (c) {
          const btn = Util.make('button', 'pal-chip');
          btn.dataset.color = String(c.index);
          btn.title = c.zh + ' · ' + c.en;
          btn.setAttribute('aria-label', c.zh);
          btn.innerHTML = '<canvas></canvas>';
          btn.addEventListener('click', function () {
            Audio.unlock(); Audio.tap();
            App.setTool('bead');
            App.setColor(c.index, true);
          });
          row.appendChild(btn);
        });
        wrap.appendChild(row);
        box.appendChild(wrap);
      });
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(box.querySelectorAll('.pal-chip canvas'), function (cv) {
          Sprites.chip(cv, parseInt(cv.parentNode.dataset.color, 10), 'bead');
        });
        Sprites.chip(App.dom.palCur, App.curColor, 'bead');
      });
      App.setColor(0, false);
    },

    setColor: function (i, scroll) {
      App.curColor = i;
      if (App.board) App.board.setColor(i);
      Array.prototype.forEach.call(App.dom.palList.querySelectorAll('.pal-chip'), function (b) {
        b.classList.toggle('is-on', parseInt(b.dataset.color, 10) === i);
      });
      if (App.dom.palCur) Sprites.chip(App.dom.palCur, i, 'bead');
      if (scroll) {
        const btn = App.dom.palList.querySelector('.pal-chip.is-on');
        if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    },

    setTool: function (tool) {
      App.curTool = tool;
      if (App.board) App.board.setTool(tool);
      App.syncToolButtons();
    },

    syncToolButtons: function () {
      ['bead', 'erase', 'pick', 'move'].forEach(function (t) {
        const el = $('tool-' + t);
        if (el) el.classList.toggle('is-on', App.curTool === t);
      });
      const hint = $('stage-hint');
      if (hint) {
        hint.textContent = App.curTool === 'erase' ? '橡皮：点或拖动移除拼豆'
          : App.curTool === 'move' ? '移动：拖动画布'
          : App.curTool === 'pick' ? '吸管：点击豆子取色'
          : '';
        hint.classList.toggle('is-on', App.curTool !== 'bead');
      }
    },

    _bindEditor: function () {
      const canvas = App.dom.edCanvas;
      App.board = new Board(canvas, {
        // 热路径只做画板绘制 + 合并到下一帧的轻量 UI 刷新，不阻塞输入
        onChange: function () { App.updateEdUI(); },
        onComplete: function () {
          App.toast('完成啦！要不要熨烫一下？');
        },
        onPickColor: function (ci) {
          App.setColor(ci, true);
          App.setTool('bead');
          App.toast('已吸取：' + Palette.get(ci).zh);
        }
      });

      const wrapToButton = function (id, fn) {
        const el = $(id);
        if (el) el.addEventListener('click', function () { Audio.unlock(); Audio.tap(); fn(); });
      };

      wrapToButton('ed-back', function () { App.confirmLeave(); });
      wrapToButton('ed-undo', function () { App.board.undo(); });
      wrapToButton('ed-redo', function () { App.board.redo(); });
      wrapToButton('ed-clear', function () {
        if (!App.board.filledCount()) { App.toast('画板已经是空的'); return; }
        App.confirm('清空画板？', '这一步可以撤销。').then(function (yes) {
          if (yes) { App.board.clearBoard(); App.toast('已清空'); }
        });
      });
      wrapToButton('ed-iron', function () { App.doIron(); });
      wrapToButton('ed-save', function () { App.doSave(); });
      wrapToButton('ed-fit', function () { App.board.fit(0.88); App._baseCell = App.board.cell; App.updateEdUINow(); });
      wrapToButton('ed-zoom-in', function () { App.board.zoomAt(1.25); App.updateEdUINow(); });
      wrapToButton('ed-zoom-out', function () { App.board.zoomAt(0.8); App.updateEdUINow(); });
      wrapToButton('ed-ghost', function () {
        App.board.showGhost = !App.board.showGhost;
        App.board._layerKey = '';
        App.board.requestRender();
        App.toast(App.board.showGhost ? '已显示颜色提示' : '已隐藏颜色提示');
      });
      wrapToButton('m-undo', function () { App.board.undo(); });
      wrapToButton('m-redo', function () { App.board.redo(); });

      const toggleSound = function () {
        const on = !(App.settings.sound !== false);
        App.settings = Store.setSetting('sound', on);
        Audio.setEnabled(on);
        App.syncSoundUI();
        if (on) { Audio.unlock(); Audio.tap(); }
      };
      wrapToButton('ed-sound', toggleSound);
      wrapToButton('m-sound', toggleSound);

      ['bead', 'erase', 'pick', 'move'].forEach(function (t) {
        wrapToButton('tool-' + t, function () { App.setTool(t); });
      });

      // 键盘
      document.addEventListener('keydown', function (e) {
        if (App.screen !== 'editor') return;
        if ($('modal-finish') && !$('modal-finish').hidden) return;
        const meta = e.ctrlKey || e.metaKey;
        if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); App.board.undo(); return; }
        if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); App.board.redo(); return; }
        if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); App.doSave(); return; }
        if (e.code === 'Space') { App.board.setSpace(true); e.preventDefault(); }
        if (e.key === 'e' || e.key === 'E') App.setTool('erase');
        if (e.key === 'b' || e.key === 'B') App.setTool('bead');
      });
      document.addEventListener('keyup', function (e) {
        if (e.code === 'Space') App.board.setSpace(false);
      });

      let rt = null;
      global.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () {
          if (!App.board) return;
          App.board.resize();
          App.paintHero();
        }, 120);
      });

      // 首次交互解锁音频
      canvas.addEventListener('pointerdown', function () { Audio.unlock(); });
    },

    confirmLeave: function () {
      const b = App.board;
      if (b.filledCount() === 0) { App.go('home'); return; }
      App.confirm('离开当前作品？', '进度会保存在「继续创作」里，随时可以回来。').then(function (yes) {
        if (yes) App.go('home');
      });
    },

    saveDraftNow: function () {
      if (!App.board) return;
      if (!App.board.filledCount()) { Store.clearDraft(); return; }
      Store.setDraft({
        size: App.board.size,
        grid: App.board.grid,
        mode: App.session.mode,
        templateId: App.session.templateId,
        ironed: App.board.ironed
      });
    },

    doSave: function () {
      const b = App.board;
      if (!b.filledCount()) { App.toast('还没有放拼豆呢'); return; }
      const sess = App.session;
      const rec = Store.saveWork({
        id: sess.workId,
        name: sess.name || '我的拼豆作品',
        size: b.size,
        grid: b.grid,
        mode: sess.mode,
        templateId: sess.templateId,
        ironed: b.ironed
      });
      sess.workId = rec.id;
      App.toast('已保存到「我的作品」');
    },

    /* ------------------------------ 熨烫 ------------------------------ */
    doIron: function () {
      const b = App.board;
      if (!b.filledCount()) { App.toast('先放几颗拼豆吧'); return; }
      const proceed = function () {
        $('ed-iron').disabled = true;
        App.toast('开始熨烫…小心烫手');
        b.startIron().then(function () {
          $('ed-iron').disabled = false;
          App.showFinish();
        });
      };
      if (b.target && !b.completed) {
        App.confirm('还没拼完呢', '完成度 ' + b.getProgress().pct + '%，现在熨烫也可以继续拼。').then(function (yes) {
          if (yes) proceed();
        });
      } else proceed();
    },

    showFinish: function () {
      const b = App.board;
      const m = $('modal-finish');
      m.hidden = false;
      const filled = b.filledCount();
      $('finish-name').textContent = App.session.name || '我的拼豆作品';
      $('finish-meta').textContent = b.size + ' × ' + b.size + ' · ' + filled + ' 颗拼豆';
      // 完成页的「保存图片」始终指向当前作品（查看历史作品时会临时改写）
      $('finish-save').onclick = App.saveCurrentPNG;
      requestAnimationFrame(function () {
        Export.intoCanvas($('finish-art'), b.grid, b.size, { kind: 'fused' });
      });
    },

    /** 导出当前作品 PNG（只含作品 + 干净背景，不含网页 UI） */
    saveCurrentPNG: function () {
      const b = App.board;
      Export.download(b.grid, b.size, (App.session.name || 'beady') + '.png', { kind: b.ironed ? 'fused' : 'bead' })
        .then(function () { App.toast('PNG 已导出到下载目录'); });
    },

    _bindFinish: function () {
      window.App = App;
    },

    /* ---------------------------- 我的作品 ---------------------------- */
    renderGallery: function () {
      const list = Store.gallery();
      const grid = App.dom.galGrid;
      grid.innerHTML = '';
      App.dom.galEmpty.classList.toggle('hidden', list.length > 0);
      $('gal-sub').textContent = '共 ' + list.length + ' 件 · 保存在本机浏览器里，刷新也不会丢';

      list.forEach(function (w) {
        const card = Util.make('article', 'gal-card');
        card.innerHTML =
          '<div class="gal-thumb"><img alt="' + w.name + '" src="' + w.thumb + '"></div>' +
          '<div class="gal-meta">' +
            '<h3>' + w.name + '</h3>' +
            '<p>' + w.size + '×' + w.size + ' · ' + Util.relTime(w.updatedAt) + '</p>' +
            '<div class="gal-ops">' +
              '<button class="btn btn-sm btn-primary" data-op="edit">继续编辑</button>' +
              '<button class="btn btn-sm" data-op="view">查看</button>' +
              '<button class="btn btn-sm btn-ghost" data-op="del">删除</button>' +
            '</div>' +
          '</div>';
        card.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-op]');
          if (!btn) return;
          Audio.unlock(); Audio.tap();
          const op = btn.dataset.op;
          if (op === 'edit') App.editWork(w);
          if (op === 'view') App.viewWork(w);
          if (op === 'del') {
            App.confirm('删除这件作品？', w.name).then(function (yes) {
              if (!yes) return;
              Store.deleteWork(w.id);
              App.renderGallery();
              App.toast('已删除');
            });
          }
        });
        grid.appendChild(card);
      });
    },

    editWork: function (w) {
      App.session = { mode: w.mode, size: w.size, templateId: w.templateId, workId: w.id, name: w.name };
      App.go('editor');
      const b = App.board;
      const t = Templates.byId(w.templateId);
      if (w.mode === 'template' && t) {
        b.loadTemplate(t);
        b.loadGrid(Store.decode(w), w.size);
        b.target = Palette.parseRows(t.pixels, t.size, t.size);
        b.targetTotal = 0;
        for (let i = 0; i < b.target.length; i++) if (b.target[i] !== Palette.EMPTY) b.targetTotal++;
      } else {
        b.setSize(w.size);
        b.target = null; b.targetTotal = 0;
        b.loadGrid(Store.decode(w), w.size);
      }
      b.ironed = !!w.ironed;
      b._layerKey = '';
      b._recomputeProgress();
      App.rebuildSideColors();
      App.setTool('bead');
      requestAnimationFrame(function () { b.resize(); b.fit(0.88); App._baseCell = b.cell; App.updateEdUINow(); });
    },

    viewWork: function (w) {
      App.session.name = w.name;
      const m = $('modal-finish');
      m.hidden = false;
      $('finish-name').textContent = w.name;
      const grid = Store.decode(w);
      let n = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] !== Palette.EMPTY) n++;
      $('finish-meta').textContent = w.size + ' × ' + w.size + ' · ' + n + ' 颗拼豆 · ' + Util.formatDate(w.updatedAt);
      requestAnimationFrame(function () {
        Export.intoCanvas($('finish-art'), grid, w.size, { kind: w.ironed ? 'fused' : 'bead' });
        $('finish-save').onclick = function () {
          Export.download(grid, w.size, w.name + '.png', { kind: w.ironed ? 'fused' : 'bead' });
          App.toast('PNG 已导出');
        };
      });
    },

    _bindGallery: function () {
      $('gal-back').addEventListener('click', function () { Audio.tap(); App.go('home'); });
      $('gal-go').addEventListener('click', function () { Audio.tap(); App.startFree(); });

      // 默认「保存图片」= 导出当前作品；查看历史作品时会被临时改写
      $('finish-save').onclick = App.saveCurrentPNG;
      $('finish-again').addEventListener('click', function () {
        Audio.tap();
        App.closeModal('modal-finish');
        const sess = App.session;
        const t = Templates.byId(sess.templateId);
        if (t) { App.board.loadTemplate(t); App.rebuildSideColors(); }
        else { App.board.loadGrid(new Int16Array(App.board.size * App.board.size).fill(-1), App.board.size); }
        App.board.ironed = false;
        App.session.workId = null;
        App.updateEdUINow();
        App.toast('新的一张，开始吧');
      });
      $('finish-home').addEventListener('click', function () {
        Audio.tap();
        Store.clearDraft();
        App.closeModal('modal-finish');
        App.go('home');
        App.refreshHomeResume();
      });
      $('finish-edit').addEventListener('click', function () {
        Audio.tap();
        App.closeModal('modal-finish');
        $('finish-save').onclick = null;
      });
      $('modal-finish').addEventListener('click', function (e) {
        if (e.target === $('modal-finish')) { App.closeModal('modal-finish'); $('finish-save').onclick = null; }
      });
    },

    /* --------------------------- 图片转拼豆 --------------------------- */
    _bindImage: function () {
      $('img-back').addEventListener('click', function () { Audio.tap(); App.go('home'); });

      const drop = $('img-drop');
      const input = $('img-input');
      drop.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) App.handleImageFile(e.target.files[0]);
      });
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
      });
      drop.addEventListener('drop', function (e) {
        if (e.dataTransfer.files && e.dataTransfer.files[0]) App.handleImageFile(e.dataTransfer.files[0]);
      });

      $('img-sizes').addEventListener('click', function (e) {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        Array.prototype.forEach.call(this.querySelectorAll('.chip'), function (c) { c.classList.remove('is-on'); });
        chip.classList.add('is-on');
        App.refreshImagePreview();
      });
      ['img-contrast', 'img-ignore'].forEach(function (id) {
        $(id).addEventListener('input', function () { App.refreshImagePreview(); });
      });
      $('img-start').addEventListener('click', function () {
        const r = App.imageResult;
        if (!r) return;
        Audio.unlock(); Audio.tap();
        App.session = { mode: 'template', size: r.size, templateId: null, workId: null, name: '我的图片拼豆' };
        App.go('editor');
        const b = App.board;
        b.size = r.size;
        b.grid = new Int16Array(r.size * r.size).fill(-1);
        b.target = r.grid;
        b.targetTotal = 0;
        for (let i = 0; i < b.target.length; i++) if (b.target[i] !== Palette.EMPTY) b.targetTotal++;
        b.correctCount = 0;
        b.undoStack = []; b.redoStack = [];
        b.completed = false; b._celebrated = false;
        b.ironed = false; b.ironing = false;
        b._layerKey = '';
        b.setTool('bead');
        App.setTool('bead');
        App.rebuildSideColors();
        requestAnimationFrame(function () {
          b.resize(); b.fit(0.88); App._baseCell = b.cell; b.requestRender(); App.updateEdUINow();
        });
      });
    },

    handleImageFile: function (file) {
      Img2Bead.loadFile(file).then(function (img) {
        App.pendingImage = img;
        const srcCv = $('img-src');
        srcCv.classList.remove('hidden');
        const holder = $('img-drop').querySelector('.drop-inner');
        if (holder) holder.classList.add('hidden');
        // 原图预览
        const dpr = Math.min(global.devicePixelRatio || 1, 2);
        const side = Math.max(120, Math.min(260, srcCv.clientWidth || 200));
        srcCv.width = side * dpr; srcCv.height = side * dpr;
        const ctx = srcCv.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, srcCv.width, srcCv.height);

        const pv = $('pv-src');
        pv.innerHTML = '';
        const small = document.createElement('canvas');
        small.width = 96; small.height = 96;
        small.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
        pv.appendChild(small);

        App.refreshImagePreview();
      }).catch(function (err) {
        App.toast(err.message || '图片读取失败');
      });
    },

    refreshImagePreview: function () {
      const img = App.pendingImage;
      if (!img) return;
      const chip = $('img-sizes').querySelector('.chip.is-on');
      const size = parseInt(chip ? chip.dataset.size : 24, 10);
      const contrast = ($('img-contrast').value | 0) / 100;
      const ignore = $('img-ignore').checked;

      let r;
      try {
        r = Img2Bead.quantize(img, size, { ignoreBg: ignore, contrast: contrast });
      } catch (e) {
        App.toast('处理失败：' + e.message);
        return;
      }
      App.imageResult = r;

      const pv = $('pv-bead');
      pv.innerHTML = '';
      const cv = document.createElement('canvas');
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      cv.width = 96 * dpr; cv.height = 96 * dpr;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#F7F1E3'; ctx.fillRect(0, 0, cv.width, cv.height);
      const cell = cv.width / size;
      for (let i = 0; i < r.grid.length; i++) {
        const c = r.grid[i];
        if (c === Palette.EMPTY) continue;
        Sprites.draw(ctx, c, 'bead', (i % size) * cell, ((i / size) | 0) * cell, cell);
      }
      pv.appendChild(cv);

      let beads = 0;
      for (let i = 0; i < r.grid.length; i++) if (r.grid[i] !== Palette.EMPTY) beads++;
      $('img-note').textContent = '共 ' + beads + ' 颗拼豆 · ' + r.counts + ' 种颜色';
      $('img-start').disabled = beads === 0;
    }
  };

  /* --------------------------- 草稿自动保存 --------------------------- */
  App.saveDraft = Util.debounce(function () { App.saveDraftNow(); }, 700);

  /* ------------------------------- 启动 ------------------------------- */
  App._bindFinish();
  function boot() {
    try {
      App.init();
    } catch (e) {
      console.error('[BEADY] 初始化失败：', e);
      const box = document.getElementById('app');
      if (box) {
        box.insertAdjacentHTML('afterbegin',
          '<div style="padding:30px;text-align:center;color:#8a3b32;font:600 15px/1.7 sans-serif">' +
          'BEADY 启动失败：' + (e && e.message ? e.message : e) + '</div>');
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.BeadyApp = App;
})(window);
