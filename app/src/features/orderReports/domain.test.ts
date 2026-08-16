import { describe, expect, it } from "vitest";
import {
  clearExportTask,
  createManualOrder,
  dispatchOrder,
  dispatchRefund,
  expireExportTasks,
  filterReportRows,
  legacyOrderCounts,
  printOrder,
  markExportTaskRead,
  savePoint,
  startExport,
  validateManualOrder,
  validatePointUniqueness,
} from "./domain";
import { scopedOrderReportsStorageKey } from "./useOrderReports";
import { canOperateOrdersForRoles } from "./access";
import { adaptOrderReportsSnapshot } from "./adapters";
import { orderReportsSeed } from "./seed";
import type { BusinessOrder, OrderReportsState, PointDraft } from "./types";

function state(): OrderReportsState {
  return structuredClone(orderReportsSeed);
}

const manualInput = {
  groupId: "TENANT-DEMO",
  createdBy: "tester",
  pointId: "POINT-SZ-001",
  productCode: "DRINK-LATTE",
  productName: "拿铁",
  specification: "大杯/少糖",
  quantity: 1,
  createdAt: "2026-08-19T10:00:00.250+08:00",
};

describe("点位资料规则", () => {
  const baseDraft: PointDraft = {
    groupId: "TENANT-DEMO",
    name: "新点位",
    code: "NEW-001",
    thirdPartyCode: "POS-NEW-001",
    province: "广东省",
    city: "深圳市",
    district: "福田区",
    address: "测试路 1 号",
    longitude: 114.05,
    latitude: 22.54,
    status: "试运行",
  };

  it.each([
    ["name", "深圳湾展厅", "点位名称已存在"],
    ["code", "sz-bay-001", "点位编码已存在"],
    ["thirdPartyCode", "pos-sz-1001", "第三方点位编码已存在"],
  ] as const)("分别校验 %s 在企业内唯一", (field, duplicate, message) => {
    expect(validatePointUniqueness(state().points, { ...baseDraft, [field]: duplicate })).toContain(message);
  });

  it("允许其他企业复用编码，并完整保存区域信息", () => {
    const draft = { ...baseDraft, groupId: "TENANT-OTHER", name: "深圳湾展厅", code: "SZ-BAY-001", thirdPartyCode: "POS-SZ-1001" };
    const next = savePoint(state(), draft);
    expect(next.points[0]).toMatchObject({ province: "广东省", city: "深圳市", district: "福田区", address: "测试路 1 号" });
  });
});

describe("手工订单创建与前置条件", () => {
  it("按企业、用户、点位和秒级创建时刻防重", () => {
    const initial = state();
    const created = createManualOrder(initial, manualInput).state;
    const errors = validateManualOrder(created, { ...manualInput, createdAt: "2026-08-19T10:00:00.999+08:00" });
    expect(errors).toContain("同一企业、用户、点位和创建时刻的手工订单不可重复");
  });

  it("生成订单号、H 取餐号、商品序号和 item code，初始未下发", () => {
    const order = createManualOrder(state(), manualInput).order;
    expect(order.orderNo).toMatch(/^MO\d{13}$/);
    expect(order.pickupNo).toMatch(/^H\d{1,4}$/);
    expect(order.productSequence).toBeGreaterThan(0);
    expect(order.itemCode).toBe(`${order.orderNo.slice(-5)}${order.productSequence}`);
    expect(order).toMatchObject({ legacyState: 0, dispatchState: "未下发", scanned: false });
  });

  it("拒绝无点位、无可用设备、无启用配方或空物料步骤", () => {
    const missingPoint = validateManualOrder(state(), { ...manualInput, pointId: "MISSING" });
    expect(missingPoint).toContain("订单未关联当前企业的有效点位");
    expect(missingPoint).toContain("点位未绑定可用的目标制饮设备");

    const noDevice = state();
    noDevice.devices = [];
    expect(validateManualOrder(noDevice, manualInput)).toContain("点位未绑定可用的目标制饮设备");

    const noFormula = state();
    noFormula.formulas = noFormula.formulas.map((formula) => ({ ...formula, enabled: false }));
    expect(validateManualOrder(noFormula, manualInput)).toContain("未匹配到当前点位启用的商品规格配方");

    const emptyFormula = state();
    emptyFormula.formulas = emptyFormula.formulas.map((formula) => formula.productCode === manualInput.productCode ? { ...formula, materialSteps: [] } : formula);
    expect(validateManualOrder(emptyFormula, manualInput)).toContain("匹配配方没有有效物料步骤");
  });
});

