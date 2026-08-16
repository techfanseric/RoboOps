import type {
  ConfigTemplate,
  DeviceOpsAction,
  DeviceOpsState,
  DomainResult,
  MaintenancePlan,
  ManagedDevice,
  OfflinePolicy,
  SoftwarePackage,
  UpgradePolicy,
} from "./types";

const ok: DomainResult = { ok: true };
const reject = (message: string): DomainResult => ({ ok: false, message });
const now = () => new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const isPositiveInteger = (value: number) => Number.isInteger(value) && value >= 0;

export function validateDevice(state: DeviceOpsState, device: ManagedDevice): DomainResult {
  if (!/^[A-Za-z0-9]+$/.test(device.sn)) return reject("设备 SN 只能包含字母或数字。 ");
  if (state.devices.some((item) => item.id !== device.id && item.sn.toLowerCase() === device.sn.toLowerCase())) return reject("设备 SN 已存在。 ");
  const model = state.models.find((item) => item.id === device.modelId);
  if (!model) return reject("设备型号不存在。 ");
  if (model.supplierId !== device.supplierId) return reject("设备供应商与型号供应商不一致。 ");
  return ok;
}

export function validateBinding(state: DeviceOpsState, deviceId: string, tenantId: string, pointId: string): DomainResult {
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device) return reject("设备不存在。 ");
  if (device.tenantId && device.tenantId !== tenantId) return reject("设备已关联其他企业，不可重新关联。 ");
  if (device.pointId && device.pointId !== pointId) return reject("设备已绑定其他点位，需先走解绑流程。 ");
  const point = state.points.find((item) => item.id === pointId);
  if (!point) return reject("目标点位不存在。 ");
  if (point.tenantId !== tenantId) return reject("目标点位不属于当前企业。 ");
  const supplier = state.suppliers.find((item) => item.id === device.supplierId);
  if (!supplier?.authorizedTenantIds.includes(tenantId)) return reject("供应商尚未获得该企业的数据授权。 ");
  return ok;
}

export function validateModelChange(state: DeviceOpsState, deviceId: string, modelId: string): DomainResult {
  const device = state.devices.find((item) => item.id === deviceId);
  const model = state.models.find((item) => item.id === modelId);
  if (!device || !model) return reject("设备或目标型号不存在。 ");
  if (device.supplierId !== model.supplierId) return reject("禁止跨供应商修改设备产品型号。 ");
  return ok;
}

export function validateTemplate(state: DeviceOpsState, template: ConfigTemplate): DomainResult {
  if (!template.name.trim() || !template.code.trim()) return reject("模板名称和编码不能为空。 ");
  if (!state.models.some((item) => item.id === template.modelId)) return reject("模板适用型号不存在。 ");
  if (state.templates.some((item) => item.id !== template.id && item.code.toLowerCase() === template.code.toLowerCase())) return reject("模板编码已存在。 ");
  if (!template.parameters.length) return reject("配置模板至少需要一个料仓参数。 ");
  const numbers = template.parameters.map((item) => item.storageNo);
  if (new Set(numbers).size !== numbers.length) return reject("同一模板的料仓编号不可重复。 ");
  for (const parameter of template.parameters) {
    if (![parameter.storageNo, parameter.capacity, parameter.warningThreshold, parameter.fullValue, parameter.dischargeValue, parameter.motorSpeed].every(isPositiveInteger)) return reject("料仓编号、容量、阈值和电机参数必须是有效整数。 ");
    if (parameter.warningThreshold > parameter.capacity) return reject("预警阈值不能超过料仓容量。 ");
    if (!parameter.storageName.trim() || !parameter.materialCode.trim()) return reject("料仓名称和资源编码不能为空。 ");
  }
  return ok;
}

