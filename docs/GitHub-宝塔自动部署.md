# GitHub → 宝塔 WebHook 自动部署

仓库：<https://github.com/franz-9527/grow>，部署分支 `main`。现有运行目录固定为 `/www/wwwroot/grow`，保持平铺结构：`app/`、`static/client/`、`data/`、`.env`。源码仓库不直接克隆到运行目录，以免现有数据与源码更新混在一起。

当前仓库已提供脚本与签名验证测试。服务器连接、实际 Python 环境、进程管理命令、WebHook URL 与首次联调仍须在目标面板完成；代码入库不代表服务器已启用自动部署。

## 一、部署前准备

服务器需要 Git、rsync、curl、flock、tar、Node.js >= 22.13，以及原 Python 项目的虚拟环境（Python >= 3.10）。旧的 ZIP 部署不需要 Node，使用源码自动构建时需要。

1. 在服务器建立私有工作目录 `/www/deploy/grow`，不要把它设为网站根目录。运行目录仍为 `/www/wwwroot/grow`。
2. 从仓库下载 `deploy/baota-deploy.sh`，保存为 `/www/deploy/grow/deploy.sh`，赋执行权限。此启动脚本由管理员维护，不在每次 WebHook 时从未经验证的请求下载或执行。
3. 将 `deploy/deploy.env.example` 保存为 `/www/deploy/grow/deploy.env`，填写原项目的 Python 解释器绝对路径、Node 所在目录、运行用户。
4. 建立 `/www/deploy/grow/control.sh`，接收 `stop` / `start` 参数，调用**当前项目实际使用的进程管理器**。停止命令必须等原进程退出；启动失败必须返回非零。不要用 `pkill -f python` 或猜测宝塔内部接口。若项目已由 Supervisor 管理，可使用 `supervisorctl stop/start 实际进程名`，否则使用经面板核实的命令。
5. 将私有配置限制为部署用户可读。检查运行目录 `.env` 中的 `GROW_DATA_DIR` 是否确实指向 `/www/wwwroot/grow/data`；脚本备份此目录下的 `grow.db`，自定义数据库位置需先适配脚本。
6. 首次接入已有站点前，另做整站备份。确认 `.env` 已设置自己的 `GROW_ADMIN_PIN` 和随机 `GROW_ADMIN_SESSION_SECRET`，并留存现有依赖版本。不要复制空白示例覆盖生产配置。

## 二、宝塔插件脚本

在软件商店的 WebHook 插件中新建 `grow-main`，脚本仅填写：

```bash
#!/usr/bin/env bash
set -e
/bin/bash /www/deploy/grow/deploy.sh
```

保存后获得的 WebHook URL 是执行部署的凭据，只放在私有配置中。使用有效 HTTPS 证书并保留证书验证。插件的具体 URL 格式和响应行为以当前安装版本为准。

脚本会锁定部署任务、拉取 `main`、在独立目录构建前端、检查后端语法、备份 SQLite 和旧代码、安装 Python 依赖、停止项目、同步源码与静态资源、启动项目并检查 `/health`。已部署的提交会跳过；若当前任务耗时超过锁等待时间，会明确失败。

仅 `app/` 与 `static/client/` 内做同步删除，`.env`、`data/`、上传目录和虚拟环境不参与覆盖或清理。备份及暂存目录在 `/www/deploy/grow` 下保留，需定期检查磁盘并人工清理已确认不再需要的旧构建。脚本不会自动回滚数据库或恢复依赖；数据库迁移后出错应先根据备份与日志确定恢复方案。

## 三、GitHub 签名接收端

为保证只有指定仓库的 `main` 推送能触发插件，在同一服务器独立运行 `deploy/github_webhook.py`。调用链为 **GitHub → HTTPS 签名接收端 → 宝塔 WebHook 插件 → 更新现有 Python 项目**，无需 GitHub Actions 或 SSH 私钥。

将接收端保存到 `/www/deploy/grow/github_webhook.py`，由独立的常驻进程管理器运行（不可随菜园项目一起停止）。给该进程设置以下私有环境变量：

| 变量 | 内容 |
| --- | --- |
| `GROW_WEBHOOK_SECRET` | 至少 32 字符的随机值，只保存到服务器私有环境与 GitHub WebHook Secret |
| `BT_WEBHOOK_URL` | 插件生成的 HTTPS URL，包含密钥，不进 Git |
| `GROW_WEBHOOK_REPOSITORY` | `franz-9527/grow` |
| `GROW_WEBHOOK_PORT` | 默认 `9011`，仅监听 `127.0.0.1` |

启动命令为 `现有Python绝对路径 /www/deploy/grow/github_webhook.py`。在宝塔站点的 Nginx 配置中添加以下代理，并使用站点的有效 HTTPS 证书；9011 不开放公网端口：

```nginx
location = /hooks/github/grow {
    client_max_body_size 2m;
    proxy_pass http://127.0.0.1:9011;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

GitHub 仓库 → Settings → Webhooks → Add webhook：

- Payload URL：`https://你的正式域名/hooks/github/grow`
- Content type：`application/json`
- Secret：与接收端 `GROW_WEBHOOK_SECRET` 一致
- SSL verification：启用
- Events：仅 `push`，Active 开启

接收端校验原始请求体的 HMAC-SHA256、仓库名称和 `refs/heads/main`，忽略删除分支和其他事件，拒绝缺失或错误签名。插件原始 URL 不暴露到公开代码中。接收端后台转发，GitHub 的 `202` **仅表示任务已接受**；部署是否成功以插件日志、`deployed-sha` 和站点 `/health` 为准。

同一接收端任务繁忙时返回 `503`；完成后到 GitHub Recent deliveries 手动 Redeliver 失败的最新推送。脚本部署的是执行时 `main` 最新提交，并以 `deployed-sha` 避免重复部署。接收端重启可能中断转发，需查看插件日志后按需重发。

如直接将插件 URL 填进 GitHub，需先确认该版本插件支持签名和分支校验；在 GitHub 填 Secret 并不代表插件实际验证签名。未经验证不按此方式启用。

## 四、首次联调

1. 先在服务器手动执行 `/bin/bash /www/deploy/grow/deploy.sh`，确认原数据、图片、管理登录与页面均正常。
2. 确认 `http://127.0.0.1:8010/health` 返回 `status: ok`，且外网 HTTPS 访问正常。
3. 添加 GitHub WebHook，`ping` 应返回 `200`；向 `main` 推送一个小修改，应返回 `202`。
4. 检查插件日志、`/www/deploy/grow/deployed-sha` 与仓库最新提交一致，再确认页面变化和原数据库数据。
5. 故意错误签名应返回 `403`；其他分支推送应返回 `200 ignore`，不会执行部署。

## 五、本地提交检查

在项目根目录执行 `git config core.hooksPath .githooks`，之后提交和推送前会扫描 Git 索引。手动扫描：`python scripts/check_public_files.py`。

检查涵盖常见令牌、私钥、已知敏感配置、带凭据 URL、数据库与发布包。它不保证识别所有密钥格式，新增第三方配置仍应使用私有 `.env`。本次使用全新的根仓库，不公开前端旧历史；旧历史备份位于本地 `.local-backups/frontend.git`。

参考：[GitHub 验证 WebHook 签名](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)、[宝塔 Git 与 WebHook 官方流程](https://docs.bt.cn/practical-tutorials/create-from-git-website/)。
