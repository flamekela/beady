/* ==========================================================================
 * BEADY · 模板生成器
 * --------------------------------------------------------------------------
 * 用几何图元（椭圆 / 多边形 / 圆环 / 心形隐函数 / 边缘检测描边）绘制 12 个
 * 原创像素图案，输出为 assets/templates/templates.js。
 *
 * 用法： node scripts/build-templates.js [--preview]
 * 为什么这样做：手抄数百行点阵极易出现行宽错误与不对称，几何生成可校验、
 * 可重跑、可扩展（加一个函数就能加一个新模板）。
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

/* ------------------------------ 画布原语 ------------------------------ */
const N = (n) => new Array(n * n).fill('.');
const put = (g, n, x, y, c) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= n || y >= n) return;
  g[y * n + x] = c;
};
const get = (g, n, x, y) => (x < 0 || y < 0 || x >= n || y >= n) ? null : g[y * n + x];

function ellipse(g, n, cx, cy, rx, ry, c) {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) put(g, n, x, y, c);
    }
  }
}
const circle = (g, n, cx, cy, r, c) => ellipse(g, n, cx, cy, r, r, c);

function poly(g, n, pts, c) {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) put(g, n, x, y, c);
    }
  }
}
const tri = (g, n, a, b, c2, c) => poly(g, n, [a, b, c2], c);

function rect(g, n, x0, y0, x1, y1, c) {
  for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
    for (let x = Math.floor(x0); x <= Math.floor(x1); x++) put(g, n, x, y, c);
}

/** 给已填充区域描一圈边（仅最外侧一圈） */
function rim(g, n, c) {
  const copy = g.slice();
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (copy[y * n + x] === '.') continue;
      const nb = [get(copy, n, x - 1, y), get(copy, n, x + 1, y), get(copy, n, x, y - 1), get(copy, n, x, y + 1)];
      if (nb.some((v) => v === '.' || v === null)) put(g, n, x, y, c);
    }
  }
}

/** 星形多边形点集 */
function starPts(cx, cy, rOut, rIn, count, rot) {
  const p = [];
  for (let i = 0; i < count * 2; i++) {
    const a = rot + i * Math.PI / count;
    const r = i % 2 ? rIn : rOut;
    p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return p;
}

/** 心形隐函数 (x²+y²-1)³ - x²y³ = 0，y 轴向上 */
function mathHeart(g, n, cRim, cBody, cHi) {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = (x + 0.5) / n * 2.45 - 1.225;
      const py = 1.32 - (y + 0.5) / n * 2.75;
      const v = Math.pow(px * px + py * py - 1, 3) - px * px * Math.pow(py, 3);
      if (v > 0) continue;
      let c = (-v) < 0.13 ? cRim : cBody;
      const hx = px + 0.50, hy = py - 0.55;
      if (hx * hx + hy * hy < 0.075) c = cHi;
      const gx = px + 0.74, gy = py - 0.44;
      if (gx * gx + gy * gy < 0.026) c = cHi;
      put(g, n, x, y, c);
    }
  }
}

/* ------------------------------ 12 个模板 ------------------------------ */

