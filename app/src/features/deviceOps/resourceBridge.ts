import type { AppState } from "../../types/core";
import type { CatalogResourcesState } from "../catalogResources/types";
// Legacy resources are keyed by tenant display name; hardware uses the stable tenant ID.
export function readDeviceResources(app: AppState | undefined, tenantId: string): CatalogResourcesState | undefined {
  const tenant = app?.tenants.find((item) => item.id === tenantId);
  for (const key of [tenantId, tenant?.name].filter(Boolean)) {
    const raw = localStorage.getItem(`roboops.catalog-resources.v2:${encodeURIComponent(key!)}`);
    if (!raw) continue;
    const resources = JSON.parse(raw) as CatalogResourcesState;
    if (resources.tenantId !== key || resources.schemaVersion !== 1) continue;
    return { ...resources, tenantId, points: resources.points.map((point) => ({ ...point, tenantId })) };
  }
  return undefined;
}
