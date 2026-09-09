# CREDITS

本项目的所有可见资产均为本项目自绘 / 程序生成，不依赖任何外部素材，不存在版权风险。

## 1. 拼豆调色板

- 颜色选取参考真实 Perler Beads / Hama Beads / Artkal Beads 实物颜色
- 但 RGB 值是项目组手挑的色彩平衡，与任何厂家产品无对应关系
- 见 `src/core/palette.js`

## 2. 拼豆精灵（珠子形状）

- 自绘：`src/render/sprites.js` 中的 `drawBead` / `drawFused` 函数（径向渐化、暗边、内孔、镜面高光）
- 非任何第三方素材库

## 3. 12 套像素模板

- 全部由 `scripts/build-templates.js` 的几何图元（椭圆 / 多边形 / 心形隐函数 / 边缘描边）生成
- 全部为原创几何设计，**不含任何第三方 IP**：
  - ❌ Pokemon / Mario / Hello Kitty / Disney / Sanrio / Minecraft / 任何动漫角色
  - ✅ 通用几何造型：爱心、星星、笑脸、花、猫、狗、青蛙、小鸡、草莓、汉堡、幽灵、火箭
- 开发者可自由扩展（见 README）

## 4. 首页主视觉（爱心）

- 由 `src/ui/app.js` 中 `heartGrid(n)` 用心形隐函数 `(x²+y²-1)³ - x²y³` 实时计算
- 非任何第三方美术

## 5. 音效

- 全部由 Web Audio API 程序化合成（`src/core/audio.js`）：
  - 放置音（轻 tik）
  - 删除音（pop）
  - 完成琶音
  - 熨烫摩擦 + 蒸汽 hiss
  - UI 点击
- 无任何音频文件，无 404 风险，无版权风险

## 6. 字体

- 全部使用系统字体栈（`system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", ...`）
- 不加载任何外部 Web Font
- 不依赖任何商用字体

## 7. 图标（SVG）

- 全部由 `src/ui/icons.js` 手写 SVG 描边图标
- 灵感来源：Lucide Icons（MIT License）的图标风格（几何描边轮廓），但每一笔的 path data 都是为本项目重写，并非直接复制
- 因此本项目无任何"基于 Lucide Icons © Cole Bemis 等"的归属要求

## 8. 第三方依赖

- 运行时：**0**
- 开发期：仅本机 `node`（≥ 18）执行模板生成器与本地静态服务器
- 测试期：通过本机已安装的 Chromium Headless Shell 直接驱动（详见 `_tools/cdp-smoke.js`，该脚本不在发布包内）

## 9. 仓库归属

本项目由用户自主创作。所有源代码、像素数据、SVG 路径、调色板、音色合成逻辑均归本仓库所有，许可证见根目录 `LICENSE`。

如发现任何意外遗漏的第三方归属需求，请提 issue。