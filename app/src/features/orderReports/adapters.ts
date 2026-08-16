import type { AppState, CatalogItem, Device, Point } from "../../types/core";
import type { DeviceTarget, OrderFormula, OrderReportsSnapshot, PointProfile } from "./types";

export interface CatalogFormulaSnapshot {
  productCode: string;
  specification: string;
  formulas: OrderFormula[];
}

export interface SnapshotAdapterInput {
  tenantId: string;
  points?: PointProfile[];
  devices?: DeviceTarget[];
  formulas?: OrderFormula[];
  appPoints?: Point[];
  appDevices?: Device[];
  catalog?: CatalogItem[];
}

export function adaptOrderReportsSnapshot(input: SnapshotAdapterInput): OrderReportsSnapshot {
  const points = input.points || (input.appPoints || []).map((point): PointProfile => ({
    id: point.id,
    groupId: input.tenantId,
    name: point.name,
    code: point.id,
    thirdPartyCode: `UNMAPPED-${point.id}`,
    province: "待补充",
    city: point.city,
    district: "待补充",
    address: "待补充",
    longitude: 0,
    latitude: 0,
    status: (["营业中", "试运行", "维护中", "暂停营业"].includes(point.status) ? point.status : "维护中") as PointProfile["status"],
  }));
  const pointByName = new Map(points.map((point) => [point.name, point.id]));
  const devices = input.devices || (input.appDevices || []).flatMap((device): DeviceTarget[] => {
    const pointId = pointByName.get(device.point);
    if (!pointId) return [];
    return [{ id: device.id, groupId: input.tenantId, pointId, sn: device.sn, type: device.type.includes("饮") ? "制饮设备" : "服务机器人", available: device.status === "在线" || device.status === "忙碌", boundAt: new Date(0).toISOString() }];
  });
  // CatalogItem does not expose specification/material steps. Callers must pass formulas explicitly;
  // returning [] prevents a UI-only catalog row from pretending it has a dispatchable recipe.
  const formulas = input.formulas || [];
  return { points, devices, formulas };
}

export function snapshotFromAppState(appState: AppState, tenantId: string, formulas: OrderFormula[] = []): OrderReportsSnapshot {
  return adaptOrderReportsSnapshot({ tenantId, appPoints: appState.points, appDevices: appState.devices, catalog: appState.catalog, formulas });
}
