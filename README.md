# 一方菜园 V5.3

现实菜地管理应用，前端 React + Three.js，后端 FastAPI + SQLite。主界面包括地块、手动生长期、农事记录、病虫草害、库存及数字码牌。

## 大田菜垄与分种

三维菜地按草图显示 12 条可编辑土垄：左侧两列约 1.2 × 7 米，右侧一列约 1.2 × 10 米，垄面为圆弧土面，垄间留窄步道，不使用地膜。点击垄或地块卡片，进入“编辑分种”，可添加、拆分、删除区段，并分别填写长度、蔬菜和生长阶段；未分配的长度保持裸土。分段总长不能超过整垄长度。

数据库升级至结构版本 8 时自动备份原库，将原有 4 块及种植、农事记录保留并对齐到新布局，另建 8 条空垄。分种区段通过 `PUT /api/v1/plots/{plot_id}/segments` 保存。

## GitHub 与自动部署

源码仓库：https://github.com/franz-9527/grow 。后续开发在根目录提交；首次克隆后运行 `git config core.hooksPath .githooks` 启用提交与推送前检查。完整自动部署步骤见 [GitHub → 宝塔 WebHook](docs/GitHub-宝塔自动部署.md)。

数据库、私有环境、历史安装包、本地图片与账号专属托管配置不进入公开仓库；历史发布包列表仅供本地存档参考。

## 本次交付

- `deploy/grow-garden-v5.3-upgrade-20260913.zip`：已有 v2/v3/v4/v5/v5.1/v5.2 项目升级，不包含数据库文件。
- `deploy/grow-garden-v5.3-install-20260913.zip`：全新安装，附含 30 条图鉴资料的空数据库。
- `deploy/grow-empty-v5.3-20260913.db`：单独导出的空 SQLite 数据库，可直接添加到宝塔。
- `deploy/release-20260913-v5.3/data/grow.db`：可单独添加至宝塔 SQLite 管理器的数据库文件。
- `deploy/验证报告-20260913-v5.3.json`：当前 V5.3 空数据库与安装/升级压缩包的打包检查报告。
- `deploy/archive/`：历史安装包、旧发布目录和构建中间文件统一归档，当前部署不要使用其中的文件。
- [宝塔部署与升级说明](docs/宝塔-部署与升级.md)。

当前版本还包括：公开查看与四位管理密码分离、管理会话保持 30 天、物资和出入库流水可独立删除、删除后列表立即刷新、地块/作物/物资图片上传、图片点击查看大图、作物生长照片时间记录、物资多图、可选种子关联、Open-Meteo 天气缓存、三维场景昼夜变化，以及手机端和网页端的横屏自适应。地块位置可在 3D 编辑模式中拖动保存。V5.3 恢复原来的 15 种虫害 + 15 种病害，图片已下载并随站点本地发布，运行时不依赖 Wikimedia；图鉴页支持资料新增、编辑、删除，只有具体作物详情可以关联病虫害。升级时会把旧的病虫草害条目补成农事记录。

数据库结构已针对宝塔常见的 SQLite 3.7.17 做兼容处理，不使用 3.8.0 才支持的部分索引；空库可直接交给旧版 SQLite 管理器添加。

作物封面图片与生长记录分开：在地块详情点击“拍照记录”，可以直接调用手机后置摄像头，反复保存照片、拍摄时间和生长备注；结束一茬后原照片仍保留。编辑物资时可一次选择多张图片，保存物资后才上传，每张已保存图片都可单独删除，首图显示在库存卡片。地块编辑中的“种子物资”只是可选关联和名称快照，不领用库存，也不会阻止删除种子物资。

## 本地开发

后端在 `backend` 目录安装 `requirements.txt`，运行 `python -m uvicorn app.main:app --host 127.0.0.1 --port 8010`。首次使用时把 `backend/.env.example` 复制为 `backend/.env`，程序启动会自动读取同目录 `.env`；已有系统环境变量优先于文件值。至少修改 `GROW_ADMIN_PIN`，公开部署前必须换成自己的四位数字，并建议设置随机的 `GROW_ADMIN_SESSION_SECRET`。默认数据库为 `backend/data/grow.db`，首次升级旧版本会自动备份旧库。开发时可以用 `GROW_DATA_DIR` 指向独立的测试目录。

前端在 `frontend` 目录安装依赖后运行 `npm run dev`。Vite 自动将 `/api` 和 `/q/` 转发给本机 8010 端口，必要时用 `GROW_API_PROXY` 指定后端地址。

