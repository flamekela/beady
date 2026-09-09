/* ==========================================================================
 * BEADY · 音效引擎（Web Audio 程序化合成，零音频文件、零 404、零版权风险）
 * --------------------------------------------------------------------------
 * 首次用户手势时才 resume AudioContext，符合浏览器自动播放策略。
 * 不自动播放背景音乐，仅提供交互反馈音。
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = global.BeadyUtil;

  const Audio = {
    enabled: true,
    ctx: null,
    master: null,
    _noiseBuf: null,
    _unlocked: false,

    init: function () {
      if (Audio.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { Audio.enabled = false; return; }
      try {
        Audio.ctx = new AC();
        Audio.master = Audio.ctx.createGain();
        Audio.master.gain.value = 0.5;
        Audio.master.connect(Audio.ctx.destination);
      } catch (e) {
        Audio.enabled = false;
      }
    },

    /** 由任意用户手势调用，解锁音频上下文 */
    unlock: function () {
      Audio.init();
      if (!Audio.ctx) return;
      if (Audio.ctx.state === 'suspended') {
        Audio.ctx.resume().catch(function () {});
      }
      Audio._unlocked = true;
    },

    setEnabled: function (on) {
      Audio.enabled = !!on;
      if (Audio.master) Audio.master.gain.value = on ? 0.5 : 0;
    },

    _ready: function () {
      if (!Audio.enabled) return false;
      if (!Audio.ctx) Audio.init();
      if (!Audio.ctx) return false;
      if (Audio.ctx.state === 'suspended') Audio.ctx.resume().catch(function () {});
      return true;
    },

    /** 白噪声缓冲区（熨烫摩擦声 / 放置颗粒感复用） */
    _noise: function () {
      if (Audio._noiseBuf) return Audio._noiseBuf;
      const len = Math.floor(Audio.ctx.sampleRate * 2);
      const buf = Audio.ctx.createBuffer(1, len, Audio.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      Audio._noiseBuf = buf;
      return buf;
    },

    /** 基础音块：振荡器 + 指数衰减包络 */
    _tone: function (opt) {
      const ctx = Audio.ctx, t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(opt.freq, t0);
      if (opt.freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.freqTo), t0 + opt.dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(opt.vol || 0.2, t0 + (opt.attack || 0.005));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
      osc.connect(gain);
      if (opt.filter) {
        const f = ctx.createBiquadFilter();
        f.type = opt.filter;
        f.frequency.value = opt.filterFreq || 1200;
        gain.connect(f); f.connect(Audio.master);
      } else {
        gain.connect(Audio.master);
      }
      osc.start(t0);
      osc.stop(t0 + opt.dur + 0.02);
    },

    /** 噪声爆（带通）——用于"tik"的颗粒感与蒸汽"滋"声 */
    _burst: function (opt) {
      const ctx = Audio.ctx, t0 = ctx.currentTime + (opt.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = Audio._noise();
      src.playbackRate.value = opt.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = opt.filter || 'bandpass';
      f.frequency.setValueAtTime(opt.freq || 1800, t0);
      if (opt.freqTo) f.frequency.linearRampToValueAtTime(opt.freqTo, t0 + opt.dur);
      f.Q.value = opt.q || 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(opt.vol || 0.12, t0 + (opt.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
      src.connect(f); f.connect(g); g.connect(Audio.master);
      src.start(t0);
      src.stop(t0 + opt.dur + 0.05);
    },

    /* ---------------- 具体音事件 ---------------- */

    /** 放置拼豆：清脆 tik，音高随颜色轻微随机变化 */
    place: function (colorIndex) {
      if (!Audio._ready()) return;
      const base = 620 + ((colorIndex || 0) * 37) % 260;
      const jitter = 1 + (Math.random() * 0.08 - 0.04);
      Audio._tone({ type: 'triangle', freq: base * jitter, freqTo: base * 0.72, dur: 0.075, vol: 0.16 });
      Audio._burst({ freq: 2600, freqTo: 1500, dur: 0.045, vol: 0.055, q: 2 });
    },

    /** 拖拽连放的余音（避免每个都一样） */
    placeSoft: function (colorIndex) {
      if (!Audio._ready()) return;
      const base = 520 + ((colorIndex || 0) * 53) % 300;
      Audio._tone({ type: 'triangle', freq: base * (1 + Math.random() * 0.1), freqTo: base * 0.8, dur: 0.05, vol: 0.09 });
    },

    /** 橡皮：轻 pop */
    erase: function () {
      if (!Audio._ready()) return;
      Audio._tone({ type: 'sine', freq: 420, freqTo: 130, dur: 0.11, vol: 0.13 });
      Audio._burst({ freq: 900, freqTo: 320, dur: 0.06, vol: 0.05, q: 1.2 });
    },

    /** 放错颜色：低沉短促的提示（不刺耳） */
    wrong: function () {
      if (!Audio._ready()) return;
      Audio._tone({ type: 'sine', freq: 196, freqTo: 150, dur: 0.16, vol: 0.1, filter: 'lowpass', filterFreq: 700 });
    },

    /** UI 点击 */
    tap: function () {
      if (!Audio._ready()) return;
      Audio._tone({ type: 'sine', freq: 880, freqTo: 1180, dur: 0.06, vol: 0.07 });
    },

    /** 模板/作品完成：舒服的上行琶音 */
    complete: function () {
      if (!Audio._ready()) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach(function (f, i) {
        setTimeout(function () {
          if (!Audio._ready()) return;
          Audio._tone({ type: 'triangle', freq: f, dur: 0.5, vol: 0.15, attack: 0.01 });
          Audio._tone({ type: 'sine', freq: f * 2, dur: 0.32, vol: 0.05, attack: 0.01 });
        }, i * 95);
      });
    },

    /** 熨斗：持续摩擦 + 蒸汽滋声，返回停止函数 */
    ironStart: function () {
      if (!Audio._ready()) return function () {};
      const ctx = Audio.ctx;
      const src = ctx.createBufferSource();
      src.buffer = Audio._noise();
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 780; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.4);
      src.connect(f); f.connect(g); g.connect(Audio.master);
      src.start();

      // 蒸汽"滋——"
      const hiss = setInterval(function () {
        if (!Audio._ready()) return;
        Audio._burst({ freq: 3200 + Math.random() * 1800, freqTo: 1400, dur: 0.28, vol: 0.035, q: 0.9 });
      }, 620);

      let stopped = false;
      return function () {
        if (stopped) return;
        stopped = true;
        clearInterval(hiss);
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
          src.stop(ctx.currentTime + 0.4);
        } catch (e) { /* 已停止 */ }
      };
    }
  };

  global.BeadyAudio = Audio;
})(window);
