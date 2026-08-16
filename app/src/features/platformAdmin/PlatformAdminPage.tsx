import { useEffect, useReducer, useState, type Dispatch, type FormEvent } from "react";
import { Badge, DataTable, EmptyState, NameCell, Section } from "../../components/ui";
import { currentUser, currentUserRoles, type AppAction } from "../../services/operations";
import type { AppState } from "../../types/core";

type AdminView = "enterprises" | "access" | "settings" | "logs" | "tasks";
type TaskStatus = "成功" | "失败" | "等待处理" | "处理中";

interface PlatformEnterprise {
  id: string;
  name: string;
  code: string;
  channel: string;
  domain: string;
  node: string;
  status: "启用" | "停用";
}

interface PlatformAccount {
  id: string;
  username: string;
  name: string;
  role: string;
  enterprise: string;
  scope: string;
  status: "启用" | "停用";
}

interface PlatformMenu {
  id: string;
  name: string;
  location: "租户后台" | "平台后台" | "开发者中心";
  path: string;
  permission: string;
  visible: boolean;
  status: "启用" | "停用";
}

interface PlatformSettings {
  validityEnabled: boolean;
  autoLossEnabled: boolean;
  photoLossRequired: boolean;
  defaultNotifier: "飞书" | "钉钉" | "企业微信";
  productPrefix: string;
  materialPrefix: string;
  pointPrefix: string;
}

interface PlatformLog {
  id: string;
  time: string;
  operator: string;
  source: string;
  action: string;
  target: string;
  result: string;
  detail: string;
}

interface PlatformTask {
  id: string;
  name: string;
  type: string;
  progress: number;
  total: number;
  status: TaskStatus;
  read: boolean;
  updatedAt: number;
  resultUrl?: string;
}

interface PlatformAdminState {
  enterprises: PlatformEnterprise[];
  accounts: PlatformAccount[];
  menus: PlatformMenu[];
  settings: PlatformSettings;
  logs: PlatformLog[];
  tasks: PlatformTask[];
}

type PlatformAdminAction =
  | { type: "toggle-enterprise"; id: string }
  | { type: "toggle-account"; id: string }
  | { type: "toggle-menu"; id: string }
  | { type: "save-settings"; settings: PlatformSettings; operator: string }
  | { type: "mark-task-read"; id: string; operator: string }
  | { type: "clear-task"; id: string; operator: string }
  | { type: "expire-tasks"; now: number };

const STORAGE_KEY = "roboops-platform-admin-v2";
const terminalTaskStatuses = new Set<TaskStatus>(["成功", "失败", "等待处理"]);