`npm run build` 输出 `frontend/dist/client`，复制到 `backend/static/client` 即可由后端统一提供服务。构建入口包含 Windows 下的正常退出修复，避免 Vinext beta 的强制退出导致 Node 原生句柄崩溃，非零失败仍原样返回。

种植历史中的每一茬使用数据库记录 ID 生成永久编号（例如 `ZC-000001`）。点击历史记录中的“打开溯源链接”可查看该茬的基本资料、农事记录与生长影像；“制作标签”会跳到数字码牌页并选中这一茬。蔬菜溯源标签默认 50×30 cm，可调整宽高、抬头、说明和颜色，支持按实际厘米尺寸下载 SVG 或直接打印。二维码链接采用当前网站域名，正式打印前请在正式域名打开页面。

## 结构

- `frontend/components/garden/`：库存、码牌、地块编辑、图片上传、病虫害图鉴编辑、农事表单与共享表单组件。
- `frontend/components/garden/growth-photos.tsx`：作物生长照片的拍照、时间和备注记录。
- `frontend/components/garden/supply-images.tsx`：物资多图片选择、保存和删除。
- `frontend/components/garden-scene.tsx`：3D 场景，按阶段显示作物，数据变化保留视角。
- `frontend/lib/api.ts`：接口与类型。
- `backend/app/main.py`：地块、种植、农事、病虫害资料、二维码及静态页面接口。
- `backend/app/inventory.py`：清单解析、入库合并、原子扣库和流水。
- `backend/app/media.py`：七牛云上传令牌和 `grow/` 分类对象路径。
- `backend/app/growth.py`：手动生长阶段和界面进度映射。
- `backend/app/database.py`：数据表、连接、迁移与迁移前备份。
- `backend/manage_db.py`：SQLite 文件检查与一致性备份。

## 验证

- 后端：在 `backend` 运行 `python -m pytest tests -q`。
- 前端类型：在 `frontend` 运行 `npx tsc --noEmit`。
- 二维码回环：`node --test scripts/test-qr.mjs`。
- 本次修改文件的检查：`npx oxlint app/page.tsx components/garden components/garden-scene.tsx lib/api.ts lib/qr.ts vite.config.ts`。
- 原 `npm run lint` 扫描全仓库，预装 `components/ui` 中仍有已有检查错误；本次未修改这些第三方组件。
- 构建完成后在项目根目录运行 `python deploy/package_release.py` 生成安装包、升级包和 SQLite 检查报告。
- 重新打包后，当前包留在 `deploy/` 根目录；旧包和旧发布物统一放在 `deploy/archive/`。

所有实际数据操作都走后端；连接失败时显示明确提示，不使用示例数据模拟成功。真实手机摄像头和目标宝塔服务器需在部署后确认。现有 Sites 静态托管配置保留，Python/SQLite 版本部署在宝塔。

## 七牛云图片上传

图片选择时只在浏览器本地预览，点击保存后才由后端统一处理：浏览器发送原图，服务端将最长边控制在 2048px，并使用无损 WebP 编码后再上传七牛 Kodo；成品文件严格不超过 2MB。AK/SK 始终只保留在后端 `.env`，不会下发到浏览器。存储空间、访问域名及密钥由部署者在私有 `.env` 中填写。对象键统一从 `grow/` 开始，并按用途写入：

- `grow/plots/{地块编号}/日期/随机文件名`；
- `grow/crops/{地块编号}/日期/随机文件名`；
- `grow/supplies/{物资编号}/日期/随机文件名`；
- `grow/threats/{图鉴资料编号}/日期/随机文件名`；
- `grow/crops/{地块编号}/growth/日期/随机文件名`（生长照片记录）。

正式部署时，把 `.env.example` 复制为项目根目录 `.env`，在这个文件中填写 `GROW_ADMIN_PIN`、`GROW_ADMIN_SESSION_SECRET` 以及 `QINIU_ACCESS_KEY`、`QINIU_SECRET_KEY` 等配置即可；宝塔 Python 项目的环境变量可以选择“无”。`.env` 不要放进公开静态目录，建议设置为仅运行用户可读。`QINIU_PUBLIC_BASE_URL` 应使用自己图片域名实际支持的协议。

上传链路改为“浏览器 → 本站后端 → 七牛”，浏览器不会再直接向七牛发送文件，因此七牛空间通常不需要为本网站配置上传 CORS。空间仍需允许图片的公开读取（或配置可访问的私有域名）；AK/SK 只保存在后端 `.env`。

## 病虫害图片来源

图鉴图片使用随前端发布的 30 张本地下载图片，国内访问不需要请求 Wikimedia；卡片仍保留原始来源页和许可信息，完整清单见 [图片来源与许可](docs/病虫害图鉴图片来源与许可-v5.3.md)。
