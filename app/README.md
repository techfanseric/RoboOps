# RoboOps Console

RoboOps Console 是 RoboOps - 机器人商业运营平台的前端工程。

本工程使用 Vite + React + TypeScript 搭建，当前以本地 mock 数据验证运营后台的信息架构、角色权限、配置发布、异常处理、任务工单、退款售后和报表闭环。真实 API、登录认证和持久化将在后续阶段接入。

## 技术栈

- Vite `6.4.3`
- React `19.2.7`
- TypeScript `6.0.3`
- React Router `7.18.1`
- Lucide React `1.23.0`

## 运行方式

```bash
cd /Users/ericyim/RoboOps/app
npm install
npm run dev
```

开发服务默认监听：

```text
http://127.0.0.1:5173/
```

## 常用命令

```bash
npm run check
npm run build
npm run preview
npm run deploy:cloudflare
```

## 云端部署

推荐沿用 `~/waylog-pwa` 的免费部署路线：

- 托管：Cloudflare Pages 免费 `pages.dev` 域名
- CI/CD：GitHub Actions 在 `main` 推送后构建并通过 Wrangler 部署
- 构建目录：`app/dist`
- Cloudflare Pages 项目名：`roboops-console`
- 生产地址：`https://roboops-console.pages.dev/`

GitHub 仓库需要配置以下 Secrets：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

`CLOUDFLARE_API_TOKEN` 只需要 Cloudflare Pages 写入权限，不要提交到代码仓库。

项目已在 `app/public/_redirects` 配置 SPA 回退，云端直连 `/login`、`/devices/:id` 等 React Router 路由时会回到 `index.html`。

## 工程结构

```text
app/
  index.html
  vite.config.ts
  src/
    main.tsx
    App.tsx
    components/
    data/
    pages/
    services/
    types/
    styles.css
```

## 当前覆盖

- 工作台
- 品牌或组织
- 场景模板
- 点位管理
- 机器人/设备管理
- 商品/服务目录
- 订单/服务请求中心
- 异常中心
- 任务/工单
- 配置发布
- 报表
- 角色权限

## 图标规范

- 图标库：`lucide-react`
- 使用原则：导航、动作按钮和状态入口必须按业务语义选择图标，不使用临时字符或无含义装饰图标。
- 当前语义映射：
  - 工作台：`LayoutDashboard`
  - 品牌或组织：`Building2`
  - 场景模板：`Blocks`
  - 点位：`MapPin`
  - 机器人/设备：`Bot`
  - 商品/服务：`PackageOpen`
  - 订单/请求：`ClipboardList`
  - 异常中心：`CircleAlert`
  - 任务/工单：`ListChecks`
  - 配置发布：`Send`
  - 报表：`ChartColumn`
  - 角色权限：`ShieldCheck`

## 产品口径

- RoboOps 面向机器人商业运营场景，饮品亭、服务站等业务通过场景模板配置。
- 品牌、点位、设备、商品/服务、订单/请求、异常、任务和报表使用统一运营数据结构。
- 角色由职责、权限包、数据范围和审批策略组合而成。
- 异常处理会联动请求、任务、退款、处理记录、审计日志和报表指标。