export function validateOfflinePolicy(state: DeviceOpsState, policy: OfflinePolicy): DomainResult {
  if (!policy.name.trim()) return reject("离线策略名称不能为空。 ");
  if (policy.isDefault && state.offlinePolicies.some((item) => item.id !== policy.id && item.isDefault)) return reject("只能设置一个默认离线策略。 ");
  if (![policy.checkIntervalMinutes, policy.maxOfflineMinutes].every((value) => Number.isInteger(value) && value > 0)) return reject("检查间隔和最大离线时长必须是正整数。 ");
  return ok;
}

export function validateMaintenancePlan(state: DeviceOpsState, plan: MaintenancePlan): DomainResult {
  if (!plan.name.trim() || !plan.type.trim()) return reject("维护方案名称和类型不能为空。 ");
  if (!state.models.some((item) => item.id === plan.modelId)) return reject("维护方案适用型号不存在。 ");
  if (!plan.steps.length || plan.steps.some((step) => !step.name.trim() || step.durationSeconds <= 0)) return reject("维护方案必须包含有效步骤。 ");
  const conflict = state.maintenancePlans.some((item) => item.id !== plan.id && item.status !== "已删除" && item.name === plan.name && item.type === plan.type && item.modelId === plan.modelId);
  if (conflict) return reject("同名称、类型和硬件型号的维护方案已存在。 ");
  for (const deviceId of plan.boundDeviceIds) {
    const duplicate = state.maintenancePlans.some((item) => item.id !== plan.id && item.status !== "已删除" && item.type === plan.type && item.boundDeviceIds.includes(deviceId));
    if (duplicate) return reject("同一设备同一维护类型只能绑定一个方案。 ");
  }
  return ok;
}

export function validateSoftwarePackage(state: DeviceOpsState, software: SoftwarePackage): DomainResult {
  if (!software.name.trim() || !software.version.trim() || !software.address.trim()) return reject("软件包名称、版本和地址不能为空。 ");
  if (!/^[a-fA-F0-9]{32}$/.test(software.md5)) return reject("MD5 必须是 32 位十六进制字符串。 ");
  if (!state.models.some((item) => item.id === software.modelId)) return reject("软件包适用型号不存在。 ");
  if (state.softwarePackages.some((item) => item.id !== software.id && item.modelId === software.modelId && item.type === software.type && item.version === software.version)) return reject("同一硬件型号和软件类型的版本必须唯一。 ");
  const sameMd5 = state.softwarePackages.find((item) => item.id !== software.id && item.md5.toLowerCase() === software.md5.toLowerCase());
  if (sameMd5 && sameMd5.type !== software.type) return reject("相同 MD5 只能复用于同一软件类型。 ");
  if (software.dependencyIds.includes(software.id)) return reject("软件包不可依赖自身。 ");
  if (software.dependencyIds.some((id) => !state.softwarePackages.some((item) => item.id === id))) return reject("依赖的软件包不存在。 ");
  return ok;
}

export function validateUpgradePolicy(state: DeviceOpsState, policy: UpgradePolicy): DomainResult {
  const existing = state.upgradePolicies.find((item) => item.id === policy.id);
  if (existing?.enabled) return reject("启用中的升级策略不可编辑。 ");
  if (!existing && state.upgradePolicies.length >= 10) return reject("升级策略最多创建 10 条。 ");
  if (state.upgradePolicies.some((item) => item.id !== policy.id && item.name === policy.name)) return reject("升级策略名称已存在。 ");
  const software = state.softwarePackages.find((item) => item.id === policy.packageId);
  if (!software || software.status === "待审核") return reject("升级策略必须选择已审核的软件包。 ");
  if (!policy.scope.deviceIds.length) return reject("升级范围展开后没有可用设备。 ");
  if (policy.scope.deviceIds.some((deviceId) => !state.devices.some((item) => item.id === deviceId && item.modelId === software.modelId))) return reject("升级范围包含与软件包型号不兼容的设备。 ");
  return ok;
}

