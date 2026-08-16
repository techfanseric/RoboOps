import { useEffect, useReducer, useState, type Dispatch } from "react";
import { Badge, DataTable, EmptyState, NameCell, Section } from "../../components/ui";
import { currentUser, currentUserRoles, type AppAction } from "../../services/operations";
import type { AppState } from "../../types/core";
import { integrationRules, visibleSyncJobs } from "./domain";
import type { IntegrationAudit, IntegrationState } from "./types";

type ViewId = "applications" | "authorization" | "credentials" | "events" | "sync" | "audit";
type Action =
  | { type: "review-application"; id: string; approved: boolean; actor: string }
  | { type: "toggle-authorization"; id: string; actor: string }
  | { type: "rotate-api"; id: string; actor: string }
  | { type: "toggle-api"; id: string; actor: string }
  | { type: "rotate-mqtt"; id: string; actor: string }
  | { type: "rotate-event"; id: string; actor: string }
  | { type: "toggle-subscription"; id: string; actor: string }
  | { type: "retry-sync"; id: string; enterprise: string; actor: string }
  | { type: "clear-sync"; id: string; enterprise: string; actor: string }
  | { type: "expire-sync"; now: number }
  | { type: "expire-credentials"; now: number };

const STORAGE_KEY = "roboops-integrations-v2";
export const integrationStorageKey = () => `${STORAGE_KEY}:shared`;
const nowText = () => new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");

const seed: IntegrationState = {
  applications: [
    { id: "dev-240819-01", developer: "许工", enterprise: "星舟具身智能", purpose: "点位订单与设备状态对接", scopes: ["order:read", "device:read", "event:subscribe"], status: "待审批", submittedAt: "2026-08-19 08:35" },
    { id: "dev-240816-02", developer: "城市运营集成组", enterprise: "城市机器人运营公司", purpose: "经营报表同步", scopes: ["report:read"], status: "已启用", submittedAt: "2026-08-16 14:20" },
  ],
  authorizations: [
    { id: "auth-001", enterprise: "星舟具身智能", appName: "现场运营助手", scopes: ["device:read", "material:write"], points: ["深圳科兴科学园", "广州未来城"], expiresAt: "2027-08-18", status: "已启用" },
    { id: "auth-002", enterprise: "城市机器人运营公司", appName: "经营数据中台", scopes: ["order:read", "report:read"], points: ["全部授权点位"], expiresAt: "2026-12-31", status: "已启用" },
  ],
  apiCredentials: [
    { id: "api-001", name: "经营数据 OpenAPI", enterprise: "城市机器人运营公司", owner: "城市运营集成组", appId: "app_cityops_bi", maskedSecret: "sk_live_••••9K2F", credentialVersion: 4, quotaPerMinute: 600, currentMinuteCalls: 284, usedToday: 12842, lastRotatedAt: "2026-08-01", status: "已启用" },
    { id: "api-002", name: "现场运营助手", enterprise: "星舟具身智能", owner: "许工", appId: "app_field_ops", maskedSecret: "sk_live_••••A7C4", credentialVersion: 2, quotaPerMinute: 300, currentMinuteCalls: 300, usedToday: 3560, lastRotatedAt: "2026-07-18", status: "已启用" },
  ],
  mqttCredentials: [
    { id: "mqtt-001", clientId: "field-ops-south-01", enterprise: "星舟具身智能", owner: "许工", topicPrefix: "tenant/xz-robot/point/+", pointScope: "华南授权点位", expiresAt: "2026-11-30", status: "已启用", credentialVersion: 2, lastRotatedAt: "2026-08-01" },
    { id: "mqtt-002", clientId: "sandbox-device-sim", enterprise: "试点交付沙箱", topicPrefix: "sandbox/device/+", pointScope: "试点交付沙箱", expiresAt: "2026-09-30", status: "已停用", credentialVersion: 1, lastRotatedAt: "2026-07-15" },
  ],
  subscriptions: [
    { id: "sub-001", name: "设备状态回调", enterprise: "星舟具身智能", owner: "许工", endpoint: "https://ops.example.com/webhooks/device", events: ["device.online", "device.offline", "device.fault"], secretVersion: 3, failures: 0, status: "已启用" },
    { id: "sub-002", name: "订单完成回调", enterprise: "城市机器人运营公司", endpoint: "https://bi.example.com/events/order", events: ["order.completed", "order.failed"], secretVersion: 2, failures: 2, status: "已启用" },
  ],
  syncJobs: [
    { id: "sync-001", enterprise: "星舟具身智能", name: "商品与配方主数据导出", direction: "导出", resource: "商品/配方", progress: 340, total: 340, status: "成功", updatedAt: Date.now() - 120_000, result: "downloads/catalog-20260819.xlsx" },
    { id: "sync-002", enterprise: "星舟具身智能", name: "第三方点位编码导入", direction: "导入", resource: "点位", progress: 64, total: 100, status: "同步中", updatedAt: Date.now() - 420_000 },
    { id: "sync-003", enterprise: "城市机器人运营公司", name: "历史订单增量同步", direction: "导出", resource: "订单", progress: 281, total: 300, status: "失败", updatedAt: Date.now() - 80_000, result: "第 282 条第三方编码不存在" },
  ],
  audits: [
    { id: "ia-001", time: "2026-08-19 09:02", actor: "系统任务", action: "暂停同步", target: "sync-002", result: "失败", detail: "超过 5 分钟无进度，自动标记失败" },
    { id: "ia-002", time: "2026-08-18 16:40", actor: "林砚", action: "轮换密钥", target: "api-001", result: "成功", detail: "旧密钥进入 15 分钟过渡期" },
  ],
};

