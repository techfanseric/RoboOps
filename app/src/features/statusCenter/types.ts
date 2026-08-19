export type StatusDimension = "连接状态" | "运行状态" | "业务状态" | "安全状态";
export type StatusCategory = "正常" | "提醒" | "警告" | "故障" | "不可用";
export type IncidentSeverity = "P0" | "P1" | "P2";
export type ScopeLevel = "平台默认" | "企业" | "品牌" | "场景" | "设备型号" | "单台设备";
export type ReleaseStatus = "待审批" | "已批准" | "发布中" | "已发布" | "部分失败" | "失败" | "已回退";

export interface StatusDefinition {
  id: string;
  code: string;
  name: string;
  dimension: StatusDimension;
  category: StatusCategory;
  appliesTo: string[];
  tenant: string;
  scopeLevel: ScopeLevel;
  scopeTargets: string[];
  affectsOrder: boolean;
  affectsDispatch: boolean;
  affectsPointOperation: boolean;
  manualConfirm: boolean;
  autoCreateIncident: boolean;
  triggerAfterMinutes: number;
  recoveryStatusCode?: string;
  description: string;
  enabled: boolean;
  version: number;
  updatedAt: string;
}

export interface IncidentRule {
  id: string;
  code: string;
  name: string;
  tenant: string;
  scopeLevel: ScopeLevel;
  scopeTargets: string[];
  deviceTypes: string[];
  source: string;
  rawCodes: string[];
  triggerCondition: string;
  consecutiveCount: number;
  dedupeMinutes: number;
  severity: IncidentSeverity;
  owner: string;
  escalation: string;
  slaMinutes: number;
  sop: string;
  notificationChannels: string[];
  notifyPointOwner: boolean;
  autoCreateTask: boolean;
  affectsOrder: boolean;
  affectsPointOperation: boolean;
  autoRecover: boolean;
  recoveryCondition: string;
  enabled: boolean;
  version: number;
  updatedAt: string;
}

export interface StatusReleaseResult {
  targetId: string;
  targetName: string;
  status: "成功" | "失败";
  reason: string;
}

export interface StatusRelease {
  id: string;
  objectType: "状态字典" | "异常规则";
  objectId: string;
  objectName: string;
  tenant: string;
  scopeLevel: ScopeLevel;
  scopeTargets: string[];
  summary: string;
  impactDeviceIds: string[];
  impactPointIds: string[];
  requester: string;
  approver: string;
  status: ReleaseStatus;
  createdAt: string;
  approvedAt?: string;
  publishedAt?: string;
  version: number;
  draft: StatusDefinition | IncidentRule;
  previous?: StatusDefinition | IncidentRule;
  results: StatusReleaseResult[];
}

export interface DeviceSilence {
  id: string;
  deviceId: string;
  ruleCode?: string;
  reason: string;
  operator: string;
  createdAt: string;
  expiresAt: string;
}

export interface StatusCenterAudit {
  id: string;
  time: string;
  actor: string;
  action: string;
  object: string;
  risk: "L1" | "L2" | "L3" | "L4";
  result: "成功" | "拒绝";
  detail: string;
}

export interface StatusCenterState {
  schemaVersion: 1;
  statusDefinitions: StatusDefinition[];
  incidentRules: IncidentRule[];
  releases: StatusRelease[];
  silences: DeviceSilence[];
  audits: StatusCenterAudit[];
  lastError?: string;
  lastNotice?: string;
}

export interface StatusCenterScope {
  actor: string;
  roles: string[];
  tenantNames: string[];
  pointIds: string[];
  pointNames: string[];
  brandNames: string[];
  scenarioNames: string[];
  deviceIds: string[];
  deviceTypes: string[];
  canManage: boolean;
  canApprove: boolean;
  canPublish: boolean;
  auditOnly: boolean;
}

export interface StatusActionMeta extends StatusCenterScope {}

export type StatusCenterAction =
  | { type: "clear-feedback" }
  | { type: "submit-status-change"; payload: { definition: StatusDefinition; summary: string; impactDeviceIds: string[]; impactPointIds: string[] }; meta: StatusActionMeta }
  | { type: "submit-rule-change"; payload: { rule: IncidentRule; summary: string; impactDeviceIds: string[]; impactPointIds: string[] }; meta: StatusActionMeta }
  | { type: "approve-release"; payload: { releaseId: string }; meta: StatusActionMeta }
  | { type: "publish-release"; payload: { releaseId: string; targets: Array<{ id: string; name: string }> }; meta: StatusActionMeta }
  | { type: "retry-release-targets"; payload: { releaseId: string }; meta: StatusActionMeta }
  | { type: "rollback-release"; payload: { releaseId: string }; meta: StatusActionMeta }
  | { type: "mute-device"; payload: { deviceId: string; ruleCode?: string; reason: string; minutes: number }; meta: StatusActionMeta }
  | { type: "expire-silences"; payload: { now: string } };

export interface DeviceHealthRow {
  deviceId: string;
  name: string;
  sn: string;
  type: string;
  version: string;
  pointId: string;
  pointName: string;
  brand: string;
  tenant: string;
  connectionStatus: string;
  operationStatus: string;
  businessStatus: string;
  safetyStatus: string;
  health: "正常" | "关注" | "故障" | "不可用";
  severity?: IncidentSeverity;
  currentException?: string;
  currentIncidentId?: string;
  owner?: string;
  lastHeartbeatAt: string;
  abnormalSince?: string;
  incidentCount: number;
  mutedUntil?: string;
}

export interface DeviceTimelineItem {
  id: string;
  time: string;
  kind: "状态" | "设备事件" | "异常" | "命令" | "静默";
  title: string;
  detail: string;
  tone: "ok" | "warn" | "bad" | "info" | "neutral";
}