const BUILD = {

  /* ---------------- 简单组（16×16） ---------------- */

  heart(n) {                                     // 爱心
    const g = N(n);
    mathHeart(g, n, 'r', 'e', 'l');
    return g;
  },

  star(n) {                                      // 星星
    const g = N(n);
    const cx = n / 2, cy = n / 2 + 0.2;
    poly(g, n, starPts(cx, cy, n * 0.455, n * 0.18, 5, -Math.PI / 2), 'z');
    poly(g, n, starPts(cx, cy, n * 0.455 - 1.15, n * 0.18 - 0.5, 5, -Math.PI / 2), 'g');
    put(g, n, cx, cy - n * 0.30, 'n');
    return g;
  },

  smile(n) {                                     // 笑脸
    const g = N(n);
    const cx = n / 2, cy = n / 2 + 0.2;
    circle(g, n, cx, cy, n * 0.43, 'z');
    circle(g, n, cx, cy, n * 0.43 - 1.0, 'g');
    ellipse(g, n, cx - 2.5, cy - 1.4, 0.95, 1.7, 'a');
    ellipse(g, n, cx + 2.5, cy - 1.4, 0.95, 1.7, 'a');
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - (cy + 0.4);
        const r = Math.hypot(dx, dy);
        if (r > n * 0.245 && r < n * 0.31 && dy > 1.3) put(g, n, x, y, 'a');
      }
    }
    put(g, n, cx - 4.6, cy + 1.2, 'l');
    put(g, n, cx + 4.6, cy + 1.2, 'l');
    return g;
  },

  flower(n) {                                    // 小花
    const g = N(n);
    const cx = n / 2, cy = n / 2 + 0.3;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
      const px = cx + Math.cos(a) * n * 0.30, py = cy + Math.sin(a) * n * 0.30;
      circle(g, n, px, py, n * 0.185, 'E');
      circle(g, n, px, py, n * 0.185 - 0.9, 'l');
    }
    circle(g, n, cx, cy, n * 0.185, 'z');
    circle(g, n, cx, cy, n * 0.185 - 0.9, 'g');
    return g;
  },

  /* ---------------- 中等组（24×24） ---------------- */

  cat(n) {                                       // 小猫
    const g = N(n);
    const cx = n / 2;
    // 耳朵（先画，稍后被头部盖住底部）
    tri(g, n, [cx - 7.8, 12.2], [cx - 7.0, 3.8], [cx - 1.4, 8.4], 'v');
    tri(g, n, [cx + 7.8, 12.2], [cx + 7.0, 3.8], [cx + 1.4, 8.4], 'v');
    poly(g, n, [[cx - 6.72, 10.37], [cx - 6.28, 5.75], [cx - 3.2, 8.28]], 'm');
    poly(g, n, [[cx + 6.72, 10.37], [cx + 6.28, 5.75], [cx + 3.2, 8.28]], 'm');
    // 头
    ellipse(g, n, cx, 15.0, 7.7, 6.8, 'v');
    ellipse(g, n, cx, 15.0, 6.9, 6.0, 'f');
    // 眼 / 鼻 / 嘴
    ellipse(g, n, cx - 2.8, 14.2, 1.5, 1.9, 'a');
    ellipse(g, n, cx + 2.8, 14.2, 1.5, 1.9, 'a');
    put(g, n, cx - 3.4, 13.4, 'b'); put(g, n, cx + 2.6, 13.4, 'b');
    tri(g, n, [cx - 0.8, 16.6], [cx + 0.8, 16.6], [cx, 17.8], 'l');
    put(g, n, cx - 1.6, 18.2, 'a'); put(g, n, cx - 0.8, 19.0, 'a');
    put(g, n, cx, 18.4, 'a');
    put(g, n, cx + 0.8, 19.0, 'a'); put(g, n, cx + 1.6, 18.2, 'a');
    // 胡须
    for (let x = 6; x <= 8; x++) { put(g, n, x, 17, 'b'); put(g, n, n - 1 - x, 17, 'b'); }
    for (let x = 6; x <= 8; x++) { put(g, n, x, 19, 'b'); put(g, n, n - 1 - x, 19, 'b'); }
    return g;
  },

  dog(n) {                                       // 小狗
    const g = N(n);
    const cx = n / 2;
    ellipse(g, n, cx, 14.5, 6.6, 6.2, 'I');
    ellipse(g, n, cx, 14.5, 5.9, 5.5, 'v');
    // 垂耳（画在头之后压住两侧，长度不超过下巴）
    ellipse(g, n, cx - 6.8, 15.2, 2.7, 4.9, 'I');
    ellipse(g, n, cx + 6.8, 15.2, 2.7, 4.9, 'I');
    ellipse(g, n, cx - 6.6, 15.4, 1.7, 3.6, 'v');
    ellipse(g, n, cx + 6.6, 15.4, 1.7, 3.6, 'v');
    // 口鼻
    ellipse(g, n, cx, 18.0, 3.5, 2.6, 'w');
    ellipse(g, n, cx, 16.3, 1.7, 1.3, 'a');
    put(g, n, cx, 17.7, 'a');
    put(g, n, cx - 1, 18.7, 'a'); put(g, n, cx, 18.7, 'a'); put(g, n, cx + 1, 18.7, 'a');
    put(g, n, cx, 20.0, 'B');
    // 眼
    ellipse(g, n, cx - 3.0, 13.6, 1.4, 1.7, 'a');
    ellipse(g, n, cx + 3.0, 13.6, 1.4, 1.7, 'a');
    put(g, n, cx - 3.6, 12.8, 'b'); put(g, n, cx + 2.6, 12.8, 'b');
    return g;
  },

  frog(n) {                                      // 青蛙
    const g = N(n);
    const cx = n / 2;
    ellipse(g, n, cx, 16.0, 9.0, 6.2, 't');
    ellipse(g, n, cx, 16.0, 8.2, 5.4, 'h');
    // 凸出的大眼睛
    [-4.6, 4.6].forEach((ox) => {
      const ex = cx + ox, ey = 9.0;
      circle(g, n, ex, ey, 3.9, 't');
      circle(g, n, ex, ey, 3.1, 'b');
      circle(g, n, ex, ey + 0.4, 1.7, 'a');
      put(g, n, ex - 0.7, ey - 0.7, 'b');
    });
    // 大嘴
    for (let x = 5; x <= n - 6; x++) {
      const y = Math.round(17.6 + Math.pow((x + 0.5 - cx) / 6.6, 2) * 1.9);
      put(g, n, x, y, 't');
    }
    put(g, n, cx - 1.4, 14.6, 't');
    put(g, n, cx + 1.4, 14.6, 't');
    return g;
  },

  chick(n) {                                     // 小鸡
    const g = N(n);
    const cx = n / 2;
    // 对称写入：一次调用同时写到左右两格，杜绝取整造成的不对称
    const mp = (x, y, c) => { put(g, n, x, y, c); put(g, n, n - 1 - x, y, c); };
    circle(g, n, cx, 14.8, 7.0, 'z');
    circle(g, n, cx, 14.8, 6.2, 'g');
    // 头顶呆毛
    mp(cx - 3, 7.8, 'z'); mp(cx - 2, 7.0, 'z'); mp(cx - 1, 6.2, 'z');
    // 眼
    circle(g, n, cx - 2.4, 13.4, 1.4, 'a');
    circle(g, n, cx + 2.4, 13.4, 1.4, 'a');
    mp(cx - 4, 12.8, 'b');
    // 嘴
    tri(g, n, [cx - 1.6, 16.0], [cx + 1.6, 16.0], [cx, 18.2], 'f');
    // 腿脚（左右严格成对）
    mp(cx - 4, 21, 'f'); mp(cx - 3, 21, 'f');
    mp(cx - 5, 22, 'f'); mp(cx - 4, 22, 'f'); mp(cx - 3, 22, 'f'); mp(cx - 2, 22, 'f');
    return g;
  },

  /* ---------------- 较复杂组（24×24） ---------------- */

  strawberry(n) {                                // 草莓
    const g = N(n);
    const cx = n / 2;
    tri(g, n, [cx - 7.7, 12.6], [cx + 7.7, 12.6], [cx, 22.0], 'r');
    ellipse(g, n, cx, 12.8, 8.7, 6.5, 'r');
    tri(g, n, [cx - 6.9, 12.6], [cx + 6.9, 12.6], [cx, 21.0], 'e');
    ellipse(g, n, cx, 12.8, 7.9, 5.9, 'e');
    // 籽（只在果肉内部且不贴边时点缀）
    for (let y = 12; y <= 19; y += 2) {
      for (let x = 4; x <= n - 5; x += 3) {
        const px = x + ((y / 2) % 2 ? 1 : 0);
        const around = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
        if (around.every(([dx, dy]) => get(g, n, px + dx, y + dy) === 'e')) put(g, n, px, y, 'g');
      }
    }
    // 叶子
    ellipse(g, n, cx - 3.8, 7.8, 3.8, 1.9, 'G');
    ellipse(g, n, cx + 3.8, 7.8, 3.8, 1.9, 'G');
    ellipse(g, n, cx, 6.6, 2.6, 2.0, 'G');
    rect(g, n, cx - 0.6, 3.0, cx + 0.6, 5.6, 'G');
    ellipse(g, n, cx, 6.8, 1.5, 1.1, 't');
    return g;
  },

  burger(n) {                                    // 汉堡
    const g = N(n);
    const cx = n / 2;
    // 上层面包
    for (let y = 4; y <= 10; y++) for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - cx) / 9.0, dy = (y + 0.5 - 10.8) / 5.6;
      if (dx * dx + dy * dy <= 1) put(g, n, x, y, 'y');
    }
    [-4, 0, 4].forEach((ox) => put(g, n, cx + ox, 6, 'w'));
    put(g, n, cx - 2.5, 8, 'w'); put(g, n, cx + 2.5, 8, 'w');
    // 生菜（两行，深浅交错做出波浪层次）
    for (let x = 3; x <= n - 4; x++) {
      put(g, n, x, 11, 'C');
      put(g, n, x, 12, (Math.floor((x - 3) / 3) % 2) ? 'A' : 'C');
    }
    // 肉饼
    rect(g, n, 3, 13, n - 4, 14, 'I');
    // 下层面包
    for (let y = 16; y <= 19; y++) for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - cx) / 9.2, dy = (y + 0.5 - 16.0) / 3.7;
      if (dx * dx + dy * dy <= 1) put(g, n, x, y, 'y');
    }
    // 芝士 + 流下的边
    rect(g, n, 3, 15, n - 4, 15, 'z');
    [5, 10, 15, 19].forEach((x) => put(g, n, x, 16, 'z'));
    return g;
  },

  ghost(n) {                                     // 小幽灵
    const g = N(n);
    const cx = n / 2, cy = 10.6, R = 7.6;
    for (let x = 0; x < n; x++) {
      // 用镜像下标取距离，保证左右完全对称
      const xm = Math.min(x, n - 1 - x);
      const d = Math.abs(xm + 0.5 - cx);
      const h = R * R - d * d;
      if (h <= 0) continue;
      const top = cy - Math.sqrt(h);
      const phase = Math.floor(d) % 4;
      const bot = 16.4 + ((phase === 1 || phase === 2) ? 1.2 : 0);
      for (let y = Math.ceil(top); y <= Math.floor(bot); y++) put(g, n, x, y, 'b');
    }
    rim(g, n, 'c');
    circle(g, n, cx - 3.0, 11.0, 2.2, 'a');
    circle(g, n, cx + 3.0, 11.0, 2.2, 'a');
    put(g, n, cx - 3.8, 10.2, 'b'); put(g, n, n - 1 - (cx - 3.8), 10.2, 'b');
    ellipse(g, n, cx, 15.0, 2.0, 2.2, 'a');
    put(g, n, cx - 5.2, 13.4, 'm'); put(g, n, n - 1 - (cx - 5.2), 13.4, 'm');
    return g;
  },

  rocket(n) {                                    // 太空火箭
    const g = N(n);
    const cx = n / 2;
    // 尾翼：底边贴在机身上，尖端向外下方，保证与机身连成一体
    tri(g, n, [cx - 2.0, 12.2], [cx - 8.6, 19.8], [cx - 2.0, 19.4], 'e');
    tri(g, n, [cx + 2.0, 12.2], [cx + 8.6, 19.8], [cx + 2.0, 19.4], 'e');
    // 机头
    tri(g, n, [cx, 1.8], [cx - 3.4, 8.8], [cx + 3.4, 8.8], 'e');
    // 机身
    ellipse(g, n, cx, 13.2, 3.9, 6.7, 'F');
    ellipse(g, n, cx, 13.2, 3.1, 6.0, 'H');
    // 舷窗
    circle(g, n, cx, 11.2, 2.7, 'F');
    circle(g, n, cx, 11.2, 2.0, 'p');
    put(g, n, cx - 0.8, 10.4, 'b');
    // 红色环带
    for (let y = 17; y <= 18; y++) for (let x = 0; x < n; x++)
      if (get(g, n, x, y) === 'H') put(g, n, x, y, 'e');
    // 尾焰
    for (let y = 19; y <= 22; y++) {
      const hw = 3.0 * (1 - (y - 19) / 4.4);
      for (let x = 0; x < n; x++) if (Math.abs(x + 0.5 - cx) <= hw) put(g, n, x, y, 'f');
    }
    for (let y = 19; y <= 21; y++) {
      const hw = 1.8 * (1 - (y - 19) / 4.0);
      for (let x = 0; x < n; x++) if (Math.abs(x + 0.5 - cx) <= hw) put(g, n, x, y, 'g');
    }
    return g;
  }
};

