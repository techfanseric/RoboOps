# RoboOps Console

当前版本：**v0.3.0**。本次新增商品管理、点位创建，以及业务人员可直接操作的商品规格/计价模板和点位字段配置。详细更新、验收步骤和操作 GIF 见 [根目录 README](../README.md#v030商品管理与新增点位2026-10-12)。

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

应用版本以 `package.json` 为准，升级时同步 `package-lock.json` 和两份 README；新增功能升功能版本，修复升修订版本，重大不兼容变更升主版本。本次为 `0.2.2 → 0.3.0`，业务配置补齐继续沿用 `0.3.0`。

部署方式见 [部署与 CI/CD](../docs/18-免费云部署与CICD实施.md)，推送 `main` 后自动构建部署，结果以流水线为准。