const views: Array<{ id: ViewId; label: string }> = [
  { id: "applications", label: "开发者申请" },
  { id: "authorization", label: "企业授权" },
  { id: "credentials", label: "接口与 MQTT" },
  { id: "events", label: "事件订阅" },
  { id: "sync", label: "数据同步" },
  { id: "audit", label: "调用审计" },
];

function restore(storageKey: string): IntegrationState {
  if (typeof window === "undefined") return seed;
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null") as Partial<IntegrationState> | null;
    if (!saved) return seed;
    return {
      ...seed,
      ...saved,
      apiCredentials: (saved.apiCredentials || seed.apiCredentials).map((item) => ({ ...item, enterprise: item.enterprise || "星舟具身智能", credentialVersion: item.credentialVersion || 1, currentMinuteCalls: item.currentMinuteCalls ?? 0 })),
      mqttCredentials: (saved.mqttCredentials || seed.mqttCredentials).map((item) => ({ ...item, enterprise: item.enterprise || "星舟具身智能", credentialVersion: item.credentialVersion || 1, lastRotatedAt: item.lastRotatedAt || "未轮换" })),
      subscriptions: (saved.subscriptions || seed.subscriptions).map((item) => ({ ...item, enterprise: item.enterprise || "星舟具身智能" })),
      syncJobs: (saved.syncJobs || seed.syncJobs).map((item) => ({ ...item, enterprise: item.enterprise || (item.id === "sync-003" ? "城市机器人运营公司" : "星舟具身智能") })),
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return seed;
  }
}

function audit(action: string, target: string, actor: string, detail: string): IntegrationAudit {
  return { id: `ia-${Date.now()}`, time: nowText(), actor, action, target, result: "成功", detail };
}