/* ------------------------------ 元数据 ------------------------------ */
const META = [
  { id: 'heart_01', name: '爱心', nameEn: 'Little Heart', difficulty: 1, size: 16, fn: 'heart' },
  { id: 'star_01', name: '星星', nameEn: 'Shiny Star', difficulty: 1, size: 16, fn: 'star' },
  { id: 'smile_01', name: '笑脸', nameEn: 'Happy Face', difficulty: 1, size: 16, fn: 'smile' },
  { id: 'flower_01', name: '小花', nameEn: 'Tiny Flower', difficulty: 1, size: 16, fn: 'flower' },
  { id: 'cat_01', name: '小猫', nameEn: 'Sleepy Cat', difficulty: 2, size: 24, fn: 'cat' },
  { id: 'dog_01', name: '小狗', nameEn: 'Loyal Dog', difficulty: 2, size: 24, fn: 'dog' },
  { id: 'frog_01', name: '青蛙', nameEn: 'Happy Frog', difficulty: 2, size: 24, fn: 'frog' },
  { id: 'chick_01', name: '小鸡', nameEn: 'Baby Chick', difficulty: 2, size: 24, fn: 'chick' },
  { id: 'straw_01', name: '草莓', nameEn: 'Sweet Strawberry', difficulty: 3, size: 24, fn: 'strawberry' },
  { id: 'burger_01', name: '汉堡', nameEn: 'Tasty Burger', difficulty: 3, size: 24, fn: 'burger' },
  { id: 'ghost_01', name: '小幽灵', nameEn: 'Tiny Ghost', difficulty: 3, size: 24, fn: 'ghost' },
  { id: 'rocket_01', name: '太空火箭', nameEn: 'Space Rocket', difficulty: 3, size: 24, fn: 'rocket' }
];

