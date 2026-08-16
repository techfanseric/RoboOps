import type { DeviceOpsState } from "./types";

export const DEVICE_OPS_STORAGE_KEY = "roboops.device-operations.v1";

export const deviceOpsSeed: DeviceOpsState = {
  version: 1,
  tenantId: "tenant-roboops",
  points: [
    { id: "point-szbay", name: "深圳湾展厅", tenantId: "tenant-roboops" },
    { id: "point-nanshan", name: "南山服务中心", tenantId: "tenant-roboops" },
  ],
  suppliers: [
    { id: "supplier-robo", name: "RoboMotion 设备", authorizedTenantIds: ["tenant-roboops"] },
    { id: "supplier-acme", name: "ACME 自动化", authorizedTenantIds: [] },
  ],
  models: [
    {
      id: "model-rm-x2", name: "RM 商用工作站", alias: "双臂定制机", code: "RMX2", category: "自动作业工作站", supplierId: "supplier-robo", status: "启用",
      capabilities: { mainboard: "RK3588", communication: "Ethernet / 5G", storageMotors: 8, weightSensors: 8, flowmeters: 2, liquidSensors: 4, valves: ["常闭电磁阀", "比例阀"], shakers: 1, steamers: 1, mixers: 2, thermostats: 2, fans: 4, drinkingWaterLines: 2, supportsSugarWash: true, supportsPumpback: true },
    },
    {
      id: "model-acme-s1", name: "ACME Compact", alias: "轻型站", code: "ACS1", category: "单机设备", supplierId: "supplier-acme", status: "启用",
      capabilities: { mainboard: "CM4", communication: "Wi-Fi", storageMotors: 4, weightSensors: 4, flowmeters: 1, liquidSensors: 1, valves: ["常闭电磁阀"], shakers: 0, steamers: 0, mixers: 1, thermostats: 1, fans: 2, drinkingWaterLines: 1, supportsSugarWash: false, supportsPumpback: false },
    },
  ],
  devices: [
    { id: "dev-001", name: "深圳湾展厅工作站", sn: "RMX2A10001", tenantId: "tenant-roboops", pointId: "point-szbay", supplierId: "supplier-robo", modelId: "model-rm-x2", status: "在线", configTemplateId: "tpl-rmx2-standard", desiredConfigTemplateId: "tpl-rmx2-standard", appliedConfigTemplateId: "tpl-rmx2-standard", activatedAt: "2026-08-01 09:20", appVersion: "2.8.1", firmwareVersion: "1.4.3", webVersion: "3.2.0" },
    { id: "dev-002", name: "南山服务中心工作站", sn: "RMX2A10002", tenantId: "tenant-roboops", pointId: "point-nanshan", supplierId: "supplier-robo", modelId: "model-rm-x2", status: "离线", configTemplateId: null, desiredConfigTemplateId: null, appliedConfigTemplateId: null, activatedAt: "2026-08-03 11:05", appVersion: "2.7.9", firmwareVersion: "1.4.1", webVersion: "3.1.8" },
    { id: "dev-003", name: "待交付设备", sn: "RMX2A10003", tenantId: null, pointId: null, supplierId: "supplier-robo", modelId: "model-rm-x2", status: "待激活", configTemplateId: null, activatedAt: null, appVersion: "2.8.1", firmwareVersion: "1.4.3", webVersion: "3.2.0" },
  ],
  templates: [
    { id: "tpl-rmx2-standard", code: "RMX2-STANDARD", name: "RM X2 标准运营模板", modelId: "model-rm-x2", status: "启用", description: "标准料仓、称重反馈及电机运行参数。", boundDeviceIds: ["dev-001"], updatedAt: "2026-08-18 16:30", parameters: [
      { storageNo: 1, storageName: "一号料仓", materialCode: "MAT-A001", capacity: 5000, warningThreshold: 800, fullValue: 4800, dischargeValue: 120, motorSpeed: 220 },
      { storageNo: 2, storageName: "二号料仓", materialCode: "MAT-A002", capacity: 4000, warningThreshold: 600, fullValue: 3800, dischargeValue: 100, motorSpeed: 200 },
    ] },
  ],
  publishRecords: [
    { id: "pub-001", category: "配置模板", targetId: "tpl-rmx2-standard", batchId: "BATCH-TPL-0818", deviceId: "dev-001", status: "成功", reason: "设备回执成功", createdAt: "2026-08-18 16:32" },
  ],
  storages: [
    { id: "storage-001", deviceId: "dev-001", storageNo: 1, name: "一号料仓", materialCode: "MAT-A001", capacity: 5000, remaining: 3260, warningThreshold: 800, calibrationFactor: 1.012, calibratedAt: "2026-08-17 14:20" },
    { id: "storage-002", deviceId: "dev-001", storageNo: 2, name: "二号料仓", materialCode: "MAT-A002", capacity: 4000, remaining: 520, warningThreshold: 600, calibrationFactor: 0.996, calibratedAt: "2026-08-16 10:08" },
    { id: "storage-003", deviceId: "dev-002", storageNo: 1, name: "一号料仓", materialCode: "MAT-A001", capacity: 5000, remaining: 1500, warningThreshold: 800, calibrationFactor: 1, calibratedAt: null },
  ],
  storageLogs: [
    { id: "slog-001", storageId: "storage-001", action: "标定", quantity: 1.012, before: 1, after: 1.012, operator: "设备运维", createdAt: "2026-08-17 14:20" },
  ],
  offlinePolicies: [
    { id: "offline-default", name: "标准离线营业策略", isDefault: true, enabled: true, cutoffTime: "22:00", checkIntervalMinutes: 5, maxOfflineMinutes: 30, boundDeviceIds: ["dev-001", "dev-002"] },
    { id: "offline-exhibition", name: "展厅延长营业策略", isDefault: false, enabled: true, cutoffTime: "23:30", checkIntervalMinutes: 3, maxOfflineMinutes: 60, boundDeviceIds: [] },
  ],
  maintenancePlans: [
    { id: "clean-daily", name: "RM X2 每日管路清洗", type: "管路清洗", modelId: "model-rm-x2", supplierId: "supplier-robo", status: "启用", description: "闭店后执行的标准清洗流程。", boundDeviceIds: ["dev-001", "dev-002"], steps: [
      { order: 1, name: "排空管路", durationSeconds: 30, instruction: "停止供料并执行管路排空" },
      { order: 2, name: "清水冲洗", durationSeconds: 120, instruction: "开启清水阀并循环冲洗" },
      { order: 3, name: "回抽干燥", durationSeconds: 45, instruction: "启动回抽并确认无残液" },
    ] },
    { id: "clean-weekly", name: "RM X2 周度深度维护", type: "深度维护", modelId: "model-rm-x2", supplierId: "supplier-robo", status: "启用", description: "每周停机窗口执行。", boundDeviceIds: ["dev-001"], steps: [
      { order: 1, name: "传感器检查", durationSeconds: 180, instruction: "检查称重和液位传感器" },
      { order: 2, name: "执行机构润滑", durationSeconds: 300, instruction: "按维保规范补充润滑" },
    ] },
  ],
  maintenanceBatches: [
    { id: "CLEAN-BATCH-0818", planId: "clean-daily", planName: "RM X2 每日管路清洗", status: "发布完成", effectiveAt: "2026-08-18 22:00", createdAt: "2026-08-18 18:05", deviceResults: [{ deviceId: "dev-001", status: "成功", reason: "设备已确认" }, { deviceId: "dev-002", status: "失败", reason: "设备离线，等待重试" }] },
  ],
  maintenanceRecords: [
    { id: "maint-001", planId: "clean-daily", deviceId: "dev-001", type: "管路清洗", result: "完成", note: "三步流程执行完成，无残液。", operator: "现场维护员", performedAt: "2026-08-18 22:10" },
  ],
  softwarePackages: [
    { id: "pkg-app-281", name: "RoboOps Runtime", version: "2.8.1", type: "App", md5: "af38b93164e94e88a7c95ba7cc4cf627", address: "oss://packages/runtime-2.8.1.apk", modelId: "model-rm-x2", status: "全量发布", force: false, content: "优化任务恢复和设备心跳。", dependencyIds: ["pkg-fw-143", "pkg-web-320"], createdAt: "2026-08-15 10:00" },
    { id: "pkg-fw-143", name: "RM X2 MCU", version: "1.4.3", type: "固件", md5: "cdbdb92cbd624b2b985f526ad7eb21ad", address: "oss://packages/mcu-1.4.3.bin", modelId: "model-rm-x2", status: "全量发布", force: true, content: "修复电机过流保护边界。", dependencyIds: [], createdAt: "2026-08-14 17:20" },
    { id: "pkg-web-320", name: "设备交互界面", version: "3.2.0", type: "Web", md5: "8f42ed9348d54b41adbc034080ac78c3", address: "oss://packages/web-3.2.0.zip", modelId: "model-rm-x2", status: "审核通过/灰度", force: false, content: "新增维护流程进度提示。", dependencyIds: [], createdAt: "2026-08-17 09:40" },
  ],
  upgradePolicies: [
    { id: "upgrade-0818", name: "深圳湾 Web 3.2.0 灰度", description: "先在展厅设备验证交互界面。", method: "可选", packageId: "pkg-web-320", enabled: true, scope: { kind: "点位", label: "深圳湾展厅", pointIds: ["point-szbay"], deviceIds: ["dev-001"] }, targetVersion: "3.2.0", createdAt: "2026-08-18 12:20", deviceResults: [{ deviceId: "dev-001", status: "成功", reason: "版本上报 3.2.0" }] },
  ],
  operationLogs: [
    { id: "op-001", action: "发布清洗方案", object: "clean-daily", result: "成功", detail: "批次 CLEAN-BATCH-0818，共 2 台设备", createdAt: "2026-08-18 18:05" },
  ],
};
