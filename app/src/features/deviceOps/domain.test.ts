import { describe, expect, it } from "vitest";
import {
  deviceOpsReducer,
  validateBinding,
  validateDevice,
  validateDeviceOpsAction,
  validateMaintenancePlan,
  validateOfflinePolicy,
  validateSoftwarePackage,
  validateUpgradePolicy,
} from "./domain";
import { deviceOpsSeed } from "./seed";
import type { DeviceOpsState, MaintenancePlan, SoftwarePackage, UpgradePolicy } from "./types";
import { capabilityForAction, dangerousDeviceOpsAction, deviceOpsStorageKey, scopeCan, scopeDeviceOpsState } from "./access";

function state(): DeviceOpsState {
  return structuredClone(deviceOpsSeed);
}

describe("设备 SN 与归属边界", () => {
  it("空点位授权范围不会退化为企业全部设备", () => {
    const scoped = scopeDeviceOpsState(state(), { tenantId: deviceOpsSeed.tenantId, userId: "U-NONE", userName: "无点位账号", roles: ["现场维护员"], pointIds: [] });
    expect(scoped.points).toHaveLength(0);
    expect(scoped.devices).toHaveLength(0);
    expect(scoped.storages).toHaveLength(0);
  });
  it.each(["RM-X2-01", "RM X2", "设备001", "RM_X2"])("拒绝非纯字母数字 SN：%s", (sn) => {
    const initial = state();
    const result = validateDevice(initial, { ...initial.devices[0], id: "dev-new", sn });

    expect(result).toEqual({ ok: false, message: "设备 SN 只能包含字母或数字。 " });
  });

  it("SN 唯一校验不区分大小写", () => {
    const initial = state();
    const result = validateDevice(initial, {
      ...initial.devices[0],
      id: "dev-new",
      sn: initial.devices[0].sn.toLowerCase(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("SN 已存在");
  });

  it("拒绝跨企业关联和已绑定设备直接改点位", () => {
    const initial = state();

    const tenantResult = validateBinding(initial, "dev-001", "tenant-other", "point-szbay");
    const pointResult = validateBinding(initial, "dev-001", initial.tenantId, "point-other");

    expect(tenantResult.ok).toBe(false);
    if (!tenantResult.ok) expect(tenantResult.message).toContain("其他企业");
    expect(pointResult.ok).toBe(false);
    if (!pointResult.ok) expect(pointResult.message).toContain("其他点位");
  });

  it("供应商未授权时拒绝企业绑定", () => {
    const initial = state();
    initial.devices.push({
      ...initial.devices[2],
      id: "dev-acme",
      sn: "ACME0001",
      supplierId: "supplier-acme",
      modelId: "model-acme-s1",
    });

    const result = validateBinding(initial, "dev-acme", initial.tenantId, "point-szbay");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("尚未获得该企业的数据授权");
  });

  it("拒绝跨供应商型号切换", () => {
    const initial = state();
    const result = validateDeviceOpsAction(initial, {
      type: "change-device-model",
      payload: { deviceId: "dev-001", modelId: "model-acme-s1" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("跨供应商");
  });

  it("拒绝不存在及不属于当前企业的点位", () => {
    const initial = state();
    const unbound = { ...initial.devices[2], tenantId: null, pointId: null };
    initial.devices = initial.devices.map((item) => item.id === unbound.id ? unbound : item);
    initial.points.push({ id: "point-other-tenant", name: "其他企业点位", tenantId: "tenant-other" });

    const missing = validateBinding(initial, unbound.id, initial.tenantId, "point-missing");
    const crossTenant = validateBinding(initial, unbound.id, initial.tenantId, "point-other-tenant");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toContain("目标点位不存在");
    expect(crossTenant.ok).toBe(false);
    if (!crossTenant.ok) expect(crossTenant.message).toContain("不属于当前企业");
  });
});

describe("料仓整数与容量边界", () => {
  it.each([
    ["补料小数", "补料", 10.5, "有效整数"],
    ["补料超容量", "补料", 1741, "不能超过容量"],
    ["出料超余量", "出料", 3261, "不能超过当前余量"],
    ["容量小于余量", "容量调整", 3259, "不能小于当前余量"],
  ] as const)("拒绝%s", (_label, action, quantity, message) => {
    const initial = state();
    const operation = {
      type: "adjust-storage" as const,
      payload: { storageId: "storage-001", action, quantity },
    };

    const result = validateDeviceOpsAction(initial, operation);
    const next = deviceOpsReducer(initial, operation);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
    expect(next.storages.find((item) => item.id === "storage-001")).toEqual(
      initial.storages.find((item) => item.id === "storage-001"),
    );
    expect(next.storageLogs).toHaveLength(initial.storageLogs.length);
  });

  it("允许精确补满、全部出料及把容量调整为当前余量", () => {
    const initial = state();
    const supplied = deviceOpsReducer(initial, {
      type: "adjust-storage",
      payload: { storageId: "storage-001", action: "补料", quantity: 1740 },
    });
    expect(supplied.storages.find((item) => item.id === "storage-001")?.remaining).toBe(5000);

    const emptied = deviceOpsReducer(initial, {
      type: "adjust-storage",
      payload: { storageId: "storage-001", action: "出料", quantity: 3260 },
    });
    expect(emptied.storages.find((item) => item.id === "storage-001")?.remaining).toBe(0);

    const resized = deviceOpsReducer(initial, {
      type: "adjust-storage",
      payload: { storageId: "storage-001", action: "容量调整", quantity: 3260 },
    });
    expect(resized.storages.find((item) => item.id === "storage-001")?.capacity).toBe(3260);
  });
});

describe("离线策略", () => {
  it("全局只允许一个默认策略", () => {
    const initial = state();
    const candidate = { ...initial.offlinePolicies[1], isDefault: true };
    const result = validateOfflinePolicy(initial, candidate);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("只能设置一个默认离线策略");
  });

  it("单 SN 改绑会从原策略移除", () => {
    const initial = state();
    const next = deviceOpsReducer(initial, {
      type: "bind-offline-policy",
      payload: { policyId: "offline-exhibition", deviceId: "dev-001" },
    });

    expect(next.offlinePolicies.find((item) => item.id === "offline-exhibition")?.boundDeviceIds).toContain("dev-001");
    expect(next.offlinePolicies.find((item) => item.id === "offline-default")?.boundDeviceIds).not.toContain("dev-001");
  });
});

describe("维护清洗方案", () => {
  it("同一设备同一维护类型只能绑定一个方案", () => {
    const initial = state();
    const conflicting: MaintenancePlan = {
      ...initial.maintenancePlans[0],
      id: "clean-conflict",
      name: "另一个每日清洗",
      boundDeviceIds: ["dev-001"],
    };
    const result = validateMaintenancePlan(initial, conflicting);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("同一设备同一维护类型只能绑定一个方案");
  });

  it("无步骤方案不可下发", () => {
    const initial = state();
    initial.maintenancePlans = initial.maintenancePlans.map((item) => item.id === "clean-daily"
      ? { ...item, steps: [] }
      : item);
    const result = validateDeviceOpsAction(initial, {
      type: "publish-maintenance-plan",
      payload: { planId: "clean-daily" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("空步骤方案不可下发");
  });

  it("删除方案会解绑设备并保留且标记历史批次", () => {
    const initial = state();
    const next = deviceOpsReducer(initial, {
      type: "delete-maintenance-plan",
      payload: { planId: "clean-daily" },
    });

    expect(next.maintenancePlans.find((item) => item.id === "clean-daily")).toMatchObject({
      status: "已删除",
      boundDeviceIds: [],
    });
    expect(next.maintenanceBatches.find((item) => item.planId === "clean-daily")?.status).toBe("方案已删除");
  });
});

describe("软件包规则", () => {
  const packageDraft = (type: SoftwarePackage["type"], id: string): SoftwarePackage => ({
    id,
    name: `测试${type}`,
    version: "9.9.9",
    type,
    md5: ({ App: "a", 固件: "b", Web: "c" } as const)[type].repeat(32),
    address: `oss://packages/${id}`,
    modelId: "model-rm-x2",
    status: "待审核",
    force: false,
    content: "测试包",
    dependencyIds: [],
    createdAt: "2026-08-19 10:00",
  });

  it.each(["App", "固件", "Web"] as const)("接受 %s 软件类型", (type) => {
    expect(validateSoftwarePackage(state(), packageDraft(type, `pkg-${type}`))).toEqual({ ok: true });
  });

  it("相同 MD5 仅允许同类型复用，保存时复用原文件地址", () => {
    const initial = state();
    const source = initial.softwarePackages.find((item) => item.id === "pkg-web-320")!;
    const sameType = { ...packageDraft("Web", "pkg-web-copy"), md5: source.md5, address: "oss://should-not-be-used" };
    const otherType = { ...packageDraft("App", "pkg-app-copy"), md5: source.md5 };

    expect(validateSoftwarePackage(initial, sameType)).toEqual({ ok: true });
    const next = deviceOpsReducer(initial, { type: "save-software-package", payload: sameType });
    expect(next.softwarePackages.find((item) => item.id === sameType.id)?.address).toBe(source.address);

    const rejected = validateSoftwarePackage(initial, otherType);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.message).toContain("相同 MD5 只能复用于同一软件类型");
  });

  it("被其他软件包依赖时禁止删除", () => {
    const initial = state();
    const operation = { type: "delete-software-package" as const, payload: { packageId: "pkg-fw-143" } };
    const result = validateDeviceOpsAction(initial, operation);
    const next = deviceOpsReducer(initial, operation);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("正被其他软件包依赖");
    expect(next.softwarePackages).toEqual(initial.softwarePackages);
  });
});

describe("升级策略", () => {
  it("第 11 条升级策略被拒绝", () => {
    const initial = state();
    const template = initial.upgradePolicies[0];
    initial.upgradePolicies = Array.from({ length: 10 }, (_, index) => ({
      ...template,
      id: `upgrade-${index}`,
      name: `升级策略 ${index}`,
      enabled: false,
    }));
    const candidate: UpgradePolicy = { ...template, id: "upgrade-11", name: "第十一条", enabled: false };
    const result = validateUpgradePolicy(initial, candidate);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("最多创建 10 条");
  });

  it("启用中的升级策略不可编辑", () => {
    const initial = state();
    const active = initial.upgradePolicies[0];
    expect(active.enabled).toBe(true);

    const result = validateUpgradePolicy(initial, { ...active, description: "尝试编辑" });
    const next = deviceOpsReducer(initial, {
      type: "save-upgrade-policy",
      payload: { ...active, description: "尝试编辑" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("启用中的升级策略不可编辑");
    expect(next.upgradePolicies.find((item) => item.id === active.id)?.description).toBe(active.description);
  });

  it("按下发中、完成/失败/超时、重试形成逐设备状态机并校验上报版本", () => {
    const initial = state();
    const draft = { ...initial.upgradePolicies[0], id: "upgrade-machine", name: "升级状态机", enabled: false, deviceResults: [] };
    initial.upgradePolicies = [draft];
    const enabled = deviceOpsReducer(initial, { type: "enable-upgrade-policy", payload: { policyId: draft.id } });
    expect(enabled.upgradePolicies[0].deviceResults[0].status).toBe("下发中");

    const wrongVersion = validateDeviceOpsAction(enabled, { type: "settle-upgrade-device", payload: { policyId: draft.id, deviceId: "dev-001", status: "成功", reportedVersion: "0.0.1", reason: "错误版本" } });
    expect(wrongVersion.ok).toBe(false);

    const failed = deviceOpsReducer(enabled, { type: "settle-upgrade-device", payload: { policyId: draft.id, deviceId: "dev-001", status: "超时", reason: "等待窗口已过" } });
    expect(failed.upgradePolicies[0].deviceResults[0].status).toBe("超时");
    const retried = deviceOpsReducer(failed, { type: "retry-upgrade-device", payload: { policyId: draft.id, deviceId: "dev-001" } });
    expect(retried.upgradePolicies[0].deviceResults[0]).toMatchObject({ status: "下发中", reportedVersion: undefined });

    const completed = deviceOpsReducer(retried, { type: "settle-upgrade-device", payload: { policyId: draft.id, deviceId: "dev-001", status: "成功", reportedVersion: draft.targetVersion, reason: "设备已上报" } });
    expect(completed.upgradePolicies[0].deviceResults[0]).toMatchObject({ status: "成功", reportedVersion: draft.targetVersion });
  });
});

describe("发布回执与实际维护记录", () => {
  it("配置模板只对成功回执更新 applied，失败设备只更新 desired", () => {
    const initial = state();
    initial.devices.push({ ...initial.devices[1], id: "dev-fail-third", sn: "RMX2A10004", appliedConfigTemplateId: null, configTemplateId: null });
    const next = deviceOpsReducer(initial, { type: "publish-template", payload: { templateId: "tpl-rmx2-standard", deviceIds: ["dev-001", "dev-002", "dev-fail-third"] } });

    expect(next.devices.find((item) => item.id === "dev-001")).toMatchObject({ desiredConfigTemplateId: "tpl-rmx2-standard", appliedConfigTemplateId: "tpl-rmx2-standard" });
    expect(next.devices.find((item) => item.id === "dev-fail-third")).toMatchObject({ desiredConfigTemplateId: "tpl-rmx2-standard", appliedConfigTemplateId: null });
    expect(next.publishRecords.find((item) => item.deviceId === "dev-fail-third")?.status).toBe("失败");
  });

  it("维护发布先进入发布中，再归集为完成或超时，并可另记实际维护", () => {
    const initial = state();
    const publishing = deviceOpsReducer(initial, { type: "publish-maintenance-plan", payload: { planId: "clean-daily" } });
    expect(publishing.maintenanceBatches[0].status).toBe("发布中");
    expect(publishing.maintenanceBatches[0].deviceResults.every((item) => item.status === "下发中")).toBe(true);

    const settled = deviceOpsReducer(publishing, { type: "settle-maintenance-batch", payload: { batchId: publishing.maintenanceBatches[0].id } });
    expect(settled.maintenanceBatches[0].status).toBe("超时失败");
    expect(settled.maintenanceBatches[0].deviceResults.map((item) => item.status)).toEqual(["成功", "失败"]);

    const recorded = deviceOpsReducer(settled, { type: "record-maintenance", payload: { id: "maint-new", planId: "clean-daily", deviceId: "dev-001", type: "管路清洗", result: "完成", note: "已完成现场清洗", operator: "现场维护员", performedAt: "2026-08-19 10:00" } });
    expect(recorded.maintenanceRecords[0]).toMatchObject({ id: "maint-new", result: "完成" });
  });
});

describe("租户用户隔离与动作权限", () => {
  const baseScope = { tenantId: "tenant-roboops", userId: "u-1", userName: "测试用户", pointIds: ["point-szbay"], roles: ["现场维护员"] };

  it("localStorage key 按租户共享，视图仍按企业和点位裁剪", () => {
    expect(deviceOpsStorageKey(baseScope)).toContain("tenant-roboops");
    expect(deviceOpsStorageKey(baseScope)).toBe(deviceOpsStorageKey({ ...baseScope, userId: "u-2" }));
    const visible = scopeDeviceOpsState(state(), baseScope);
    expect(visible.points.map((item) => item.id)).toEqual(["point-szbay"]);
    expect(visible.devices.every((item) => item.tenantId === baseScope.tenantId && item.pointId === "point-szbay")).toBe(true);
  });

  it("审计只读、现场仅允许料仓/维护记录，配置管理员可发布", () => {
    const audit = { ...baseScope, roles: ["审计员"] };
    expect(scopeCan(audit, "view-audit")).toBe(true);
    expect(scopeCan(audit, "field-operation")).toBe(false);
    expect(scopeCan(baseScope, "field-operation")).toBe(true);
    expect(scopeCan(baseScope, "manage-device")).toBe(false);
    expect(scopeCan(baseScope, "manage-configuration")).toBe(false);
    expect(scopeCan({ ...baseScope, roles: ["商品/配置管理员"] }, "manage-configuration")).toBe(true);
    expect(capabilityForAction({ type: "record-maintenance", payload: state().maintenanceRecords[0] })).toBe("field-operation");
    expect(capabilityForAction({ type: "publish-template", payload: { templateId: "tpl-rmx2-standard", deviceIds: ["dev-001"] } })).toBe("manage-configuration");
  });

  it("发布、删除、升级状态等危险动作要求二次确认", () => {
    expect(dangerousDeviceOpsAction({ type: "publish-template", payload: { templateId: "tpl-rmx2-standard", deviceIds: ["dev-001"] } })).toBe(true);
    expect(dangerousDeviceOpsAction({ type: "adjust-storage", payload: { storageId: "storage-001", action: "补料", quantity: 1 } })).toBe(false);
  });
});