describe("订单下发、旧状态与打印", () => {
  it("区分首次下发与显式 retry，且禁止把重复首次下发伪装成新动作", () => {
    const created = createManualOrder(state(), manualInput);
    const first = dispatchOrder(created.state, created.order.id, false, "2026-08-19T10:00:01+08:00");
    expect(first.dataLogs[0]).toMatchObject({ event: "ORDER_PUSH", retry: false, result: "成功" });
    expect(() => dispatchOrder(first, created.order.id, false)).toThrow("已下发订单必须使用显式重发");

    const retried = dispatchOrder(first, created.order.id, true, "2026-08-19T10:00:02+08:00");
    expect(retried.dataLogs[0]).toMatchObject({ event: "ORDER_RETRY", retry: true, result: "成功" });
    expect(retried.orders.find((order) => order.id === created.order.id)?.retryCount).toBe(1);
  });

  it("下发时重新匹配最新启用配方，并只加载启用工艺", () => {
    const created = createManualOrder(state(), manualInput);
    created.state.formulas.push({
      ...created.state.formulas.find((formula) => formula.id === "FORMULA-LATTE-3")!,
      id: "FORMULA-LATTE-4",
      comboCode: "DRINK-LATTE-L-S30-V4",
      version: 4,
      materialSteps: [{ order: 1, materialCode: "MAT-MILK", materialName: "鲜奶", expected: 300, unit: "ml" }],
      processEnabled: false,
      processSteps: [{ order: 1, name: "不应加载", seconds: 99 }],
    });
    const dispatched = dispatchOrder(created.state, created.order.id, false);
    const order = dispatched.orders.find((item) => item.id === created.order.id)!;
    expect(order).toMatchObject({ formulaId: "FORMULA-LATTE-4", comboCode: "DRINK-LATTE-L-S30-V4", totalResourceUsage: 300 });
    expect(order.steps).toHaveLength(1);
    expect(order.processSteps).toEqual([]);
  });

  it("下发时再次校验设备、启用配方和物料步骤", () => {
    const created = createManualOrder(state(), manualInput);
    const noDevice = { ...created.state, devices: [] };
    expect(dispatchOrder(noDevice, created.order.id, false).dataLogs[0]).toMatchObject({ result: "失败", reason: "点位没有可用制饮设备" });

    const disabled = { ...created.state, formulas: created.state.formulas.map((formula) => ({ ...formula, enabled: false })) };
    expect(dispatchOrder(disabled, created.order.id, false).dataLogs[0]).toMatchObject({ result: "失败", reason: "订单关联配方不存在或已停用" });

    const empty = { ...created.state, formulas: created.state.formulas.map((formula) => formula.id === created.order.formulaId ? { ...formula, materialSteps: [] } : formula) };
    expect(dispatchOrder(empty, created.order.id, false).dataLogs[0]).toMatchObject({ result: "失败", reason: "配方物料步骤为空" });
  });

  it("严格保持 0/1/2,3,5/4,5 的旧状态统计口径", () => {
    const sample = [0, 1, 2, 3, 4, 5].map((legacyState, index) => ({ ...state().orders[0], id: `O-${index}`, legacyState })) as BusinessOrder[];
    expect(legacyOrderCounts(sample)).toEqual({ total: 6, waiting: 1, exception: 1, completed: 3, refunded: 2 });
  });

  it("首次打印与补打分开留痕，并拒绝不存在的订单", () => {
    const initial = { ...state(), printLogs: [] };
    const first = printOrder(initial, "ORDER-DEMO-001", "张三", "2026-08-19T10:01:00+08:00");
    const second = printOrder(first, "ORDER-DEMO-001", "李四", "2026-08-19T10:02:00+08:00");
    expect(first.printLogs[0]).toMatchObject({ printType: "首次打印", operator: "张三", result: "成功" });
    expect(second.printLogs[0]).toMatchObject({ printType: "补打", operator: "李四", result: "成功" });
    expect(() => printOrder(second, "MISSING", "李四")).toThrow("订单不存在");
  });

  it("退单记录成功/失败状态并禁止重复成功下发", () => {
    const failedSource = state();
    failedSource.devices = [];
    const failed = dispatchRefund(failedSource, "ORDER-DEMO-001");
    expect(failed.orders.find((order) => order.id === "ORDER-DEMO-001")).toMatchObject({ refundState: "退单下发失败", refundAttempts: 1 });
    expect(failed.dataLogs[0]).toMatchObject({ event: "REFUND_PUSH", result: "失败" });

    const success = dispatchRefund(state(), "ORDER-DEMO-001");
    expect(success.orders.find((order) => order.id === "ORDER-DEMO-001")).toMatchObject({ refundState: "退单下发成功", refundAttempts: 1, legacyState: 5 });
    expect(() => dispatchRefund(success, "ORDER-DEMO-001")).toThrow("退单已成功下发，不可重复操作");
  });
});

