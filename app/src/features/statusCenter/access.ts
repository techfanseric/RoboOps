import { currentUser, currentUserRoles, filteredDevices, filteredPoints } from "../../services/operations";
import type { AppState, Device, Incident } from "../../types/core";
import type { DeviceHealthRow, DeviceTimelineItem, IncidentRule, ScopeLevel, StatusCenterScope, StatusCenterState } from "./types";

const manageRoles = new Set(["平台支持", "业务负责人", "运营负责人", "商品/配置管理员", "场景模板管理员", "配置发布人"]);
const approveRoles = new Set(["平台支持", "业务负责人", "配置审批人"]);
const publishRoles = new Set(["平台支持", "配置发布人", "场景模板管理员"]);
const auditRoles = new Set(["审计员", "数据查看员"]);

export function statusCenterScopeFromAppState(state: AppState): StatusCenterScope {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const points = filteredPoints(state);
  const pointIds = points.map((point) => point.id);
  const pointNames = points.map((point) => point.name);
  const tenantNames = [...new Set(points.map((point) => state.brands.find((brand) => brand.name === point.brand)?.tenant).filter((item): item is string => Boolean(item)))];
  const devices = filteredDevices(state);
  const hasOperationalRole = roles.some((role) => !auditRoles.has(role));
  return {
    actor: user.name,
    roles,
    tenantNames,
    pointIds,
    pointNames,
    brandNames: [...new Set(points.map((point) => point.brand))],
    scenarioNames: [...new Set(points.map((point) => point.scenario))],
    deviceIds: devices.map((device) => device.id),
    deviceTypes: [...new Set(devices.map((device) => device.type))],
    canManage: roles.some((role) => manageRoles.has(role)),
    canApprove: roles.some((role) => approveRoles.has(role)),
    canPublish: roles.some((role) => publishRoles.has(role)),
    auditOnly: roles.some((role) => auditRoles.has(role)) && !hasOperationalRole,
  };
}

export function statusCenterStateForScope(state: StatusCenterState, scope: StatusCenterScope) {
  const tenants = new Set(scope.tenantNames);
  const visibleConfig = <T extends { tenant: string; scopeLevel: ScopeLevel; scopeTargets: string[] }>(item: T) => {
    if (item.tenant !== "*" && !tenants.has(item.tenant)) return false;
    if (item.scopeLevel === "平台默认" || item.scopeLevel === "企业") return true;
    const allowedTargets = item.scopeLevel === "品牌" ? scope.brandNames : item.scopeLevel === "场景" ? scope.scenarioNames : item.scopeLevel === "设备型号" ? scope.deviceTypes : scope.deviceIds;
    return item.scopeTargets.some((target) => allowedTargets.includes(target));
  };
  const visibleReleases = state.releases.filter((item) => visibleConfig(item) && (!item.impactDeviceIds.length || item.impactDeviceIds.some((id) => scope.deviceIds.includes(id))));
  const visibleReleaseIds = new Set(visibleReleases.map((item) => item.id));
  return {
    ...state,
    statusDefinitions: state.statusDefinitions.filter(visibleConfig),
    incidentRules: state.incidentRules.filter(visibleConfig),
    releases: visibleReleases,
    silences: state.silences.filter((item) => scope.deviceIds.includes(item.deviceId)),
    audits: state.audits.filter((item) => scope.roles.includes("平台支持") || item.actor === scope.actor || visibleReleaseIds.has(item.object) || scope.deviceIds.includes(item.object)),
  };
}

export function scopeTargetsForLevel(state: AppState, level: ScopeLevel, tenant: string) {
  const points = filteredPoints(state).filter((point) => tenant === "*" || state.brands.find((brand) => brand.name === point.brand)?.tenant === tenant);
  if (level === "平台默认") return [{ id: "*", name: "全平台默认" }];
  if (level === "企业") return tenant === "*" ? [] : [{ id: tenant, name: tenant }];
  if (level === "品牌") return [...new Set(points.map((point) => point.brand))].map((name) => ({ id: name, name }));
  if (level === "场景") return [...new Set(points.map((point) => point.scenario))].map((name) => ({ id: name, name }));
  if (level === "设备型号") return [...new Set(filteredDevices(state).filter((device) => points.some((point) => point.name === device.point)).map((device) => device.type))].map((name) => ({ id: name, name }));
  return filteredDevices(state).filter((device) => points.some((point) => point.name === device.point)).map((device) => ({ id: device.id, name: `${device.name} / ${device.sn}` }));
}

export function deviceMatchesScope(state: AppState, device: Device, tenant: string, level: ScopeLevel, targets: string[]) {
  const point = state.points.find((item) => item.name === device.point);
  const brand = point ? state.brands.find((item) => item.name === point.brand) : undefined;
  if (!point || !brand || (tenant !== "*" && brand.tenant !== tenant)) return false;
  if (level === "平台默认") return true;
  if (level === "企业") return targets.includes(brand.tenant);
  if (level === "品牌") return targets.includes(point.brand);
  if (level === "场景") return targets.includes(point.scenario);
  if (level === "设备型号") return targets.includes(device.type);
  return targets.includes(device.id);
}

