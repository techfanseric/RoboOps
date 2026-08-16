import { useEffect, useReducer } from "react";
import { catalogResourcesReducer } from "./domain";
import { createCatalogResourcesSeed } from "./seed";
import type { CatalogResourcesScope, CatalogResourcesState } from "./types";

export const STORAGE_PREFIX = "roboops.catalog-resources.v2";
export function catalogResourcesStorageKey(scope: Pick<CatalogResourcesScope, "tenantId" | "userId" | "pointIds">) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope.tenantId)}`;
}

function initialize(scope: CatalogResourcesScope): CatalogResourcesState {
  try {
    const stored = localStorage.getItem(catalogResourcesStorageKey(scope));
    if (!stored) return createCatalogResourcesSeed(new Date(), scope);
    const parsed = JSON.parse(stored) as CatalogResourcesState;
    if (parsed.schemaVersion !== 1 || parsed.tenantId !== scope.tenantId) return createCatalogResourcesSeed(new Date(), scope);
    const fallbackPointId = parsed.points[0]?.id || scope.pointIds?.[0] || "POINT-UNASSIGNED";
    return { ...parsed, bins: parsed.bins.map((bin) => ({ ...bin, pointId: bin.pointId || fallbackPointId })) };
  } catch {
    return createCatalogResourcesSeed(new Date(), scope);
  }
}

export function scopeCatalogResourcesState(state: CatalogResourcesState, scope: Pick<CatalogResourcesScope, "pointIds">): CatalogResourcesState {
  if (!scope.pointIds) return state;
  const allowed = new Set(scope.pointIds);
  const batches = state.batches.filter((batch) => allowed.has(batch.pointId));
  const batchIds = new Set(batches.map((batch) => batch.id));
  const bins = state.bins.filter((bin) => allowed.has(bin.pointId));
  const binIds = new Set(bins.map((bin) => bin.id));
  const visibleObjectIds = new Set([...allowed, ...batchIds, ...binIds]);
  return {
    ...state,
    points: state.points.filter((point) => allowed.has(point.id)),
    bins,
    batches,
    validityPlans: state.validityPlans.map((plan) => ({ ...plan, pointIds: plan.pointIds.filter((pointId) => allowed.has(pointId)) })),
    formulas: state.formulas.map((formula) => ({ ...formula, deliveryResults: formula.deliveryResults.filter((result) => allowed.has(result.pointId)) })),
    printLogs: state.printLogs.filter((log) => batchIds.has(log.batchId)),
    logs: state.logs.filter((log) => !["点位", "批次", "料仓"].includes(log.objectType) || visibleObjectIds.has(log.objectId)),
  };
}

export function useCatalogResources(scope: CatalogResourcesScope) {
  const storageKey = catalogResourcesStorageKey(scope);
  const [state, dispatch] = useReducer(catalogResourcesReducer, scope, initialize);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Storage may be unavailable in private mode. */ }
  }, [state, storageKey]);
  return { state, dispatch };
}
