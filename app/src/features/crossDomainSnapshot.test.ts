import { describe, expect, it } from "vitest";
import { createInitialState } from "../data/mockData";
import { createCatalogResourcesSeed } from "./catalogResources";
import { buildReportRows, catalogToOrderFormulas, composeOrderSnapshot, readDeviceOpsState } from "./crossDomainSnapshot";
import { mergePointProfiles } from "./orderReports/useOrderReports";

describe("跨模块订单快照", () => {
  it("把最新启用配方、物料和工艺转换为可下发订单配方", () => {
    const catalog = createCatalogResourcesSeed(new Date("2026-08-19T08:00:00"));
    const formulas = catalogToOrderFormulas(catalog, "tn-001");
    expect(formulas[0]).toMatchObject({ groupId: "tn-001", enabled: true, processEnabled: true });
    expect(formulas[0].materialSteps[0]).toMatchObject({ materialCode: "TEA-BASE", expected: 220, unit: "ml" });
    expect(formulas[0].processSteps[0]).toMatchObject({ rpm: 120, direction: "正转" });
  });

  it("组合主应用点位设备与资源配方，不再使用孤立订单 seed", () => {
    const appState = createInitialState();
    const catalog = createCatalogResourcesSeed(new Date("2026-08-19T08:00:00"), { tenantId: "tn-001", points: [{ id: "pt-001", name: "深圳湾展厅 A 点", region: "深圳", tenantId: "tn-001", validityEnabled: true }] });
    const snapshot = composeOrderSnapshot(appState, "tn-001", catalog, readDeviceOpsState(appState, undefined));
    expect(snapshot.points.some((point) => point.id === "pt-001")).toBe(true);
    expect(snapshot.devices.some((device) => device.pointId === "pt-001")).toBe(true);
    expect(snapshot.formulas.every((formula) => formula.groupId === "tn-001")).toBe(true);
    expect(new Set(snapshot.reportRows?.map((row) => row.type))).toEqual(new Set(["商品销售", "点位销售", "生产明细", "物料用量", "料仓用量", "标定记录", "损耗记录"]));
  });

  it("上游状态刷新时保留点位扩展编码、地址和新建点位", () => {
    const upstream = [{ id: "P-1", groupId: "T-1", name: "点位一", code: "P-1", thirdPartyCode: "UNMAPPED-P-1", province: "待补充", city: "深圳", district: "待补充", address: "待补充", longitude: 0, latitude: 0, status: "营业中" as const }];
    const local = [{ ...upstream[0], code: "SZ001", thirdPartyCode: "THIRD-001", address: "南山区 1 号", longitude: 113.9 }, { ...upstream[0], id: "P-NEW", name: "新增点位", code: "NEW001" }];
    const merged = mergePointProfiles(local, upstream);
    expect(merged.find((point) => point.id === "P-1")).toMatchObject({ code: "SZ001", thirdPartyCode: "THIRD-001", address: "南山区 1 号", longitude: 113.9 });
    expect(merged.some((point) => point.id === "P-NEW")).toBe(true);
  });

  it("七类报表行携带可与授权点位求交集的范围", () => {
    const appState = createInitialState();
    const catalog = createCatalogResourcesSeed(new Date("2026-08-19T08:00:00"), { tenantId: "tn-001", points: [{ id: "pt-001", name: "深圳湾展厅 A 点", region: "深圳", tenantId: "tn-001", validityEnabled: true }] });
    const rows = buildReportRows(appState, catalog, readDeviceOpsState(appState, undefined));
    for (const type of ["商品销售", "物料用量", "料仓用量"] as const) {
      expect(rows.filter((row) => row.type === type).every((row) => row.pointIds?.includes("pt-001"))).toBe(true);
    }
  });
});
