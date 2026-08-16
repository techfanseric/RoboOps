import type { AppState } from "../types/core";
import type { CatalogResourcesState } from "./catalogResources";
import { deviceOpsSeed, deviceOpsStorageKey, scopeDeviceOpsState, scopeFromAppState as deviceScopeFromAppState, type DeviceOpsState } from "./deviceOps";
import type { DeviceTarget, OrderFormula, OrderReportsSnapshot, PointProfile, ReportRow } from "./orderReports";

export function catalogToOrderFormulas(catalog: CatalogResourcesState, groupId: string): OrderFormula[] {
  return catalog.formulas.map((formula): OrderFormula => {
    const process = catalog.processPlans.find((item) => item.id === formula.processId && item.status === "启用");
    const pointIds = formula.scope === "全国"
      ? catalog.points.map((point) => point.id)
      : formula.scope === "区域"
        ? catalog.points.filter((point) => formula.targets.includes(point.region)).map((point) => point.id)
        : catalog.points.filter((point) => formula.targets.includes(point.id) || formula.targets.includes(point.name)).map((point) => point.id);
    return {
      id: formula.id,
      groupId,
      productCode: formula.productCode,
      productName: formula.productName,
      specification: formula.specCodes.join("/"),
      comboCode: formula.combinationCode,
      version: formula.version,
      enabled: formula.status === "启用",
      pointIds,
      materialSteps: formula.steps.map((step) => {
        const material = catalog.materials.find((item) => item.id === step.materialId);
        return { order: step.order, materialCode: material?.code || step.materialId, materialName: material?.name || step.materialId, expected: step.amount, unit: step.unit };
      }),
      processEnabled: Boolean(process),
      processSteps: (process?.steps || []).map((step) => ({ order: step.order, name: process?.name || "执行工艺", seconds: step.seconds, rpm: step.speed, direction: step.direction })),
    };
  });
}

export function deviceOpsToOrderDevices(deviceOps: DeviceOpsState, groupId: string): DeviceTarget[] {
  return deviceOps.devices.flatMap((device) => {
    if (!device.pointId || device.tenantId !== deviceOps.tenantId) return [];
    return [{
      id: device.id,
      groupId,
      pointId: device.pointId,
      sn: device.sn,
      type: deviceOps.models.find((model) => model.id === device.modelId)?.category.includes("饮") ? "制饮设备" : "服务机器人",
      available: device.status === "在线",
      boundAt: device.activatedAt || new Date(0).toISOString(),
    } satisfies DeviceTarget];
  });
}

