import { describe, expect, it } from "vitest";
import { deviceOpsSeed } from "./seed";
import { deviceOpsReducer, validateMaintenancePlan } from "./domain";
import { buildDeviceBootstrap, telemetryStatus, validateModel, validateTelemetry } from "./hardware";
import type { DeviceTelemetry } from "./types";
const seed = () => structuredClone(deviceOpsSeed);
const report = (): DeviceTelemetry => ({ sequence: 1, reportedAt: new Date().toISOString(), modelRevision: 1, channels: [{ channel: 1, remaining: 100, materialCode: "TEA", sensorValue: 12 }] });
describe("硬件配置与状态链路", () => {
  it("保存型号增加版本，不伪造设备实际应用版本", () => {
    const state = seed(); const model = { ...state.models[0], channelCount: 16, ioMapping: Array.from({ length: 16 }, (_, i) => ({ channel: i + 1, pumpIo: `P${i}`, valveIo: `V${i}`, sensorIo: `S${i}` })) };
    expect(validateModel(state, model)).toEqual({ ok: true });
    const next = deviceOpsReducer(state, { type: "save-model", payload: model });
    expect(next.models[0].revision).toBe(2); expect(next.devices[0].telemetry).toBeUndefined();
    expect(validateModel(state, { ...model, ioMapping: model.ioMapping.map((io) => ({ ...io, pumpIo: "P0" })) }).ok).toBe(false);
  });
  it("接收合法状态，拒绝重复、乱序、越界和未知 SN", () => {
    const state = seed(); const device = state.devices.find((item) => item.tenantId === state.tenantId)!;
    const next = deviceOpsReducer(state, { type: "receive-telemetry", payload: { sn: device.sn, report: report() } });
    expect(next.devices.find((item) => item.id === device.id)?.telemetry?.sequence).toBe(1);
    expect(validateTelemetry(next, device.sn, report()).ok).toBe(false);
    expect(validateTelemetry(next, device.sn, { ...report(), sequence: 2, reportedAt: "2020-01-01T00:00:00Z" }).ok).toBe(false);
    expect(validateTelemetry(state, device.sn, { ...report(), channels: [{ channel: 999, remaining: 2, materialCode: "", sensorValue: null }] }).ok).toBe(false);
    expect(validateTelemetry(state, "UNKNOWN", report()).ok).toBe(false);
  });
  it("区分无上报、离线及数据过期", () => {
    const device = seed().devices[0];
    expect(telemetryStatus({ ...device, status: "在线", telemetry: undefined })).toBe("尚无上报");
    expect(telemetryStatus({ ...device, status: "在线", telemetry: report() }, Date.now() + 121000)).toBe("数据已过期");
    expect(telemetryStatus({ ...device, status: "离线", telemetry: report() })).toBe("设备离线");
  });
  it("启动配置按 SN 隔离，删除和停用方案不进入同步", () => {
    const state = seed(); const device = state.devices.find((item) => item.tenantId === state.tenantId && item.pointId)!;
    state.maintenancePlans = state.maintenancePlans.map((plan) => ({ ...plan, status: "停用" }));
    expect(buildDeviceBootstrap(state, device.sn, []).cleaningPlans).toHaveLength(0);
    expect(() => buildDeviceBootstrap(state, "UNKNOWN", [])).toThrow();
  });
  it("拒绝无效时长与不兼容设备", () => {
    const state = seed(); const plan = state.maintenancePlans[0];
    expect(validateMaintenancePlan(state, { ...plan, steps: [{ ...plan.steps[0], durationSeconds: NaN }] }).ok).toBe(false);
    expect(validateMaintenancePlan(state, { ...plan, boundDeviceIds: ["missing"] }).ok).toBe(false);
  });
});

import { createCatalogResourcesSeed } from "../catalogResources/seed";
it("启动同步只包含当前点位可用商品、配方和所需物料工艺，回收后全部退出", () => {
  const state = seed(); const device = state.devices.find((item) => item.tenantId === state.tenantId && item.pointId)!;
  const resources = createCatalogResourcesSeed(new Date(), { tenantId: state.tenantId, points: state.points.map((point) => ({ ...point, region: "深圳", validityEnabled: true })) });
  const product = { id: "TEA-LATTE", name: "招牌茶拿铁", brand: "茶", type: "饮品商品", status: "上架", attrs: [], flow: "制饮" };
  const bootstrap = buildDeviceBootstrap(state, device.sn, [product], resources);
  expect(bootstrap.products).toHaveLength(1); expect(bootstrap.recipes.length).toBeGreaterThan(0); expect(bootstrap.materials.length).toBeGreaterThan(0); expect(bootstrap.processes.length).toBeGreaterThan(0);
  expect(buildDeviceBootstrap(state, device.sn, [{ ...product, deletedAt: new Date().toISOString() }], resources).recipes).toHaveLength(0);
  expect(buildDeviceBootstrap(state, device.sn, [product], resources, [{ product: product.name, sku: "TEA", spec: "热", price: "10", points: "其他门店" }]).products).toHaveLength(0);
});
