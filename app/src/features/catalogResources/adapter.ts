import { currentUser, currentUserRoles, currentUserScopes } from "../../services/operations";
import type { AppState } from "../../types/core";
import { createCatalogResourcesSeed } from "./seed";
import type { CatalogResourcesScope, CatalogResourcesState } from "./types";
import { catalogResourcesStorageKey } from "./useCatalogResources";
import { scopeCatalogResourcesState } from "./useCatalogResources";

export function scopeFromAppState(appState: AppState): CatalogResourcesScope {
  const user = currentUser(appState);
  const roles = currentUserRoles(appState);
  const scopes = currentUserScopes(appState);
  const manageRoles = ["平台支持", "租户管理员", "业务负责人", "运营负责人", "商品/配置管理员"];
  const fieldRoles = ["点位负责人", "现场维护员", "机器人/设备运维"];
  const permissions = ["read", ...(roles.some((role) => manageRoles.includes(role)) ? ["manage", "field"] : roles.some((role) => fieldRoles.includes(role)) ? ["field"] : [])] as CatalogResourcesScope["permissions"];
  const allScope = scopes.some((value) => /全部|平台/.test(value));
  const selectedBrand = appState.brands.find((brand) => brand.name === appState.filters.brand);
  const scopedTenant = appState.tenants.find((tenant) => scopes.some((value) => value.includes(tenant.name)))?.name;
  const scopedBrand = appState.brands.find((brand) => scopes.some((value) => value.includes(brand.name)));
  const tenantId = selectedBrand?.tenant || scopedTenant || scopedBrand?.tenant || (roles.includes("平台支持") ? "ALL-AUTHORIZED" : "TENANT-DEMO");
  const visible = appState.points.filter((point) => {
    const pointTenant = appState.brands.find((brand) => brand.name === point.brand)?.tenant;
    return (tenantId === "ALL-AUTHORIZED" || pointTenant === tenantId) && (appState.filters.brand === "all" || point.brand === appState.filters.brand) && (appState.filters.point === "all" || point.name === appState.filters.point) && (allScope || scopes.some((value) => value.includes(point.name) || value.includes(point.brand) || value.includes(point.city)));
  });
  const tenantPoints = appState.points.filter((point) => tenantId === "ALL-AUTHORIZED" || appState.brands.find((brand) => brand.name === point.brand)?.tenant === tenantId);
  const points = tenantPoints.map((point) => ({ id: point.id, name: point.name, region: point.city, tenantId, validityEnabled: true }));
  return { tenantId, userId: user.id, actor: user.name, roles, permissions, pointIds: visible.map((point) => point.id), points };
}

/** Read-only bridge for order/report snapshots. It never mutates or repairs browser storage. */
export function readCatalogResourcesState(appState: AppState, storage?: Pick<Storage, "getItem">): CatalogResourcesState {
  const scope = scopeFromAppState(appState);
  const source = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!source) return createCatalogResourcesSeed(new Date(), scope);
  try {
    const raw = source.getItem(catalogResourcesStorageKey(scope));
    if (!raw) return createCatalogResourcesSeed(new Date(), scope);
    const parsed = JSON.parse(raw) as CatalogResourcesState;
    if (parsed.schemaVersion !== 1 || parsed.tenantId !== scope.tenantId || !Array.isArray(parsed.formulas) || !Array.isArray(parsed.processPlans) || !Array.isArray(parsed.materials)) return createCatalogResourcesSeed(new Date(), scope);
    return scopeCatalogResourcesState(parsed, scope);
  } catch {
    return createCatalogResourcesSeed(new Date(), scope);
  }
}
