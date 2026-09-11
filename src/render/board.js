/* ==========================================================================
 * BEADY · 拼豆板引擎（模型 + 渲染 + 交互 + 熨烫）
 * --------------------------------------------------------------------------
 * 单一职责：负责「一块板」的全部状态与表现，不碰页面导航与存档。
 * 对外通过 opts 回调通知宿主: onChange / onProgress / onComplete / onCellResult
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = global.BeadyUtil;
  const Palette = global.BeadyPalette;
  const Sprites = global.BeadySprites;
  const Audio = global.BeadyAudio;

  const PLACE_MS = 110;      // 放置 pop 动画（必须极短，否则连续点按会显得迟钝）
  const PLACE_POP = 0.045;   // pop 峰值幅度：最大约 1.045 倍
  const PLACE_SETTLE = 0.045;// 落定下沉幅度（格）
  const ERASE_MS = 150;      // 移除（橡皮 / Undo）动画
  const WRONG_MS = 620;      // 放错色红框提示时长
  const CELL_MIN = 5, CELL_MAX = 72;

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
  function smoothstep(p) { return p <= 0 ? 0 : (p >= 1 ? 1 : p * p * (3 - 2 * p)); }

  /** 调试追踪（仅 ?debug=1 时非空；平时为 null，零开销零行为改变） */
  function TR() {
    return (global.BeadyTrace && global.BeadyTrace.enabled) ? global.BeadyTrace : null;
  }

  function BeadyBoard(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};

    this.dpr = Math.min(global.devicePixelRatio || 1, 3);
    this.size = 24;
    this.grid = new Int16Array(this.size * this.size).fill(Palette.EMPTY);
    this.target = null;         // Int16Array | null
    this.targetTotal = 0;
    this.correctCount = 0;

    this.color = 0;
    this.tool = 'bead';         // bead | erase | move | pick
    this.showGhost = true;

    this.cell = 24;             // CSS px / 格
    this.ox = 0; this.oy = 0;   // 板左上角在 canvas 中的 CSS px 位置

    this.anims = new Map();     // idx -> {type, t0, color}
    this.wrong = new Map();     // idx -> t0
    this.sparks = [];

    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;

    this.ironing = false;
    this.ironed = false;
    this.iron = null;
    this.completed = false;

    this.interactive = true;
    this.pointers = new Map();
    this.pinch = null;
    this.panning = false;
    this.spaceDown = false;
    this.lastCell = null;
    this.paintCount = 0;

    this._raf = 0;
    this._dirty = true;
    this._layer = null;
    this._layerKey = '';
    this._celebrated = false;

    this._bind();
    this.resize();
  }

  BeadyBoard.prototype = {

    /* ==================== 生命周期 / 数据 ==================== */

    setSize: function (n) {
      const p = Math.max(4, Math.min(96, n | 0));
      if (p === this.size && this.grid.length === p * p) return;
      this.size = p;
      this.grid = new Int16Array(p * p).fill(Palette.EMPTY);
      this.target = null; this.targetTotal = 0; this.correctCount = 0;
      this.undoStack = []; this.redoStack = [];
      this.anims.clear(); this.wrong.clear(); this.sparks.length = 0;
      this.ironed = false; this.ironing = false; this.iron = null;
      this.completed = false; this._celebrated = false;
      this._layerKey = '';
      this.requestRender();
      this._notify();
    },

    /** 直接装载格子数据（长度需等于 size*size） */
    loadGrid: function (arr, size) {
      if (size) this.size = size;
      const n = this.size * this.size;
      this.grid = new Int16Array(n);
      for (let i = 0; i < n; i++) this.grid[i] = arr[i] === undefined ? Palette.EMPTY : arr[i];
      this.undoStack = []; this.redoStack = [];
      this.anims.clear(); this.wrong.clear();
      this.ironed = false; this.ironing = false; this.completed = false; this._celebrated = false;
      this._recomputeProgress();
      this.requestRender();
      this._notify();
    },

    /** 装载模板：pixels 字符串数组 */
    loadTemplate: function (tpl) {
      const size = tpl.size || tpl.width;
      this.size = size;
      this.grid = new Int16Array(size * size).fill(Palette.EMPTY);
      this.target = Palette.parseRows(tpl.pixels, size, size);
      this.targetTotal = 0;
      for (let i = 0; i < this.target.length; i++) if (this.target[i] !== Palette.EMPTY) this.targetTotal++;
      this.correctCount = 0;
      this.undoStack = []; this.redoStack = [];
      this.anims.clear(); this.wrong.clear(); this.sparks.length = 0;
      this.ironed = false; this.ironing = false; this.completed = false; this._celebrated = false;
      this._layerKey = '';
      this.requestRender();
      this._notify();
    },

    /** 模板对象 -> 需要的颜色索引列表 */
    templateColors: function () {
      if (!this.target) return [];
      const set = new Set();
      for (let i = 0; i < this.target.length; i++) {
        const v = this.target[i];
        if (v !== Palette.EMPTY) set.add(v);
      }
      return Array.from(set);
    },

    clearBoard: function () {
      const ops = this._collectClearOps();
      if (!ops.length) return;
      // 先应用（to = 空格），再入栈，保证可以撤销
      this._applyOps(ops, false);
      this._pushOps(ops);
      this.requestRender();
      this._notify();
    },

    /* ==================== 历史 ==================== */

    _applyOps: function (ops, reverse) {
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        this.grid[op.i] = reverse ? op.from : op.to;
      }
    },

    _pushOps: function (ops) {
      if (!ops || !ops.length) return;
      this.undoStack.push(ops);
      if (this.undoStack.length > 240) this.undoStack.shift();
      this.redoStack.length = 0;
    },

    undo: function () {
      const ops = this.undoStack.pop();
      if (!ops) return false;
      // 视觉：向上飞出后消失
      for (let i = 0; i < ops.length; i++) {
        if (ops[i].to !== Palette.EMPTY) {
          this.anims.set(ops[i].i, { type: 'erase', t0: Util.now(), color: ops[i].to });
        }
      }
      this._applyOps(ops, true);
      this.redoStack.push(ops);
      this._recomputeProgress();
      Audio.erase();
      this.requestRender();
      this._notify();
      return true;
    },

    redo: function () {
      const ops = this.redoStack.pop();
      if (!ops) return false;
      for (let i = 0; i < ops.length; i++) {
        if (ops[i].to !== Palette.EMPTY) {
          this.anims.set(ops[i].i, { type: 'place', t0: Util.now(), color: ops[i].to });
        }
      }
      this._applyOps(ops, false);
      this.undoStack.push(ops);
      this._recomputeProgress();
      Audio.placeSoft(this.color);
      this.requestRender();
      this._notify();
      return true;
    },

    canUndo: function () { return this.undoStack.length > 0; },
    canRedo: function () { return this.redoStack.length > 0; },

    /* ==================== 编辑操作 ==================== */

    _collectClearOps: function () {
      const ops = [];
      for (let i = 0; i < this.grid.length; i++) {
        if (this.grid[i] !== Palette.EMPTY) ops.push({ i: i, from: this.grid[i], to: Palette.EMPTY });
      }
      for (let i = 0; i < ops.length; i++) {
        this.anims.set(ops[i].i, { type: 'erase', t0: Util.now(), color: ops[i].from });
      }
      // 依序清除，避免大量同时消失过于突兀
      return ops;
    },

    setCell: function (idx, colorIdx, isDrag) {
      const prev = this.grid[idx];
      if (prev === colorIdx) return false;

      if (this.stroke) this.stroke.ops.push({ i: idx, from: prev, to: colorIdx });
      this.grid[idx] = colorIdx;

      if (colorIdx !== Palette.EMPTY) {
        this.anims.set(idx, { type: 'place', t0: Util.now(), color: colorIdx });
      } else if (prev !== Palette.EMPTY) {
        this.anims.set(idx, { type: 'erase', t0: Util.now(), color: prev });
      }

      // 模板判定：放对/放错反馈
      if (this.target) {
        const want = this.target[idx];
        if (want !== Palette.EMPTY) {
          if (colorIdx === want) {
            if (prev !== want) this.correctCount++;
            if (!isDrag) { Audio.place(colorIdx); this._popSparks(idx, colorIdx, 5); }
            else Audio.placeSoft(colorIdx);
          } else if (colorIdx !== Palette.EMPTY) {
            if (prev === want) this.correctCount--;
            this.wrong.set(idx, Util.now());
            Audio.wrong();
          } else {
            if (prev === want) this.correctCount--;
            Audio.erase();
          }
        } else {
          colorIdx === Palette.EMPTY ? Audio.erase() : (isDrag ? Audio.placeSoft(colorIdx) : Audio.place(colorIdx));
        }
      } else {
        if (colorIdx === Palette.EMPTY) Audio.erase();
        else if (isDrag) Audio.placeSoft(colorIdx);
        else Audio.place(colorIdx);
      }

      if (this.opts.onCellResult) this.opts.onCellResult(idx, this.target ? this.target[idx] === colorIdx : true);
      return true;
    },

    _popSparks: function (idx, colorIdx, n) {
      if (this.sparks.length > 70) return;
      const col = idx % this.size, row = (idx / this.size) | 0;
      const x = this.ox + (col + 0.5) * this.cell;
      const y = this.oy + (row + 0.5) * this.cell;
      const hex = Palette.hex(colorIdx) || '#fff';
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.02 + Math.random() * 0.05;
        this.sparks.push({
          x: x, y: y, vx: Math.cos(a) * sp * this.cell,
          vy: Math.sin(a) * sp * this.cell - 0.02 * this.cell,
          r: this.cell * (0.06 + Math.random() * 0.07),
          t0: Util.now(), life: 420 + Math.random() * 240, c: hex
        });
      }
    },

    _recomputeProgress: function () {
      if (!this.target) { this.correctCount = 0; return; }
      let c = 0;
      for (let i = 0; i < this.target.length; i++) {
        const t = this.target[i];
        if (t !== Palette.EMPTY && this.grid[i] === t) c++;
      }
      this.correctCount = c;
      const done = this.correctCount === this.targetTotal && this.targetTotal > 0;
      if (done && !this.completed) {
        this.completed = true;
        if (!this._celebrated) { this._celebrated = true; this._celebrate(); }
      } else if (!done) {
        this.completed = false;
      }
    },

    getProgress: function () {
      if (!this.target) return { total: 0, done: 0, pct: 0 };
      const t = this.targetTotal || 1;
      return {
        total: this.targetTotal,
        done: this.correctCount,
        pct: Math.round(this.correctCount / t * 100)
      };
    },

    filledCount: function () {
      let n = 0;
      for (let i = 0; i < this.grid.length; i++) if (this.grid[i] !== Palette.EMPTY) n++;
      return n;
    },

    _celebrate: function () {
      Audio.complete();
      const cx = this.canvas.clientWidth / 2, cy = this.canvas.clientHeight / 2;
      const hexes = this.templateColors().slice(0, 8);
      for (let k = 0; k < 90; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.03 + Math.random() * 0.10;
        this.sparks.push({
          x: cx, y: cy,
          vx: Math.cos(a) * sp * 260,
          vy: Math.sin(a) * sp * 260 - 40,
          r: 3 + Math.random() * 5,
          t0: Util.now(), life: 900 + Math.random() * 700,
          c: hexes.length ? Palette.hex(hexes[(Math.random() * hexes.length) | 0]) : '#F5A2B8'
        });
      }
      this.requestRender();
      if (this.opts.onComplete) setTimeout(this.opts.onComplete, 260);
    },

    _notify: function () {
      if (this.opts.onChange) this.opts.onChange(this);
    },

    /* ==================== 坐标与视图 ==================== */

    resize: function () {
      const w = Math.max(1, this.canvas.clientWidth | 0);
      const h = Math.max(1, this.canvas.clientHeight | 0);
      this.dpr = Math.min(global.devicePixelRatio || 1, 3);
      this._vw = w; this._vh = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this._constrainPan();
      this.requestRender();
    },

    boardPixelSize: function () { return this.size * this.cell; },

    fit: function (margin) {
      const m = margin == null ? 0.9 : margin;
      const w = this._vw || this.canvas.clientWidth;
      const h = this._vh || this.canvas.clientHeight;
      const c = Math.floor(Math.min(w, h) * m / this.size);
      this.cell = Util.clamp(c, CELL_MIN, CELL_MAX);
      const bw = this.boardPixelSize();
      this.ox = Math.round((w - bw) / 2);
      this.oy = Math.round((h - bw) / 2);
      this._constrainPan();
      this.requestRender();
    },

    _constrainPan: function () {
      const w = this._vw || this.canvas.clientWidth || 0;
      const h = this._vh || this.canvas.clientHeight || 0;
      const bw = this.boardPixelSize();
      const slackX = Math.min(w * 0.55, Math.max(60, bw * 0.5));
      const slackY = Math.min(h * 0.55, Math.max(60, bw * 0.5));
      const minOx = w - bw - slackX, maxOx = slackX;
      const minOy = h - bw - slackY, maxOy = slackY;
      this.ox = Util.clamp(this.ox, Math.min(minOx, maxOx), Math.max(minOx, maxOx));
      this.oy = Util.clamp(this.oy, Math.min(minOy, maxOy), Math.max(minOy, maxOy));
    },

    zoomAt: function (factor, ax, ay) {
      const ax0 = ax == null ? (this._vw || 0) / 2 : ax;
      const ay0 = ay == null ? (this._vh || 0) / 2 : ay;
      const bx = (ax0 - this.ox) / this.cell;
      const by = (ay0 - this.oy) / this.cell;
      const next = Util.clamp(this.cell * factor, CELL_MIN, CELL_MAX);
      if (Math.abs(next - this.cell) < 0.01) return;
      this.cell = next;
      this.ox = ax0 - bx * this.cell;
      this.oy = ay0 - by * this.cell;
      this._constrainPan();
      this.requestRender();
    },

    pan: function (dx, dy) {
      this.ox += dx; this.oy += dy;
      this._constrainPan();
      this.requestRender();
    },

    cellAt: function (px, py) {
      const col = Math.floor((px - this.ox) / this.cell);
      const row = Math.floor((py - this.oy) / this.cell);
      if (col < 0 || row < 0 || col >= this.size || row >= this.size) return -1;
      return row * this.size + col;
    },

    /* ==================== 交互 ==================== */

    setTool: function (t) { this.tool = t; this.requestRender(); },
    setColor: function (i) { this.color = i; },
    setInteractive: function (v) { this.interactive = v; },
    setSpace: function (v) { this.spaceDown = v; },

    _bind: function () {
      const self = this;
      const cv = this.canvas;

      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      cv.addEventListener('pointerdown', function (e) {
        const tr = TR();
        if (tr) tr.log({ ev: 'pointerdown', id: e.pointerId, button: e.button, buttons: e.buttons,
                         cx: Math.round(e.clientX), cy: Math.round(e.clientY),
                         interactive: self.interactive, tool: self.tool, space: self.spaceDown, pointers: self.pointers.size });
        if (!self.interactive) return;
        // 阻止 iOS 长按弹出「拷贝/查询」菜单，并确保后续能收到 pointerup
        try { e.preventDefault(); } catch (err) { /* ignore */ }
        cv.setPointerCapture(e.pointerId);
        self.pointers.set(e.pointerId, self._pt(e));

        if (self.pointers.size === 2) {
          // 双指：缩放 / 平移
          const arr = Array.from(self.pointers.values());
          self.pinch = {
            d: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y),
            cx: (arr[0].x + arr[1].x) / 2, cy: (arr[0].y + arr[1].y) / 2,
            cell: self.cell
          };
          // 第二指落下前可能已经落下过一颗豆（浏览器会为每个触点单独派发 pointerdown）。
          // 只要这一笔还是「本帧刚落下的单颗豆」，就判定为捏合缩放误触，直接收回。
          self._cancelStroke();
          return;
        }

        const isErase = e.button === 2 || e.button === 1 || self.tool === 'erase' || self.spaceDown;
        if (self.spaceDown || self.tool === 'move') {
          self.panning = true;
          return;
        }
        if (self.tool === 'pick') { self._pickAt(e); return; }
        self.beginStroke(e, isErase ? Palette.EMPTY : self.color);
      });

      cv.addEventListener('pointermove', function (e) {
        if (!self.interactive) return;
        if (!self.pointers.has(e.pointerId)) return;
        const prev = self.pointers.get(e.pointerId);
        const cur = self._pt(e);
        self.pointers.set(e.pointerId, cur);

        if (self.pinch && self.pointers.size >= 2) {
          const arr = Array.from(self.pointers.values());
          const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
          if (self.pinch.d > 4) {
            const cx = (arr[0].x + arr[1].x) / 2, cy = (arr[0].y + arr[1].y) / 2;
            const next = Util.clamp(self.pinch.cell * (d / self.pinch.d), CELL_MIN, CELL_MAX);
            const bx = (self.pinch.cx - self.ox) / self.cell;
            const by = (self.pinch.cy - self.oy) / self.cell;
            self.cell = next;
            self.ox = cx - bx * self.cell;
            self.oy = cy - by * self.cell;
            self.pinch.d = d; self.pinch.cell = next; self.pinch.cx = cx; self.pinch.cy = cy;
            self._constrainPan();
            self.requestRender();
          }
          return;
        }

        if (self.panning) {
          self.pan(cur.x - prev.x, cur.y - prev.y);
          return;
        }
        if (self.stroke) self.continueStroke(e);
      });

      const endPointer = function (e) {
        if (TR()) TR().log({ ev: 'pointerup', id: e.pointerId, remaining: self.pointers.size - 1, grid: self.lastCell != null ? self.grid[self.lastCell] : null });
        self.pointers.delete(e.pointerId);
        if (self.pointers.size < 2) self.pinch = null;
        if (self.pointers.size === 0) {
          self.panning = false;
          self.endStroke();
        }
        try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      };
      cv.addEventListener('pointerup', endPointer);
      cv.addEventListener('pointercancel', endPointer);

      cv.addEventListener('wheel', function (e) {
        if (!self.interactive) return;
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const f = Math.pow(0.9985, e.deltaY);
        self.zoomAt(f, e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
    },

    _pt: function (e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    },

    _pickAt: function (e) {
      const p = this._pt(e);
      const idx = this.cellAt(p.x, p.y);
      if (idx < 0) return;
      const c = this.grid[idx];
      if (c === Palette.EMPTY) return;
      Audio.tap();
      if (this.opts.onPickColor) this.opts.onPickColor(c);
    },

    beginStroke: function (e, colorIdx) {
      const p = this._pt(e);
      const idx = this.cellAt(p.x, p.y);
      const tr = TR();
      if (tr) tr.log({ ev: 'cellAt', px: Math.round(p.x), py: Math.round(p.y), idx: idx,
                       ox: this.ox, oy: this.oy, cell: this.cell, size: this.size, iw: this.canvas.clientWidth, ih: this.canvas.clientHeight });
      if (idx < 0) { if (tr) tr.log({ ev: 'cellAt-miss', idx: idx }); return; }
      this.stroke = { color: colorIdx, ops: [], lastIdx: -1 };
      this.lastCell = idx;
      const before = this.grid[idx];
      const pxBefore = tr ? tr.sampleCell(idx) : null;
      this.setCell(idx, colorIdx, false);
      if (tr) tr.log({ ev: 'setCell', idx: idx, before: before, after: this.grid[idx], anims: this.anims.size, pxBefore: pxBefore });
      this.paintCount = 1;
      // 首触必须当帧可见：立刻绘制，不等下一次 rAF 回调
      this._paintNow();
      if (tr) {
        const pxAfter = tr.sampleCell(idx);
        tr.log({ ev: 'afterPaintNow', idx: idx, grid: this.grid[idx], px: pxAfter,
                 pixelDiff: tr.pixelDiff(pxBefore, pxAfter), raf: this._raf, drewIdx: tr.frame ? tr.frame.drew.slice(0, 40) : [] });
      }
      this._notify();
    },

    continueStroke: function (e) {
      const p = this._pt(e);
      const idx = this.cellAt(p.x, p.y);
      if (idx < 0) { this.lastCell = null; return; }
      const colorIdx = this.stroke.color;
      if (this.lastCell != null && this.lastCell >= 0 && this.lastCell !== idx) {
        // 快速拖动时补齐两点之间的格子（ Bresenham ）
        const a = this.lastCell, b = idx;
        const x0 = a % this.size, y0 = (a / this.size) | 0;
        const x1 = b % this.size, y1 = (b / this.size) | 0;
        this._line(x0, y0, x1, y1, function (cx, cy) {
          const i = cy * this.size + cx;
          this.setCell(i, colorIdx, true);
          this.paintCount++;
        }.bind(this));
      } else if (this.lastCell !== idx) {
        this.setCell(idx, colorIdx, true);
        this.paintCount++;
      }
      this.lastCell = idx;
      this._recomputeProgress();
      // 拖动同样当帧出豆：代价 O(移动经过的格子数)，只画主画布，不做任何 UI / 存储工作
      this._paintNow();
      this._notify();
    },

    /** 撤销本次笔画中已放下的豆（仅用于双指缩放把误触豆收回） */
    _cancelStroke: function () {
      const st = this.stroke;
      this.stroke = null;
      this.lastCell = null;
      this.paintCount = 0;
      if (!st || !st.ops.length) return;
      const ops = st.ops;
      // 直接回滚 grid，不入历史栈（这一下本来就不算一次编辑）
      for (let i = 0; i < ops.length; i++) {
        this.grid[ops[i].i] = ops[i].from;
        this.anims.delete(ops[i].i);
        if (ops[i].to !== Palette.EMPTY) this.wrong.delete(ops[i].i);
      }
      this._recomputeProgress();
      this._paintNow();
    },

    endStroke: function () {
      if (!this.stroke) return;
      const tr = TR();
      const ops = this.stroke.ops;
      const idx = this.lastCell;
      this.stroke = null;
      this.lastCell = null;
      if (ops.length) {
        this._pushOps(ops);
        this._recomputeProgress();
      }
      if (tr) tr.log({ ev: 'endStroke', ops: ops.length, idx: idx,
                       grid: (idx != null && idx >= 0) ? this.grid[idx] : null,
                       px: (idx != null && idx >= 0) ? tr.sampleCell(idx) : null });
      this.requestRender();
      this._notify();
    },

    _line: function (x0, y0, x1, y1, cb) {
      let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let guard = 0;
      while (guard++ < 4096) {
        cb(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },

    /* ==================== 渲染 ==================== */

    requestRender: function () {
      if (this._raf) { if (TR()) TR().log({ ev: 'requestRender-earlyReturn', raf: this._raf }); return; }
      const self = this;
      this._raf = requestAnimationFrame(function (t) {
        self._raf = 0;
        self.render(t);
      });
      if (TR()) TR().log({ ev: 'requestRender-scheduled', raf: this._raf });
    },

    /**
     * 首触即时反馈：立即同步绘制一帧。
     * 只负责把「当前 grid / anims」画到画布上，不含任何 UI 或存储工作。
     *
     * 安全写法（FIX01-R1）：
     *   - render 抛异常时【绝不】取消已排队的 rAF 帧，并让异常可见（console.error）。
     *     旧实现 `try{render}catch{}` + 无条件 cancel，会精确制造
     *     「点了没反应、停下来也永远不出现、下一次点击才恢复」的死画面。
     *   - 仅当本次同步绘制成功、且没有后续动画帧要画（needMore=false）时，
     *     才吸收掉此前已排队的那一帧（它只会重画同一张静态画面）。
     */
    _paintNow: function () {
      const tr = TR();
      const rafBefore = this._raf;
      let errMsg = null;
      let needMore = false;
      try {
        needMore = this.render(Util.now());
      } catch (err) {
        errMsg = (err && err.message) || String(err);
        if (global.console && global.console.error) {
          global.console.error('[BEADY] 首触同步绘制失败（已保留排队帧，不打断输入）:', err);
        }
        if (tr) tr.log({ ev: 'PAINT_ERROR', msg: errMsg, where: (err && err.stack ? String(err.stack).split('\n').slice(1, 3).join(' | ') : '') });
      }
      const rafAfterRender = this._raf;
      let cancelled = false;
      if (!errMsg && !needMore && rafBefore && this._raf === rafBefore) {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
        cancelled = true;
      }
      if (tr) tr.log({ ev: 'paintNow', rafBefore: rafBefore, rafAfterRender: rafAfterRender,
                       needMore: needMore, cancelled: cancelled, rafEnd: this._raf, err: errMsg });
    },

    _layerNeeded: function () {
      return this.size + '|' + Math.round(this.cell * 2) + '|' + this.dpr + '|' + (this.showGhost ? 1 : 0) + '|' + (this.target ? 1 : 0);
    },

    _buildLayer: function () {
      const key = this._layerNeeded();
      if (this._layerKey === key && this._layer) return this._layer;

      const size = this.size, cell = this.cell, dpr = this.dpr;
      const u = cell * dpr;                 // 设备像素 / 格
      const S = Math.max(1, Math.round(size * u));
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');

      const rad = Math.max(6, Math.min(u * 0.9, 22 * dpr));

      // 板面：米白半透明塑料
      const g = ctx.createLinearGradient(0, 0, S * 0.35, S);
      g.addColorStop(0, '#FCF8EE');
      g.addColorStop(0.55, '#F6EFE0');
      g.addColorStop(1, '#EFE6D2');
      Sprites.roundRect(ctx, 0, 0, S, S, rad);
      ctx.fillStyle = g;
      ctx.fill();

      // 板面内缘高光 + 外边框
      ctx.save();
      Sprites.roundRect(ctx, 0, 0, S, S, rad);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, dpr * 2);
      Sprites.roundRect(ctx, dpr, dpr, S - 2 * dpr, S - 2 * dpr, rad - dpr);
      ctx.stroke();

      // 格子网格（极淡）
      ctx.strokeStyle = 'rgba(120,100,70,0.055)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      for (let i = 1; i < size; i++) {
        const p = Math.round(i * u) + 0.5;
        ctx.moveTo(p, 0); ctx.lineTo(p, S);
        ctx.moveTo(0, p); ctx.lineTo(S, p);
      }
      ctx.stroke();

      // 插针：每格中心一个小柱，带下方阴影与右上高光
      const pr = Math.max(1, u * 0.085);
      for (let r0 = 0; r0 < size; r0++) {
        for (let c0 = 0; c0 < size; c0++) {
          const x = (c0 + 0.5) * u, y = (r0 + 0.5) * u;
          ctx.beginPath();
          ctx.arc(x + pr * 0.25, y + pr * 0.35, pr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(90,72,48,0.13)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, pr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.72)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(120,102,74,0.22)';
          ctx.lineWidth = Math.max(0.6, dpr);
          ctx.stroke();
        }
      }

      // 模板目标色提示（非常淡）
      if (this.target && this.showGhost) {
        for (let r0 = 0; r0 < size; r0++) {
          for (let c0 = 0; c0 < size; c0++) {
            const i = r0 * size + c0;
            const t = this.target[i];
            if (t === Palette.EMPTY) continue;
            const hex = Palette.hex(t);
            if (!hex) continue;
            const inset = u * 0.14;
            Sprites.roundRect(ctx, c0 * u + inset, r0 * u + inset, u - inset * 2, u - inset * 2, u * 0.22);
            ctx.fillStyle = Util.rgba(hex, 0.17);
            ctx.fill();
            ctx.strokeStyle = Util.rgba(hex, 0.26);
            ctx.lineWidth = Math.max(0.6, dpr);
            ctx.stroke();
          }
        }
      }

      ctx.restore();

      // 板框
      Sprites.roundRect(ctx, 0.5, 0.5, S - 1, S - 1, rad);
      ctx.strokeStyle = 'rgba(190,172,140,0.75)';
      ctx.lineWidth = Math.max(1, dpr * 1.2);
      ctx.stroke();

      this._layer = cv;
      this._layerKey = key;
      return cv;
    },

    /** 某格当前的熨烫融合度 0..1 */
    fuseAt: function (col, row) {
      if (!this.iron) return this.ironed ? 1 : 0;
      const x = this.ox + (col + 0.5) * this.cell;
      const passed = this.iron.x - x;
      const span = Math.max(18, this.cell * 2.4);
      return smoothstep(passed / span);
    },

    render: function (now) {
      const tr = TR();
      if (tr) { tr._seq = (tr._seq || 0) + 1; tr.frameStart(tr._seq); }
      const ctx = this.ctx, dpr = this.dpr;
      const W = this.canvas.width, H = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const t = now || Util.now();
      const size = this.size, cell = this.cell;

      // 1) 底板
      const layer = this._buildLayer();
      const bw = size * cell;
      ctx.save();
      ctx.shadowColor = 'rgba(120,98,64,0.22)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      Sprites.roundRect(ctx, this.ox, this.oy, bw, bw, Math.max(6, Math.min(cell * 0.9, 22)));
      ctx.fillStyle = '#EFE6D2';
      ctx.fill();
      ctx.restore();
      ctx.drawImage(layer, this.ox, this.oy, bw, bw);

      // 2) 静态拼豆
      let needMore = false;
      const cellDev = cell * dpr;
      for (let i = 0; i < this.grid.length; i++) {
        const c = this.grid[i];
        if (c === Palette.EMPTY) continue;
        // 正在播放动画的格子由下方第 3 步单独绘制；但【动画已过期】的格子必须在这里补画。
        // 否则「动画过期的那一帧」会被上下两趟同时跳过：静态趟因 anims.has(i) 跳过、
        // 动画趟因 el >= 时长 跳过，而 anims.delete 在该帧末尾才发生 —— 于是该帧
        // clearRect 之后什么都没画；若此后没有新的渲染，豆子就永久消失
        // （正是「首次单击无效 / 停下来也不出现 / 再点一次才出现」的根因）。
        const a = this.anims.get(i);
        if (a) {
          const dur = a.type === 'place' ? PLACE_MS : ERASE_MS;
          if (t - a.t0 < dur) continue;
        }
        if (tr) tr.drew(i);
        this._drawCell(ctx, i, cell, cellDev);
      }

      // 3) 动画中的拼豆
      //    首触即时反馈：豆子第一帧就「已经在那里」了。
      //    起始 scale/alpha 都接近常态，之后只做轻微的 pop 与落定震动；
      //    没有从空中掉下来的过程，所以不存在「第一下看不见」的观感。
      const expired = [];
      this.anims.forEach(function (a, i) {
        const el = t - a.t0;
        if (a.type === 'place') {
          if (el >= PLACE_MS) { expired.push(i); return; }
          needMore = true;
          if (tr) tr.drew(i);
          const q = Util.clamp(el / PLACE_MS, 0, 1);
          const col = i % size, row = (i / size) | 0;
          const cx = this.ox + col * cell, cy = this.oy + row * cell;
          // 弹性缩放：0.90 → 约 1.04 → 1.00
          const scale = 1 + PLACE_POP * Math.sin(Math.PI * Math.pow(q, 0.7));
          // 极轻微的落定下沉，模拟「按下去」的手感（最大约 0.045 格）
          const dy = PLACE_SETTLE * cell * Math.sin(Math.PI * q);
          this._drawSpriteAt(ctx, a.color, cx, cy, cell, cellDev, scale, dy);
        } else {
          if (el >= ERASE_MS) { expired.push(i); return; }
          needMore = true;
          const p = el / ERASE_MS;
          const col = i % size, row = (i / size) | 0;
          const cx = this.ox + col * cell, cy = this.oy + row * cell;
          const scale = 1 - 0.85 * easeOutCubic(p);
          const dy = -easeOutCubic(p) * cell * 0.42;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          this._drawSpriteAt(ctx, a.color, cx, cy, cell, cellDev, scale, dy);
          ctx.restore();
        }
      }, this);
      expired.forEach(function (i) { this.anims.delete(i); }, this);

      // 4) 放错色红框
      if (this.wrong.size) {
        const del = [];
        this.wrong.forEach(function (t0, i) {
          const el = t - t0;
          if (el >= WRONG_MS) { del.push(i); return; }
          needMore = true;
          const col = i % size, row = (i / size) | 0;
          const x = this.ox + col * cell, y = this.oy + row * cell;
          const a = (1 - el / WRONG_MS) * 0.95;
          Sprites.roundRect(ctx, x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.2);
          ctx.strokeStyle = 'rgba(232,74,66,' + a.toFixed(3) + ')';
          ctx.lineWidth = Math.max(1.5, cell * 0.1);
          ctx.stroke();
        }, this);
        del.forEach(function (i) { this.wrong.delete(i); }, this);
      }

      // 5) 粒子
      if (this.sparks.length) {
        needMore = true;
        const keep = [];
        for (let k = 0; k < this.sparks.length; k++) {
          const s = this.sparks[k];
          const el = t - s.t0;
          if (el >= s.life) continue;
          const p = el / s.life;
          const x = s.x + s.vx * el;
          const y = s.y + s.vy * el + 0.00022 * el * el;
          ctx.globalAlpha = Util.clamp(1 - p * 1.1, 0, 1);
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.5, s.r * (1 - p * 0.5)), 0, Math.PI * 2);
          ctx.fillStyle = s.c;
          ctx.fill();
          keep.push(s);
        }
        ctx.globalAlpha = 1;
        this.sparks = keep;
      }

      // 6) 熨烫覆盖层
      if (this.iron) { this._renderIron(ctx, t); needMore = true; }

      if (tr) tr.log({ ev: 'render', seq: tr._seq, size: size, cell: cell, ox: this.ox, oy: this.oy,
                       drewN: tr.frame ? tr.frame.drew.length : 0, drewIdx: tr.frame ? tr.frame.drew.slice(0, 40) : [],
                       needMore: needMore, layerKey: this._layerKey, cw: this.canvas.width, ch: this.canvas.height });

      if (needMore) this.requestRender();
      return needMore;
    },

    _drawSpriteAt: function (ctx, colorIdx, cx, cy, cell, cellDev, scale, dy) {
      const grow = (scale - 1) * cell;
      const x = cx + cell / 2 - (cell * scale) / 2;
      const y = cy + cell / 2 - (cell * scale) / 2 + (dy || 0);
      const f = this.fuseAt(((cx - this.ox) / cell) | 0, ((cy - this.oy) / cell) | 0);
      if (f > 0 && f < 1) {
        ctx.save();
        ctx.globalAlpha *= (1 - f * 0.85);
        Sprites.draw(ctx, colorIdx, 'bead', x + grow * 0.06, y + grow * 0.06, cell * scale * (1 - 0.05 * f));
        ctx.restore();
        ctx.save();
        ctx.globalAlpha *= f;
        Sprites.draw(ctx, colorIdx, 'fused', x, y, cell * scale);
        ctx.restore();
        // 融化瞬间的柔光
        ctx.save();
        ctx.globalAlpha = Math.sin(Math.PI * f) * 0.28;
        Sprites.draw(ctx, colorIdx, 'fused', x, y, cell * scale);
        ctx.restore();
      } else if (f >= 1) {
        Sprites.draw(ctx, colorIdx, 'fused', x, y, cell * scale);
      } else {
        Sprites.draw(ctx, colorIdx, 'bead', x, y, cell * scale);
      }
    },

    _drawCell: function (ctx, i, cell, cellDev) {
      const c = this.grid[i];
      if (c === Palette.EMPTY) return;
      const size = this.size;
      const col = i % size, row = (i / size) | 0;
      const x = this.ox + col * cell, y = this.oy + row * cell;
      const f = this.fuseAt(col, row);
      if (f > 0 && f < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - f * 0.85;
        Sprites.draw(ctx, c, 'bead', x + cell * 0.03 * f, y + cell * 0.03 * f, cell * (1 - 0.05 * f));
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = f;
        Sprites.draw(ctx, c, 'fused', x, y, cell);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = Math.sin(Math.PI * f) * 0.28;
        Sprites.draw(ctx, c, 'fused', x, y, cell);
        ctx.restore();
      } else if (f >= 1) {
        Sprites.draw(ctx, c, 'fused', x, y, cell);
      } else {
        Sprites.draw(ctx, c, 'bead', x, y, cell);
      }
    },

    /* ==================== 熨烫 ==================== */

    /**
     * 播放熨烫动画。
     * @returns {Promise} 完成时 resolve
     */
    startIron: function () {
      if (this.ironing) return Promise.resolve();
      const self = this;
      this.ironing = true;
      this.setInteractive(false);
      const bw = this.boardPixelSize();
      this.iron = {
        t0: Util.now(),
        phase: 'paper',
        p: 0,                       // 进度：0~1，首帧渲染前必须先有值
        x: this.ox - Math.max(60, bw * 0.22),
        y: 0,
        stopSound: null,
        steam: []
      };
      const stop = Audio.ironStart();
      this.iron.stopSound = stop;

      return new Promise(function (resolve) {
        const PAPER = 700, IRON = Math.min(4200, Math.max(2600, bw * 9)), LIFT = 700;
        const self2 = self;
        function step() {
          const el = Util.now() - self.iron.t0;
          if (el < PAPER) {
            self.iron.phase = 'paper';
            self.iron.p = el / PAPER;
          } else if (el < PAPER + IRON) {
            if (self.iron.phase === 'paper' && self.iron.stopSound) { /* 音效在 paper 结束前已启动 */ }
            self.iron.phase = 'iron';
            const q = (el - PAPER) / IRON;
            // 缓入缓出，模拟手推熨斗
            const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
            self.iron.x = self.ox - Math.max(60, bw * 0.22) + e * (bw + Math.max(120, bw * 0.44));
            self.iron.p = q;
          } else if (el < PAPER + IRON + LIFT) {
            self.iron.phase = 'lift';
            self.iron.p = (el - PAPER - IRON) / LIFT;
          } else {
            self.iron = null;
            self.ironing = false;
            self.ironed = true;
            if (self.iron && self.iron.stopSound) { /* noop */ }
            self.setInteractive(true);
            self.requestRender();
            if (self.opts.onIronDone) self.opts.onIronDone();
            resolve();
            return;
          }
          self.requestRender();
          requestAnimationFrame(step);
        }
        // 保证每帧都有动画（渲染循环依赖 dirty / needMore）
        self._ironTick = setInterval(function () { self.requestRender(); }, 32);
        requestAnimationFrame(step);
        setTimeout(function () {
          clearInterval(self._ironTick);
          // 兜底：因页面切后台等极端情况错过相位推进时，别让熨斗永远卡在画板渲染里
          if (self.iron) {
            if (self.iron.stopSound) { self.iron.stopSound(); self.iron.stopSound = null; }
            self.iron = null;
            self.ironing = false;
            self.ironed = true;
            self.setInteractive(true);
            self.requestRender();
          }
        }, PAPER + IRON + LIFT + 2500);
        return;
      });
    },

    _renderIron: function (ctx, t) {
      const ir = this.iron;
      const bw = this.boardPixelSize();
      const bx = this.ox, by = this.oy;

      // 烘焙纸：半透明，带一点点纤维纹理感
      if (ir.phase === 'paper') {
        const a = Util.clamp(ir.p, 0, 1);
        const yy = (1 - easeOutCubic(a)) * -bw * 0.25;
        ctx.save();
        ctx.globalAlpha = a * 0.72;
        Sprites.roundRect(ctx, bx - 8, by - 8 + yy, bw + 16, bw + 16, 12);
        const pg = ctx.createLinearGradient(bx, by + yy, bx, by + bw + yy);
        pg.addColorStop(0, 'rgba(255,255,255,0.98)');
        pg.addColorStop(1, 'rgba(246,242,232,0.92)');
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,190,170,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      } else if (ir.phase === 'iron' || ir.phase === 'lift') {
        const lift = ir.phase === 'lift' ? ir.p : 0;
        const a = ir.phase === 'lift' ? (1 - lift) : 1;
        ctx.save();
        ctx.globalAlpha = 0.72 * a;
        const yy = ir.phase === 'lift' ? -lift * bw * 0.35 : 0;
        Sprites.roundRect(ctx, bx - 8, by - 8 + yy, bw + 16, bw + 16, 12);
        const pg = ctx.createLinearGradient(bx, by + yy, bx, by + bw + yy);
        pg.addColorStop(0, 'rgba(255,255,255,0.98)');
        pg.addColorStop(1, 'rgba(246,242,232,0.92)');
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,190,170,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 熨斗经过处的微微热反光
        if (ir.phase === 'iron') {
          ctx.globalAlpha = 0.30;
          const hg = ctx.createLinearGradient(ir.x - bw * 0.18, 0, ir.x + bw * 0.06, 0);
          hg.addColorStop(0, 'rgba(255,236,196,0)');
          hg.addColorStop(0.6, 'rgba(255,232,190,0.85)');
          hg.addColorStop(1, 'rgba(255,246,225,0)');
          ctx.fillStyle = hg;
          ctx.fillRect(ir.x - bw * 0.18, by + yy, bw * 0.24, bw);
        }
        ctx.restore();

        if (ir.phase === 'iron') this._drawIron(ctx, ir, t, bx, by, bw);
      }
    },

    _drawIron: function (ctx, ir, t, bx, by, bw) {
      const w = Util.clamp(bw * 0.34, 84, 210);
      const h = w * 0.46;
      const x = ir.x, y = by + bw * 0.5 - h;

      // 蒸汽粒子
      if (!ir._t2 || t - ir._t2 > 70) {
        ir._t2 = t;
        ir.steam.push({ x: x + w * 0.62, y: y + h * 0.1, t0: t, life: 900, r: h * 0.10 + Math.random() * h * 0.1 });
      }
      ctx.save();
      for (let k = ir.steam.length - 1; k >= 0; k--) {
        const s = ir.steam[k];
        const el = t - s.t0;
        if (el > s.life) { ir.steam.splice(k, 1); continue; }
        const p = el / s.life;
        ctx.globalAlpha = 0.34 * (1 - p);
        ctx.beginPath();
        ctx.arc(s.x + Math.sin(p * 6) * w * 0.05, s.y - p * h * 1.4, s.r * (1 + p * 1.6), 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.05);

      // 投影
      ctx.save();
      ctx.globalAlpha = 0.20;
      Sprites.roundRect(ctx, -w * 0.06, h * 0.86, w * 1.02, h * 0.22, h * 0.12);
      ctx.fillStyle = 'rgba(90,72,48,1)';
      ctx.fill();
      ctx.restore();

      // 底板
      Sprites.roundRect(ctx, 0, h * 0.62, w, h * 0.34, Math.min(10, w * 0.08));
      const bg = ctx.createLinearGradient(0, h * 0.62, 0, h * 0.96);
      bg.addColorStop(0, '#E9EEF3');
      bg.addColorStop(1, '#B9C4CF');
      ctx.fillStyle = bg;
      ctx.fill();

      // 机身
      const bodyPath = function () {
        ctx.beginPath();
        ctx.moveTo(w * 0.06, h * 0.72);
        ctx.quadraticCurveTo(w * 0.02, h * 0.30, w * 0.34, h * 0.22);
        ctx.quadraticCurveTo(w * 0.62, h * 0.14, w * 0.94, h * 0.40);
        ctx.quadraticCurveTo(w * 1.0, h * 0.52, w * 0.86, h * 0.70);
        ctx.closePath();
      };
      bodyPath();
      const bodyG = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.75);
      bodyG.addColorStop(0, '#FFF3E6');
      bodyG.addColorStop(0.5, '#F6D3B0');
      bodyG.addColorStop(1, '#E2B189');
      ctx.fillStyle = bodyG;
      ctx.fill();

      // 把手
      ctx.beginPath();
      ctx.lineWidth = Math.max(6, w * 0.075);
      ctx.strokeStyle = '#C98F66';
      ctx.lineCap = 'round';
      ctx.moveTo(w * 0.22, h * 0.34);
      ctx.quadraticCurveTo(w * 0.42, h * 0.02, w * 0.70, h * 0.26);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(2, w * 0.022);
      ctx.moveTo(w * 0.24, h * 0.32);
      ctx.quadraticCurveTo(w * 0.42, h * 0.06, w * 0.68, h * 0.26);
      ctx.stroke();

      // 机身高光
      ctx.save();
      bodyPath();
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(w * 0.30, h * 0.34, w * 0.22, h * 0.10, -0.15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
      ctx.restore();

      // 温度指示灯
      ctx.beginPath();
      ctx.arc(w * 0.80, h * 0.44, Math.max(2.2, w * 0.026), 0, Math.PI * 2);
      ctx.fillStyle = (Math.floor(t / 320) % 2) ? '#FF8A5B' : '#FFD2A8';
      ctx.fill();

      ctx.restore();
    }
  };

  global.BeadyBoard = BeadyBoard;
})(window);