function reducer(state: IntegrationState, action: Action): IntegrationState {
  const next = structuredClone(state);
  switch (action.type) {
    case "review-application": {
      const item = next.applications.find((entry) => entry.id === action.id);
      if (!item || !integrationRules.canApprove(item)) return state;
      item.status = action.approved ? "已启用" : "已拒绝";
      next.audits.unshift(audit(action.approved ? "通过开发者申请" : "拒绝开发者申请", item.id, action.actor, `${item.enterprise} / ${item.scopes.join("、")}`));
      return next;
    }
    case "toggle-authorization": {
      const item = next.authorizations.find((entry) => entry.id === action.id);
      if (!item) return state;
      item.status = item.status === "已启用" ? "已停用" : "已启用";
      next.audits.unshift(audit("变更企业授权", item.id, action.actor, `${item.appName} → ${item.status}`));
      return next;
    }
    case "rotate-api": {
      const item = next.apiCredentials.find((entry) => entry.id === action.id);
      if (!item) return state;
      item.previousVersion = item.credentialVersion;
      item.previousExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      item.credentialVersion += 1;
      item.lastRotatedAt = new Date().toISOString();
      item.maskedSecret = `sk_live_••••${Math.random().toString(36).slice(-4).toUpperCase()}`;
      next.audits.unshift(audit("轮换 OpenAPI 密钥", item.appId, action.actor, "旧密钥保留 15 分钟过渡期；页面仅展示掩码"));
      return next;
    }
    case "toggle-api": {
      const item = next.apiCredentials.find((entry) => entry.id === action.id);
      if (!item) return state;
      item.status = item.status === "已启用" ? "已停用" : "已启用";
      next.audits.unshift(audit("变更 OpenAPI 凭证", item.appId, action.actor, item.status));
      return next;
    }
    case "rotate-mqtt": {
      const item = next.mqttCredentials.find((entry) => entry.id === action.id);
      if (!item) return state;
      item.previousVersion = item.credentialVersion;
      item.previousExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      item.credentialVersion += 1;
      item.lastRotatedAt = new Date().toISOString();
      next.audits.unshift(audit("轮换 MQTT 凭证", item.clientId, action.actor, `凭证 v${item.credentialVersion}；范围保持为 ${item.pointScope}`));
      return next;
    }
    case "rotate-event": {
      const item = next.subscriptions.find((entry) => entry.id === action.id);
      if (!item) return state;
      item.previousSecretVersion = item.secretVersion;
      item.previousSecretExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      item.secretVersion += 1;
      next.audits.unshift(audit("轮换事件签名", item.id, action.actor, `签名版本升级至 v${item.secretVersion}`));
      return next;
    }
    case "toggle-subscription": {
      const item = next.subscriptions.find((entry) => entry.id === action.id);
      if (!item) return state;
      item.status = item.status === "已启用" ? "已停用" : "已启用";
      next.audits.unshift(audit("变更事件订阅", item.id, action.actor, item.status));
      return next;
    }
    case "retry-sync": {
      const item = next.syncJobs.find((entry) => entry.id === action.id && entry.enterprise === action.enterprise);
      if (!item || item.status === "同步中") return state;
      item.status = "同步中";
      item.updatedAt = Date.now();
      delete item.result;
      next.audits.unshift(audit("重试数据同步", item.id, action.actor, `从 ${item.progress}/${item.total} 继续`));
      return next;
    }
    case "clear-sync": {
      const item = next.syncJobs.find((entry) => entry.id === action.id && entry.enterprise === action.enterprise);
      if (!item || !integrationRules.canMutateSync(item)) return state;
      next.syncJobs = next.syncJobs.filter((entry) => entry.id !== action.id);
      next.audits.unshift(audit("清理同步记录", item.id, action.actor, item.name));
      return next;
    }
    case "expire-sync":
      next.syncJobs.forEach((job) => {
        if (integrationRules.isStalled(job, action.now)) {
          job.status = "失败";
          job.result = "超过 5 分钟无进度，已自动失败";
        }
      });
      return next;
    case "expire-credentials":
      next.apiCredentials.forEach((item) => { if (item.previousExpiresAt && new Date(item.previousExpiresAt).getTime() <= action.now) { delete item.previousVersion; delete item.previousExpiresAt; } });
      next.mqttCredentials.forEach((item) => { if (item.previousExpiresAt && new Date(item.previousExpiresAt).getTime() <= action.now) { delete item.previousVersion; delete item.previousExpiresAt; } });
      next.subscriptions.forEach((item) => { if (item.previousSecretExpiresAt && new Date(item.previousSecretExpiresAt).getTime() <= action.now) { delete item.previousSecretVersion; delete item.previousSecretExpiresAt; } });
      return next;
  }
}