describe("报表范围与存储隔离", () => {
  it("今日、近 7 天和近 30 天按真实发生时间过滤", () => {
    const rows = [
      { ...state().reportRows[0], id: "TODAY", occurredAt: "2026-08-19 10:00" },
      { ...state().reportRows[0], id: "D6", occurredAt: "2026-08-13 10:00" },
      { ...state().reportRows[0], id: "D29", occurredAt: "2026-07-21 10:00" },
      { ...state().reportRows[0], id: "OLD", occurredAt: "2026-07-20 10:00" },
      { ...state().reportRows[0], id: "FUTURE", occurredAt: "2026-08-19 12:01" },
    ];
    const now = new Date("2026-08-19T12:00:00");
    expect(filterReportRows(rows, "今日", now).map((row) => row.id)).toEqual(["TODAY"]);
    expect(filterReportRows(rows, "近 7 天", now).map((row) => row.id)).toEqual(["TODAY", "D6"]);
    expect(filterReportRows(rows, "近 30 天", now).map((row) => row.id)).toEqual(["TODAY", "D6", "D29"]);
  });

  it("localStorage key 按 tenant 共享且跨租户隔离", () => {
    expect(scopedOrderReportsStorageKey("TENANT-A", "USER-1")).toBe(scopedOrderReportsStorageKey("TENANT-A", "USER-2"));
    expect(scopedOrderReportsStorageKey("TENANT-A", "USER-1")).not.toBe(scopedOrderReportsStorageKey("TENANT-B", "USER-1"));
  });

  it("财务、审计和数据查看角色即使持有订单包也不能执行订单动作", () => {
    expect(canOperateOrdersForRoles(["财务/结算"], ["订单处理包"], true)).toBe(false);
    expect(canOperateOrdersForRoles(["审计员"], ["订单处理包"], true)).toBe(false);
    expect(canOperateOrdersForRoles(["数据查看员"], ["订单处理包"], true)).toBe(false);
    expect(canOperateOrdersForRoles(["运营负责人"], [], true)).toBe(true);
    expect(canOperateOrdersForRoles(["运营负责人"], [], false)).toBe(false);
  });

  it("外部设备快照只关联可解析点位，且不会从目录商品伪造配方", () => {
    const snapshot = adaptOrderReportsSnapshot({
      tenantId: "TENANT-X",
      appPoints: [{ id: "P1", name: "外部点位", brand: "B", scenario: "S", city: "深圳市", status: "营业中", owner: "O" }],
      appDevices: [
        { id: "D1", sn: "SN1", name: "设备", point: "外部点位", type: "制饮设备", status: "在线", version: "1", capability: [] },
        { id: "D2", sn: "SN2", name: "孤立设备", point: "未知点位", type: "制饮设备", status: "在线", version: "1", capability: [] },
      ],
      catalog: [{ id: "C1", name: "仅目录商品", type: "饮品商品", brand: "B", status: "上架", attrs: [], flow: "" }],
    });
    expect(snapshot.points.map((point) => point.id)).toEqual(["P1"]);
    expect(snapshot.devices.map((device) => device.id)).toEqual(["D1"]);
    expect(snapshot.formulas).toEqual([]);
  });
});

describe("异步导出任务", () => {
  it("只保留按创建时间倒序的最近 50 条", () => {
    let current: OrderReportsState = { ...state(), exportTasks: [] };
    for (let index = 0; index < 55; index += 1) {
      current = startExport(current, "商品销售", `批次 ${index}`, "tester", new Date(Date.UTC(2026, 7, 19, 1, 0, index)).toISOString());
    }
    expect(current.exportTasks).toHaveLength(50);
    expect(current.exportTasks[0].filters).toBe("批次 54");
    expect(current.exportTasks.at(-1)?.filters).toBe("批次 5");
  });

  it("待执行和执行中超过 5 分钟未更新转失败，成功任务不受影响", () => {
    const initial = state();
    initial.exportTasks = [
      { id: "PENDING", reportType: "商品销售", filters: "今日", status: "待执行", createdBy: "tester", createdAt: "2026-08-19T09:00:00Z", updatedAt: "2026-08-19T09:00:00Z", isRead: false },
      { id: "RUNNING", reportType: "生产明细", filters: "今日", status: "执行中", createdBy: "tester", createdAt: "2026-08-19T09:00:00Z", updatedAt: "2026-08-19T09:00:00Z", isRead: false },
      { id: "SUCCESS", reportType: "损耗记录", filters: "今日", status: "成功", createdBy: "tester", createdAt: "2026-08-19T09:00:00Z", updatedAt: "2026-08-19T09:00:00Z", isRead: false },
    ];
    const expired = expireExportTasks(initial, "2026-08-19T09:05:01Z");
    expect(expired.exportTasks.find((task) => task.id === "PENDING")).toMatchObject({ status: "失败", failureReason: "超过 5 分钟未更新，任务已超时" });
    expect(expired.exportTasks.find((task) => task.id === "RUNNING")?.status).toBe("失败");
    expect(expired.exportTasks.find((task) => task.id === "SUCCESS")?.status).toBe("成功");
  });

  it("处理中任务不可清理，完成或失败任务可以清理", () => {
    const initial = state();
    expect(() => clearExportTask(initial, "EXPORT-002")).toThrow("处理中任务不可清理");
    expect(clearExportTask(initial, "EXPORT-001").exportTasks.some((task) => task.id === "EXPORT-001")).toBe(false);
  });

  it("只有终态可标记已读，重复标记保持幂等", () => {
    const initial = state();
    expect(() => markExportTaskRead(initial, "EXPORT-002")).toThrow("处理中任务不可标记已读");
    const read = markExportTaskRead(initial, "EXPORT-001", "审计员");
    expect(read.exportTasks.find((task) => task.id === "EXPORT-001")?.isRead).toBe(true);
    expect(markExportTaskRead(read, "EXPORT-001")).toBe(read);
  });
});
