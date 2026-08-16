import { currentUser, currentUserRoles, currentUserScopes, filteredPoints } from "../../services/operations";
import type { AppState } from "../../types/core";
import type { DeviceOpsAction, DeviceOpsCapability, DeviceOpsScope, DeviceOpsState } from "./types";

const auditRoles = new Set(["审计员", "数据查看员"]);
const fieldRoles = new Set(["现场维护员", "试运行操作员"]);
const deviceRoles = new Set(["机器人/设备运维", "设备运维负责人"]);
const configurationRoles = new Set(["平台支持", "商品/配置管理员", "配置发布人", "机器人/设备运维", "设备运维负责人"]);

export function defaultDeviceOpsScope(state: DeviceOpsState): DeviceOpsScope {
  return {
    tenantId: state.tenantId,
    userId: "device-ops-demo",
    userName: "设备运维管理员",
    roles: ["设备运维负责人", "商品/配置管理员"],
    pointIds: state.points.filter((item) => item.tenantId === state.tenantId).map((item) => item.id),
  };
}

export function scopeFromAppState(appState: AppState): DeviceOpsScope {
  const user = currentUser(appState);
  const points = filteredPoints(appState);
  const tenantName = points.map((point) => appState.brands.find((brand) => brand.name === point.brand)?.tenant).find(Boolean)
    || appState.tenants.find((tenant) => currentUserScopes(appState).some((scope) => scope.includes(tenant.name)))?.name;
  const tenant = appState.tenants.find((item) => item.name === tenantName) || appState.tenants[0];
  const tenantPoints = tenant ? points.filter((point) => appState.brands.find((brand) => brand.name === point.brand)?.tenant === tenant.name) : [];
  return {
    tenantId: tenant?.id || "tenant-unassigned",
    userId: user.id,
    userName: user.name,
    roles: currentUserRoles(appState),
    pointIds: tenantPoints.map((point) => point.id),
    points: tenantPoints.map((point) => ({ id: point.id, name: point.name })),
  };
}

export function capabilityForAction(action: DeviceOpsAction): DeviceOpsCapability {
  if (["adjust-storage", "calibrate-storage", "record-maintenance"].includes(action.type)) return "field-operation";
  if (["register-device", "bind-device", "change-device-model", "activate-device", "bind-offline-policy", "save-offline-policy"].includes(action.type)) return "manage-device";
  if (["save-template", "publish-template", "save-maintenance-plan", "delete-maintenance-plan", "publish-maintenance-plan", "settle-maintenance-batch", "save-software-package", "delete-software-package", "set-software-status", "save-upgrade-policy", "enable-upgrade-policy", "settle-upgrade-device", "retry-upgrade-device", "retry-device-publish"].includes(action.type)) return "manage-configuration";
  return "view-audit";
}

export function scopeCan(scope: DeviceOpsScope, capability: DeviceOpsCapability): boolean {
  if (capability === "view-audit") return true;
  if (scope.roles.some((role) => configurationRoles.has(role))) return true;
  if (capability === "manage-device" && scope.roles.some((role) => deviceRoles.has(role))) return true;
  if (capability === "field-operation" && scope.roles.some((role) => deviceRoles.has(role) || fieldRoles.has(role))) return true;
  return false;
}

export function isAuditOnly(scope: DeviceOpsScope): boolean {
  return scope.roles.some((role) => auditRoles.has(role)) && !scope.roles.some((role) => configurationRoles.has(role) || deviceRoles.has(role) || fieldRoles.has(role));
}

export function dangerousDeviceOpsAction(action: DeviceOpsAction): boolean {
  return ["publish-template", "delete-maintenance-plan", "publish-maintenance-plan", "delete-software-package", "set-software-status", "enable-upgrade-policy", "settle-upgrade-device", "retry-upgrade-device", "retry-device-publish"].includes(action.type);
}

export function deviceOpsStorageKey(scope: DeviceOpsScope): string {
  return `roboops.device-operations.v1.${encodeURIComponent(scope.tenantId)}`;
}

export function scopeDeviceOpsState(state: DeviceOpsState, scope: DeviceOpsScope): DeviceOpsState {
  const pointIds = new Set(scope.pointIds);
  const points = state.points.filter((item) => item.tenantId === scope.tenantId && pointIds.has(item.id));
  const visiblePointIds = new Set(points.map((item) => item.id));
  const devices = state.devices.filter((item) => item.tenantId === scope.tenantId && Boolean(item.pointId && visiblePointIds.has(item.pointId)));
  const deviceIds = new Set(devices.map((item) => item.id));
  return {
    ...state,
    tenantId: scope.tenantId,
    points,
    devices,
    storages: state.storages.filter((item) => deviceIds.has(item.deviceId)),
    storageLogs: state.storageLogs.filter((item) => state.storages.some((storage) => storage.id === item.storageId && deviceIds.has(storage.deviceId))),
    publishRecords: state.publishRecords.filter((item) => deviceIds.has(item.deviceId)),
    maintenanceRecords: state.maintenanceRecords.filter((item) => deviceIds.has(item.deviceId)),
    maintenanceBatches: state.maintenanceBatches.map((batch) => ({ ...batch, deviceResults: batch.deviceResults.filter((item) => deviceIds.has(item.deviceId)) })).filter((batch) => batch.deviceResults.length > 0),
    upgradePolicies: state.upgradePolicies.map((policy) => ({ ...policy, scope: { ...policy.scope, deviceIds: policy.scope.deviceIds.filter((id) => deviceIds.has(id)) }, deviceResults: policy.deviceResults.filter((item) => deviceIds.has(item.deviceId)) })).filter((policy) => policy.scope.deviceIds.length > 0),
  };
}