const initialState: PlatformAdminState = {
  enterprises: [
    { id: "ent-001", name: "星舟具身智能", code: "XZ-ROBOT", channel: "RoboTea", domain: "tenant.xingzhou.example", node: "华南主节点", status: "启用" },
    { id: "ent-002", name: "城市机器人运营公司", code: "CITY-OPS", channel: "RoboService", domain: "tenant.cityops.example", node: "华东边缘节点", status: "启用" },
    { id: "ent-003", name: "试点交付沙箱", code: "PILOT-SBX", channel: "交付测试", domain: "sandbox.roboops.example", node: "隔离测试节点", status: "停用" },
  ],
  accounts: [
    { id: "pa-001", username: "platform-admin", name: "林砚", role: "平台支持", enterprise: "RoboOps 平台", scope: "全部租户", status: "启用" },
    { id: "pa-002", username: "tenant-admin", name: "周岚", role: "租户管理员", enterprise: "星舟具身智能", scope: "全部品牌", status: "启用" },
    { id: "pa-003", username: "delivery-audit", name: "叶青", role: "审计员", enterprise: "星舟具身智能", scope: "审计数据", status: "启用" },
  ],
  menus: [
    { id: "menu-001", name: "资源耗材", location: "租户后台", path: "/resources", permission: "resource:read", visible: true, status: "启用" },
    { id: "menu-002", name: "设备升级", location: "租户后台", path: "/devices/operations", permission: "device:upgrade", visible: true, status: "启用" },
    { id: "menu-003", name: "平台管理", location: "平台后台", path: "/roles/platform", permission: "platform:admin", visible: true, status: "启用" },
    { id: "menu-004", name: "集成开放", location: "开发者中心", path: "/integrations", permission: "integration:read", visible: true, status: "启用" },
  ],
  settings: {
    validityEnabled: true,
    autoLossEnabled: true,
    photoLossRequired: true,
    defaultNotifier: "飞书",
    productPrefix: "PRD",
    materialPrefix: "MAT",
    pointPrefix: "PNT",
  },
  logs: [
    { id: "plog-001", time: "2026-08-19 09:10", operator: "林砚", source: "平台后台", action: "复核企业状态", target: "星舟具身智能", result: "成功", detail: "租户启用、节点与域名配置一致" },
    { id: "plog-002", time: "2026-08-19 09:04", operator: "系统任务", source: "异步任务", action: "导出设备版本明细", target: "task-002", result: "失败", detail: "任务超过 5 分钟无进度，已按旧后台规则转失败" },
  ],
  tasks: [
    { id: "task-001", name: "物料主数据导出", type: "导出", progress: 240, total: 240, status: "成功", read: false, updatedAt: Date.now() - 120_000, resultUrl: "downloads/materials-20260819.xlsx" },
    { id: "task-002", name: "设备版本明细导出", type: "导出", progress: 12, total: 86, status: "处理中", read: false, updatedAt: Date.now() - 420_000 },
    { id: "task-003", name: "配方批量导入", type: "导入", progress: 34, total: 34, status: "失败", read: false, updatedAt: Date.now() - 90_000 },
  ],
};

const adminViews: Array<{ id: AdminView; label: string }> = [
  { id: "enterprises", label: "企业与应用" },
  { id: "access", label: "账号与菜单" },
  { id: "settings", label: "系统设置" },
  { id: "logs", label: "平台日志" },
  { id: "tasks", label: "异步任务" },
];

