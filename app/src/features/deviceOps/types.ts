export type Supplier = {
  id: string;
  name: string;
  authorizedTenantIds: string[];
};

export type HardwareCapabilities = {
  mainboard: string;
  communication: string;
  storageMotors: number;
  weightSensors: number;
  flowmeters: number;
  liquidSensors: number;
  valves: string[];
  shakers: number;
  steamers: number;
  mixers: number;
  thermostats: number;
  fans: number;
  drinkingWaterLines: number;
  supportsSugarWash: boolean;
  supportsPumpback: boolean;
};

export type DeviceModel = {
  id: string;
  name: string;
  alias: string;
  code: string;
  category: string;
  supplierId: string;
  capabilities: HardwareCapabilities;
  status: "启用" | "停用";
};

export type ManagedDevice = {
  id: string;
  name: string;
  sn: string;
  tenantId: string | null;
  pointId: string | null;
  supplierId: string;
  modelId: string;
  status: "待激活" | "在线" | "离线" | "维护中";
  configTemplateId: string | null;
  desiredConfigTemplateId?: string | null;
  appliedConfigTemplateId?: string | null;
  activatedAt: string | null;
  appVersion: string;
  firmwareVersion: string;
  webVersion: string;
};

export type TemplateParameter = {
  storageNo: number;
  storageName: string;
  materialCode: string;
  capacity: number;
  warningThreshold: number;
  fullValue: number;
  dischargeValue: number;
  motorSpeed: number;
};

export type ConfigTemplate = {
  id: string;
  code: string;
  name: string;
  modelId: string;
  status: "启用" | "停用";
  description: string;
  parameters: TemplateParameter[];
  boundDeviceIds: string[];
  updatedAt: string;
};

export type DevicePublishStatus = "下发中" | "成功" | "失败" | "超时";

export type ManagedPoint = {
  id: string;
  name: string;
  tenantId: string;
};

export type DevicePublishRecord = {
  id: string;
  category: "配置模板" | "清洗方案" | "升级策略" | "离线策略";
  targetId: string;
  batchId: string;
  deviceId: string;
  status: DevicePublishStatus;
  reason: string;
  createdAt: string;
};

export type StorageBin = {
  id: string;
  deviceId: string;
  storageNo: number;
  name: string;
  materialCode: string;
  capacity: number;
  remaining: number;
  warningThreshold: number;
  calibrationFactor: number;
  calibratedAt: string | null;
};

export type StorageLog = {
  id: string;
  storageId: string;
  action: "补料" | "出料" | "容量调整" | "标定";
  quantity: number;
  before: number;
  after: number;
  operator: string;
  createdAt: string;
};

export type OfflinePolicy = {
  id: string;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  cutoffTime: string;
  checkIntervalMinutes: number;
  maxOfflineMinutes: number;
  boundDeviceIds: string[];
};

export type MaintenanceStep = {
  order: number;
  name: string;
  durationSeconds: number;
  instruction: string;
};

export type MaintenancePlan = {
  id: string;
  name: string;
  type: string;
  modelId: string;
  supplierId: string;
  status: "启用" | "停用" | "已删除";
  description: string;
  steps: MaintenanceStep[];
  boundDeviceIds: string[];
};

export type MaintenanceBatch = {
  id: string;
  planId: string;
  planName: string;
  status: "发布中" | "发布完成" | "超时失败" | "方案已删除";
  effectiveAt: string;
  createdAt: string;
  deviceResults: Array<{ deviceId: string; status: DevicePublishStatus; reason: string }>;
};

export type MaintenanceRecord = {
  id: string;
  planId: string;
  deviceId: string;
  type: string;
  result: "完成" | "异常";
  note: string;
  operator: string;
  performedAt: string;
};

export type SoftwareType = "App" | "固件" | "Web";
export type SoftwareStatus = "待审核" | "审核通过/灰度" | "全量发布";

