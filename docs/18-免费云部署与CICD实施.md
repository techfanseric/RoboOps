# RoboOps 免费云部署与 CI/CD 实施记录

整理日期：2026-07-08
检查对象：`/Users/ericyim/RoboOps/app`
对照项目：`/Users/ericyim/waylog-pwa`

## 1. 结论

RoboOps 当前是纯前端 Vite + React + TypeScript 应用，状态保存在浏览器 `localStorage`，尚未接真实后端、数据库或文件存储。因此现阶段可以直接复用 `waylog-pwa` 的免费部署模型：

- GitHub 托管源码。
- GitHub Actions 在 `main` 推送时自动执行类型检查和生产构建。
- Cloudflare Pages 承载静态产物，使用免费 `pages.dev` HTTPS 域名。
- 通过 Cloudflare Wrangler Action 直传 `app/dist`。

本阶段不需要 Supabase。后续若要做多设备同步、真实账号、审计日志或 API outbox 持久化，再按数据边界选择 Supabase Free、Cloudflare D1/KV/R2 或正式后端服务。

## 2. 对照 waylog-pwa

`waylog-pwa` 的线上路径是：

- 静态资源整理到 `dist/`。
- GitHub Actions 使用 `cloudflare/wrangler-action@v3`。
- GitHub Secrets 保存 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`。
- 推送 `main` 后发布到 Cloudflare Pages 项目。

RoboOps 与 waylog 的差异：

| 项目 | waylog-pwa | RoboOps |
| --- | --- | --- |
| 前端形态 | 原生 HTML/CSS/JS | Vite + React + TypeScript |
| 构建步骤 | 手动复制运行文件到 `dist` | `npm ci` 后 `npm run build` |
| 云端产物 | 根目录 `dist` | `app/dist` |
| 数据同步 | Supabase 原型表 | 当前无云端数据依赖 |
| 路由 | 静态页面 + 重写 | React Router，需要 SPA 回退 |

## 3. 已实施内容

已新增 GitHub Actions 工作流：

```text
.github/workflows/deploy.yml
```

流程：

1. Checkout 源码。
2. 安装 Node.js 22。
3. 在 `app/` 下执行 `npm ci`。
4. 执行 `npm run build`，包含 TypeScript 检查。
5. 使用 Wrangler Action 部署 `app/dist` 到 Cloudflare Pages 项目 `roboops-console`，Pages 生产分支为 `main`。

已新增 Cloudflare Pages 静态配置：

```text
app/public/_redirects
app/public/_headers
```

`_redirects` 负责把 `/login`、`/points/:id`、`/devices/:id`、`/invitations/:id/accept` 等前端路由回退到 `index.html`，避免云端刷新或直链访问 404。

`_headers` 补充基础安全响应头。

已新增本地手动部署命令：

```bash
cd /Users/ericyim/RoboOps/app
npm run deploy:cloudflare
```

## 4. GitHub Secrets

自动部署需要在 RoboOps 的 GitHub 仓库中配置：

```text
CLOUDFLARE_ACCOUNT_ID=acaba0e593f76d3a1962b9169dfc51fc
CLOUDFLARE_API_TOKEN=<Cloudflare Pages 写入权限 token>
```

`CLOUDFLARE_ACCOUNT_ID` 不是敏感密钥，但为了和 `waylog-pwa` 保持一致，仍作为 Secret 管理。

`CLOUDFLARE_API_TOKEN` 需要使用 Cloudflare 后台创建，建议只授权当前账号的 Cloudflare Pages 写入能力。不要复用本机 Wrangler OAuth token，也不要把 token 写入代码或文档。

## 5. 当前外部资源状态

- 本机 GitHub CLI 已登录 `techfanseric`。
- 本机 Wrangler 已登录 Cloudflare 账号 `Techfanseric@gmail.com's Account`，Account ID 为 `acaba0e593f76d3a1962b9169dfc51fc`。
- Cloudflare Pages 项目已创建：`roboops-console`。
- Cloudflare Pages 生产地址：`https://roboops-console.pages.dev/`。
- 首次直传部署 ID：`dc07133e-4858-4b9f-b491-b7f6606855a7`。
- GitHub 私有仓库已创建：`https://github.com/techfanseric/RoboOps`。
- 本地 Git 仓库已绑定 `origin`：`https://github.com/techfanseric/RoboOps.git`。
- GitHub Secret `CLOUDFLARE_ACCOUNT_ID` 已写入。
- GitHub Secret `CLOUDFLARE_API_TOKEN` 已写入。
- Cloudflare API token 验证结果：有效且 active。

## 6. 验证记录

已执行：

```bash
cd /Users/ericyim/RoboOps/app
npm run build
```

结果：

- TypeScript 检查通过。
- Vite 生产构建通过。
- 构建产物输出到 `app/dist`。
- `https://roboops-console.pages.dev/` 返回 HTTP 200。
- `https://roboops-console.pages.dev/login` 返回 HTTP 200，说明 SPA 回退生效。
- `https://roboops-console.pages.dev/devices/RB-CF-001` 返回 HTTP 200，说明详情直链回退生效。
- `_headers` 生效，响应包含 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin` 和 `X-Frame-Options: DENY`。
- 当前存在一个 Vite chunk 体积超过 500 kB 的提示，不阻塞部署；后续真实上线前可按模块做动态导入拆包。

## 7. 后续扩展

当前部署先服务静态 MVP 演示与评审。进入真实试点时建议分阶段补充：

- 账号与权限：接入服务端 IAM 或企业 SSO，前端权限只作为展示层控制。
- 持久化：将配置发布、审批、任务、异常和 API outbox 写入真实后端。
- 审计：服务端生成不可篡改审计日志。
- 文件：现场照片、排障附件、合同或结算单据进入对象级附件，不把项目材料目录暴露为产品模块。
- 监控：Cloudflare Web Analytics、Pages 部署历史和 GitHub Actions 失败通知。