function restoreState(storageKey: string): PlatformAdminState {
  if (typeof window === "undefined") return initialState;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return initialState;
  try {
    const saved = JSON.parse(raw) as Partial<PlatformAdminState>;
    return {
      ...initialState,
      ...saved,
      settings: { ...initialState.settings, ...(saved.settings || {}) },
      enterprises: saved.enterprises || initialState.enterprises,
      accounts: saved.accounts || initialState.accounts,
      menus: saved.menus || initialState.menus,
      logs: saved.logs || initialState.logs,
      tasks: saved.tasks || initialState.tasks,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return initialState;
  }
}

function platformAdminReducer(state: PlatformAdminState, action: PlatformAdminAction): PlatformAdminState {
  const next = structuredClone(state);
  const now = new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");
  switch (action.type) {
    case "toggle-enterprise": {
      const enterprise = next.enterprises.find((item) => item.id === action.id);
      if (enterprise) enterprise.status = enterprise.status === "启用" ? "停用" : "启用";
      if (enterprise) next.logs.unshift({ id: `plog-${Date.now()}`, time: now, operator: "平台支持", source: "平台后台", action: "变更企业状态", target: enterprise.id, result: "成功", detail: enterprise.status });
      return next;
    }
    case "toggle-account": {
      const account = next.accounts.find((item) => item.id === action.id);
      if (account) account.status = account.status === "启用" ? "停用" : "启用";
      if (account) next.logs.unshift({ id: `plog-${Date.now()}`, time: now, operator: "平台支持", source: "平台后台", action: "变更账号状态", target: account.id, result: "成功", detail: account.status });
      return next;
    }
    case "toggle-menu": {
      const menu = next.menus.find((item) => item.id === action.id);
      if (menu) menu.status = menu.status === "启用" ? "停用" : "启用";
      if (menu) next.logs.unshift({ id: `plog-${Date.now()}`, time: now, operator: "平台支持", source: "平台后台", action: "变更菜单策略草案", target: menu.id, result: "成功", detail: `${menu.path} → ${menu.status}` });
      return next;
    }
    case "save-settings":
      next.settings = action.settings;
      next.logs.unshift({ id: `plog-${Date.now()}`, time: now, operator: action.operator, source: "平台后台", action: "更新系统设置", target: "全局默认设置", result: "成功", detail: "点位设置仍可覆盖企业默认值" });
      return next;
    case "mark-task-read": {
      const task = next.tasks.find((item) => item.id === action.id);
      if (!task || !terminalTaskStatuses.has(task.status)) return state;
      task.read = true;
      next.logs.unshift({ id: `plog-${Date.now()}`, time: now, operator: action.operator, source: "异步任务", action: "标记已读", target: task.id, result: "成功", detail: task.name });
      return next;
    }
    case "clear-task": {
      const task = next.tasks.find((item) => item.id === action.id);
      if (!task || !terminalTaskStatuses.has(task.status)) return state;
      next.tasks = next.tasks.filter((item) => item.id !== action.id);
      next.logs.unshift({ id: `plog-${Date.now()}`, time: now, operator: action.operator, source: "异步任务", action: "清理记录", target: action.id, result: "成功", detail: task.name });
      return next;
    }
    case "expire-tasks":
      next.tasks.forEach((task) => {
        if (task.status === "处理中" && action.now - task.updatedAt > 300_000) task.status = "失败";
      });
      return next;
    default:
      return state;
  }
}

export function PlatformAdminPage({ state, appDispatch }: { state: AppState; appDispatch: Dispatch<AppAction> }) {
  const roles = currentUserRoles(state);
  const user = currentUser(state);
  const storageKey = `${STORAGE_KEY}:platform`;
  const [adminState, dispatch] = useReducer(platformAdminReducer, storageKey, restoreState);
  const [activeView, setActiveView] = useState<AdminView>("enterprises");
  const [draftSettings, setDraftSettings] = useState(adminState.settings);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(adminState));
  }, [adminState, storageKey]);

  function confirmMainHighRisk(label: string, target: string, action: () => void) {
    if (window.confirm(`${label}？\n\n对象：${target}\n该操作将写入 L4 审计日志。`)) action();
    else appDispatch({ type: "feature-audit", action: label, object: target, risk: "L4", result: "已拒绝", detail: `${user.name} 取消二次确认` });
  }

  function runPlatformAction(action: PlatformAdminAction, label: string, target: string, detail: string, risk: "L2" | "L3" | "L4", needsConfirm: boolean) {
    if (needsConfirm && !window.confirm(`${label}？\n\n对象：${target}\n该操作将写入主系统审计。`)) {
      appDispatch({ type: "feature-audit", action: label, object: target, risk, result: "已拒绝", detail: `${user.name} 取消二次确认` });
      return;
    }
    dispatch(action);
    appDispatch({ type: "feature-audit", action: label, object: target, risk, result: "成功", detail });
  }

  useEffect(() => {
    dispatch({ type: "expire-tasks", now: Date.now() });
    const timer = window.setInterval(() => dispatch({ type: "expire-tasks", now: Date.now() }), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!roles.includes("平台支持")) {
    return (
      <Section title="平台管理不可用" meta="该区域只对平台支持角色开放">
        <EmptyState>当前账号没有跨租户、平台菜单或全局设置管理权限。</EmptyState>
      </Section>
    );
  }

  function submitSettings(event: FormEvent) {
    event.preventDefault();
    if (![draftSettings.productPrefix, draftSettings.materialPrefix, draftSettings.pointPrefix].every((value) => value.trim())) return;
    runPlatformAction({ type: "save-settings", settings: draftSettings, operator: user.name }, "更新平台默认设置", "全局默认设置", "效期、自动报损、通知渠道和编码前缀已更新", "L3", true);
  }

  return (
    <>
      <div className="section-tabs" role="tablist" aria-label="平台管理分组">
        {adminViews.map((view) => (
          <button className={activeView === view.id ? "active" : ""} type="button" role="tab" aria-selected={activeView === view.id} key={view.id} onClick={() => setActiveView(view.id)}>
            {view.label}
          </button>
        ))}
      </div>

      {activeView === "enterprises" ? (
        <>
          <Section title="企业与运行节点" meta="企业隔离、业务渠道、访问域名和同步节点">
            <DataTable
              headers={["企业", "编码", "渠道", "域名", "节点", "状态", "动作"]}
              rows={state.tenants.map((enterprise) => [
                <NameCell primary={enterprise.name} secondary={enterprise.id} />,
                enterprise.id.toUpperCase(),
                enterprise.mode,
                "由服务端域名策略托管",
                enterprise.supportOwner,
                <Badge value={enterprise.status} />,
                <button className="text-button" type="button" onClick={() => confirmMainHighRisk(`${enterprise.status === "启用" ? "停用" : "启用"}企业`, enterprise.name, () => appDispatch({ type: "platform-toggle-tenant", tenantId: enterprise.id }))}>{enterprise.status === "启用" ? "停用" : "启用"}</button>,
              ])}
            />
          </Section>
          <Section title="平台应用" meta="应用 ID 与密钥只展示状态，不在前端暴露密钥明文">
            <DataTable headers={["应用", "用途", "企业范围", "凭证", "状态"]} rows={[[<NameCell primary="RoboOps Console" secondary="app-roboops-console" />, "运营后台", "全部启用企业", <Badge value="已托管" />, <Badge value="启用" />], [<NameCell primary="Field Operations" secondary="app-field-ops" />, "现场效期与任务", "授权点位", <Badge value="已轮换" />, <Badge value="启用" />]]} />
          </Section>
        </>
      ) : null}

      {activeView === "access" ? (
        <>
          <Section title="平台账号" meta="停用账号后，其后续请求必须重新鉴权">
            <DataTable headers={["账号", "角色", "范围", "最近登录", "状态", "动作"]} rows={state.users.map((account) => [<NameCell primary={account.name} secondary={account.id} />, account.role, account.scope, account.login, <Badge value={account.status} />, <button className="text-button" type="button" disabled={account.id === user.id} title={account.id === user.id ? "不能停用当前登录账号" : "变更后写入主系统审计"} onClick={() => confirmMainHighRisk(`${account.status === "启用" ? "停用" : "启用"}账号`, account.name, () => appDispatch({ type: "platform-toggle-user", userId: account.id }))}>{account.status === "启用" ? "停用" : "启用"}</button>])} />
          </Section>
          <Section title="菜单与权限标识" meta="菜单可见性与接口动作权限分离">
            <DataTable headers={["菜单", "位置", "路径", "权限标识", "可见", "状态", "动作"]} rows={adminState.menus.map((menu) => [<NameCell primary={menu.name} secondary={menu.id} />, menu.location, menu.path, menu.permission, menu.visible ? "是" : "否", <Badge value={menu.status} />, <button className="text-button" type="button" onClick={() => runPlatformAction({ type: "toggle-menu", id: menu.id }, "变更菜单策略草案", menu.id, `${menu.path} → ${menu.status === "启用" ? "停用" : "启用"}`, "L4", true)}>{menu.status === "启用" ? "停用" : "启用"}</button>])} />
          </Section>
        </>
      ) : null}

      {activeView === "settings" ? (
        <Section title="企业默认设置" meta="点位设置可覆盖企业默认值，保存后写平台操作日志">
          <form className="detail-stack" onSubmit={submitSettings}>
            <div className="form-grid">
              <ToggleField label="启用效期系统" checked={draftSettings.validityEnabled} onChange={(checked) => setDraftSettings({ ...draftSettings, validityEnabled: checked })} />
              <ToggleField label="开启自动报损" checked={draftSettings.autoLossEnabled} onChange={(checked) => setDraftSettings({ ...draftSettings, autoLossEnabled: checked })} />
              <ToggleField label="报损必须拍照" checked={draftSettings.photoLossRequired} onChange={(checked) => setDraftSettings({ ...draftSettings, photoLossRequired: checked })} />
              <label className="field"><span>默认通知渠道</span><select value={draftSettings.defaultNotifier} onChange={(event) => setDraftSettings({ ...draftSettings, defaultNotifier: event.target.value as PlatformSettings["defaultNotifier"] })}><option>飞书</option><option>钉钉</option><option>企业微信</option></select></label>
              <TextField label="商品编码前缀" value={draftSettings.productPrefix} onChange={(value) => setDraftSettings({ ...draftSettings, productPrefix: value })} />
              <TextField label="资源编码前缀" value={draftSettings.materialPrefix} onChange={(value) => setDraftSettings({ ...draftSettings, materialPrefix: value })} />
              <TextField label="点位编码前缀" value={draftSettings.pointPrefix} onChange={(value) => setDraftSettings({ ...draftSettings, pointPrefix: value })} />
            </div>
            <div><button className="text-button primary-action" type="submit">保存企业默认设置</button></div>
          </form>
        </Section>
      ) : null}

      {activeView === "logs" ? (
        <Section title="平台操作与数据日志" meta="主系统审计与平台配置草案日志合并展示">
          <DataTable headers={["时间", "来源", "操作", "对象", "操作人", "结果", "说明"]} rows={[...state.auditLogs.slice(0, 30).map((log) => [log.time, "主系统", log.action, <NameCell primary={log.object} secondary={log.id} />, log.operator, <Badge value={log.result} />, log.detail]), ...adminState.logs.map((log) => [log.time, log.source, log.action, <NameCell primary={log.target} secondary={log.id} />, log.operator, <Badge value={log.result} />, log.detail])]} />
        </Section>
      ) : null}

      {activeView === "tasks" ? (
        <Section title="异步任务" meta="最近任务；处理中任务不可标记已读或清理，5 分钟无进度自动失败">
          <DataTable headers={["任务", "类型", "进度", "状态", "结果", "已读", "动作"]} rows={adminState.tasks.slice(0, 50).map((task) => {
            const terminal = terminalTaskStatuses.has(task.status);
            return [<NameCell primary={task.name} secondary={task.id} />, task.type, `${task.progress}/${task.total}`, <Badge value={task.status} />, task.resultUrl || "-", task.read ? "是" : "否", <div className="button-row"><button className="text-button" type="button" disabled={!terminal || task.read} title={terminal ? "标记任务结果为已读" : "处理中任务不可标记已读"} onClick={() => runPlatformAction({ type: "mark-task-read", id: task.id, operator: user.name }, "标记平台任务已读", task.id, task.name, "L2", false)}>已读</button><button className="text-button danger-action" type="button" disabled={!terminal} title={terminal ? "清理任务记录" : "处理中任务不可清理"} onClick={() => runPlatformAction({ type: "clear-task", id: task.id, operator: user.name }, "清理平台任务记录", task.id, task.name, "L4", true)}>清理</button></div>];
          })} />
        </Section>
      ) : null}
    </>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="field"><span>{label}</span><select value={checked ? "开启" : "关闭"} onChange={(event) => onChange(event.target.value === "开启")}><option>开启</option><option>关闭</option></select></label>;
}

export const platformAdminRules = {
  canMutateTask(task: Pick<PlatformTask, "status">) {
    return terminalTaskStatuses.has(task.status);
  },
  expiresAfterFiveMinutes(task: Pick<PlatformTask, "status" | "updatedAt">, now: number) {
    return task.status === "处理中" && now - task.updatedAt > 300_000;
  },
};