export type SoftwarePackage = {
  id: string;
  name: string;
  version: string;
  type: SoftwareType;
  md5: string;
  address: string;
  modelId: string;
  status: SoftwareStatus;
  force: boolean;
  content: string;
  dependencyIds: string[];
  createdAt: string;
};

export type UpgradeScope =
  | { kind: "区域/全国"; label: string; deviceIds: string[] }
  | { kind: "点位"; label: string; pointIds: string[]; deviceIds: string[] }
  | { kind: "设备"; label: string; deviceIds: string[] };

export type UpgradePolicy = {
  id: string;
  name: string;
  description: string;
  method: "强制" | "可选";
  packageId: string;
  enabled: boolean;
  scope: UpgradeScope;
  targetVersion: string;
  deviceResults: Array<{ deviceId: string; status: DevicePublishStatus; reason: string; reportedVersion?: string }>;
  createdAt: string;
};

export type OperationLog = {
  id: string;
  action: string;
  object: string;
  result: "成功" | "拒绝";
  detail: string;
  createdAt: string;
};

export type DeviceOpsState = {
  version: 1;
  tenantId: string;
  points: ManagedPoint[];
  suppliers: Supplier[];
  models: DeviceModel[];
  devices: ManagedDevice[];
  templates: ConfigTemplate[];
  publishRecords: DevicePublishRecord[];
  storages: StorageBin[];
  storageLogs: StorageLog[];
  offlinePolicies: OfflinePolicy[];
  maintenancePlans: MaintenancePlan[];
  maintenanceBatches: MaintenanceBatch[];
  maintenanceRecords: MaintenanceRecord[];
  softwarePackages: SoftwarePackage[];
  upgradePolicies: UpgradePolicy[];
  operationLogs: OperationLog[];
};

export type DomainResult = { ok: true } | { ok: false; message: string };

export type DeviceOpsAction =
  | { type: "register-device"; payload: ManagedDevice }
  | { type: "bind-device"; payload: { deviceId: string; tenantId: string; pointId: string } }
  | { type: "change-device-model"; payload: { deviceId: string; modelId: string } }
  | { type: "activate-device"; payload: { deviceId: string } }
  | { type: "save-template"; payload: ConfigTemplate }
  | { type: "publish-template"; payload: { templateId: string; deviceIds: string[] } }
  | { type: "adjust-storage"; payload: { storageId: string; action: "补料" | "出料" | "容量调整"; quantity: number } }
  | { type: "calibrate-storage"; payload: { storageId: string; calibrationFactor: number } }
  | { type: "save-offline-policy"; payload: OfflinePolicy }
  | { type: "bind-offline-policy"; payload: { policyId: string; deviceId: string } }
  | { type: "save-maintenance-plan"; payload: MaintenancePlan }
  | { type: "delete-maintenance-plan"; payload: { planId: string } }
  | { type: "publish-maintenance-plan"; payload: { planId: string } }
  | { type: "settle-maintenance-batch"; payload: { batchId: string } }
  | { type: "record-maintenance"; payload: MaintenanceRecord }
  | { type: "save-software-package"; payload: SoftwarePackage }
  | { type: "delete-software-package"; payload: { packageId: string } }
  | { type: "set-software-status"; payload: { packageId: string; status: SoftwareStatus } }
  | { type: "save-upgrade-policy"; payload: UpgradePolicy }
  | { type: "enable-upgrade-policy"; payload: { policyId: string } }
  | { type: "settle-upgrade-device"; payload: { policyId: string; deviceId: string; status: "成功" | "失败" | "超时"; reportedVersion?: string; reason: string } }
  | { type: "retry-upgrade-device"; payload: { policyId: string; deviceId: string } }
  | { type: "record-denied-action"; payload: { action: string; object: string; detail: string } }
  | { type: "retry-device-publish"; payload: { recordId: string } };

export type DeviceOpsScope = {
  tenantId: string;
  userId: string;
  userName: string;
  roles: string[];
  pointIds: string[];
  points?: Array<{ id: string; name: string }>;
};

export type DeviceOpsCapability = "view-audit" | "field-operation" | "manage-device" | "manage-configuration";
