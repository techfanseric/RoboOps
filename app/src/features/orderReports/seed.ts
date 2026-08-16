import type { OrderReportsState } from "./types";

export const orderReportsSeed: OrderReportsState = {
  version: 1,
  points: [
    { id: "POINT-SZ-001", groupId: "TENANT-DEMO", name: "深圳湾展厅", code: "SZ-BAY-001", thirdPartyCode: "POS-SZ-1001", province: "广东省", city: "深圳市", district: "南山区", address: "科苑南路 2666 号", longitude: 113.9468, latitude: 22.5176, status: "营业中" },
    { id: "POINT-GZ-001", groupId: "TENANT-DEMO", name: "广州天河服务站", code: "GZ-TH-001", thirdPartyCode: "POS-GZ-2001", province: "广东省", city: "广州市", district: "天河区", address: "天河北路 233 号", longitude: 113.327, latitude: 23.136, status: "试运行" },
  ],
  devices: [
    { id: "DEVICE-001", groupId: "TENANT-DEMO", pointId: "POINT-SZ-001", sn: "TP20260818001", type: "制饮设备", available: true, boundAt: "2026-08-18T08:10:00+08:00" },
    { id: "DEVICE-002", groupId: "TENANT-DEMO", pointId: "POINT-GZ-001", sn: "TP20260818002", type: "制饮设备", available: true, boundAt: "2026-08-18T09:10:00+08:00" },
  ],
  formulas: [
    {
      id: "FORMULA-LATTE-3", groupId: "TENANT-DEMO", productCode: "DRINK-LATTE", specification: "大杯/少糖", comboCode: "DRINK-LATTE-L-S30", version: 3, enabled: true, pointIds: [],
      materialSteps: [
        { order: 1, materialCode: "MAT-MILK", materialName: "鲜奶", expected: 220, unit: "ml" },
        { order: 2, materialCode: "MAT-COFFEE", materialName: "咖啡液", expected: 60, unit: "ml" },
        { order: 3, materialCode: "MAT-SYRUP", materialName: "糖浆", expected: 10, unit: "ml" },
      ],
      processEnabled: true,
      processSteps: [{ order: 1, name: "混合", seconds: 8, rpm: 180, direction: "正转" }],
    },
    {
      id: "FORMULA-TEA-2", groupId: "TENANT-DEMO", productCode: "DRINK-TEA", specification: "中杯/标准", comboCode: "DRINK-TEA-M-STD", version: 2, enabled: true, pointIds: ["POINT-GZ-001"],
      materialSteps: [
        { order: 1, materialCode: "MAT-TEA", materialName: "茶汤", expected: 260, unit: "ml" },
        { order: 2, materialCode: "MAT-SYRUP", materialName: "糖浆", expected: 20, unit: "ml" },
      ],
      processEnabled: false,
      processSteps: [],
    },
  ],
  orders: [
    {
      id: "ORDER-DEMO-001", groupId: "TENANT-DEMO", createdBy: "运营经理", createdAt: "2026-08-19T08:31:12+08:00", pointId: "POINT-SZ-001", deviceId: "DEVICE-001", orderNo: "MO2026081900001", pickupNo: "101", productSequence: 1, itemCode: "MO2026081900001-01", productCode: "DRINK-LATTE", productName: "拿铁", specification: "大杯/少糖", quantity: 1, formulaId: "FORMULA-LATTE-3", comboCode: "DRINK-LATTE-L-S30", legacyState: 3, dispatchState: "已下发", retryCount: 0, refundState: "未申请", refundAttempts: 0, scanned: true, totalResourceUsage: 290, executionStartedAt: "2026-08-19T08:32:01+08:00", executionFinishedAt: "2026-08-19T08:32:42+08:00",
      steps: [
        { id: "STEP-001", orderId: "ORDER-DEMO-001", order: 1, materialCode: "MAT-MILK", materialName: "鲜奶", expected: 220, actual: 218, unit: "ml", status: "完成", exceptionReason: "", durationSeconds: 14 },
        { id: "STEP-002", orderId: "ORDER-DEMO-001", order: 2, materialCode: "MAT-COFFEE", materialName: "咖啡液", expected: 60, actual: 60, unit: "ml", status: "完成", exceptionReason: "", durationSeconds: 18 },
        { id: "STEP-003", orderId: "ORDER-DEMO-001", order: 3, materialCode: "MAT-SYRUP", materialName: "糖浆", expected: 10, actual: 10, unit: "ml", status: "完成", exceptionReason: "", durationSeconds: 9 },
      ],
      processSteps: [{ order: 1, name: "混合", seconds: 8, rpm: 180, direction: "正转" }],
    },
    {
      id: "ORDER-DEMO-002", groupId: "TENANT-DEMO", createdBy: "值班员", createdAt: "2026-08-19T08:42:05+08:00", pointId: "POINT-GZ-001", deviceId: "DEVICE-002", orderNo: "MO2026081900002", pickupNo: "102", productSequence: 1, itemCode: "MO2026081900002-01", productCode: "DRINK-TEA", productName: "原叶鲜茶", specification: "中杯/标准", quantity: 1, formulaId: "FORMULA-TEA-2", comboCode: "DRINK-TEA-M-STD", legacyState: 1, dispatchState: "下发失败", retryCount: 1, refundState: "未申请", refundAttempts: 0, scanned: false, totalResourceUsage: 280,
      steps: [
        { id: "STEP-004", orderId: "ORDER-DEMO-002", order: 1, materialCode: "MAT-TEA", materialName: "茶汤", expected: 260, actual: 121, unit: "ml", status: "异常", exceptionReason: "流量计读数异常，实际出料不足", durationSeconds: 22 },
        { id: "STEP-005", orderId: "ORDER-DEMO-002", order: 2, materialCode: "MAT-SYRUP", materialName: "糖浆", expected: 20, actual: 0, unit: "ml", status: "待执行", exceptionReason: "", durationSeconds: 0 },
      ],
      processSteps: [],
    },
  ],
  dataLogs: [
    { id: "DLOG-002", orderId: "ORDER-DEMO-002", event: "ORDER_RETRY", retry: true, result: "失败", reason: "设备执行中断", deviceSn: "TP20260818002", time: "2026-08-19T08:43:10+08:00" },
    { id: "DLOG-001", orderId: "ORDER-DEMO-001", event: "ORDER_PUSH", retry: false, result: "成功", reason: "订单下发已提交", deviceSn: "TP20260818001", time: "2026-08-19T08:31:30+08:00" },
  ],
  printLogs: [{ id: "PRINT-001", orderId: "ORDER-DEMO-001", printType: "首次打印", result: "成功", operator: "运营经理", time: "2026-08-19T08:31:35+08:00", reason: "订单首次打印" }],
  reportRows: [
    { id: "R-PRODUCT-1", type: "商品销售", dimension: "拿铁 / 大杯少糖", point: "深圳湾展厅", value: 128, unit: "杯", occurredAt: "2026-08-19", detail: "销售额 ¥3,584，完成率 98.4%" },
    { id: "R-POINT-1", type: "点位销售", dimension: "深圳湾展厅", point: "深圳湾展厅", value: 346, unit: "单", occurredAt: "2026-08-19", detail: "销售额 ¥9,842，退款 3 单" },
    { id: "R-PRODUCTION-1", type: "生产明细", dimension: "MO2026081900001", point: "深圳湾展厅", value: 41, unit: "秒", occurredAt: "2026-08-19 08:32", detail: "应出 290ml / 实出 288ml" },
    { id: "R-MATERIAL-1", type: "物料用量", dimension: "鲜奶 MAT-MILK", point: "深圳湾展厅", value: 28.16, unit: "L", occurredAt: "2026-08-19", detail: "订单用量 28.10L / 调试 0.06L" },
    { id: "R-STORAGE-1", type: "料仓用量", dimension: "1# 冷藏料仓", point: "深圳湾展厅", value: 71, unit: "%", occurredAt: "2026-08-19 09:00", detail: "当前 7.1L / 容量 10L" },
    { id: "R-CALIBRATION-1", type: "标定记录", dimension: "鲜奶泵", point: "深圳湾展厅", value: 0.98, unit: "系数", occurredAt: "2026-08-18 17:20", detail: "标定前 0.95 / 操作人 设备工程师" },
    { id: "R-LOSS-1", type: "损耗记录", dimension: "茶汤 MAT-TEA", point: "广州天河服务站", value: 0.139, unit: "L", occurredAt: "2026-08-19 08:43", detail: "制作异常损耗 / 关联 MO2026081900002" },
  ],
  exportTasks: [
    { id: "EXPORT-001", reportType: "商品销售", filters: "近 7 天 / 全部点位", status: "成功", createdBy: "运营经理", createdAt: "2026-08-19T08:00:00+08:00", updatedAt: "2026-08-19T08:00:18+08:00", isRead: false, fileName: "商品销售-2026-08-19.xlsx" },
    { id: "EXPORT-002", reportType: "生产明细", filters: "今日 / 深圳湾展厅", status: "执行中", createdBy: "运营经理", createdAt: "2026-08-19T09:00:00+08:00", updatedAt: "2026-08-19T09:00:20+08:00", isRead: false },
  ],
  auditLogs: [],
};