export function IntegrationCenterPage({ state, appDispatch }: { state: AppState; appDispatch: Dispatch<AppAction> }) {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const isPlatform = roles.includes("平台支持");
  const isDeveloper = roles.includes("开发者");
  const isAuditor = roles.includes("审计员");
  const canAdmin = isPlatform || roles.some((role) => ["租户管理员", "集成管理员"].includes(role));
  const explicitEnterprises = state.tenants.filter((tenant) => user.scope.includes(tenant.name)).map((tenant) => tenant.name);
  const canSync = isPlatform || (roles.includes("集成管理员") && explicitEnterprises.length > 0);
  const storageKey = integrationStorageKey();
  const [model, dispatch] = useReducer(reducer, storageKey, restore);
  const [view, setView] = useState<ViewId>("applications");

  useEffect(() => {
    dispatch({ type: "expire-sync", now: Date.now() });
    dispatch({ type: "expire-credentials", now: Date.now() });
    const timer = window.setInterval(() => { dispatch({ type: "expire-sync", now: Date.now() }); dispatch({ type: "expire-credentials", now: Date.now() }); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => window.localStorage.setItem(storageKey, JSON.stringify(model)), [model, storageKey]);

  const scopedBrands = state.brands.filter((brand) => user.scope.includes(brand.name));
  const scopedPoints = state.points.filter((point) => user.scope.includes(point.name));
  const scopedPointBrands = scopedPoints.map((point) => point.brand);
  const allowedEnterprises = new Set([
    ...state.tenants.filter((tenant) => user.scope.includes(tenant.name)).map((tenant) => tenant.name),
    ...state.brands.filter((brand) => scopedPointBrands.includes(brand.name)).map((brand) => brand.tenant),
    ...scopedBrands.map((brand) => brand.tenant),
  ]);
  const inScope = (enterprise: string) => isPlatform || allowedEnterprises.has(enterprise) || (isDeveloper && enterprise === user.scope.split(" /")[0]);
  const hasEnterpriseScope = (enterprise: string) => isPlatform || (!isDeveloper && explicitEnterprises.includes(enterprise));
  const canManageEnterprise = (enterprise: string) => canAdmin && hasEnterpriseScope(enterprise);
  const applications = model.applications.filter((item) => isDeveloper ? item.developer === user.name : inScope(item.enterprise));
  const authorizations = model.authorizations.filter((item) => hasEnterpriseScope(item.enterprise) || item.points.some((point) => scopedPoints.some((scoped) => scoped.name === point)));
  const apiCredentials = model.apiCredentials.filter((item) => hasEnterpriseScope(item.enterprise) || (isDeveloper && item.owner === user.name));
  const mqttCredentials = model.mqttCredentials.filter((item) => hasEnterpriseScope(item.enterprise) || (isDeveloper && item.owner === user.name));
  const subscriptions = model.subscriptions.filter((item) => hasEnterpriseScope(item.enterprise) || (isDeveloper && item.owner === user.name));
  const syncJobs = visibleSyncJobs(model.syncJobs, explicitEnterprises, isPlatform);
  const canManageOwned = (owner: string | undefined, enterprise: string) => canManageEnterprise(enterprise) || (isDeveloper && owner === user.name);
  const visibleViews = views.filter((item) => {
    if (isDeveloper) return ["applications", "credentials", "events", "audit"].includes(item.id);
    if (item.id === "sync") return canSync;
    return true;
  });
  const audits = isPlatform ? model.audits : model.audits.filter((item) => item.actor === user.name || (isAuditor && item.detail.includes(user.scope.split(" /")[0])));

  function execute(action: Action, label: string, target: string, detail: string, highRisk = true) {
    if (highRisk && !window.confirm(`${label}？\n\n对象：${target}\n该操作会写入审计日志。`)) return;
    dispatch(action);
    appDispatch({ type: "feature-audit", action: label, object: target, risk: highRisk ? "L4" : "L2", result: "成功", detail });
  }

  return (
    <>
      <div className="section-tabs" role="tablist" aria-label="集成与开放平台分组">
        {visibleViews.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
      </div>

      {view === "applications" ? <Section title="开发者接入申请" meta={canAdmin ? "权限范围非空后进入人工审批；企业级审批要求企业级数据范围" : "当前角色仅查看本人或授权范围内的申请"}><DataTable headers={["申请人", "企业", "用途", "权限范围", "提交时间", "状态", "动作"]} rows={applications.map((item) => [<NameCell primary={item.developer} secondary={item.id} />, item.enterprise, item.purpose, <span className="badge-row">{item.scopes.map((scope) => <Badge key={scope} value={scope} tone="neutral" />)}</span>, item.submittedAt, <Badge value={item.status} />, <div className="button-row"><button className="text-button" disabled={!canManageEnterprise(item.enterprise) || !integrationRules.canApprove(item)} onClick={() => execute({ type: "review-application", id: item.id, approved: true, actor: user.name }, "通过开发者申请", item.id, item.scopes.join("、"))}>通过</button><button className="text-button danger-action" disabled={!canManageEnterprise(item.enterprise) || !integrationRules.canApprove(item)} onClick={() => execute({ type: "review-application", id: item.id, approved: false, actor: user.name }, "拒绝开发者申请", item.id, item.purpose)}>拒绝</button></div>])} /></Section> : null}

      {view === "authorization" ? <Section title="企业应用授权" meta="企业、点位范围和有效期共同限制实际数据访问"><DataTable headers={["应用", "企业", "权限范围", "点位范围", "有效期", "判定", "动作"]} rows={authorizations.map((item) => [<NameCell primary={item.appName} secondary={item.id} />, item.enterprise, item.scopes.join("、"), item.points.join("、"), item.expiresAt, <Badge value={integrationRules.authorizationIsActive(item) ? "授权有效" : "不可访问"} />, <button className="text-button" disabled={!canManageEnterprise(item.enterprise)} onClick={() => execute({ type: "toggle-authorization", id: item.id, actor: user.name }, "变更企业授权", item.id, `${item.enterprise} / ${item.appName}`)}>{item.status === "已启用" ? "停用" : "启用"}</button>])} /></Section> : null}

      {view === "credentials" ? <><Section title="OpenAPI 应用凭证" meta="密钥不回显；限流按应用与企业授权共同判定"><DataTable headers={["应用", "App ID", "密钥", "分钟调用/配额", "今日调用", "版本/过渡", "状态", "动作"]} rows={apiCredentials.map((item) => [<NameCell primary={item.name} secondary={`${item.enterprise} / ${item.id}`} />, item.appId, item.maskedSecret, <NameCell primary={`${item.currentMinuteCalls}/${item.quotaPerMinute}`} secondary={integrationRules.withinQuota(item.currentMinuteCalls, item.quotaPerMinute) ? "配额可用" : "已限流"} />, item.usedToday, <NameCell primary={`v${item.credentialVersion} / ${item.lastRotatedAt}`} secondary={item.previousVersion ? `旧 v${item.previousVersion} 至 ${item.previousExpiresAt}` : "无过渡版本"} />, <Badge value={integrationRules.withinQuota(item.currentMinuteCalls, item.quotaPerMinute) ? item.status : "已限流"} />, <div className="button-row"><button className="text-button" disabled={!canManageOwned(item.owner, item.enterprise)} onClick={() => execute({ type: "rotate-api", id: item.id, actor: user.name }, "轮换 OpenAPI 密钥", item.appId, "旧密钥保留 15 分钟过渡期")}>轮换</button><button className="text-button" disabled={!canManageOwned(item.owner, item.enterprise)} onClick={() => execute({ type: "toggle-api", id: item.id, actor: user.name }, "变更 OpenAPI 凭证", item.appId, item.status)}>{item.status === "已启用" ? "停用" : "启用"}</button></div>])} /></Section><Section title="MQTT 凭证" meta="主题前缀与点位范围绑定，禁止跨租户订阅"><DataTable headers={["Client ID", "主题前缀", "点位范围", "版本/过渡", "有效期", "状态", "动作"]} rows={mqttCredentials.map((item) => [<NameCell primary={item.clientId} secondary={`${item.enterprise} / ${item.id}`} />, item.topicPrefix, item.pointScope, <NameCell primary={`v${item.credentialVersion} / ${item.lastRotatedAt}`} secondary={item.previousVersion ? `旧 v${item.previousVersion} 至 ${item.previousExpiresAt}` : "无过渡版本"} />, item.expiresAt, <Badge value={item.status} />, <button className="text-button" disabled={!canManageOwned(item.owner, item.enterprise)} onClick={() => execute({ type: "rotate-mqtt", id: item.id, actor: user.name }, "轮换 MQTT 凭证", item.clientId, item.pointScope)}>轮换凭证</button>])} /></Section></> : null}

      {view === "events" ? <Section title="事件订阅" meta="失败次数用于告警；轮换签名后保留 15 分钟旧版本过渡"><DataTable headers={["订阅", "回调地址", "事件", "签名版本", "连续失败", "状态", "动作"]} rows={subscriptions.map((item) => [<NameCell primary={item.name} secondary={`${item.enterprise} / ${item.id}`} />, item.endpoint, item.events.join("、"), <NameCell primary={`v${item.secretVersion}`} secondary={item.previousSecretVersion ? `旧 v${item.previousSecretVersion} 至 ${item.previousSecretExpiresAt}` : "无过渡版本"} />, <Badge value={item.failures ? `${item.failures} 次` : "正常"} />, <Badge value={item.status} />, <div className="button-row"><button className="text-button" disabled={!canManageOwned(item.owner, item.enterprise)} onClick={() => execute({ type: "rotate-event", id: item.id, actor: user.name }, "轮换事件签名", item.id, item.endpoint)}>轮换签名</button><button className="text-button" disabled={!canManageOwned(item.owner, item.enterprise)} onClick={() => execute({ type: "toggle-subscription", id: item.id, actor: user.name }, "变更事件订阅", item.id, item.status)}>{item.status === "已启用" ? "暂停" : "恢复"}</button></div>])} /></Section> : null}

      {view === "sync" ? <Section title="数据同步任务" meta="企业范围隔离；处理中任务不可清理；超过 5 分钟无进度自动失败"><DataTable headers={["任务", "企业", "方向", "资源", "进度", "状态", "结果", "动作"]} rows={syncJobs.slice(0, 50).map((item) => [<NameCell primary={item.name} secondary={item.id} />, item.enterprise, item.direction, item.resource, `${item.progress}/${item.total}`, <Badge value={item.status} />, item.result || "-", <div className="button-row"><button className="text-button" disabled={!canSync || item.status === "同步中"} onClick={() => execute({ type: "retry-sync", id: item.id, enterprise: item.enterprise, actor: user.name }, "重试数据同步", item.id, `${item.enterprise} / ${item.name}`)}>重试</button><button className="text-button danger-action" disabled={!canSync || !integrationRules.canMutateSync(item)} onClick={() => execute({ type: "clear-sync", id: item.id, enterprise: item.enterprise, actor: user.name }, "清理同步记录", item.id, `${item.enterprise} / ${item.name}`)}>清理</button></div>])} /></Section> : null}

      {view === "audit" ? <Section title="接入与调用审计" meta="按当前账号企业范围展示凭证、授权、审批、订阅和同步留痕">{audits.length ? <DataTable headers={["时间", "操作人", "动作", "对象", "结果", "说明"]} rows={audits.map((item) => [item.time, item.actor, item.action, <NameCell primary={item.target} secondary={item.id} />, <Badge value={item.result} />, item.detail])} /> : <EmptyState>当前范围暂无接入审计记录</EmptyState>}</Section> : null}
    </>
  );
}