export function validateDeviceOpsAction(state: DeviceOpsState, action: DeviceOpsAction): DomainResult {
  switch (action.type) {
    case "register-device": return validateDevice(state, action.payload);
    case "bind-device": return validateBinding(state, action.payload.deviceId, action.payload.tenantId, action.payload.pointId);
    case "change-device-model": return validateModelChange(state, action.payload.deviceId, action.payload.modelId);
    case "save-template": return validateTemplate(state, action.payload);
    case "publish-template": {
      const template = state.templates.find((item) => item.id === action.payload.templateId);
      if (!template || template.status !== "启用") return reject("只有启用中的配置模板可以下发。 ");
      if (!action.payload.deviceIds.length) return reject("至少选择一台设备。 ");
      if (action.payload.deviceIds.some((id) => !state.devices.some((device) => device.id === id && device.modelId === template.modelId))) return reject("模板只能下发到适用型号的设备。 ");
      return ok;
    }
    case "adjust-storage": {
      const storage = state.storages.find((item) => item.id === action.payload.storageId);
      if (!storage) return reject("料仓不存在。 ");
      if (!isPositiveInteger(action.payload.quantity)) return reject("补料、出料和容量必须是有效整数。 ");
      if (action.payload.action === "补料" && storage.remaining + action.payload.quantity > storage.capacity) return reject("补料后余量不能超过容量。 ");
      if (action.payload.action === "出料" && action.payload.quantity > storage.remaining) return reject("出料量不能超过当前余量。 ");
      if (action.payload.action === "容量调整" && action.payload.quantity < storage.remaining) return reject("新容量不能小于当前余量。 ");
      return ok;
    }
    case "calibrate-storage": return action.payload.calibrationFactor > 0 && Number.isFinite(action.payload.calibrationFactor) ? ok : reject("标定系数必须大于 0。 ");
    case "save-offline-policy": return validateOfflinePolicy(state, action.payload);
    case "bind-offline-policy": return state.offlinePolicies.some((item) => item.id === action.payload.policyId) && state.devices.some((item) => item.id === action.payload.deviceId) ? ok : reject("设备或离线策略不存在。 ");
    case "save-maintenance-plan": return validateMaintenancePlan(state, action.payload);
    case "publish-maintenance-plan": {
      const plan = state.maintenancePlans.find((item) => item.id === action.payload.planId);
      if (!plan || plan.status !== "启用") return reject("只有启用中的维护方案可以发布。 ");
      if (!plan.steps.length) return reject("空步骤方案不可下发。 ");
      if (!plan.boundDeviceIds.length) return reject("维护方案尚未绑定设备。 ");
      return ok;
    }
    case "record-maintenance": {
      const plan = state.maintenancePlans.find((item) => item.id === action.payload.planId && item.status !== "已删除");
      if (!plan) return reject("维护方案不存在或已删除。 ");
      if (!plan.boundDeviceIds.includes(action.payload.deviceId)) return reject("设备未绑定该维护方案。 ");
      if (!action.payload.note.trim()) return reject("维护记录必须填写现场结果。 ");
      return ok;
    }
    case "save-software-package": return validateSoftwarePackage(state, action.payload);
    case "delete-software-package": return state.softwarePackages.some((item) => item.dependencyIds.includes(action.payload.packageId)) ? reject("软件包正被其他软件包依赖，不可删除。 ") : ok;
    case "save-upgrade-policy": return validateUpgradePolicy(state, action.payload);
    case "enable-upgrade-policy": {
      const policy = state.upgradePolicies.find((item) => item.id === action.payload.policyId);
      return policy ? validateUpgradePolicy({ ...state, upgradePolicies: state.upgradePolicies.filter((item) => item.id !== policy.id) }, { ...policy, enabled: false }) : reject("升级策略不存在。 ");
    }
    case "settle-upgrade-device": {
      const policy = state.upgradePolicies.find((item) => item.id === action.payload.policyId);
      const result = policy?.deviceResults.find((item) => item.deviceId === action.payload.deviceId);
      if (!policy?.enabled || !result || result.status !== "下发中") return reject("只有下发中的设备升级记录可以回执。 ");
      if (action.payload.status === "成功" && action.payload.reportedVersion !== policy.targetVersion) return reject("设备上报版本与目标版本不一致，不能标记成功。 ");
      return ok;
    }
    case "retry-upgrade-device": {
      const result = state.upgradePolicies.find((item) => item.id === action.payload.policyId)?.deviceResults.find((item) => item.deviceId === action.payload.deviceId);
      return result && ["失败", "超时"].includes(result.status) ? ok : reject("只有失败或超时的升级记录可以重试。 ");
    }
    default: return ok;
  }
}