export function appPointsToOrderPoints(appState: AppState, groupId: string): PointProfile[] {
  return appState.points.map((point) => ({
    id: point.id,
    groupId,
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
}

export function composeOrderSnapshot(appState: AppState, groupId: string, catalog: CatalogResourcesState, deviceOps?: DeviceOpsState): OrderReportsSnapshot {
  const points = appPointsToOrderPoints(appState, groupId);
  const pointIds = new Set(points.map((point) => point.id));
  const featureDevices = deviceOps ? deviceOpsToOrderDevices(deviceOps, groupId).filter((device) => pointIds.has(device.pointId)) : [];
  const fallbackDevices: DeviceTarget[] = appState.devices.flatMap((device) => {
    const pointId = points.find((point) => point.name === device.point)?.id;
    if (!pointId) return [];
    return [{ id: device.id, groupId, pointId, sn: device.sn, type: device.type.includes("饮") ? "制饮设备" : "服务机器人", available: ["在线", "忙碌"].includes(device.status), boundAt: new Date(0).toISOString() }];
  });
  return {
    points,
    devices: featureDevices.length ? featureDevices : fallbackDevices,
    formulas: catalogToOrderFormulas(catalog, groupId),
    reportRows: buildReportRows(appState, catalog, deviceOps),
  };
}

export function buildReportRows(appState: AppState, catalog: CatalogResourcesState, deviceOps?: DeviceOpsState): ReportRow[] {
  const occurredAt = new Date().toISOString();
  const rows: ReportRow[] = [];
  catalog.formulas.filter((formula) => formula.status === "启用").forEach((formula) => {
    const pointIds = formula.scope === "全国" ? catalog.points.map((point) => point.id) : formula.scope === "区域" ? catalog.points.filter((point) => formula.targets.includes(point.region)).map((point) => point.id) : formula.targets;
    rows.push({ id: `product-${formula.id}`, type: "商品销售", dimension: `${formula.productName} / ${formula.specCodes.join("/")}`, point: formula.scope === "点位" ? formula.targets.join("、") : formula.scope, pointIds, value: appState.businessRequests.filter((item) => item.label.includes(formula.productName)).length, unit: "单", occurredAt, detail: `${formula.combinationCode} / v${formula.version}` });
  });
  appState.points.forEach((point) => {
    const requests = appState.businessRequests.filter((item) => item.point === point.name);
    rows.push({ id: `point-${point.id}`, type: "点位销售", dimension: point.name, point: point.name, pointIds: [point.id], value: requests.reduce((sum, item) => sum + item.amount, 0), unit: "元", occurredAt, detail: `${requests.length} 笔订单/服务请求` });
  });
  appState.businessRequests.forEach((request) => rows.push({ id: `production-${request.id}`, type: "生产明细", dimension: request.label, point: request.point, pointIds: appState.points.filter((point) => point.name === request.point).map((point) => point.id), value: 1, unit: "单", occurredAt, detail: `${request.id} / ${request.statusLabel}` }));
  catalog.materials.forEach((material) => {
    const usage = catalog.formulas.flatMap((formula) => formula.steps).filter((step) => step.materialId === material.id).reduce((sum, step) => sum + step.amount, 0);
    rows.push({ id: `material-${material.id}`, type: "物料用量", dimension: material.name, point: "当前授权范围", pointIds: catalog.points.map((point) => point.id), value: usage, unit: catalog.units.find((unit) => unit.id === material.unitId)?.name || "单位", occurredAt, detail: `${material.code} / 启用配方理论用量` });
  });
  catalog.bins.forEach((bin) => rows.push({ id: `bin-${bin.id}`, type: "料仓用量", dimension: `${bin.deviceSn} / ${bin.number}`, point: catalog.points.find((point) => point.id === bin.pointId)?.name || "当前授权范围", pointIds: [bin.pointId], value: bin.capacity - bin.remaining, unit: catalog.units.find((unit) => unit.id === catalog.materials.find((material) => material.id === bin.materialId)?.unitId)?.name || "单位", occurredAt, detail: `容量 ${bin.capacity}，余量 ${bin.remaining}` }));
  (deviceOps?.storageLogs.filter((log) => log.action === "标定") || []).forEach((log) => { const pointId = deviceOps?.devices.find((device) => device.id === deviceOps.storages.find((storage) => storage.id === log.storageId)?.deviceId)?.pointId; rows.push({ id: `calibration-${log.id}`, type: "标定记录", dimension: deviceOps?.storages.find((storage) => storage.id === log.storageId)?.name || log.storageId, point: deviceOps?.points.find((point) => point.id === pointId)?.name || "当前授权范围", pointIds: pointId ? [pointId] : [], value: log.quantity, unit: "标定值", occurredAt: log.createdAt, detail: `${log.operator} / ${log.before} → ${log.after}` }); });
  catalog.batches.forEach((batch) => rows.push({ id: `waste-${batch.id}`, type: "损耗记录", dimension: catalog.materials.find((material) => material.id === batch.materialId)?.name || batch.materialId, point: catalog.points.find((point) => point.id === batch.pointId)?.name || batch.pointId, pointIds: [batch.pointId], value: batch.wastedAmount, unit: catalog.units.find((unit) => unit.id === catalog.materials.find((material) => material.id === batch.materialId)?.unitId)?.name || "单位", occurredAt: batch.activatedAt, detail: `${batch.code} / ${batch.status}` }));
  return rows;
}

export function readDeviceOpsState(appState: AppState, storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage) {
  const scope = deviceScopeFromAppState(appState);
  const seed = structuredClone(deviceOpsSeed);
  seed.tenantId = scope.tenantId;
  const points = scope.points?.length ? scope.points : scope.pointIds.map((id) => ({ id, name: id }));
  seed.points = points.map((point) => ({ ...point, tenantId: scope.tenantId }));
  seed.devices = seed.devices.map((device, index) => ({ ...device, tenantId: device.tenantId ? scope.tenantId : null, pointId: device.pointId ? seed.points[index % Math.max(seed.points.length, 1)]?.id || null : null }));
  seed.suppliers = seed.suppliers.map((supplier) => supplier.id === "supplier-robo" ? { ...supplier, authorizedTenantIds: [...new Set([...supplier.authorizedTenantIds, scope.tenantId])] } : supplier);
  if (!storage) return scopeDeviceOpsState(seed, scope);
  try {
    const raw = storage.getItem(deviceOpsStorageKey(scope));
    if (!raw) return scopeDeviceOpsState(seed, scope);
    const parsed = JSON.parse(raw) as DeviceOpsState;
    if (parsed.version !== 1 || parsed.tenantId !== scope.tenantId) return scopeDeviceOpsState(seed, scope);
    return scopeDeviceOpsState(parsed, scope);
  } catch {
    return scopeDeviceOpsState(seed, scope);
  }
}