export function impactForScope(state: AppState, tenant: string, level: ScopeLevel, targets: string[]) {
  // Use the full tenant topology for impact calculation. The reducer then compares
  // this authoritative impact set with the operator's visible devices/points, so a
  // point-scoped manager cannot publish a brand- or tenant-wide change by accident.
  const devices = state.devices.filter((device) => deviceMatchesScope(state, device, tenant, level, targets));
  const pointNames = new Set(devices.map((device) => device.point));
  return { deviceIds: devices.map((device) => device.id), pointIds: state.points.filter((point) => pointNames.has(point.name)).map((point) => point.id) };
}

function incidentDevice(state: AppState, incident: Incident) {
  const request = state.businessRequests.find((item) => item.id === incident.order);
  if (request) return state.devices.find((device) => device.name === request.device && device.point === incident.point);
  return undefined;
}

function activeSilence(domain: StatusCenterState, deviceId: string) {
  const now = Date.now();
  return domain.silences.find((item) => item.deviceId === deviceId && new Date(item.expiresAt).getTime() > now);
}

export function buildDeviceHealthRows(state: AppState, domain: StatusCenterState): DeviceHealthRow[] {
  const incidents = state.incidents.filter((incident) => !["closed", "recovered"].includes(incident.status));
  return filteredDevices(state).map((device) => {
    const point = state.points.find((item) => item.name === device.point)!;
    const tenant = state.brands.find((brand) => brand.name === point.brand)?.tenant || "未归属企业";
    const deviceIncidents = incidents.filter((incident) => incident.point === device.point && (incidentDevice(state, incident)?.id === device.id || state.businessRequests.find((request) => request.id === incident.order)?.device === device.name));
    const current = deviceIncidents.sort((a, b) => (a.level < b.level ? -1 : 1))[0];
    const lastEvent = state.deviceEvents.filter((event) => event.device === device.id).slice(-1)[0];
    const connectionStatus = device.status === "离线" ? "离线" : "在线";
    const operationStatus = device.status === "忙碌" ? "执行中" : ["待维护", "维护中"].includes(device.status) ? "待维护" : "空闲";
    const businessStatus = current?.type.includes("物料") ? "关键物料不足" : connectionStatus === "离线" || operationStatus === "待维护" ? "不可接单" : "可接单";
    const safetyStatus = current?.type.includes("急停") ? "急停触发" : "安全正常";
    const severity = current?.level as DeviceHealthRow["severity"];
    const health = safetyStatus === "急停触发" || severity === "P0" ? "故障" : connectionStatus === "离线" ? "不可用" : current || operationStatus === "待维护" ? "关注" : "正常";
    const silence = activeSilence(domain, device.id);
    return {
      deviceId: device.id,
      name: device.name,
      sn: device.sn,
      type: device.type,
      version: device.version,
      pointId: point.id,
      pointName: point.name,
      brand: point.brand,
      tenant,
      connectionStatus,
      operationStatus,
      businessStatus,
      safetyStatus,
      health,
      severity,
      currentException: current?.type,
      currentIncidentId: current?.id,
      owner: current?.owner,
      lastHeartbeatAt: lastEvent ? `今天 ${lastEvent.time}` : "暂无设备事件",
      abnormalSince: current ? `今天 ${lastEvent?.time || "--:--"}` : undefined,
      incidentCount: deviceIncidents.length,
      mutedUntil: silence?.expiresAt,
    };
  });
}

export function buildDeviceTimeline(state: AppState, domain: StatusCenterState, deviceId: string): DeviceTimelineItem[] {
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device) return [];
  const items: DeviceTimelineItem[] = [];
  state.deviceEvents.filter((event) => event.device === device.id).forEach((event) => items.push({ id: event.id, time: `今天 ${event.time}`, kind: "设备事件", title: event.event, detail: event.related || "设备主动上报", tone: event.level === "warn" ? "bad" : "info" }));
  state.commandRecords.filter((record) => record.device === device.id).forEach((record) => items.push({ id: record.id, time: `今天 ${record.time}`, kind: "命令", title: record.command, detail: `${record.operator} / ${record.result}`, tone: record.result === "成功" ? "ok" : "warn" }));
  state.incidents.filter((incident) => incident.point === device.point && incidentDevice(state, incident)?.id === device.id).forEach((incident) => items.push({ id: incident.id, time: `SLA ${incident.sla}`, kind: "异常", title: incident.type, detail: `${incident.level} / ${incident.statusLabel} / ${incident.owner}`, tone: incident.level === "P0" || incident.level === "P1" ? "bad" : "warn" }));
  domain.silences.filter((silence) => silence.deviceId === device.id).forEach((silence) => items.push({ id: silence.id, time: new Date(silence.createdAt).toLocaleString("zh-CN", { hour12: false }), kind: "静默", title: "设置异常静默", detail: `${silence.operator} / 至 ${new Date(silence.expiresAt).toLocaleString("zh-CN", { hour12: false })} / ${silence.reason}`, tone: "warn" }));
  items.push({ id: `current-${device.id}`, time: "当前", kind: "状态", title: device.status, detail: `${device.version} / ${device.point}`, tone: device.status === "在线" || device.status === "忙碌" ? "ok" : "warn" });
  return items.reverse();
}

export function effectiveRuleSource(state: AppState, rule: IncidentRule, device: Device) {
  return deviceMatchesScope(state, device, rule.tenant, rule.scopeLevel, rule.scopeTargets);
}
