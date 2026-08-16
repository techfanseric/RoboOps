import type { AppState } from "../../types/core";
import { currentUser, currentUserPermissionPackages, currentUserRoles, filteredPoints, menuAccessPolicy, reportExportPolicy } from "../../services/operations";

export interface FeatureAccess {
  tenantId: string;
  userId: string;
  operator: string;
  visiblePointNames: string[];
  canViewOrders: boolean;
  canOperateOrders: boolean;
  canViewReports: boolean;
  canExportReports: boolean;
  orderReason: string;
  reportReason: string;
  exportReason: string;
}

const orderOperatorRoles = new Set(["平台支持", "租户管理员", "业务负责人", "运营负责人", "点位负责人", "客服/售后", "试运行操作员"]);
const readOnlyRoles = new Set(["财务/结算", "审计员", "数据查看员"]);

export function canOperateOrdersForRoles(roles: string[], packages: string[], menuAllowed: boolean) {
  const readOnly = roles.some((role) => readOnlyRoles.has(role));
  return menuAllowed && !readOnly && (roles.some((role) => orderOperatorRoles.has(role)) || packages.includes("订单处理包"));
}

export function orderReportsAccess(appState?: AppState, tenantId?: string): FeatureAccess {
  if (!appState) {
    return { tenantId: tenantId || "TENANT-DEMO", userId: "demo-user", operator: "演示用户", visiblePointNames: [], canViewOrders: true, canOperateOrders: true, canViewReports: true, canExportReports: true, orderReason: "演示模式", reportReason: "演示模式", exportReason: "演示模式" };
  }
  const user = currentUser(appState);
  const roles = currentUserRoles(appState);
  const packages = currentUserPermissionPackages(appState);
  const orderMenu = menuAccessPolicy(appState, "orders");
  const reportMenu = menuAccessPolicy(appState, "reports");
  const exportPolicy = reportExportPolicy(appState);
  const readOnly = roles.some((role) => readOnlyRoles.has(role));
  const canOperateOrders = canOperateOrdersForRoles(roles, packages, orderMenu.allowed);
  const scopedPoints = filteredPoints(appState);
  const tenantNames = new Set(appState.brands.filter((brand) => scopedPoints.some((point) => point.brand === brand.name)).map((brand) => brand.tenant));
  const resolvedTenantId = tenantId || (tenantNames.size === 1 ? appState.tenants.find((tenant) => tenant.name === [...tenantNames][0])?.id || [...tenantNames][0] : "all-visible-tenants");
  return {
    tenantId: resolvedTenantId,
    userId: user.id,
    operator: user.name,
    visiblePointNames: scopedPoints.map((point) => point.name),
    canViewOrders: orderMenu.allowed,
    canOperateOrders,
    canViewReports: reportMenu.allowed,
    canExportReports: reportMenu.allowed && exportPolicy.allowed,
    orderReason: canOperateOrders ? "当前角色可执行订单动作；危险动作需要二次确认并写入审计" : readOnly ? `当前角色 ${roles.join("、")} 为只读角色，不得创建、下发或退单` : orderMenu.reason,
    reportReason: reportMenu.reason,
    exportReason: exportPolicy.message,
  };
}
