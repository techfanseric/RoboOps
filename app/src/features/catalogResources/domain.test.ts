import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogResourcesReducer } from "./domain";
import { createInitialState } from "../../data/mockData";
import { readCatalogResourcesState, scopeFromAppState } from "./adapter";
import { createCatalogResourcesSeed } from "./seed";
import type { CatalogResourcesAction, CatalogResourcesState } from "./types";
import { catalogResourcesStorageKey, scopeCatalogResourcesState } from "./useCatalogResources";

const NOW = new Date(2026, 7, 19, 10, 0, 0);
const reduce = (state: CatalogResourcesState, action: CatalogResourcesAction) => catalogResourcesReducer(state, { ...action, meta: action.meta || { actor: "测试管理员", permissions: ["manage", "field"] } } as CatalogResourcesAction);

describe("catalogResourcesReducer", () => {
  let state: CatalogResourcesState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    state = createCatalogResourcesSeed(new Date());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("创建重叠范围的新版本时停用冲突旧配方并清除旧步骤", () => {
    const oldFormula = state.formulas.find((formula) => formula.id === "FM-001");
    expect(oldFormula?.version).toBe(3);
    expect(oldFormula?.steps).not.toHaveLength(0);

    const next = reduce(state, {
      type: "add-formula",
      payload: {
        productCode: "TEA-LATTE",
        productName: "招牌茶拿铁",
        specCodes: ["COLD", "NORMAL"],
        scope: "区域",
        targets: ["华东区"],
        steps: [{ materialId: "MAT-TEA", amount: 200, unit: "ml" }],
        processId: "PP-001",
      },
    });

    expect(next.lastError).toBeUndefined();
    expect(next.formulas[0]).toMatchObject({
      combinationCode: "TEA-LATTE-COLD-NORMAL",
      version: 4,
      status: "启用",
    });
    expect(next.formulas.find((formula) => formula.id === "FM-001")).toMatchObject({
      status: "停用",
      steps: [],
    });
    expect(next.logs[0].note).toContain("停用 1 份冲突配方");
  });

  describe("整数、容量与出料约束", () => {
    it("拒绝带小数的物料有效期参数", () => {
      const next = reduce(state, {
        type: "add-material",
        payload: {
          code: "SYRUP-NEW",
          name: "测试糖浆",
          unitId: "UNIT-ML",
          storageType: "常温",
          compatibleHardware: [],
          defaultValidMinutes: 30.5,
          defaultWarningMinutes: 5,
          calibrationPrecision: 1,
        },
      });

      expect(next.lastError).toContain("整数");
      expect(next.materials).toHaveLength(state.materials.length);
    });

    it.each([
      ["补料小数", "补料", 10.5, "大于 0 的整数"],
      ["补料超容量", "补料", 4000, "超过容量"],
      ["出料超余量", "出料", 1801, "不能超过当前余量"],
      ["新容量小于余量", "调整容量", 1799, "不能小于当前余量"],
    ] as const)("拒绝%s", (_label, mode, amount, message) => {
      const before = state.bins.find((bin) => bin.id === "BIN-001");
      const next = reduce(state, {
        type: "adjust-bin",
        payload: { binId: "BIN-001", mode, amount },
      });

      expect(next.lastError).toContain(message);
      expect(next.bins.find((bin) => bin.id === "BIN-001")).toEqual(before);
      expect(next.logs).toHaveLength(state.logs.length);
    });

    it("允许边界内补料和出料并形成日志", () => {
      const supplied = reduce(state, {
        type: "adjust-bin",
        payload: { binId: "BIN-001", mode: "补料", amount: 3200 },
      });
      expect(supplied.lastError).toBeUndefined();
      expect(supplied.bins.find((bin) => bin.id === "BIN-001")?.remaining).toBe(5000);
      expect(supplied.logs[0].action).toBe("补料");

      const dispensed = reduce(supplied, {
        type: "adjust-bin",
        payload: { binId: "BIN-001", mode: "出料", amount: 5000 },
      });
      expect(dispensed.lastError).toBeUndefined();
      expect(dispensed.bins.find((bin) => bin.id === "BIN-001")?.remaining).toBe(0);
    });
  });

  describe("效期批次限制", () => {
    it("只允许当日启用时间，并拒绝同点位同物料同启用时间重复录入", () => {
      const action = {
        type: "add-batch" as const,
        payload: {
          pointId: "POINT-001",
          materialId: "MAT-MILK",
          activatedAt: "2026-08-19T10:00",
          amount: 1000,
        },
      };
      const created = reduce(state, action);

      expect(created.lastError).toBeUndefined();
      expect(created.batches).toHaveLength(state.batches.length + 1);
      expect(created.batches[0]).toMatchObject({
        pointId: "POINT-001",
        materialId: "MAT-MILK",
        initialAmount: 1000,
        availableAmount: 1000,
      });
      expect(new Date(created.batches[0].expiresAt).getTime()).toBe(
        new Date("2026-08-19T14:00").getTime(),
      );
      expect(new Date(created.batches[0].warningAt).getTime()).toBe(
        new Date("2026-08-19T13:30").getTime(),
      );

      const duplicate = reduce(created, action);
      expect(duplicate.lastError).toContain("请勿重复录入");
      expect(duplicate.batches).toHaveLength(created.batches.length);

      const yesterday = reduce(state, {
        ...action,
        payload: { ...action.payload, activatedAt: "2026-08-18T23:59" },
      });
      expect(yesterday.lastError).toContain("当天时间");
      expect(yesterday.batches).toHaveLength(state.batches.length);
    });
  });

  describe("打印与报损", () => {
    it("首次打印与后续补打分别记录", () => {
      state = {
        ...state,
        batches: state.batches.map((batch) => batch.id === "BATCH-001"
          ? { ...batch, printCount: 0, firstPrintedAt: undefined }
          : batch),
        printLogs: [],
      };

      const first = reduce(state, {
        type: "print-batch",
        payload: { batchId: "BATCH-001", amount: 100 },
      });
      expect(first.lastError).toBeUndefined();
      expect(first.printLogs[0]).toMatchObject({ kind: "首次打印", amount: 100 });
      expect(first.batches.find((batch) => batch.id === "BATCH-001")?.firstPrintedAt).toBeDefined();

      vi.advanceTimersByTime(60_000);
      const reprint = reduce(first, {
        type: "print-batch",
        payload: { batchId: "BATCH-001", amount: 50 },
      });
      expect(reprint.lastError).toBeUndefined();
      expect(reprint.printLogs[0]).toMatchObject({ kind: "补打", amount: 50 });
      expect(reprint.printLogs[1].kind).toBe("首次打印");
      expect(reprint.batches.find((batch) => batch.id === "BATCH-001")?.printCount).toBe(2);
    });

    it.each([
      ["已过期", { expiresAt: "2026-08-19T09:59:59", warningAt: "2026-08-19T09:00:00" }],
      ["已报损", { availableAmount: 0, wastedAmount: 1800 }],
    ] as const)("拒绝%s批次打印", (expectedStatus, patch) => {
      state = {
        ...state,
        batches: state.batches.map((batch) => batch.id === "BATCH-001" ? { ...batch, ...patch } : batch),
      };
      const next = reduce(state, {
        type: "print-batch",
        payload: { batchId: "BATCH-001", amount: 1 },
      });

      expect(next.lastError).toContain(`${expectedStatus}批次不可打印`);
      expect(next.printLogs).toHaveLength(state.printLogs.length);
      expect(next.logs).toHaveLength(state.logs.length);
    });

    it("拒绝超过批次可用量的报损并允许恰好全量报损", () => {
      const rejected = reduce(state, {
        type: "waste-batch",
        payload: { batchId: "BATCH-001", amount: 1801, reason: "盘点差异" },
      });
      expect(rejected.lastError).toContain("不能超过批次可用/打印重量 1800");
      expect(rejected.batches.find((batch) => batch.id === "BATCH-001")?.availableAmount).toBe(1800);

      const accepted = reduce(state, {
        type: "waste-batch",
        payload: { batchId: "BATCH-001", amount: 1800, reason: "盘点差异" },
      });
      expect(accepted.lastError).toBeUndefined();
      expect(accepted.batches.find((batch) => batch.id === "BATCH-001")).toMatchObject({
        availableAmount: 0,
        wastedAmount: 1800,
        status: "已报损",
      });
      expect(accepted.logs[0].action).toBe("报损");
    });
  });

  describe("租户范围与动作权限", () => {
    it("同租户跨角色共享领域状态且跨租户隔离", () => {
      const base = { tenantId: "TENANT-A", userId: "USER-1", pointIds: ["P-2", "P-1"] };
      expect(catalogResourcesStorageKey(base)).toContain("TENANT-A");
      expect(catalogResourcesStorageKey(base)).toBe(catalogResourcesStorageKey({ ...base, pointIds: ["P-1", "P-2"] }));
      expect(catalogResourcesStorageKey(base)).not.toBe(catalogResourcesStorageKey({ ...base, tenantId: "TENANT-B" }));
      expect(catalogResourcesStorageKey(base)).toBe(catalogResourcesStorageKey({ ...base, userId: "USER-2" }));
    });

    it("只读取当前 AppState scope 对应的最新分区", () => {
      const appState = createInitialState();
      const scope = scopeFromAppState(appState);
      const saved = createCatalogResourcesSeed(NOW, scope);
      saved.materials[0] = { ...saved.materials[0], name: "当前分区最新茶汤" };
      const values = new Map([[catalogResourcesStorageKey(scope), JSON.stringify(saved)]]);
      const storage = { getItem: (key: string) => values.get(key) || null };

      expect(readCatalogResourcesState(appState, storage).materials[0].name).toBe("当前分区最新茶汤");

      const anotherUser = { ...appState, currentUserId: "usr-008" };
      expect(catalogResourcesStorageKey(scopeFromAppState(anotherUser))).toBe(catalogResourcesStorageKey(scope));
      expect(readCatalogResourcesState(anotherUser, storage).materials[0].name).toBe("当前分区最新茶汤");
    });

    it("只读角色不能执行管理或现场动作", () => {
      const readonly = { actor: "审计员", permissions: ["read" as const] };
      const managed = catalogResourcesReducer(state, { type: "save-unit", payload: { id: "U-X", code: "X", name: "测试", precision: 0 }, meta: readonly });
      expect(managed.lastError).toContain("资源配置管理权限");
      expect(managed.units).toHaveLength(state.units.length);
      const field = catalogResourcesReducer(state, { type: "print-batch", payload: { batchId: "BATCH-001", amount: 1 }, meta: readonly });
      expect(field.lastError).toContain("现场作业权限");
      expect(field.printLogs).toHaveLength(state.printLogs.length);
    });

    it("点位角色只看到授权点位数据且领域层拒绝越权写入", () => {
      const second = { ...state.batches[0], id: "BATCH-OTHER", pointId: "POINT-002" };
      const shared = { ...state, batches: [...state.batches, second], bins: [...state.bins, { ...state.bins[0], id: "BIN-OTHER", pointId: "POINT-002" }] };
      const scoped = scopeCatalogResourcesState(shared, { pointIds: ["POINT-001"] });
      expect(scoped.points.map((point) => point.id)).toEqual(["POINT-001"]);
      expect(scoped.batches.map((batch) => batch.id)).not.toContain("BATCH-OTHER");
      expect(scoped.bins.map((bin) => bin.id)).not.toContain("BIN-OTHER");

      const denied = catalogResourcesReducer(shared, { type: "waste-batch", payload: { batchId: "BATCH-OTHER", amount: 1, reason: "测试" }, meta: { actor: "点位负责人", permissions: ["field"], pointIds: ["POINT-001"] } });
      expect(denied.lastError).toContain("授权点位范围");
      expect(denied.batches.find((batch) => batch.id === "BATCH-OTHER")?.wastedAmount).toBe(second.wastedAmount);
    });

    it("局部点位管理者不能创建影响范围外的区域或全国配方", () => {
      const meta = { actor: "局部配置管理员", permissions: ["manage" as const], pointIds: ["POINT-001"] };
      const regional = catalogResourcesReducer(state, { type: "add-formula", payload: { productCode: "LOCAL", productName: "局部商品", specCodes: ["COLD"], scope: "区域", targets: ["华东区"], steps: [{ materialId: "MAT-TEA", amount: 10, unit: "ml" }] }, meta });
      const national = catalogResourcesReducer(state, { type: "add-formula", payload: { productCode: "NATIONAL", productName: "全国商品", specCodes: ["COLD"], scope: "全国", targets: [], steps: [{ materialId: "MAT-TEA", amount: 10, unit: "ml" }] }, meta });
      expect(regional.lastError).toContain("未授权点位");
      expect(national.lastError).toContain("未授权点位");
    });

    it("局部编辑效期方案时保留授权范围外的既有绑定", () => {
      const shared = { ...state, validityPlans: state.validityPlans.map((plan) => ({ ...plan, pointIds: ["POINT-001", "POINT-002"] })) };
      const original = shared.validityPlans[0];
      const next = catalogResourcesReducer(shared, { type: "save-validity-plan", payload: { ...original, name: "局部更新", pointIds: ["POINT-001"] }, meta: { actor: "局部配置管理员", permissions: ["manage"], pointIds: ["POINT-001"] } });
      expect(next.lastError).toBeUndefined();
      expect(next.validityPlans[0].pointIds).toEqual(["POINT-002", "POINT-001"]);
    });
  });

  describe("补全的配置与下发规则", () => {
    it("允许 valid_time=-1 并保留当日到期语义", () => {
      const next = reduce(state, { type: "add-material", payload: { code: "DAY-MAT", name: "当日物料", unitId: "UNIT-ML", storageType: "冷藏", compatibleHardware: [], defaultValidMinutes: -1, defaultWarningMinutes: 30, calibrationPrecision: 1 } });
      expect(next.lastError).toBeUndefined();
      expect(next.materials[0].defaultValidMinutes).toBe(-1);
    });

    it("把区域与区域内点位识别为配方范围冲突", () => {
      const next = reduce(state, { type: "add-formula", payload: { productCode: "TEA-LATTE", productName: "招牌茶拿铁", specCodes: ["COLD", "NORMAL"], scope: "点位", targets: ["POINT-001"], steps: [{ materialId: "MAT-TEA", amount: 200, unit: "ml" }] } });
      expect(next.lastError).toBeUndefined();
      expect(next.formulas[0].version).toBe(4);
      expect(next.formulas.find((formula) => formula.id === "FM-001")?.status).toBe("停用");
    });

    it.each([
      ["坏规格", { specCodes: ["UNKNOWN"], steps: [{ materialId: "MAT-TEA", amount: 10, unit: "ml" }] }, "规格项"],
      ["坏物料", { specCodes: ["COLD"], steps: [{ materialId: "UNKNOWN", amount: 10, unit: "ml" }] }, "物料或单位"],
      ["坏单位", { specCodes: ["COLD"], steps: [{ materialId: "MAT-TEA", amount: 10, unit: "bucket" }] }, "物料或单位"],
      ["部分坏步骤", { specCodes: ["COLD"], steps: [{ materialId: "MAT-TEA", amount: 10, unit: "ml" }, { materialId: "", amount: 0, unit: "" }] }, "不能静默忽略"],
    ] as const)("整单拒绝%s引用", (_label, patch, message) => {
      const next = reduce(state, { type: "add-formula", payload: { productCode: "NEW", productName: "新商品", scope: "全国", targets: [], specCodes: [...patch.specCodes], steps: patch.steps.map((step) => ({ ...step })) } });
      expect(next.lastError).toContain(message);
      expect(next.formulas).toHaveLength(state.formulas.length);
    });

    it("保存效期方案并生成逐点位配方下发结果，失败点位可重试", () => {
      const withPlan = reduce(state, { type: "save-validity-plan", payload: { id: "VP-NEW", code: "VP-NEW", name: "新效期方案", status: "启用", autoWaste: false, pointIds: [], deliveryStatus: "待下发", rules: [{ materialId: "MAT-TEA", validMinutes: 60, warningMinutes: 10 }] } });
      expect(withPlan.lastError).toBeUndefined();
      expect(withPlan.validityPlans.some((plan) => plan.id === "VP-NEW")).toBe(true);

      const published = reduce(withPlan, { type: "publish-formula", payload: { formulaId: "FM-002", pointIds: withPlan.points.map((point) => point.id) } });
      const formula = published.formulas.find((item) => item.id === "FM-002")!;
      expect(formula.deliveryStatus).toBe("部分失败");
      expect(formula.deliveryResults).toHaveLength(3);
      const failed = formula.deliveryResults.find((item) => item.status === "失败")!;
      const retried = reduce(published, { type: "retry-formula-delivery", payload: { formulaId: formula.id, pointId: failed.pointId } });
      expect(retried.formulas.find((item) => item.id === formula.id)?.deliveryStatus).toBe("已完成");
      expect(retried.formulas.find((item) => item.id === formula.id)?.deliveryResults.every((item) => item.status === "成功")).toBe(true);
    });
  });

  describe("报损、补打与自动任务边界", () => {
    it("过期批次不可人工报损", () => {
      state = { ...state, batches: state.batches.map((batch) => ({ ...batch, expiresAt: "2026-08-19T09:00:00" })) };
      const next = reduce(state, { type: "waste-batch", payload: { batchId: "BATCH-001", amount: 1, reason: "人工报损" } });
      expect(next.lastError).toContain("已过期批次不可再次报损");
    });

    it("部分报损后整个批次停止打印", () => {
      const wasted = reduce(state, { type: "waste-batch", payload: { batchId: "BATCH-001", amount: 100, reason: "封签破损" } });
      expect(wasted.batches[0].status).toBe("已报损");
      const printed = reduce(wasted, { type: "print-batch", payload: { batchId: "BATCH-001", amount: 1 } });
      expect(printed.lastError).toContain("已报损批次不可打印");
    });

    it("补打重量不能超过首次打印重量", () => {
      state = { ...state, batches: state.batches.map((batch) => ({ ...batch, printCount: 0, firstPrintedAt: undefined, firstPrintAmount: undefined })), printLogs: [] };
      const first = reduce(state, { type: "print-batch", payload: { batchId: "BATCH-001", amount: 100 } });
      const rejected = reduce(first, { type: "print-batch", payload: { batchId: "BATCH-001", amount: 101 } });
      expect(rejected.lastError).toContain("首次打印重量 100");
    });

    it("自动报损仅在 06:00 后处理启用方案点位的过期批次", () => {
      state = { ...state, batches: state.batches.map((batch) => ({ ...batch, expiresAt: "2026-08-19T05:00:00", printCount: 0, firstPrintAmount: undefined })) };
      const early = catalogResourcesReducer(state, { type: "run-auto-waste", payload: { now: "2026-08-19T05:59:59" }, meta: { actor: "系统任务", permissions: ["system"] } });
      expect(early.lastError).toContain("06:00 后");
      const completed = catalogResourcesReducer(state, { type: "run-auto-waste", payload: { now: "2026-08-19T06:01:00" }, meta: { actor: "系统任务", permissions: ["system"] } });
      expect(completed.lastError).toBeUndefined();
      expect(completed.batches[0]).toMatchObject({ status: "已报损", availableAmount: 0, wastedAmount: 1800 });
      expect(completed.logs[0].action).toBe("自动报损");
    });
  });
});