function audit(state: DeviceOpsState, action: string, object: string, detail: string): DeviceOpsState {
  return { ...state, operationLogs: [{ id: uid("op"), action, object, result: "成功", detail, createdAt: now() }, ...state.operationLogs] };
}

export function deviceOpsReducer(state: DeviceOpsState, action: DeviceOpsAction): DeviceOpsState {
  if (!validateDeviceOpsAction(state, action).ok) return state;
  switch (action.type) {
    case "register-device": return audit({ ...state, devices: [...state.devices, action.payload] }, "登记设备", action.payload.sn, "完成 SN、型号及供应商一致性校验");
    case "bind-device": return audit({ ...state, devices: state.devices.map((item) => item.id === action.payload.deviceId ? { ...item, tenantId: action.payload.tenantId, pointId: action.payload.pointId } : item) }, "绑定设备", action.payload.deviceId, `绑定点位 ${action.payload.pointId}`);
    case "change-device-model": return audit({ ...state, devices: state.devices.map((item) => item.id === action.payload.deviceId ? { ...item, modelId: action.payload.modelId } : item) }, "修改设备型号", action.payload.deviceId, `目标型号 ${action.payload.modelId}`);
    case "activate-device": {
      const defaultPolicy = state.offlinePolicies.find((item) => item.isDefault && item.enabled);
      const device = state.devices.find((item) => item.id === action.payload.deviceId);
      const defaultPlans = device ? state.maintenancePlans.filter((item) => item.status === "启用" && item.modelId === device.modelId && !state.maintenancePlans.some((other) => other.id !== item.id && other.type === item.type && other.boundDeviceIds.includes(device.id))) : [];
      const next = {
        ...state,
        devices: state.devices.map((item) => item.id === action.payload.deviceId ? { ...item, status: "在线" as const, activatedAt: now() } : item),
        offlinePolicies: state.offlinePolicies.map((item) => defaultPolicy && item.id === defaultPolicy.id && !item.boundDeviceIds.includes(action.payload.deviceId) ? { ...item, boundDeviceIds: [...item.boundDeviceIds, action.payload.deviceId] } : item),
        maintenancePlans: state.maintenancePlans.map((item) => defaultPlans.some((plan) => plan.id === item.id) && !item.boundDeviceIds.includes(action.payload.deviceId) ? { ...item, boundDeviceIds: [...item.boundDeviceIds, action.payload.deviceId] } : item),
      };
      return audit(next, "激活设备", action.payload.deviceId, "设备进入正常状态并继承默认离线策略与缺失维护方案");
    }
    case "save-template": {
      const exists = state.templates.some((item) => item.id === action.payload.id);
      return audit({ ...state, templates: exists ? state.templates.map((item) => item.id === action.payload.id ? action.payload : item) : [...state.templates, action.payload] }, exists ? "编辑配置模板" : "新增配置模板", action.payload.id, `${action.payload.parameters.length} 组料仓参数`);
    }
    case "publish-template": {
      const batchId = uid("TPL-BATCH");
      const records = action.payload.deviceIds.map((deviceId, index) => ({ id: uid("pub"), category: "配置模板" as const, targetId: action.payload.templateId, batchId, deviceId, status: (index % 3 === 2 ? "失败" : "成功") as "成功" | "失败", reason: index % 3 === 2 ? "设备离线，等待重试" : "设备回执成功", createdAt: now() }));
      const successfulIds = records.filter((item) => item.status === "成功").map((item) => item.deviceId);
      const next = { ...state, devices: state.devices.map((item) => action.payload.deviceIds.includes(item.id) ? { ...item, desiredConfigTemplateId: action.payload.templateId, appliedConfigTemplateId: successfulIds.includes(item.id) ? action.payload.templateId : item.appliedConfigTemplateId ?? item.configTemplateId, configTemplateId: successfulIds.includes(item.id) ? action.payload.templateId : item.configTemplateId } : item), templates: state.templates.map((item) => item.id === action.payload.templateId ? { ...item, boundDeviceIds: Array.from(new Set([...item.boundDeviceIds, ...action.payload.deviceIds])) } : item), publishRecords: [...records, ...state.publishRecords] };
      return audit(next, "下发配置模板", action.payload.templateId, `批次 ${batchId}，${records.length} 台设备`);
    }
    case "adjust-storage": {
      const storage = state.storages.find((item) => item.id === action.payload.storageId)!;
      const before = action.payload.action === "容量调整" ? storage.capacity : storage.remaining;
      const after = action.payload.action === "补料" ? storage.remaining + action.payload.quantity : action.payload.action === "出料" ? storage.remaining - action.payload.quantity : action.payload.quantity;
      const next = { ...state, storages: state.storages.map((item) => item.id !== storage.id ? item : action.payload.action === "容量调整" ? { ...item, capacity: after } : { ...item, remaining: after }), storageLogs: [{ id: uid("slog"), storageId: storage.id, action: action.payload.action, quantity: action.payload.quantity, before, after, operator: "设备运维", createdAt: now() }, ...state.storageLogs] };
      return audit(next, action.payload.action, storage.id, `${before} → ${after}`);
    }
    case "calibrate-storage": {
      const storage = state.storages.find((item) => item.id === action.payload.storageId)!;
      const next = { ...state, storages: state.storages.map((item) => item.id === storage.id ? { ...item, calibrationFactor: action.payload.calibrationFactor, calibratedAt: now() } : item), storageLogs: [{ id: uid("slog"), storageId: storage.id, action: "标定" as const, quantity: action.payload.calibrationFactor, before: storage.calibrationFactor, after: action.payload.calibrationFactor, operator: "设备运维", createdAt: now() }, ...state.storageLogs] };
      return audit(next, "料仓标定", storage.id, `${storage.calibrationFactor} → ${action.payload.calibrationFactor}`);
    }
    case "save-offline-policy": {
      const exists = state.offlinePolicies.some((item) => item.id === action.payload.id);
      return audit({ ...state, offlinePolicies: exists ? state.offlinePolicies.map((item) => item.id === action.payload.id ? action.payload : item) : [...state.offlinePolicies, action.payload] }, exists ? "编辑离线策略" : "新增离线策略", action.payload.id, action.payload.isDefault ? "设置为默认策略" : "保存策略");
    }
    case "bind-offline-policy": {
      const next = { ...state, offlinePolicies: state.offlinePolicies.map((item) => ({ ...item, boundDeviceIds: item.id === action.payload.policyId ? Array.from(new Set([...item.boundDeviceIds, action.payload.deviceId])) : item.boundDeviceIds.filter((id) => id !== action.payload.deviceId) })) };
      return audit(next, "绑定离线策略", action.payload.deviceId, `单 SN 绑定至 ${action.payload.policyId}`);
    }
    case "save-maintenance-plan": {
      const exists = state.maintenancePlans.some((item) => item.id === action.payload.id);
      return audit({ ...state, maintenancePlans: exists ? state.maintenancePlans.map((item) => item.id === action.payload.id ? action.payload : item) : [...state.maintenancePlans, action.payload] }, exists ? "编辑维护方案" : "新增维护方案", action.payload.id, `${action.payload.steps.length} 个步骤`);
    }
    case "delete-maintenance-plan": {
      const plan = state.maintenancePlans.find((item) => item.id === action.payload.planId)!;
      const next = { ...state, maintenancePlans: state.maintenancePlans.map((item) => item.id === plan.id ? { ...item, status: "已删除" as const, boundDeviceIds: [] } : item), maintenanceBatches: state.maintenanceBatches.map((item) => item.planId === plan.id ? { ...item, status: "方案已删除" as const } : item) };
      return audit(next, "删除维护方案", plan.id, "已解绑设备，历史发布记录保留并标记方案已删除");
    }
    case "publish-maintenance-plan": {
      const plan = state.maintenancePlans.find((item) => item.id === action.payload.planId)!;
      const batchId = uid("CLEAN-BATCH");
      const results = plan.boundDeviceIds.map((deviceId) => ({ deviceId, status: "下发中" as const, reason: "等待设备回执" }));
      const batch = { id: batchId, planId: plan.id, planName: plan.name, status: "发布中" as const, effectiveAt: now(), createdAt: now(), deviceResults: results };
      const records = results.map((item) => ({ id: uid("pub"), category: "清洗方案" as const, targetId: plan.id, batchId, deviceId: item.deviceId, status: item.status, reason: item.reason, createdAt: now() }));
      return audit({ ...state, maintenanceBatches: [batch, ...state.maintenanceBatches], publishRecords: [...records, ...state.publishRecords] }, "发布清洗方案", plan.id, `批次 ${batchId}，${results.length} 台设备`);
    }
    case "settle-maintenance-batch": {
      const batch = state.maintenanceBatches.find((item) => item.id === action.payload.batchId);
      if (!batch || batch.status !== "发布中") return state;
      const results = batch.deviceResults.map((result) => state.devices.find((item) => item.id === result.deviceId)?.status === "离线" ? { ...result, status: "失败" as const, reason: "设备离线，发布超时" } : { ...result, status: "成功" as const, reason: "设备已确认" });
      const status = results.some((item) => item.status === "失败") ? "超时失败" as const : "发布完成" as const;
      const next = { ...state, maintenanceBatches: state.maintenanceBatches.map((item) => item.id === batch.id ? { ...item, status, deviceResults: results } : item), publishRecords: state.publishRecords.map((item) => item.batchId !== batch.id ? item : { ...item, status: results.find((result) => result.deviceId === item.deviceId)?.status || item.status, reason: results.find((result) => result.deviceId === item.deviceId)?.reason || item.reason }) };
      return audit(next, "完成清洗方案发布", batch.planId, `批次 ${batch.id}：${status}`);
    }
    case "record-maintenance": return audit({ ...state, maintenanceRecords: [action.payload, ...state.maintenanceRecords] }, "记录现场维护", action.payload.deviceId, `${action.payload.type} / ${action.payload.result} / ${action.payload.note}`);
    case "save-software-package": {
      const sameMd5 = state.softwarePackages.find((item) => item.id !== action.payload.id && item.md5.toLowerCase() === action.payload.md5.toLowerCase() && item.type === action.payload.type);
      const software = sameMd5 ? { ...action.payload, address: sameMd5.address } : action.payload;
      const exists = state.softwarePackages.some((item) => item.id === software.id);
      return audit({ ...state, softwarePackages: exists ? state.softwarePackages.map((item) => item.id === software.id ? software : item) : [...state.softwarePackages, software] }, exists ? "编辑软件包" : "新增软件包", software.id, sameMd5 ? "复用相同 MD5 的文件地址" : `${software.type} ${software.version}`);
    }
    case "delete-software-package": return audit({ ...state, softwarePackages: state.softwarePackages.filter((item) => item.id !== action.payload.packageId) }, "删除软件包", action.payload.packageId, "依赖校验通过");
    case "set-software-status": return audit({ ...state, softwarePackages: state.softwarePackages.map((item) => item.id === action.payload.packageId ? { ...item, status: action.payload.status } : item) }, "变更软件包状态", action.payload.packageId, action.payload.status);
    case "save-upgrade-policy": {
      const exists = state.upgradePolicies.some((item) => item.id === action.payload.id);
      return audit({ ...state, upgradePolicies: exists ? state.upgradePolicies.map((item) => item.id === action.payload.id ? action.payload : item) : [...state.upgradePolicies, action.payload] }, exists ? "编辑升级策略" : "新增升级策略", action.payload.id, `${action.payload.scope.kind}展开为 ${action.payload.scope.deviceIds.length} 台设备`);
    }
    case "enable-upgrade-policy": {
      const policy = state.upgradePolicies.find((item) => item.id === action.payload.policyId)!;
      const results = policy.scope.deviceIds.map((deviceId) => ({ deviceId, status: "下发中" as const, reason: "等待设备上报目标版本" }));
      const batchId = uid("UPGRADE-BATCH");
      const records = results.map((item) => ({ id: uid("pub"), category: "升级策略" as const, targetId: policy.id, batchId, deviceId: item.deviceId, status: item.status, reason: item.reason, createdAt: now() }));
      const next = { ...state, upgradePolicies: state.upgradePolicies.map((item) => item.id === policy.id ? { ...item, enabled: true, deviceResults: results } : item), publishRecords: [...records, ...state.publishRecords] };
      return audit(next, "启用升级策略", policy.id, `批次 ${batchId}，目标版本 ${policy.targetVersion}`);
    }
    case "settle-upgrade-device": {
      const policy = state.upgradePolicies.find((item) => item.id === action.payload.policyId)!;
      const next = { ...state, upgradePolicies: state.upgradePolicies.map((item) => item.id !== policy.id ? item : { ...item, deviceResults: item.deviceResults.map((result) => result.deviceId === action.payload.deviceId ? { ...result, status: action.payload.status, reason: action.payload.reason, reportedVersion: action.payload.reportedVersion } : result) }), publishRecords: state.publishRecords.map((item) => item.category === "升级策略" && item.targetId === policy.id && item.deviceId === action.payload.deviceId ? { ...item, status: action.payload.status, reason: action.payload.reason } : item) };
      return audit(next, "升级设备回执", action.payload.deviceId, `${action.payload.status} / 上报版本 ${action.payload.reportedVersion || "-"} / ${action.payload.reason}`);
    }
    case "retry-upgrade-device": {
      const next = { ...state, upgradePolicies: state.upgradePolicies.map((item) => item.id !== action.payload.policyId ? item : { ...item, deviceResults: item.deviceResults.map((result) => result.deviceId === action.payload.deviceId ? { ...result, status: "下发中" as const, reason: "已重试，等待设备上报", reportedVersion: undefined } : result) }), publishRecords: state.publishRecords.map((item) => item.category === "升级策略" && item.targetId === action.payload.policyId && item.deviceId === action.payload.deviceId ? { ...item, status: "下发中" as const, reason: "已重试，等待设备上报", createdAt: now() } : item) };
      return audit(next, "重试设备升级", action.payload.deviceId, `策略 ${action.payload.policyId}`);
    }
    case "record-denied-action": return { ...state, operationLogs: [{ id: uid("op"), action: action.payload.action, object: action.payload.object, result: "拒绝", detail: action.payload.detail, createdAt: now() }, ...state.operationLogs] };
    case "retry-device-publish": return audit({ ...state, publishRecords: state.publishRecords.map((item) => item.id === action.payload.recordId ? { ...item, status: "下发中", reason: "已重新进入下发队列", createdAt: now() } : item) }, "重试设备下发", action.payload.recordId, "保留原批次并重新入队");
    default: return state;
  }
}

export function safeParseDeviceOpsState(raw: string | null, seed: DeviceOpsState): DeviceOpsState {
  if (!raw) return seed;
  try {
    const parsed = JSON.parse(raw) as Partial<DeviceOpsState>;
    return parsed.version === 1 ? { ...seed, ...parsed } as DeviceOpsState : seed;
  } catch {
    return seed;
  }
}
