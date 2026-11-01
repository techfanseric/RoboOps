# RoboOps Console

当前版本：**v0.3.2**。

本次合入商品回收站、清洗方案、设备型号配置及界面优化，保留既有商品分类、模板和点位功能。完整说明及分模块动图见 [项目 README](../README.md)。

历史版本的商品分类、商品模板和点位创建摘要见 [项目 README](../README.md)。

## v0.3.2 更新

合入商品回收站永久删除、卖点与简介规则调整、清洗方案及设备型号配置，并统一后台排版与控件样式。保留 v0.3.1 商品分类、规格模板和点位功能；详细说明与演示见 [项目 README](../README.md)。

## 本地运行

推荐 Node.js 22。技术栈：React + TypeScript + Vite。

```bash
cd app
npm ci
npm run dev
```

开发地址：<http://127.0.0.1:5173/>。

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 类型检查 |
| `npm test` | 领域及集成测试 |
| `npm run build` | 构建生产文件至 `dist/` |
| `npm run preview` | 本地预览生产构建 |

## 工程与版本

页面位于 `src/pages/`，功能模块位于 `src/features/`，主状态与权限逻辑位于 `src/services/operations.ts`。当前使用本地演示数据及浏览器存储。

应用版本以 `package.json` 为准，升级时同步 `package-lock.json` 和两份 README；新增功能升功能版本，修复升修订版本，重大不兼容变更升主版本。上一版为 `0.2.2 → 0.3.0`，业务配置补齐沿用 `0.3.0`；分类更新使用 `0.3.1`，本次反馈整合递增为 `0.3.2`，保留旧浏览器数据。

部署方式见 [部署与 CI/CD](../docs/18-免费云部署与CICD实施.md)，推送 `main` 后自动构建部署，结果以流水线为准。
