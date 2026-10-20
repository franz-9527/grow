# 我的菜园 · 前端原型

面向手机使用的现实种菜管理前端。当前版本包含可交互的低多边形一亩菜园、管理/游戏双模式、可走动农场助手、动态晴天/小雨/薄雾、四类蔬菜状态、地块快捷操作、任务/记录列表，以及数字二维码绑定与换绑界面。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

默认访问 `http://localhost:3000`。

## 构建检查

```bash
npm run build
npx tsc --noEmit
npx oxlint app/page.tsx components/garden-scene.tsx app/layout.tsx
```

## 当前边界

- 操作记录和二维码绑定暂存在浏览器内存中，刷新页面会恢复演示数据。
- 3D 蔬菜和大部分场景由 Three.js 几何体实时绘制；农场助手与小狐狸使用本地 GLB 模型，来源和许可证见 `public/models/ASSET_LICENSES.md`。
- 天气与病虫害风险目前为演示数据，下一阶段接入 FastAPI、SQLite 与绍兴越城区天气任务。

完整架构和数据模型见 `../docs/现实种菜管理系统-开发文档.md`；只使用宝塔网页界面的部署步骤见 `../docs/宝塔面板图形化部署指南.md`。
