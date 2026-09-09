# BEADY · 在线拼豆

> 打开网页就能拼的治愈系拼豆小游戏。
> 纯前端 · 无后端 · 无需登录 · 一行命令跑起来 / 一键静态托管。

![preview](./assets/icons/favicon.svg)

## 特性

- **自由创作**：16/24/32/48 拼豆板，36 种真实拼豆色，撤销/重做/橡皮/吸管/平移
- **模板挑战**：12 套原创像素模板（爱心、星星、小猫、小狗、火箭、汉堡……），进度统计 + 提示色 + 红框提醒
- **图片转拼豆**：本地浏览器内量化 JPG/PNG，零上传
- **熨烫仪式**：烘焙纸 → 蒸汽熨斗 → 颗粒融合三阶段动画
- **导出 / 存档**：导出 PNG / 保存到 localStorage / 我的作品自动取回
- **零依赖**：纯 HTML/CSS/JS + Canvas，无需构建步骤
- **移动友好**：390×844 起全断点响应式布局，底部调色盘横滑

## 运行

```bash
git clone <仓库地址>
cd beady
npm run dev    # http://localhost:5173
```

或直接静态托管（`index.html` 是入口），不依赖任何构建产物。

### 添加新模板

模板用脚本生成（数据驱动、可重跑、保证行宽与对称性）：

```bash
# 在 scripts/build-templates.js 的 BUILD / META 中加一个函数与条目
node scripts/build-templates.js              # 生成 assets/templates/templates.js
node scripts/build-templates.js --preview    # 终端打印轮廓
```

模板字符含义：`.` = 空格；其余单字符含义见 `src/core/palette.js`。

## 项目结构

```
beady/
├── index.html                 # 页面骨架 + 脚本依赖顺序
├── assets/
│   ├── css/style.css          # 温暖米白 · 圆角卡片 · 响应式
│   ├── icons/                 # favicon（自绘 SVG）
│   └── templates/templates.js # 12 套模板数据（脚本生成）
├── src/
│   ├── core/                  # 工具 / 调色板 / 音效 / 存档
│   ├── render/                # 拼豆精灵 / 画板引擎
│   ├── features/              # 导出 / 图片转拼豆
│   └── ui/                    # 应用层（路由 / 各屏 UI / 图标）
├── scripts/
│   ├── dev-server.js          # 零依赖静态服务器
│   └── build-templates.js     # 模板生成器
├── CREDITS.md
└── README.md
```

## 浏览器支持

在以下浏览器上完整测试通过：
- Chrome / Edge 100+
- Firefox 110+
- Safari 16+

需要支持：`Pointer Events` / `Canvas 2D` / `Web Audio API` / `requestAnimationFrame` / `ES2020`。

## 技术栈

- 原生 JavaScript（**零**第三方运行时依赖）
- Canvas 2D（拼豆精灵用离屏 canvas 缓存，主循环只做 `drawImage`）
- Web Audio API 程序化合成（音效全靠合成，零音频文件 / 零 404）
- localStorage（存档 + 设置）
- CSS 变量 + `grid` + `flex`（响应式布局）

## License

MIT