/* ------------------------------ 生成 & 校验 ------------------------------ */
const out = [];
let bad = 0;

META.forEach((m) => {
  const grid = BUILD[m.fn](m.size);
  const rows = [];
  for (let y = 0; y < m.size; y++) rows.push(grid.slice(y * m.size, (y + 1) * m.size).join(''));

  const flat = rows.join('');
  const colors = Array.from(new Set(flat.split('').filter((c) => c !== '.')));
  const beads = flat.split('').filter((c) => c !== '.').length;

  let ok = rows.length === m.size;
  rows.forEach((r) => { if (r.length !== m.size) ok = false; });
  if (!ok) { bad++; console.error('  ✗ 行宽错误:', m.id); }

  out.push({
    id: m.id, name: m.name, nameEn: m.nameEn, difficulty: m.difficulty,
    minutes: Math.max(5, Math.min(25, Math.round(beads / 22) + 4)),
    size: m.size, palette: colors, pixels: rows
  });

  console.log('  ' + (ok ? '✓' : '✗') + ' ' + m.id.padEnd(12) + ' size=' + m.size +
    ' 豆=' + String(beads).padStart(3) + ' 色=' + colors.length + ' [' + colors.join('') + ']');
  if (process.argv.indexOf('--preview') >= 0) {
    console.log(rows.map((r) => '      ' + [...r].map((c) => c === '.' ? '  ' : '██').join('')).join('\n'));
    console.log('');
  }
});

const file = '/* BEADY · 模板数据\n' +
  ' * ------------------------------------------------------------------\n' +
  ' * 由 scripts/build-templates.js 生成（原创像素设计，无任何版权 IP）。\n' +
  ' * 新增模板：在脚本里加一个几何绘制函数 + META 条目，重跑即可。\n' +
  ' * 字符含义见 src/core/palette.js（. = 空格不放豆）。\n' +
  ' * ------------------------------------------------------------------ */\n' +
  'window.BEADY_TEMPLATES = ' + JSON.stringify(out, null, 2) + ';\n';

const target = path.join(__dirname, '..', 'assets', 'templates', 'templates.js');
fs.writeFileSync(target, file, 'utf8');
console.log('\n  输出: ' + target);
console.log('  模板数: ' + out.length + ' | 校验失败: ' + bad);
process.exit(bad ? 1 : 0);
