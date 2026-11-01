import type { CatalogItem, ProductVariant } from "../../types/core";
import type { CatalogResourcesState } from "../catalogResources/types";
import type { DeviceModel, DeviceOpsState, DeviceTelemetry, DomainResult, ManagedDevice } from "./types";

export function validateModel(state: DeviceOpsState, model: DeviceModel): DomainResult {
  const reject = (message: string): DomainResult => ({ ok: false, message });
  if (!model.name.trim() || !model.code.trim()) return reject("型号名称和编码不能为空。");
  if (!state.suppliers.some((supplier) => supplier.id === model.supplierId && supplier.authorizedTenantIds.includes(state.tenantId))) return reject("型号供应商未授权当前企业。");
  const old = state.models.find((item) => item.id === model.id);
  if (old && old.supplierId !== model.supplierId) return reject("已有型号不能更换供应商。");
  if (state.models.some((item) => item.id !== model.id && item.code.toLowerCase() === model.code.toLowerCase())) return reject("型号编码已存在。");
  if (!Number.isInteger(model.channelCount) || model.channelCount! < 1 || model.channelCount! > 128) return reject("通道数量必须为 1–128 的整数。");
  if (Object.values(model.capabilities).some((value) => typeof value === "number" && (!Number.isInteger(value) || value < 0))) return reject("硬件数量必须为非负整数。");
  const mapping = model.ioMapping || [];
  if (mapping.length !== model.channelCount || new Set(mapping.map((item) => item.channel)).size !== mapping.length || mapping.some((item) => !Number.isInteger(item.channel) || item.channel < 1 || item.channel > model.channelCount! || !item.pumpIo.trim() || !item.valveIo.trim())) return reject("请为每个通道配置泵和阀 IO，通道编号不可重复或越界。");
  const outputs = mapping.flatMap((item) => [item.pumpIo.trim().toUpperCase(), item.valveIo.trim().toUpperCase()]);
  if (new Set(outputs).size !== outputs.length) return reject("泵阀输出 IO 不可重复。");
  if (state.storages.some((bin) => state.devices.some((device) => device.id === bin.deviceId && device.modelId === model.id) && bin.storageNo > model.channelCount!)) return reject("缩减通道前，请先处理超出范围的设备料仓。");
  return { ok: true };
}

export function validateTelemetry(state: DeviceOpsState, sn: string, report: DeviceTelemetry): DomainResult {
  const reject = (message: string): DomainResult => ({ ok: false, message });
  if (!report || typeof report !== "object" || typeof sn !== "string") return reject("状态消息格式无效。");
  const device = state.devices.find((item) => item.sn.toUpperCase() === sn.toUpperCase() && item.tenantId === state.tenantId);
  if (!device) return reject("设备 SN 不存在或不属于当前企业。");
  const model = state.models.find((item) => item.id === device.modelId);
  if (!model || !Number.isInteger(report.sequence) || report.sequence < 0 || !Number.isInteger(report.modelRevision) || report.modelRevision < 1 || report.modelRevision > (model.revision || 1)) return reject("上报序列或型号版本无效。");
  if (!Number.isFinite(Date.parse(report.reportedAt)) || Date.parse(report.reportedAt) > Date.now() + 60_000) return reject("上报时间无效或超前。");
  if (device.telemetry && (report.sequence <= device.telemetry.sequence || Date.parse(report.reportedAt) < Date.parse(device.telemetry.reportedAt))) return reject("忽略重复或乱序上报。");
  const count = model.channelCount ?? model.capabilities.storageMotors;
  if (!Array.isArray(report.channels) || new Set(report.channels.map((item) => item?.channel)).size !== report.channels.length || report.channels.some((item) => !item || !Number.isInteger(item.channel) || item.channel < 1 || item.channel > count || !Number.isFinite(item.remaining) || item.remaining < 0 || typeof item.materialCode !== "string" || (item.sensorValue !== null && !Number.isFinite(item.sensorValue)))) return reject("通道编号、余量或传感器数据无效。");
  return { ok: true };
}

export function telemetryStatus(device: ManagedDevice, time = Date.now()): string {
  if (device.status === "离线") return "设备离线";
  if (!device.telemetry) return "尚无上报";
  return time - Date.parse(device.telemetry.reportedAt) > 120_000 ? "数据已过期" : "数据正常";
}

// A transport-independent contract: HTTP handlers and MQTT consumers share these validators.
export function buildDeviceBootstrap(state: DeviceOpsState, sn: string, catalog: CatalogItem[], resources?: CatalogResourcesState, variants?: ProductVariant[]) {
  const device = state.devices.find((item) => item.sn.toUpperCase() === sn.toUpperCase() && item.tenantId === state.tenantId && item.pointId);
  if (!device) throw new Error("设备未绑定当前企业及点位。");
  const model = state.models.find((item) => item.id === device.modelId && item.status === "启用");
  if (!model) throw new Error("设备型号不存在或已停用。");
  const point = resources?.points.find((item) => item.id === device.pointId);
  const pointName = state.points.find((item) => item.id === device.pointId)?.name;
  const products = catalog.filter((item) => !item.deletedAt && !item.product?.deletedAt && item.status === "上架" && (!variants || variants.some((variant) => ((variant.productId || variant.catalogItemId) ? (variant.productId || variant.catalogItemId) === item.id : variant.product === item.name) && variant.points.split("、").includes(pointName || ""))));
  const formulas = resources?.formulas.filter((item) => item.status === "启用" && products.some((product) => product.name === item.productName || product.id === item.productCode) && resources.processPlans.some((process) => process.id === item.processId && process.status === "启用") && (item.scope === "全国" || item.targets.includes(device.pointId!) || item.targets.includes(point?.name || "") || (item.scope === "区域" && item.targets.includes(point?.region || "")))) || [];
  return {
    schemaVersion: 1, sn: device.sn, tenantId: state.tenantId, pointId: device.pointId,
    model: { ...model, revision: model.revision || 1, channelCount: model.channelCount ?? model.capabilities.storageMotors, ioMapping: model.ioMapping || [] },
    configuration: state.templates.find((item) => item.id === (device.desiredConfigTemplateId ?? device.configTemplateId) && item.modelId === model.id && item.status === "启用") || null,
    products: products.filter((item) => formulas.some((formula) => formula.productName === item.name || formula.productCode === item.id)),
    materials: resources?.materials.filter((item) => item.status === "启用" && formulas.some((formula) => formula.steps.some((step) => step.materialId === item.id))) || [],
    recipes: formulas,
    processes: resources?.processPlans.filter((item) => formulas.some((formula) => formula.processId === item.id)) || [],
    cleaningPlans: state.maintenancePlans.filter((plan) => plan.status === "启用" && plan.modelId === model.id && plan.boundDeviceIds.includes(device.id)).map((plan) => ({ ...plan, boundDeviceIds: [device.id] })),
  };
}
