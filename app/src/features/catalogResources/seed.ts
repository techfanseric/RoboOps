import type { CatalogResourcesScope, CatalogResourcesState, Point } from "./types";

const pad = (value: number) => String(value).padStart(2, "0");
const localInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export function createCatalogResourcesSeed(now = new Date(), scope?: Pick<CatalogResourcesScope, "tenantId" | "points">): CatalogResourcesState {
  const activation = new Date(now); activation.setHours(8, 30, 0, 0);
  const warning = new Date(activation.getTime() + 420 * 60_000);
  const expiry = new Date(activation.getTime() + 480 * 60_000);
  const tenantId = scope?.tenantId || "TENANT-DEMO";
  const fallbackPoints: Point[] = [{ id: "POINT-001", name: "虹桥枢纽店", region: "华东区", tenantId, validityEnabled: true }, { id: "POINT-002", name: "张江展厅", region: "华东区", tenantId, validityEnabled: true }, { id: "POINT-003", name: "演示实验室", region: "华南区", tenantId, validityEnabled: false }];
  const points = scope?.points?.length ? scope.points : fallbackPoints;
  const primaryPoint = points[0];
  return {
    schemaVersion: 1,
    tenantId,
    specGroups: [
      { id: "SG-TEMP", code: "TEMP", name: "温度", sort: 1, options: [{ id: "SO-COLD", code: "COLD", name: "冰饮", alias: "冰", sort: 1, enabled: true }, { id: "SO-HOT", code: "HOT", name: "热饮", alias: "热", sort: 2, enabled: true }] },
      { id: "SG-SUGAR", code: "SUGAR", name: "甜度", sort: 2, options: [{ id: "SO-NORMAL", code: "NORMAL", name: "标准糖", sort: 1, enabled: true }, { id: "SO-ZERO", code: "ZERO", name: "不另外加糖", sort: 2, enabled: true }] },
    ],
    specTemplates: [{ id: "ST-001", code: "DRINK-BASE", name: "标准饮品规格", groupIds: ["SG-TEMP", "SG-SUGAR"], status: "启用", updatedAt: now.toISOString() }],
    formulas: [
      { id: "FM-001", productCode: "TEA-LATTE", productName: "招牌茶拿铁", specCodes: ["COLD", "NORMAL"], combinationCode: "TEA-LATTE-COLD-NORMAL", version: 3, scope: "区域", targets: [primaryPoint?.region || "华东区"], status: "启用", processId: "PP-001", deliveryStatus: "已完成", deliveryResults: primaryPoint ? [{ pointId: primaryPoint.id, status: "成功", reason: "设备回执成功", updatedAt: now.toISOString() }] : [], updatedAt: now.toISOString(), steps: [{ id: "FS-1", order: 1, materialId: "MAT-TEA", amount: 220, unit: "ml" }, { id: "FS-2", order: 2, materialId: "MAT-MILK", amount: 80, unit: "ml" }] },
      { id: "FM-002", productCode: "TEA-LATTE", productName: "招牌茶拿铁", specCodes: ["HOT", "ZERO"], combinationCode: "TEA-LATTE-HOT-ZERO", version: 1, scope: "全国", targets: [], status: "启用", processId: "PP-002", deliveryStatus: "待下发", deliveryResults: [], updatedAt: now.toISOString(), steps: [{ id: "FS-3", order: 1, materialId: "MAT-TEA", amount: 240, unit: "ml" }, { id: "FS-4", order: 2, materialId: "MAT-MILK", amount: 60, unit: "ml" }] },
    ],
    processPlans: [
      { id: "PP-001", code: "SHAKE-COLD", name: "冷饮标准摇杯", status: "启用", formulaCombinationCodes: ["TEA-LATTE-COLD-NORMAL"], steps: [{ order: 1, speed: 120, direction: "正转", seconds: 8 }, { order: 2, speed: 80, direction: "反转", seconds: 4 }] },
      { id: "PP-002", code: "MIX-HOT", name: "热饮低速混合", status: "启用", formulaCombinationCodes: ["TEA-LATTE-HOT-ZERO"], steps: [{ order: 1, speed: 60, direction: "正转", seconds: 6 }] },
    ],
    units: [{ id: "UNIT-ML", code: "ML", name: "ml", precision: 1 }, { id: "UNIT-G", code: "G", name: "g", precision: 1 }, { id: "UNIT-PC", code: "PC", name: "个", precision: 0 }],
    materials: [
      { id: "MAT-TEA", code: "TEA-BASE", name: "萃取茶汤", unitId: "UNIT-ML", density: 1.02, storageType: "保温桶冷藏", compatibleHardware: ["液体泵"], defaultValidMinutes: 480, defaultWarningMinutes: 60, calibrationPrecision: 1, status: "启用" },
      { id: "MAT-MILK", code: "FRESH-MILK", name: "鲜奶", unitId: "UNIT-ML", density: 1.03, storageType: "冷藏", compatibleHardware: ["冷藏液体泵"], defaultValidMinutes: 240, defaultWarningMinutes: 30, calibrationPrecision: 1, status: "启用" },
      { id: "MAT-CUP", code: "CUP-500", name: "500ml 杯", unitId: "UNIT-PC", storageType: "常温", compatibleHardware: ["落杯器"], defaultValidMinutes: 0, defaultWarningMinutes: 0, calibrationPrecision: 0, status: "启用" },
    ],
    bins: [
      { id: "BIN-001", pointId: primaryPoint?.id || "POINT-001", deviceSn: "RB202608001", number: "A01", materialId: "MAT-TEA", capacity: 5000, remaining: 1800, warningThreshold: 800, status: "正常", suppliedAt: activation.toISOString(), expiresAt: expiry.toISOString() },
      { id: "BIN-002", pointId: primaryPoint?.id || "POINT-001", deviceSn: "RB202608001", number: "A02", materialId: "MAT-MILK", capacity: 3000, remaining: 520, warningThreshold: 600, status: "低余量", suppliedAt: activation.toISOString(), expiresAt: new Date(activation.getTime() + 240 * 60_000).toISOString() },
    ],
    validityPlans: [{ id: "VP-001", code: "VP-DRINK-01", name: "饮品亭日常效期", status: "启用", autoWaste: true, pointIds: primaryPoint ? [primaryPoint.id] : [], deliveryStatus: "已完成", rules: [{ materialId: "MAT-TEA", validMinutes: 480, warningMinutes: 60 }, { materialId: "MAT-MILK", validMinutes: 240, warningMinutes: 30 }] }],
    points,
    batches: primaryPoint ? [{ id: "BATCH-001", code: `B${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-001`, pointId: primaryPoint.id, materialId: "MAT-TEA", activatedAt: localInput(activation), expiresAt: expiry.toISOString(), warningAt: warning.toISOString(), initialAmount: 2000, availableAmount: 1800, wastedAmount: 0, status: now >= expiry ? "已过期" : now >= warning ? "临期" : "可用", printCount: 1, firstPrintedAt: activation.toISOString(), firstPrintAmount: 2000 }] : [],
    logs: primaryPoint ? [{ id: "LOG-001", action: "首次打印", objectType: "批次", objectId: "BATCH-001", time: activation.toISOString(), operator: "门店值班员", note: "打印批次标签 2000 ml" }] : [],
    printLogs: primaryPoint ? [{ id: "PRINT-001", batchId: "BATCH-001", kind: "首次打印", amount: 2000, operator: "门店值班员", time: activation.toISOString() }] : [],
  };
}
