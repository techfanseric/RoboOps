import { staticData } from "../data/mockData";
import type {
  AppState,
  ApiOperation,
  ApprovalRequest,
  AuditLog,
  Brand,
  BrandChange,
  BusinessRequest,
  BusinessSnapshot,
  CatalogChange,
  CatalogItem,
  CommandRecord,
  Device,
  DeviceChange,
  Incident,
  Organization,
  OrganizationChange,
  Point,
  PointCheck,
  PointReadiness,
  ProcessingRecord,
  ProductVariant,
  RefundCase,
  ReleaseDiff,
  ReleaseRecord,
  ScenarioTemplate,
  ScopeSelection,
  Task,
  TeamAssignment,
  TeamSettings,
  Tenant,
  User,
  UserInvitation,
  ViewId,
} from "../types/core";

const openIncidentStatuses = new Set(["new", "triaged", "assigned", "processing", "waiting_manual_confirm", "converted_to_refund", "converted_to_field_service"]);
const openTaskStatuses = new Set(["已创建", "已分派", "处理中", "等待外部条件"]);
const terminalRequestStatuses = new Set(["delivered", "cancelled", "refunded"]);

const menuRules: Record<ViewId, { permission: string; roles: string[]; packages: string[]; description: string }> = {
  workbench: { permission: "经营看板", roles: [], packages: [], description: "所有启用账号都可进入工作台查看自己的待办和经营状态。" },
  brands: { permission: "品牌或组织管理", roles: ["平台支持", "租户管理员", "业务负责人", "运营负责人"], packages: ["用户权限管理包", "审计查看包"], description: "需要能查看租户、品牌、组织和上线责任。" },
  templates: { permission: "场景模板配置", roles: ["平台支持", "业务负责人", "运营负责人", "商品/配置管理员", "场景模板管理员", "配置发布人", "配置审批人", "审计员"], packages: ["场景模板配置包", "配置发布包", "审计查看包"], description: "需要能查看或维护场景字段、状态和异常字典。" },
  points: { permission: "点位运营", roles: ["平台支持", "租户管理员", "业务负责人", "运营负责人", "点位负责人", "机器人/设备运维", "现场维护员", "试运行操作员"], packages: ["点位运营包", "现场任务包", "设备查看包"], description: "需要管理或执行点位日常运营。" },
  devices: { permission: "设备查看", roles: ["平台支持", "业务负责人", "运营负责人", "点位负责人", "机器人/设备运维", "设备运维负责人", "现场维护员", "审计员", "试运行操作员"], packages: ["设备查看包", "设备运维包", "设备高危命令包", "审计查看包"], description: "需要查看设备状态、事件、日志和命令记录。" },
  catalog: { permission: "商品服务管理", roles: ["平台支持", "业务负责人", "运营负责人", "商品/配置管理员", "场景模板管理员", "配置发布人", "配置审批人", "审计员"], packages: ["商品服务管理包", "场景模板配置包", "配置发布包", "审计查看包"], description: "需要查看或维护商品/服务、SKU 和可售范围。" },
  resources: { permission: "资源耗材管理", roles: ["平台支持", "业务负责人", "运营负责人", "点位负责人", "商品/配置管理员", "现场维护员", "机器人/设备运维", "审计员"], packages: ["商品服务管理包", "点位运营包", "现场任务包", "设备运维包", "审计查看包"], description: "需要维护资源、料仓、效期、批次、补料、报损或现场作业。" },
  orders: { permission: "订单处理", roles: ["平台支持", "业务负责人", "运营负责人", "点位负责人", "客服/售后", "退款审批人", "财务/结算", "审计员", "试运行操作员"], packages: ["订单处理包", "客服售后包", "退款发起包", "退款审批包", "审计查看包"], description: "需要查看交易和履约请求上下文。" },
  incidents: { permission: "状态与异常管理", roles: ["平台支持", "业务负责人", "运营负责人", "点位负责人", "客服/售后", "机器人/设备运维", "设备运维负责人", "现场维护员", "商品/配置管理员", "场景模板管理员", "配置发布人", "配置审批人", "审计员", "试运行操作员"], packages: ["异常处理包", "客服售后包", "设备运维包", "现场任务包", "配置审批包", "配置发布包", "审计查看包"], description: "需要查看设备健康、配置状态与异常规则，或执行异常处置。" },
  tasks: { permission: "现场任务", roles: ["平台支持", "业务负责人", "运营负责人", "点位负责人", "现场维护员", "机器人/设备运维", "客服/售后", "试运行操作员"], packages: ["现场任务包", "设备运维包", "客服售后包"], description: "需要承接异常、维护、客服或人工确认任务。" },
  releases: { permission: "配置发布", roles: ["平台支持", "业务负责人", "运营负责人", "商品/配置管理员", "场景模板管理员", "配置发布人", "配置审批人", "审计员"], packages: ["配置发布包", "场景模板配置包", "审计查看包"], description: "需要查看、提交或审批配置发布。" },
  reports: { permission: "报表查看", roles: ["平台支持", "租户管理员", "业务负责人", "运营负责人", "财务/结算", "数据查看员", "审计员"], packages: ["工作台查看包", "报表查看包", "报表导出包", "审计查看包"], description: "需要查看经营、设备、异常和接口同步复盘。" },
  roles: { permission: "权限自检", roles: ["平台支持", "租户管理员", "业务负责人", "运营负责人", "审计员"], packages: ["用户权限管理包", "审计查看包"], description: "需要查看当前账号权限来源、审批队列和风险授权。" },
  integrations: { permission: "集成与开放平台", roles: ["平台支持", "租户管理员", "业务负责人", "集成管理员", "开发者", "审计员"], packages: ["用户权限管理包", "配置发布包", "审计查看包"], description: "需要管理开发者授权、OpenAPI、MQTT、事件订阅或数据同步。" },
};

export type BadgeTone = "ok" | "warn" | "bad" | "info" | "neutral";

export type IncidentWorkflowAction = "advance" | "task" | "refund" | "close";
export type TaskWorkflowAction = "start" | "resolve";
export type DeviceCommandAction = "sync-status" | "sync-config" | "restart";

export interface IncidentActionPayload {
  note: string;
  impact?: string;
  owner?: string;
}

export interface IncidentCreatePayload {
  type: string;
  level: string;
  source: string;
  point: string;
  owner: string;
  note: string;
}

export interface TaskActionPayload {
  note: string;
  result?: string;
}

export interface ActionPolicy {
  label: string;
  risk: string;
  allowed: boolean;
  requiresApproval: boolean;
  approver?: string;
  rule?: string;
  message: string;
}

export interface ActionMatrixRow {
  module: string;
  action: string;
  risk: string;
  status: string;
  source: string;
  reason: string;
}

export interface FilterOptions {
  brands: string[];
  scenarios: string[];
  points: string[];
}

export interface ConfigReleasePayload {
  name: string;
  object: string;
  scope: string;
  scopeRef?: ScopeSelection;
  before: string;
  after: string;
  impact: string;
  reason: string;
}

export interface ReleaseRollbackPayload {
  releaseId: string;
  reason: string;
}

export interface CatalogChangePayload {
  itemId: string;
  name: string;
  status: string;
  attrs: string[];
  flow: string;
  variantSku: string;
  variantSpec: string;
  variantPrice: string;
  variantPoints: string;
  reason: string;
}

export interface PointChangePayload {
  pointId: string;
  status: string;
  owner: string;
  checks: Array<{ item: string; status: string }>;
  reason: string;
}

export interface DeviceCommandPayload {
  deviceId: string;
  command: DeviceCommandAction;
  reason: string;
}

export interface ScenarioTemplateChangePayload {
  templateId: string;
  objectName: string;
  fields: string[];
  states: string[];
  exceptions: string[];
  roles: string[];
  reason: string;
}

export interface BrandChangePayload {
  brandId: string;
  name: string;
  status: string;
  scenario: string;
  owner: string;
  points: number;
  reason: string;
}

export interface OrganizationChangePayload {
  organizationId: string;
  name: string;
  type: string;
  parent: string;
  owner: string;
  points: number;
  users: number;
  reason: string;
}

export interface CustomerOnboardingPayload {
  tenantName: string;
  mode: string;
  contact: string;
  supportOwner: string;
  brandName: string;
  scenario: string;
  organizationName: string;
  city: string;
  adminName: string;
  adminEmail: string;
  adminRole: string;
  reason: string;
}

export interface UserInvitationPayload {
  tenant: string;
  email: string;
  name: string;
  role: string;
  scope: string;
  scopeRef?: ScopeSelection;
  reason: string;
}

export interface InvitationAcceptancePayload {
  invitationId: string;
  password: string;
}

export interface DeviceChangePayload {
  deviceId: string;
  name: string;
  point: string;
  type: string;
  status: string;
  version: string;
  capability: string[];
  reason: string;
}

export interface TeamAssignmentActivationPayload {
  assignmentId: string;
  userId: string;
  dataScope: string;
  scopeRef?: ScopeSelection;
  permissionPackages: string[];
  note: string;
}

export interface TeamAssignmentLifecyclePayload {
  assignmentId: string;
  reason: string;
}

export type AppAction =
  | { type: "login"; identifier: string; password: string }
  | { type: "logout" }
  | { type: "expire-session" }
  | { type: "set-filter"; key: "brand" | "scenario" | "point"; value: string }
  | { type: "set-team"; key: keyof TeamSettings; value: string }
  | { type: "apply-team-template" }
  | { type: "submit-team-assignment-activation"; payload: TeamAssignmentActivationPayload }
  | { type: "review-team-assignment"; payload: TeamAssignmentLifecyclePayload }
  | { type: "revoke-team-assignment"; payload: TeamAssignmentLifecyclePayload }
  | { type: "create-release"; payload: ConfigReleasePayload }
  | { type: "submit-release-rollback"; payload: ReleaseRollbackPayload }
  | { type: "submit-catalog-change"; payload: CatalogChangePayload }
  | { type: "submit-point-change"; payload: PointChangePayload }
  | { type: "submit-template-change"; payload: ScenarioTemplateChangePayload }
  | { type: "submit-brand-change"; payload: BrandChangePayload }
  | { type: "submit-organization-change"; payload: OrganizationChangePayload }
  | { type: "submit-customer-onboarding"; payload: CustomerOnboardingPayload }
  | { type: "invite-user"; payload: UserInvitationPayload }
  | { type: "accept-invitation"; payload: InvitationAcceptancePayload }
  | { type: "submit-device-change"; payload: DeviceChangePayload }
  | { type: "device-command"; payload: DeviceCommandPayload }
  | { type: "review-approval"; approvalId: string; decision: "approve" | "reject"; note?: string }
  | { type: "incident"; incidentId: string; action: IncidentWorkflowAction; payload?: IncidentActionPayload }
  | { type: "create-incident"; payload: IncidentCreatePayload }
  | { type: "task"; taskId: string; action: TaskWorkflowAction; payload?: TaskActionPayload }
  | { type: "sync-api-operation"; operationId: string }
  | { type: "rollback-api-operation"; operationId: string }
  | { type: "platform-toggle-tenant"; tenantId: string }
  | { type: "platform-toggle-user"; userId: string }
  | { type: "feature-audit"; action: string; object: string; risk: AuditLog["risk"]; result: string; detail: string };

export function appReducer(state: AppState, action: AppAction): AppState {
  const next = structuredClone(state);
  switch (action.type) {
    case "login":
      login(next, action.identifier, action.password);
      return next;
    case "logout":
      logout(next);
      return next;
    case "expire-session":
      expireSession(next);
      return next;
    case "set-filter":
      next.filters[action.key] = action.value;
      return next;
    case "set-team":
      next.team[action.key] = action.value;
      return next;
    case "apply-team-template":
      next.teamAssignments = buildTeamAssignments(next);
      next.teamAppliedAt = currentTime();
      addAuditLog(next, "生成团队角色草案", "团队搭建向导", "L2", "成功", `已生成 ${next.teamAssignments.length} 个角色实例草案`);
      recordApiOperation(next, action);
      return next;
    case "submit-team-assignment-activation":
      submitTeamAssignmentActivation(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "review-team-assignment":
      reviewTeamAssignment(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "revoke-team-assignment":
      revokeTeamAssignment(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "create-release":
      createConfigRelease(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-release-rollback":
      submitReleaseRollback(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-catalog-change":
      submitCatalogChange(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-point-change":
      submitPointChange(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-template-change":
      submitTemplateChange(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-brand-change":
      submitBrandChange(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-organization-change":
      submitOrganizationChange(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-customer-onboarding":
      submitCustomerOnboarding(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "invite-user":
      inviteUser(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "accept-invitation":
      acceptInvitation(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "submit-device-change":
      submitDeviceChange(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "device-command":
      runDeviceCommand(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "review-approval":
      reviewApproval(next, action.approvalId, action.decision, action.note);
      recordApiOperation(next, action);
      return next;
    case "incident":
      runIncidentAction(next, action.incidentId, action.action, action.payload);
      recordApiOperation(next, action);
      return next;
    case "create-incident":
      createIncident(next, action.payload);
      recordApiOperation(next, action);
      return next;
    case "task":
      runTaskAction(next, action.taskId, action.action, action.payload);
      recordApiOperation(next, action);
      return next;
    case "sync-api-operation":
      syncApiOperation(next, action.operationId);
      return next;
    case "rollback-api-operation":
      rollbackApiOperation(next, action.operationId);
      return next;
    case "platform-toggle-tenant": {
      if (!currentUserRoles(next).includes("平台支持")) {
        addAuditLog(next, "变更企业状态", action.tenantId, "L4", "已拒绝", "仅平台支持可变更企业状态");
        return next;
      }
      const tenant = next.tenants.find((item) => item.id === action.tenantId);
      if (!tenant) return state;
      tenant.status = tenant.status === "启用" ? "停用" : "启用";
      addAuditLog(next, "变更企业状态", tenant.id, "L4", "成功", `${tenant.name} → ${tenant.status}`);
      return next;
    }
    case "platform-toggle-user": {
      if (!currentUserRoles(next).includes("平台支持")) {
        addAuditLog(next, "变更账号状态", action.userId, "L4", "已拒绝", "仅平台支持可变更平台账号状态");
        return next;
      }
      const account = next.users.find((item) => item.id === action.userId);
      if (!account || account.id === next.currentUserId) {
        addAuditLog(next, "变更账号状态", action.userId, "L4", "已拒绝", "账号不存在或不能停用当前登录账号");
        return next;
      }
      account.status = account.status === "启用" ? "停用" : "启用";
      addAuditLog(next, "变更账号状态", account.id, "L4", "成功", `${account.name} → ${account.status}；停用后现有会话需重新鉴权`);
      return next;
    }
    case "feature-audit":
      addAuditLog(next, action.action, action.object, action.risk, action.result, action.detail);
      return next;
    default:
      return state;
  }
}

const localAuthAdapter = {
  provider: "local-credential" as const,
  password: "RoboOps@2026",
  sessionMinutes: 30,
};

function login(state: AppState, identifier: string, password: string) {
  const normalized = identifier.trim().toLowerCase();
  const user = state.users.find((item) => {
    const id = item.id.toLowerCase();
    const localEmail = `${item.id}@roboops.local`;
    const email = item.email?.toLowerCase();
    return normalized === id || normalized === localEmail || normalized === item.name.toLowerCase() || normalized === email;
  });
  const passwordOk = user ? (user.credential ? password === user.credential : password === localAuthAdapter.password) : false;
  if (!user || !passwordOk || user.status !== "启用") {
    const failedAttempts = (state.auth.failedAttempts || 0) + 1;
    state.auth = {
      authenticated: false,
      lastError: "账号或密码不正确，或账号未启用。",
      lastFailureAt: currentTime(),
      failedAttempts,
    };
    addAuditLog(state, "登录失败", normalized || "空账号", "L2", "已拒绝", `连续失败 ${failedAttempts} 次`, "认证服务");
    return;
  }
  const session = createSessionState();
  state.currentUserId = user.id;
  user.login = `今天 ${currentTime()}`;
  state.auth = session;
  state.filters = { brand: "all", scenario: "all", point: "all" };
  addAuditLog(state, "登录系统", user.id, "L0", "成功", `会话 ${session.sessionId}，有效至 ${session.expiresAt}`, user.name);
}

function logout(state: AppState) {
  const user = currentUser(state);
  addAuditLog(state, "退出登录", user.id, "L0", "成功", state.auth.sessionId ? `用户主动退出，会话 ${state.auth.sessionId}` : "用户主动退出", user.name);
  state.auth = { authenticated: false };
}

function expireSession(state: AppState) {
  if (!state.auth.authenticated) return;
  const user = currentUser(state);
  addAuditLog(state, "会话过期", user.id, "L1", "成功", state.auth.sessionId ? `会话 ${state.auth.sessionId} 已过期` : "登录会话已过期", "认证服务");
  state.auth = { authenticated: false, lastError: "会话已过期，请重新登录。" };
}

function createSessionState() {
  const now = new Date();
  const expiresAtEpoch = now.getTime() + localAuthAdapter.sessionMinutes * 60 * 1000;
  return {
    authenticated: true,
    loginAt: formatDateTime(now),
    expiresAt: formatDateTime(new Date(expiresAtEpoch)),
    expiresAtEpoch,
    sessionId: `SES-${now.getTime().toString(36).toUpperCase()}`,
    provider: localAuthAdapter.provider,
  };
}

function recordApiOperation(state: AppState, action: AppAction) {
  const spec = buildApiOperation(state, action);
  if (!spec) return;
  const operation: ApiOperation = {
    id: `API-${String(state.apiOperations.length + 1).padStart(3, "0")}`,
    time: currentTime(),
    status: "业务已记录",
    idempotencyKey: `${spec.method}:${spec.path}:${Date.now()}:${state.apiOperations.length + 1}`,
    syncStatus: "待同步",
    attempts: 0,
    ...spec,
  };
  state.apiOperations.unshift(operation);
}

function syncApiOperation(state: AppState, operationId: string) {
  const operation = state.apiOperations.find((item) => item.id === operationId);
  if (!operation) return;
  const policy = apiOperationActionPolicy(state, operationId, "sync");
  if (!policy.allowed) {
    addAuditLog(state, policy.label, operation.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  operation.attempts += 1;
  operation.status = "同步发送中";
  operation.syncStatus = "同步中";
  operation.serverRequestId = operation.serverRequestId || `REQ-${String(state.apiOperations.length + operation.attempts).padStart(4, "0")}`;
  delete operation.lastError;
  delete operation.nextRetryAt;
  delete operation.rollbackPlan;
  addAuditLog(state, "提交同步请求", operation.id, operation.risk, "同步中", `${operation.method} ${operation.path} / ${operation.object}`);
}

function rollbackApiOperation(state: AppState, operationId: string) {
  const operation = state.apiOperations.find((item) => item.id === operationId);
  if (!operation) return;
  const policy = apiOperationActionPolicy(state, operationId, "compensate");
  if (!policy.allowed) {
    addAuditLog(state, policy.label, operation.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  operation.status = "补偿已完成";
  operation.syncStatus = "已补偿";
  operation.rolledBackAt = currentTime();
  delete operation.nextRetryAt;
  addAuditLog(state, "提交补偿处理", operation.id, operation.risk, "已补偿", operation.rollbackPlan || "已完成补偿处理，等待重新拉取服务端状态");
}

function buildApiOperation(state: AppState, action: AppAction): Omit<ApiOperation, "id" | "time" | "status" | "idempotencyKey" | "syncStatus" | "attempts" | "lastError" | "syncedAt" | "nextRetryAt"> | null {
  if (action.type === "set-filter" || action.type === "set-team" || action.type === "sync-api-operation" || action.type === "rollback-api-operation") return null;

  if (action.type === "apply-team-template") {
    return {
      method: "POST",
      path: "/api/team-setup/drafts",
      action: "生成团队角色草案",
      object: "团队搭建向导",
      risk: "L2",
      summary: "根据经营模式、规模和服务方式生成角色实例草案",
    };
  }

  if (action.type === "submit-team-assignment-activation") {
    return {
      method: "POST",
      path: `/api/iam/role-instances/${action.payload.assignmentId}/activation-requests`,
      action: "提交角色实例启用",
      object: action.payload.assignmentId,
      risk: "L4",
      summary: "绑定账号、权限包和数据范围，进入权限审批",
    };
  }

  if (action.type === "review-team-assignment" || action.type === "revoke-team-assignment") {
    return {
      method: "PATCH",
      path: `/api/iam/role-instances/${action.payload.assignmentId}/lifecycle`,
      action: action.type === "review-team-assignment" ? "复核角色实例" : "回收角色实例",
      object: action.payload.assignmentId,
      risk: "L4",
      summary: action.payload.reason,
    };
  }

  if (action.type === "create-release") {
    return {
      method: "POST",
      path: "/api/config-releases",
      action: "提交配置发布",
      object: action.payload.name,
      risk: "L3",
      summary: action.payload.impact,
    };
  }

  if (action.type === "submit-release-rollback") {
    return {
      method: "POST",
      path: `/api/config-releases/${action.payload.releaseId}/rollback-requests`,
      action: "提交配置回退",
      object: action.payload.releaseId,
      risk: "L3",
      summary: action.payload.reason,
    };
  }

  if (action.type === "submit-catalog-change") {
    return {
      method: "POST",
      path: `/api/catalog/items/${action.payload.itemId}/change-requests`,
      action: "提交商品/服务配置发布",
      object: action.payload.itemId,
      risk: "L3",
      summary: action.payload.reason,
    };
  }

  if (action.type === "submit-point-change") {
    return {
      method: "POST",
      path: `/api/points/${action.payload.pointId}/change-requests`,
      action: "提交点位配置发布",
      object: action.payload.pointId,
      risk: "L3",
      summary: action.payload.reason,
    };
  }

  if (action.type === "submit-template-change") {
    return {
      method: "POST",
      path: `/api/scenario-templates/${action.payload.templateId}/change-requests`,
      action: "提交场景模板配置发布",
      object: action.payload.templateId,
      risk: "L3",
      summary: action.payload.reason,
    };
  }

  if (action.type === "submit-brand-change") {
    return {
      method: "POST",
      path: `/api/brands/${action.payload.brandId}/change-requests`,
      action: "提交品牌配置发布",
      object: action.payload.brandId,
      risk: "L3",
      summary: action.payload.reason,
    };
  }

  if (action.type === "submit-organization-change") {
    return {
      method: "POST",
      path: `/api/organizations/${action.payload.organizationId}/change-requests`,
      action: "提交组织配置发布",
      object: action.payload.organizationId,
      risk: "L3",
      summary: action.payload.reason,
    };
  }

  if (action.type === "submit-customer-onboarding") {
    return {
      method: "POST",
      path: "/api/tenants/onboarding-requests",
      action: "开通租户/客户",
      object: action.payload.tenantName,
      risk: "L4",
      summary: `${action.payload.mode} / ${action.payload.brandName} / ${action.payload.reason}`,
    };
  }

  if (action.type === "invite-user") {
    return {
      method: "POST",
      path: "/api/iam/invitations",
      action: "邀请用户",
      object: action.payload.email,
      risk: "L4",
      summary: `${action.payload.name} / ${action.payload.role} / ${action.payload.scope}`,
    };
  }

  if (action.type === "accept-invitation") {
    const invitation = state.userInvitations.find((item) => item.id === action.payload.invitationId);
    return {
      method: "POST",
      path: `/api/iam/invitations/${action.payload.invitationId}/acceptance`,
      action: "接受邀请",
      object: action.payload.invitationId,
      risk: "L3",
      summary: invitation ? `${invitation.name} / ${invitation.email} / ${invitation.scope}` : "接受用户邀请并设置本地凭证",
    };
  }

  if (action.type === "submit-device-change") {
    return {
      method: "POST",
      path: `/api/devices/${action.payload.deviceId}/change-requests`,
      action: "提交设备配置发布",
      object: action.payload.deviceId,
      risk: "L3",
      summary: action.payload.reason,
    };
  }

  if (action.type === "device-command") {
    const policy = deviceCommandPolicy(state, action.payload.deviceId, action.payload.command);
    return {
      method: "POST",
      path: `/api/devices/${action.payload.deviceId}/commands`,
      action: policy.requiresApproval ? "提交设备命令" : "执行设备命令",
      object: action.payload.deviceId,
      risk: policy.risk,
      summary: `${policy.label} / ${action.payload.reason}`,
    };
  }

  if (action.type === "review-approval") {
    const approval = state.approvalRequests.find((item) => item.id === action.approvalId);
    return {
      method: "POST",
      path: `/api/approvals/${action.approvalId}/decision`,
      action: action.decision === "approve" ? "审批通过" : "审批驳回",
      object: approval?.target || action.approvalId,
      risk: approval?.risk || "L2",
      summary: action.note || approval?.rule || "审批处理",
    };
  }

  if (action.type === "incident") {
    const labels: Record<IncidentWorkflowAction, string> = {
      advance: "推进异常状态",
      task: "异常转任务",
      refund: "异常转退款",
      close: "关闭异常",
    };
    const risks: Record<IncidentWorkflowAction, string> = {
      advance: "L1",
      task: "L2",
      refund: "L2",
      close: "L2",
    };
    return {
      method: "POST",
      path: `/api/incidents/${action.incidentId}/actions/${action.action}`,
      action: labels[action.action],
      object: action.incidentId,
      risk: risks[action.action],
      summary: action.payload?.note || "异常处理动作",
    };
  }

  if (action.type === "create-incident") {
    return {
      method: "POST",
      path: "/api/incidents",
      action: "创建异常",
      object: action.payload.point,
      risk: "L1",
      summary: action.payload.note,
    };
  }

  if (action.type === "task") {
    return {
      method: "POST",
      path: `/api/tasks/${action.taskId}/actions/${action.action}`,
      action: action.action === "start" ? "开始处理任务" : "解决任务",
      object: action.taskId,
      risk: "L1",
      summary: action.payload?.note || "任务处理动作",
    };
  }

  return null;
}

export function apiOperationSyncSummary(operations: ApiOperation[]) {
  return {
    total: operations.length,
    pending: operations.filter((operation) => operation.syncStatus === "待同步").length,
    syncing: operations.filter((operation) => operation.syncStatus === "同步中").length,
    succeeded: operations.filter((operation) => operation.syncStatus === "同步成功").length,
    failed: operations.filter((operation) => operation.syncStatus === "同步失败").length,
    rollbackRequired: operations.filter((operation) => operation.syncStatus === "需要补偿").length,
    rolledBack: operations.filter((operation) => operation.syncStatus === "已补偿").length,
  };
}

function apiFailureReason(operation: ApiOperation): string {
  if (operation.path.includes("/approvals/")) return "审批服务返回 409，审批对象版本与服务端不一致";
  if (operation.path.includes("/devices/")) return "设备服务超时，命令或状态回写未确认";
  if (operation.path.includes("/config") || operation.path.includes("change-requests")) return "配置服务拒绝写入，当前版本需要重新拉取后合并";
  if (operation.path.includes("/tenants/")) return "客户开通服务未确认租户、品牌和组织初始化结果";
  if (operation.path.includes("/iam/")) return "IAM 服务未确认授权变更，需保留授权申请和审计记录";
  return "服务端未确认该经营动作，需要重试或人工复核";
}

function apiRollbackPlan(operation: ApiOperation): string {
  if (operation.path.includes("/approvals/")) return "撤销待确认审批影响，保留审批意见和审计记录，重新拉取审批对象后再处理";
  if (operation.path.includes("/devices/")) return "停止继续下发设备动作，保留命令记录，等待设备服务回传最终状态";
  if (operation.path.includes("/tenants/")) return "暂停继续创建点位和设备，保留客户开通记录，等待客户开通服务返回最终租户状态";
  if (operation.path.includes("/iam/")) return "撤销待确认角色启用结果，保留授权申请和 L4 审计，等待 IAM 重新确认";
  return "撤销待确认变更影响，保留发布差异和失败记录，重新拉取服务端版本后再提交";
}

function retryWindow(attempts: number): string {
  if (attempts <= 1) return "5 分钟后";
  if (attempts === 2) return "15 分钟后";
  return "人工复核后";
}

export function statusTone(value: string | number): BadgeTone {
  const text = String(value);
  if (["营业中", "在线", "已发布", "已生效", "上架", "已取杯", "已确认", "已支付", "已完成", "已解决", "已恢复", "已归档", "启用", "已启用", "已接受", "成功", "可营业", "delivered", "审批通过", "同步成功", "服务端已确认", "补偿已完成", "已补偿", "L0"].includes(text)) return "ok";
  if (["维护中", "待维护", "待取杯", "服务中", "待审批", "待复核审批", "待回收审批", "待同步", "同步中", "同步发送中", "业务已记录", "草稿", "处理中", "已分派", "已分诊", "忙碌", "暂停", "待客服确认", "退款处理中", "待处理", "待邀请", "待配置", "待开通", "待接受", "待授权", "已发送", "已转退款", "已转现场处理", "待人工确认", "待关闭审批", "已回退", "L1", "L2"].includes(text)) return "warn";
  if (["暂停营业", "停用", "离线", "异常", "制作异常", "新异常", "已驳回", "已拒绝", "已回收", "同步失败", "需要补偿", "待补偿处理", "P1", "P0", "L3", "L4"].includes(text)) return "bad";
  if (["试运行", "机器人服务", "饮品商品", "info"].includes(text)) return "info";
  return "neutral";
}

export function currentUser(state: AppState) {
  return state.users.find((user) => user.id === state.currentUserId) || state.users[0] || staticData.users[0];
}

export function currentUserRoles(state: AppState): string[] {
  const user = currentUser(state);
  return unique([user.role, ...activeTeamAssignments(state).filter((assignment) => assignment.assigneeId === user.id || assignment.assigneeName === user.name).map((assignment) => assignment.role)]);
}

export function currentUserScopes(state: AppState): string[] {
  const user = currentUser(state);
  return unique([user.scope, ...activeTeamAssignments(state).filter((assignment) => assignment.assigneeId === user.id || assignment.assigneeName === user.name).map((assignment) => assignment.scope)]);
}

export function currentUserPermissionPackages(state: AppState): string[] {
  const roles = currentUserRoles(state);
  const basePackages = staticData.roles.filter((role) => roles.includes(role.name)).flatMap((role) => role.packages);
  const assignmentPackages = currentUserTeamAssignments(state).flatMap((assignment) => assignment.permissionPackages || assignment.packageSummary.split("、"));
  return unique([...basePackages, ...assignmentPackages].map((item) => item.trim()).filter(Boolean));
}

export function menuAccessPolicy(state: AppState, viewId: ViewId) {
  const user = currentUser(state);
  const rule = menuRules[viewId];
  const roles = currentUserRoles(state);
  const packages = currentUserPermissionPackages(state);
  if (user.status !== "启用") {
    return { allowed: false, permission: rule.permission, source: "账号未启用", reason: "账号启用后才能访问业务菜单。" };
  }
  if (viewId === "workbench") {
    if (!currentUserHasBusinessAccess(state)) {
      return { allowed: true, permission: rule.permission, source: "账号待授权", reason: "账号已创建，但业务角色尚未审批生效。" };
    }
    return { allowed: true, permission: rule.permission, source: "启用账号", reason: rule.description };
  }
  if (userHasGlobalScope(state)) {
    return { allowed: true, permission: rule.permission, source: "全局数据范围", reason: rule.description };
  }
  const matchedRole = roles.find((role) => rule.roles.includes(role));
  if (matchedRole) {
    return { allowed: true, permission: rule.permission, source: `角色：${matchedRole}`, reason: rule.description };
  }
  const matchedPackage = packages.find((permissionPackage) => rule.packages.includes(permissionPackage));
  if (matchedPackage) {
    return { allowed: true, permission: rule.permission, source: `权限包：${matchedPackage}`, reason: rule.description };
  }
  return { allowed: false, permission: rule.permission, source: "未授权", reason: `当前账号有效角色为${roles.join("、")}，未包含 ${rule.permission} 菜单权限。` };
}

export function menuAccessPolicies(state: AppState) {
  return (Object.keys(menuRules) as ViewId[]).map((viewId) => ({ viewId, ...menuAccessPolicy(state, viewId) }));
}

function userHasGlobalScope(state: AppState): boolean {
  const user = currentUser(state);
  return currentUserRoles(state).includes("平台支持") || currentUserScopes(state).some((scope) => scope.includes("全部租户"));
}

export function filteredPoints(state: AppState): Point[] {
  return state.points.filter((point) => {
    const brandOk = state.filters.brand === "all" || point.brand === state.filters.brand;
    const scenarioOk = state.filters.scenario === "all" || point.scenario === state.filters.scenario;
    const pointOk = state.filters.point === "all" || point.name === state.filters.point;
    return brandOk && scenarioOk && pointOk && pointVisibleForCurrentUser(state, point);
  });
}

export function filterOptionsForCurrentUser(state: AppState): FilterOptions {
  const points = state.points.filter((point) => pointVisibleForCurrentUser(state, point));
  return {
    brands: unique(points.map((point) => point.brand)),
    scenarios: unique(points.map((point) => point.scenario)),
    points: points.map((point) => point.name),
  };
}

export function filteredBrands(state: AppState): Brand[] {
  return state.brands.filter((brand) => brandVisibleForCurrentUser(state, brand));
}

export function filteredTenants(state: AppState): Tenant[] {
  return state.tenants.filter((tenant) => tenantVisibleForCurrentUser(state, tenant));
}

export function filteredOrganizations(state: AppState): Organization[] {
  return state.organizations.filter((organization) => organizationVisibleForCurrentUser(state, organization));
}

export function tenantVisibleForCurrentUser(state: AppState, tenant: Tenant): boolean {
  if (userHasGlobalScope(state)) return true;
  const scopes = currentUserScopes(state);
  if (scopes.some((scope) => scope.includes(tenant.name))) return true;
  return state.brands.some((brand) => brand.tenant === tenant.name && brandVisibleForCurrentUser(state, brand));
}

export function brandVisibleForCurrentUser(state: AppState, brand: Brand): boolean {
  if (userHasGlobalScope(state)) return true;
  const visibleBrands = filterOptionsForCurrentUser(state).brands;
  const scopes = currentUserScopes(state);
  return visibleBrands.includes(brand.name) || scopes.some((scope) => scope.includes(brand.name) || scope.includes(brand.tenant));
}

export function organizationVisibleForCurrentUser(state: AppState, organization: Organization): boolean {
  if (userHasGlobalScope(state)) return true;
  const visibleBrandTenants = filteredBrands(state).map((brand) => brand.tenant);
  const scopes = currentUserScopes(state);
  return visibleBrandTenants.includes(organization.tenant) || scopes.some((scope) => scope.includes(organization.name) || scope.includes(organization.tenant));
}

export function pointVisibleForCurrentUser(state: AppState, point: Point): boolean {
  if (userHasGlobalScope(state)) return true;
  const scopes = currentUserScopes(state);
  return scopes.some((scope) => scopeMatchesPoint(state, scope, point));
}

function scopeMatchesPoint(state: AppState, scope: string, point: Point): boolean {
  const brand = state.brands.find((item) => item.name === point.brand) || staticData.brands.find((item) => item.name === point.brand);
  const tenant = brand?.tenant || "";
  if (scope.includes("全部租户")) return true;
  const explicitPointNames = state.points.filter((item) => scopeHasToken(scope, item.name)).map((item) => item.name);
  if (explicitPointNames.length) return explicitPointNames.includes(point.name);
  if (scopeHasToken(scope, point.name)) return true;
  if (scopeHasToken(scope, point.brand) && (scopeHasToken(scope, point.city) || scope.includes("全部") || !scope.includes(" / "))) return true;
  if (tenant && scope.includes(tenant) && scope.includes("全部品牌")) return true;
  if (tenant && scope.includes(tenant) && scopeHasToken(scope, point.city)) return true;
  return false;
}

function scopeHasToken(scope: string, value: string): boolean {
  return scope
    .split(/[/、,，]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .includes(value);
}

export function deviceVisibleForCurrentUser(state: AppState, deviceId: string): boolean {
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device) return false;
  const point = state.points.find((item) => item.name === device.point);
  return point ? pointVisibleForCurrentUser(state, point) : userHasGlobalScope(state);
}

export function requestVisibleForCurrentUser(state: AppState, requestId: string): boolean {
  const request = state.businessRequests.find((item) => item.id === requestId);
  if (!request) return false;
  const point = state.points.find((item) => item.name === request.point);
  return point ? pointVisibleForCurrentUser(state, point) : userHasGlobalScope(state);
}

export function incidentVisibleForCurrentUser(state: AppState, incidentId: string): boolean {
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident) return false;
  const point = state.points.find((item) => item.name === incident.point);
  return point ? pointVisibleForCurrentUser(state, point) : userHasGlobalScope(state);
}

export function taskVisibleForCurrentUser(state: AppState, taskId: string): boolean {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return false;
  const point = state.points.find((item) => item.name === task.point);
  return point ? pointVisibleForCurrentUser(state, point) : userHasGlobalScope(state);
}

export function releaseVisibleForCurrentUser(state: AppState, releaseId: string): boolean {
  const release = state.releases.find((item) => item.id === releaseId);
  if (!release) return false;
  const user = currentUser(state);
  if (userHasGlobalScope(state) || release.by === user.name) return true;
  if (release.scopeRef) return releaseScopeVisibleForCurrentUser(state, release.scopeRef);
  if (user.scope.includes(release.scope) || release.scope.includes(user.scope)) return true;
  return state.points.some((point) => {
    if (!pointVisibleForCurrentUser(state, point)) return false;
    return release.scope.includes(point.name) || release.scope.includes(point.brand) || release.scope.includes(point.city);
  });
}

export function userInvitationVisibleForCurrentUser(state: AppState, invitation: UserInvitation): boolean {
  const user = currentUser(state);
  if (userHasGlobalScope(state) || invitation.invitedBy === user.name) return true;
  const tenant = state.tenants.find((item) => item.name === invitation.tenant);
  if (tenant && tenantVisibleForCurrentUser(state, tenant)) return true;
  const scopes = currentUserScopes(state);
  return scopes.some((scope) => invitation.scope.includes(scope) || scope.includes(invitation.scope) || invitation.scope.includes(scope.split(" / ")[0]));
}

function releaseScopeVisibleForCurrentUser(state: AppState, scope: ScopeSelection): boolean {
  if (scope.type === "tenant") {
    const brandNames = state.brands.filter((brand) => brand.tenant === scope.label || scope.value.includes(brand.tenant)).map((brand) => brand.name);
    return state.points.some((point) => brandNames.includes(point.brand) && pointVisibleForCurrentUser(state, point));
  }
  if (scope.type === "brand") {
    return state.points.some((point) => point.brand === scope.label && pointVisibleForCurrentUser(state, point));
  }
  if (scope.type === "organization") {
    const organization = state.organizations.find((item) => item.id === scope.id || item.name === scope.label);
    return organization ? organizationVisibleForCurrentUser(state, organization) : false;
  }
  if (scope.type === "city") {
    return state.points.some((point) => point.city === scope.label && pointVisibleForCurrentUser(state, point));
  }
  if (scope.type === "point") {
    const point = state.points.find((item) => item.id === scope.id || item.name === scope.label);
    return point ? pointVisibleForCurrentUser(state, point) : false;
  }
  if (scope.type === "device") {
    return deviceVisibleForCurrentUser(state, scope.id);
  }
  if (scope.type === "scenario") {
    return state.points.some((point) => point.scenario === scope.label && pointVisibleForCurrentUser(state, point));
  }
  return false;
}

export function filteredBusinessRequests(state: AppState): BusinessRequest[] {
  const points = new Set(filteredPoints(state).map((point) => point.name));
  return state.businessRequests.filter((request) => points.has(request.point));
}

export function filteredIncidents(state: AppState): Incident[] {
  const points = new Set(filteredPoints(state).map((point) => point.name));
  return state.incidents.filter((incident) => points.has(incident.point));
}

export function filteredTasks(state: AppState): Task[] {
  const points = new Set(filteredPoints(state).map((point) => point.name));
  return state.tasks.filter((task) => points.has(task.point));
}

export function filteredDevices(state: AppState) {
  const points = new Set(filteredPoints(state).map((point) => point.name));
  return state.devices.filter((device) => points.has(device.point));
}

export function filteredCatalogItems(state: AppState): CatalogItem[] {
  const visibleBrands = new Set(filterOptionsForCurrentUser(state).brands);
  return state.catalog.filter((item) => {
    const brandOk = state.filters.brand === "all" || item.brand === state.filters.brand;
    return visibleBrands.has(item.brand) && brandOk;
  });
}

export function catalogItemVisibleForCurrentUser(state: AppState, itemId: string): boolean {
  const item = state.catalog.find((catalogItem) => catalogItem.id === itemId);
  if (!item) return false;
  return filterOptionsForCurrentUser(state).brands.includes(item.brand) || userHasGlobalScope(state);
}

export function pointIdVisibleForCurrentUser(state: AppState, pointId: string): boolean {
  const point = state.points.find((item) => item.id === pointId);
  return point ? pointVisibleForCurrentUser(state, point) : false;
}

export function templateVisibleForCurrentUser(state: AppState, templateId: string): boolean {
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) return false;
  if (userHasGlobalScope(state)) return true;
  return state.points.some((point) => point.scenario === template.name && pointVisibleForCurrentUser(state, point));
}

export function commandVisibleForCurrentUser(state: AppState, commandId: string): boolean {
  const command = state.commandRecords.find((item) => item.id === commandId);
  return command ? deviceVisibleForCurrentUser(state, command.device) : false;
}

export function filteredProductVariants(state: AppState): ProductVariant[] {
  const catalogNames = new Set(filteredCatalogItems(state).map((item) => item.name));
  const points = filteredPoints(state).map((point) => point.name);
  return state.productVariants.filter((variant) => {
    if (!catalogNames.has(variant.product)) return false;
    if (state.filters.point !== "all" && !variant.points.includes(state.filters.point)) return false;
    return points.some((point) => variant.points.includes(point));
  });
}

export function activeIncidents(state: AppState): Incident[] {
  return filteredIncidents(state).filter((incident) => openIncidentStatuses.has(incident.status));
}

export function activeTasks(state: AppState): Task[] {
  return filteredTasks(state).filter((task) => openTaskStatuses.has(task.status));
}

export function pointDevices(state: AppState, pointName: string) {
  return state.devices.filter((device) => device.point === pointName);
}

export function pointRequests(state: AppState, pointName: string) {
  return state.businessRequests.filter((request) => request.point === pointName);
}

export function pointIncidents(state: AppState, pointName: string) {
  return state.incidents.filter((incident) => incident.point === pointName && openIncidentStatuses.has(incident.status));
}

export function pointTasks(state: AppState, pointName: string) {
  return state.tasks.filter((task) => task.point === pointName && openTaskStatuses.has(task.status));
}

export function pointReadiness(state: AppState, point: Point): PointReadiness {
  const checks = state.pointChecks.filter((check) => check.point === point.name);
  const blockers = checks.filter((check) => check.status !== "已完成").map((check) => check.item);
  const devices = pointDevices(state, point.name);
  const products = state.productVariants.filter((variant) => variant.points.includes(point.name));
  if (!devices.length) blockers.push("绑定设备");
  if (!products.length) blockers.push("可售商品/服务");
  if (devices.length && !devices.some((device) => device.status === "在线" || device.status === "忙碌")) blockers.push("设备在线");
  return {
    status: blockers.length ? "待处理" : "可营业",
    blockers,
    checks,
  };
}

export function businessSnapshot(state: AppState): BusinessSnapshot {
  const points = filteredPoints(state);
  const requests = filteredBusinessRequests(state);
  const requestIds = new Set(requests.map((request) => request.id));
  const incidents = activeIncidents(state);
  const tasks = activeTasks(state);
  const devices = filteredDevices(state);
  const readyPoints = points.filter((point) => pointReadiness(state, point).status === "可营业");
  const liveRequests = requests.filter((request) => !terminalRequestStatuses.has(request.status));
  const refunding = state.refunds.filter((refund) => requestIds.has(refund.request) && refund.status !== "已完成" && refund.status !== "已取消");
  return { points, requests, incidents, tasks, devices, readyPoints, liveRequests, refunding };
}

export function pointHealthScore(state: AppState, point: Point): { score: number; tone: "" | "warn" | "bad" } {
  const readiness = pointReadiness(state, point);
  const devices = pointDevices(state, point.name);
  const online = devices.filter((device) => device.status === "在线" || device.status === "忙碌").length;
  const score = Math.max(18, Math.min(100, 82 - pointIncidents(state, point.name).length * 16 - pointTasks(state, point.name).length * 6 + online * 5 - readiness.blockers.length * 12));
  return { score, tone: score > 78 ? "" : score > 55 ? "warn" : "bad" };
}

export function incidentReasonBars(state: AppState) {
  const incidents = filteredIncidents(state);
  if (!incidents.length) return [{ label: "暂无异常", value: 0, tone: "" as const }];
  const counts = incidents.reduce<Record<string, number>>((acc, incident) => {
    acc[incident.type] = (acc[incident.type] || 0) + 1;
    return acc;
  }, {});
  const max = Math.max(...Object.values(counts));
  return Object.entries(counts).map(([label, count]) => ({
    label,
    value: Math.max(12, Math.round((count / max) * 100)),
    tone: label.includes("失败") || label.includes("错误") ? ("bad" as const) : ("warn" as const),
  }));
}

export function teamRecommendation(state: AppState) {
  const baseRoles = ["业务负责人", "运营负责人", "客服/售后", "机器人/设备运维", "现场维护员", "财务/结算"];
  const expanded = state.team.scale.includes("20") || state.team.scale.includes("50");
  const platformManaged = state.team.mode === "平台代运营" || state.team.service.includes("平台代管");
  return baseRoles.map((role) => {
    let owner = "客户配置";
    if (platformManaged && ["运营负责人", "客服/售后", "机器人/设备运维"].includes(role)) owner = "平台代管";
    if (role === "现场维护员" && state.team.service.includes("外包")) owner = "外部供应商";
    const scope = expanded ? "品牌/区域" : role === "现场维护员" ? "点位" : "品牌/点位";
    const packages = staticData.roles.find((template) => template.name === role)?.packages.join("、") || "工作台查看包";
    return [role, owner, scope, packages];
  });
}

export function activeTeamAssignments(state: AppState): TeamAssignment[] {
  return state.teamAssignments.filter((assignment) => assignment.status === "已启用");
}

export function currentUserTeamAssignments(state: AppState): TeamAssignment[] {
  const user = currentUser(state);
  return activeTeamAssignments(state).filter((assignment) => assignment.assigneeId === user.id || assignment.assigneeName === user.name);
}

export function currentUserHasBusinessAccess(state: AppState): boolean {
  const user = currentUser(state);
  if (user.status !== "启用") return false;
  if (user.role === "待授权用户" && currentUserTeamAssignments(state).length === 0) return false;
  return true;
}

export function teamActivationSummary(state: AppState) {
  const total = state.teamAssignments.length;
  const active = activeTeamAssignments(state).length;
  return {
    total,
    active,
    pending: Math.max(0, total - active),
    status: total === 0 ? "未生成" : active === total ? "已完成" : "待补齐",
  };
}

function buildTeamAssignments(state: AppState): TeamAssignment[] {
  return teamRecommendation(state).map(([role, owner, scope, packageSummary], index) => ({
    id: `role-inst-${String(index + 1).padStart(2, "0")}`,
    role: String(role),
    owner: String(owner),
    scope: String(scope),
    packageSummary: String(packageSummary),
    status: owner === "客户配置" ? "待绑定账号" : "待确认",
  }));
}

function submitTeamAssignmentActivation(state: AppState, payload: TeamAssignmentActivationPayload) {
  const assignment = state.teamAssignments.find((item) => item.id === payload.assignmentId);
  const user = state.users.find((item) => item.id === payload.userId);
  if (!assignment || !user) return;
  const policy = roleAssignmentActionPolicy(state, assignment.id, "configure");
  if (!policy.allowed) {
    addAuditLog(state, policy.label, assignment.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  const packages = payload.permissionPackages.length ? payload.permissionPackages : [assignment.packageSummary];
  assignment.assigneeId = user.id;
  assignment.assigneeName = user.name;
  assignment.owner = user.name;
  assignment.scope = payload.dataScope.trim();
  assignment.scopeRef = payload.scopeRef;
  assignment.permissionPackages = packages;
  assignment.packageSummary = packages.join("、");
  assignment.status = "待审批";
  assignment.note = payload.note.trim();
  const approval = addApprovalRequest(state, "启用角色实例", assignment.id, "业务负责人", "角色、权限包和数据范围变更需由非发起人审批", "L4");
  addAuditLog(state, "提交角色实例启用", assignment.id, "L4", "待审批", `${assignment.role} / ${user.name} / ${assignment.scope} / ${assignment.packageSummary}；审批单 ${approval.id}`);
}

function applyTeamAssignmentApproval(state: AppState, assignmentId: string, approved: boolean) {
  const assignment = state.teamAssignments.find((item) => item.id === assignmentId);
  if (!assignment) return;
  if (!approved) {
    assignment.status = "已驳回";
    return;
  }
  assignment.status = "已启用";
  assignment.activatedAt = currentTime();
  assignment.reviewAt = futureDateLabel(90);
  assignment.expiresAt = futureDateLabel(180);
  delete assignment.revokedAt;
  delete assignment.revokeReason;
  addAuditLog(state, "启用角色实例", assignment.id, "L4", "成功", `${assignment.role} / ${assignment.assigneeName || "-"} / ${assignment.scope} / ${assignment.packageSummary}；复核 ${assignment.reviewAt}，有效至 ${assignment.expiresAt}`);
}

function applyTeamAssignmentLifecycleApproval(state: AppState, assignmentId: string, lifecycleAction: "review" | "revoke", approved: boolean, detail: string) {
  const assignment = state.teamAssignments.find((item) => item.id === assignmentId);
  if (!assignment) return;
  const pendingReason = assignment.pendingLifecycleReason || detail;
  delete assignment.pendingLifecycleAction;
  delete assignment.pendingLifecycleReason;
  delete assignment.pendingLifecycleApprovalId;
  if (!approved) {
    addAuditLog(state, lifecycleAction === "review" ? "驳回角色实例复核" : "驳回角色实例回收", assignment.id, "L4", "已驳回", detail);
    return;
  }
  if (lifecycleAction === "review") {
    assignment.status = "已启用";
    assignment.lastReviewedAt = currentTime();
    assignment.reviewAt = futureDateLabel(90);
    assignment.expiresAt = futureDateLabel(180);
    addAuditLog(state, "复核角色实例", assignment.id, "L4", "成功", `${pendingReason}；下次复核 ${assignment.reviewAt}，有效至 ${assignment.expiresAt}`);
    return;
  }
  assignment.status = "已回收";
  assignment.revokedAt = currentTime();
  assignment.revokeReason = pendingReason;
  addAuditLog(state, "回收角色实例", assignment.id, "L4", "成功", `${assignment.role} / ${assignment.assigneeName || assignment.owner}；${assignment.revokeReason}`);
}

function reviewTeamAssignment(state: AppState, payload: TeamAssignmentLifecyclePayload) {
  const assignment = state.teamAssignments.find((item) => item.id === payload.assignmentId);
  if (!assignment) return;
  const policy = roleAssignmentActionPolicy(state, assignment.id, "review");
  if (!policy.allowed) {
    addAuditLog(state, policy.label, assignment.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  if (assignment.status !== "已启用") {
    addAuditLog(state, "复核角色实例", assignment.id, "L4", "已拒绝", "只有已启用的角色实例可以复核");
    return;
  }
  if (assignment.pendingLifecycleAction) {
    addAuditLog(state, "提交角色实例复核", assignment.id, "L4", "已拒绝", `已有${assignment.pendingLifecycleAction === "review" ? "复核" : "回收"}审批 ${assignment.pendingLifecycleApprovalId || ""} 待处理`);
    return;
  }
  assignment.pendingLifecycleAction = "review";
  assignment.pendingLifecycleReason = payload.reason.trim();
  const approval = addApprovalRequest(state, "复核角色实例", assignment.id, "业务负责人", "角色实例复核需由非发起人审批", "L4");
  assignment.pendingLifecycleApprovalId = approval.id;
  addAuditLog(state, "提交角色实例复核", assignment.id, "L4", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function revokeTeamAssignment(state: AppState, payload: TeamAssignmentLifecyclePayload) {
  const assignment = state.teamAssignments.find((item) => item.id === payload.assignmentId);
  if (!assignment) return;
  const policy = roleAssignmentActionPolicy(state, assignment.id, "revoke");
  if (!policy.allowed) {
    addAuditLog(state, policy.label, assignment.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  if (assignment.status !== "已启用") {
    addAuditLog(state, "回收角色实例", assignment.id, "L4", "已拒绝", `当前状态 ${assignment.status} 不能回收`);
    return;
  }
  if (assignment.pendingLifecycleAction) {
    addAuditLog(state, "提交角色实例回收", assignment.id, "L4", "已拒绝", `已有${assignment.pendingLifecycleAction === "review" ? "复核" : "回收"}审批 ${assignment.pendingLifecycleApprovalId || ""} 待处理`);
    return;
  }
  assignment.pendingLifecycleAction = "revoke";
  assignment.pendingLifecycleReason = payload.reason.trim();
  const approval = addApprovalRequest(state, "回收角色实例", assignment.id, "业务负责人", "角色实例回收需由非发起人审批", "L4");
  assignment.pendingLifecycleApprovalId = approval.id;
  addAuditLog(state, "提交角色实例回收", assignment.id, "L4", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

export function incidentActionPolicy(state: AppState, incident: Incident, action: IncidentWorkflowAction): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const actionLabels: Record<IncidentWorkflowAction, string> = {
    advance: "推进状态",
    task: "转任务",
    refund: "转退款",
    close: "关闭异常",
  };
  const risk: Record<IncidentWorkflowAction, string> = {
    advance: "L1",
    task: "L2",
    refund: "L2",
    close: "L2",
  };
  const allowedRoles: Record<IncidentWorkflowAction, string[]> = {
    advance: ["运营负责人", "点位负责人", "客服/售后", "机器人/设备运维", "设备运维", "运营调度", "平台支持"],
    task: ["运营负责人", "点位负责人", "机器人/设备运维", "设备运维", "现场维护员", "平台支持"],
    refund: ["运营负责人", "客服/售后", "平台支持"],
    close: ["运营负责人", "点位负责人", "客服/售后", "机器人/设备运维", "设备运维", "平台支持"],
  };
  const policy = staticData.approvalPolicies.find((item) => {
    if (action === "refund") return item.action.includes("退款");
    if (action === "close") return item.action.includes("关闭");
    return false;
  });
  const requiresApproval = action === "refund" || (action === "close" && incident.level === "P1");
  const roleAllowed = roles.some((role) => allowedRoles[action].includes(role));
  const scopeAllowed = incidentVisibleForCurrentUser(state, incident.id);
  const hasRefund = state.refunds.some((refund) => refund.incident === incident.id);
  const hasFieldTask = state.tasks.some((task) => task.sourceIncident === incident.id);
  const nextStatusExists = ["new", "triaged", "assigned", "processing", "waiting_manual_confirm", "recovered"].includes(incident.status);
  const canCreateTask = !hasFieldTask && ["new", "triaged", "assigned", "processing", "waiting_manual_confirm"].includes(incident.status);
  const canCreateRefund = incident.order !== "-" && !hasRefund && ["new", "triaged", "assigned", "processing", "waiting_manual_confirm"].includes(incident.status);
  const canClose = ["waiting_manual_confirm", "recovered", "converted_to_refund", "converted_to_field_service"].includes(incident.status);
  const statusAllowed = action === "advance" ? nextStatusExists : action === "task" ? canCreateTask : action === "refund" ? canCreateRefund : canClose;
  const allowed = roleAllowed && scopeAllowed && statusAllowed;
  let message = requiresApproval ? "提交后会生成审批记录并保留操作留痕。" : "提交后会立即更新相关经营事实。";
  if (!roleAllowed) message = `当前账号角色为${user.role}，不能执行该动作。`;
  else if (!scopeAllowed) message = "该异常不在当前账号的数据范围内。";
  else if (incident.status === "closed") message = "该异常已关闭，不能继续处理。";
  else if (action === "advance" && !nextStatusExists) message = "当前异常状态不能继续推进。";
  else if (action === "task" && hasFieldTask) message = "该异常已生成现场任务，不能重复派单。";
  else if (action === "task" && !canCreateTask) message = "当前异常状态不适合再转现场任务。";
  else if (action === "refund" && incident.order === "-") message = "该异常没有关联订单/服务请求，不能转退款。";
  else if (action === "refund" && hasRefund) message = "该异常已存在退款记录，不能重复转退款。";
  else if (action === "refund" && !canCreateRefund) message = "当前异常状态不适合再转退款。";
  else if (action === "close" && !canClose) message = "请先完成处理、退款或现场任务，再关闭异常。";
  return {
    label: actionLabels[action],
    risk: risk[action],
    allowed,
    requiresApproval,
    approver: policy?.approver,
    rule: policy?.rule,
    message,
  };
}

export function taskActionPolicy(state: AppState, task: Task, action: TaskWorkflowAction): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const allowedRoles = ["运营负责人", "点位负责人", "现场维护员", "客服/售后", "机器人/设备运维", "设备运维", "配置发布人", "试运行操作员", "平台支持"];
  const labels: Record<TaskWorkflowAction, string> = {
    start: "开始处理",
    resolve: "标记解决",
  };
  const roleAllowed = roles.some((role) => allowedRoles.includes(role) || task.owner === role);
  const scopeAllowed = taskVisibleForCurrentUser(state, task.id);
  const statusAllowsStart = ["已创建", "已分派", "等待外部条件"].includes(task.status);
  const statusAllowsResolve = task.status === "处理中";
  const statusAllowed = action === "start" ? statusAllowsStart : statusAllowsResolve;
  const allowed = roleAllowed && scopeAllowed && statusAllowed;
  let message = "提交后会写入任务处理记录，并在需要时回写来源异常。";
  if (!roleAllowed) message = `当前账号角色为${user.role}，不能执行该任务动作。`;
  else if (!scopeAllowed) message = "该任务不在当前账号的数据范围内。";
  else if (task.status === "已解决") message = "该任务已解决，不能重复处理。";
  else if (action === "start" && !statusAllowsStart) message = "该任务已在处理中，不能重复开始。";
  else if (action === "resolve" && !statusAllowsResolve) message = "请先开始处理，再提交任务结果。";
  return {
    label: labels[action],
    risk: "L1",
    allowed,
    requiresApproval: false,
    message,
  };
}

export function deviceCommandPolicy(state: AppState, deviceId: string, command: DeviceCommandAction): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const labels: Record<DeviceCommandAction, string> = {
    "sync-status": "同步状态",
    "sync-config": "同步配置",
    restart: "重启设备",
  };
  const risks: Record<DeviceCommandAction, string> = {
    "sync-status": "L1",
    "sync-config": "L2",
    restart: "L3",
  };
  const allowedRoles: Record<DeviceCommandAction, string[]> = {
    "sync-status": ["运营负责人", "机器人/设备运维", "设备运维", "设备运维负责人", "平台支持"],
    "sync-config": ["运营负责人", "机器人/设备运维", "设备运维", "设备运维负责人", "配置发布人", "平台支持"],
    restart: ["机器人/设备运维", "设备运维", "设备运维负责人", "平台支持"],
  };
  const policy = staticData.approvalPolicies.find((item) => item.action.includes("设备"));
  const requiresApproval = command !== "sync-status";
  const roleAllowed = roles.some((role) => allowedRoles[command].includes(role));
  const scopeAllowed = deviceVisibleForCurrentUser(state, deviceId);
  const allowed = roleAllowed && scopeAllowed;
  let message = requiresApproval ? "提交后进入设备命令审批，通过后才会写入执行结果。" : "提交后会立即同步设备状态并写入操作记录。";
  if (!roleAllowed) message = `当前账号有效角色为${roles.join("、")}，不能执行该设备命令。`;
  else if (!scopeAllowed) message = "该设备不在当前账号的数据范围内。";
  return {
    label: labels[command],
    risk: risks[command],
    allowed,
    requiresApproval,
    approver: policy?.approver || "设备运维负责人",
    rule: policy?.rule || "二次确认并写入高风险动作记录",
    message,
  };
}

export function configReleaseActionPolicy(state: AppState): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const allowedRoles = ["业务负责人", "运营负责人", "商品/配置管理员", "场景模板管理员", "配置发布人", "平台支持"];
  const allowed = roles.some((role) => allowedRoles.includes(role));
  return {
    label: "提交配置发布",
    risk: "L3",
    allowed,
    requiresApproval: true,
    approver: "配置审批人",
    rule: "影响点位经营或设备运行时必须审批",
    message: allowed ? "提交后会生成审批单，审批通过后才更新发布状态。" : `当前账号角色为${user.role}，不能提交配置发布。`,
  };
}

export function customerOnboardingPolicy(state: AppState): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const allowed = roles.includes("平台支持") || currentUserScopes(state).some((scope) => scope.includes("全部租户"));
  return {
    label: "开通租户/客户",
    risk: "L4",
    allowed,
    requiresApproval: false,
    message: allowed ? "提交后创建租户、初始品牌、初始组织和管理员邀请，并写入开通审计。" : `当前账号角色为${user.role}，不能开通新的租户/客户。`,
  };
}

export function userInvitationPolicy(state: AppState): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const packages = currentUserPermissionPackages(state);
  const allowed = roles.some((role) => ["平台支持", "租户管理员"].includes(role)) || packages.includes("用户权限管理包");
  return {
    label: "邀请用户",
    risk: "L4",
    allowed,
    requiresApproval: false,
    message: allowed ? "邀请发出后先进入待接受状态；账号接受邀请后再绑定角色实例和数据范围。" : `当前账号角色为${user.role}，没有用户邀请权限。`,
  };
}

export function roleAssignmentActionPolicy(state: AppState, assignmentId: string, action: "configure" | "review" | "revoke"): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const packages = currentUserPermissionPackages(state);
  const assignment = state.teamAssignments.find((item) => item.id === assignmentId);
  const labels = {
    configure: "配置角色实例",
    review: "提交角色实例复核",
    revoke: "提交角色实例回收",
  };
  const manageAllowed = roles.some((role) => ["平台支持", "租户管理员"].includes(role)) || packages.includes("用户权限管理包");
  const scopeAllowed = assignment ? teamAssignmentVisibleForCurrentUser(state, assignment.id) : false;
  const statusAllowed = action === "configure"
    ? Boolean(assignment && assignment.status !== "已启用" && assignment.status !== "待审批" && !assignment.pendingLifecycleAction)
    : Boolean(assignment && assignment.status === "已启用" && !assignment.pendingLifecycleAction);
  const allowed = Boolean(assignment && manageAllowed && scopeAllowed && statusAllowed);
  let message = action === "configure" ? "提交后进入角色实例启用审批，审批通过后才生效。" : "提交后进入角色生命周期审批，审批通过后才改变权限。";
  if (!assignment) message = "角色实例不存在。";
  else if (!manageAllowed) message = `当前账号有效角色为${roles.join("、")}，只能查看权限，不能提交角色管理动作。`;
  else if (!scopeAllowed) message = "该角色实例不在当前账号的数据范围内。";
  else if (assignment.pendingLifecycleAction) message = `已有${assignment.pendingLifecycleAction === "review" ? "复核" : "回收"}审批 ${assignment.pendingLifecycleApprovalId || ""} 待处理。`;
  else if (action === "configure" && assignment.status === "已启用") message = "已启用角色实例不能直接重新配置；请先走复核、回收或新建角色实例。";
  else if (action === "configure" && assignment.status === "待审批") message = "该角色实例已有启用审批待处理。";
  else if (action !== "configure" && assignment.status !== "已启用") message = "角色实例启用后才能提交复核或回收审批。";
  return {
    label: labels[action],
    risk: "L4",
    allowed,
    requiresApproval: true,
    approver: "业务负责人",
    rule: "角色、权限包、数据范围和生命周期变更需由非发起人审批",
    message,
  };
}

export function releaseRollbackActionPolicy(state: AppState, releaseId: string): ActionPolicy {
  const release = state.releases.find((item) => item.id === releaseId);
  const basePolicy = configReleaseActionPolicy(state);
  const visible = release ? releaseVisibleForCurrentUser(state, release.id) : false;
  const reversible = release ? releaseHasReversibleChange(state, release.id) : false;
  const activeRollback = release ? state.releases.find((item) => item.rollbackOf === release.id && item.status !== "已驳回") : undefined;
  const statusAllowed = release?.status === "已发布";
  const notRollbackRelease = !release?.rollbackOf;
  const allowed = Boolean(release && basePolicy.allowed && visible && reversible && statusAllowed && notRollbackRelease && !activeRollback);
  let message = "提交后会创建配置回退审批，通过后按原发布的 before/after 反向应用。";
  if (!release) message = "发布记录不存在。";
  else if (!basePolicy.allowed) message = basePolicy.message;
  else if (!visible) message = "该发布不在当前账号的数据范围内。";
  else if (!statusAllowed) message = "只有已发布的配置才能申请回退。";
  else if (!notRollbackRelease) message = "回退发布不再继续回退；需要调整时请提交新的配置发布。";
  else if (activeRollback) message = `该发布已有回退记录 ${activeRollback.id}，当前状态为${activeRollback.status}。`;
  else if (!reversible) message = "该发布没有可自动回退的配置对象，请通过新建发布提交修正。";
  return {
    label: "申请配置回退",
    risk: "L3",
    allowed,
    requiresApproval: true,
    approver: "配置审批人",
    rule: "回退已发布配置必须进入审批，并保留原发布差异和回退原因",
    message,
  };
}

export function reportExportPolicy(state: AppState): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const packages = currentUserPermissionPackages(state);
  const allowed = roles.some((role) => ["平台支持", "业务负责人", "财务/结算"].includes(role)) || packages.includes("报表导出包");
  return {
    label: "导出报表明细",
    risk: "L3",
    allowed,
    requiresApproval: false,
    message: allowed ? "导出后必须写入导出范围、操作者和文件记录。" : `当前账号有效角色为${roles.join("、") || user.role}，没有报表导出权限。`,
  };
}

export function apiOperationActionPolicy(state: AppState, operationId: string, action: "sync" | "compensate"): ActionPolicy {
  const operation = state.apiOperations.find((item) => item.id === operationId);
  const roles = currentUserRoles(state);
  const visible = operation ? apiOperationVisibleForCurrentUser(state, operation) : false;
  const roleAllowed = action === "sync"
    ? roles.some((role) => ["平台支持", "租户管理员", "运营负责人"].includes(role))
    : roles.some((role) => ["平台支持", "租户管理员", "业务负责人"].includes(role));
  const statusAllowed = action === "sync"
    ? Boolean(operation && ["待同步", "同步失败"].includes(operation.syncStatus))
    : Boolean(operation && operation.syncStatus === "需要补偿");
  const allowed = Boolean(operation && visible && roleAllowed && statusAllowed);
  let message = action === "sync" ? "提交后进入服务端同步，等待服务端确认。" : "提交后记录补偿处理结果，并等待重新拉取服务端状态。";
  if (!operation) message = "同步记录不存在。";
  else if (!visible) message = "该同步记录不在当前账号的数据范围内。";
  else if (!roleAllowed) message = action === "sync" ? `当前账号有效角色为${roles.join("、")}，不能提交服务端同步。` : `当前账号有效角色为${roles.join("、")}，不能提交补偿处理。`;
  else if (!statusAllowed) message = action === "sync" ? `当前同步状态为${operation.syncStatus}，不能重复提交同步。` : `当前同步状态为${operation.syncStatus}，不需要补偿处理。`;
  return {
    label: action === "sync" ? "提交同步请求" : "提交补偿处理",
    risk: action === "sync" ? "L2" : "L4",
    allowed,
    requiresApproval: false,
    message,
  };
}

export function actionPermissionMatrix(state: AppState): ActionMatrixRow[] {
  const visibleIncident = activeIncidents(state)[0];
  const visibleTask = activeTasks(state)[0];
  const visibleDevice = filteredDevices(state)[0];
  const visibleRelease = state.releases.find((release) => releaseVisibleForCurrentUser(state, release.id));
  const visibleApproval = state.approvalRequests.find((approval) => approvalVisibleForCurrentUser(state, approval));
  const visibleOperation = state.apiOperations.find((operation) => apiOperationVisibleForCurrentUser(state, operation));
  const compensableOperation = state.apiOperations.find((operation) => apiOperationVisibleForCurrentUser(state, operation) && operation.syncStatus === "需要补偿");
  const visibleAssignment = state.teamAssignments.find((assignment) => teamAssignmentVisibleForCurrentUser(state, assignment.id));
  const rows: ActionMatrixRow[] = [
    menuMatrixRow(state, "工作台", "查看经营看板", "L0", "workbench"),
    menuMatrixRow(state, "品牌或组织", "查看品牌/组织", "L1", "brands"),
    policyMatrixRow("品牌或组织", customerOnboardingPolicy(state)),
    policyMatrixRow("用户权限", userInvitationPolicy(state)),
    policyMatrixRow("配置发布", configReleaseActionPolicy(state)),
    policyMatrixRow("报表", reportExportPolicy(state)),
  ];
  if (visibleRelease) rows.push(policyMatrixRow("配置发布", releaseRollbackActionPolicy(state, visibleRelease.id)));
  if (visibleIncident) {
    rows.push(policyMatrixRow("异常中心", incidentActionPolicy(state, visibleIncident, "advance")));
    rows.push(policyMatrixRow("异常中心", incidentActionPolicy(state, visibleIncident, "refund")));
    rows.push(policyMatrixRow("异常中心", incidentActionPolicy(state, visibleIncident, "close")));
  } else {
    rows.push(emptyObjectMatrixRow("异常中心", "异常处理动作", "当前范围暂无可处理异常。"));
  }
  if (visibleTask) {
    rows.push(policyMatrixRow("任务工单", taskActionPolicy(state, visibleTask, "start")));
    rows.push(policyMatrixRow("任务工单", taskActionPolicy(state, visibleTask, "resolve")));
  } else {
    rows.push(emptyObjectMatrixRow("任务工单", "任务处理动作", "当前范围暂无可处理任务。"));
  }
  if (visibleDevice) {
    rows.push(policyMatrixRow("机器人设备", deviceCommandPolicy(state, visibleDevice.id, "sync-status")));
    rows.push(policyMatrixRow("机器人设备", deviceCommandPolicy(state, visibleDevice.id, "sync-config")));
    rows.push(policyMatrixRow("机器人设备", deviceCommandPolicy(state, visibleDevice.id, "restart")));
  } else {
    rows.push(emptyObjectMatrixRow("机器人设备", "设备命令", "当前范围暂无可操作设备。"));
  }
  if (visibleApproval) rows.push(policyMatrixRow("审批", approvalActionPolicy(state, visibleApproval)));
  else rows.push(emptyObjectMatrixRow("审批", "处理审批", "当前范围暂无审批记录。"));
  if (visibleOperation) rows.push(policyMatrixRow("接口同步", apiOperationActionPolicy(state, visibleOperation.id, "sync")));
  else rows.push(emptyObjectMatrixRow("接口同步", "提交同步请求", "当前范围暂无同步记录。"));
  if (compensableOperation) rows.push(policyMatrixRow("接口同步", apiOperationActionPolicy(state, compensableOperation.id, "compensate")));
  else rows.push(emptyObjectMatrixRow("接口同步", "提交补偿处理", "当前范围暂无需要补偿的同步记录。"));
  if (visibleAssignment) {
    rows.push(policyMatrixRow("角色权限", roleAssignmentActionPolicy(state, visibleAssignment.id, "configure")));
    rows.push(policyMatrixRow("角色权限", roleAssignmentActionPolicy(state, visibleAssignment.id, "review")));
    rows.push(policyMatrixRow("角色权限", roleAssignmentActionPolicy(state, visibleAssignment.id, "revoke")));
  } else {
    rows.push(emptyObjectMatrixRow("角色权限", "角色实例管理", "当前范围暂无角色实例。"));
  }
  return rows;
}

function policyMatrixRow(module: string, policy: ActionPolicy): ActionMatrixRow {
  return {
    module,
    action: policy.label,
    risk: policy.risk,
    status: policy.allowed ? (policy.requiresApproval ? "需审批" : "可执行") : "不可执行",
    source: policy.allowed ? (policy.requiresApproval ? `审批人：${policy.approver || "按策略匹配"}` : "当前角色/权限包") : "策略拦截",
    reason: policy.message,
  };
}

function menuMatrixRow(state: AppState, module: string, action: string, risk: string, viewId: ViewId): ActionMatrixRow {
  const access = menuAccessPolicy(state, viewId);
  return {
    module,
    action,
    risk,
    status: access.allowed ? "可查看" : "不可查看",
    source: access.source,
    reason: access.reason,
  };
}

function emptyObjectMatrixRow(module: string, action: string, reason: string): ActionMatrixRow {
  return {
    module,
    action,
    risk: "L0",
    status: "无对象",
    source: "当前数据范围",
    reason,
  };
}

export function approvalActionPolicy(state: AppState, approval: ApprovalRequest): ActionPolicy {
  const user = currentUser(state);
  const roles = currentUserRoles(state);
  const allowedRoles = approvalRoles(approval.action);
  const selfApproval = approval.requester === user.name;
  const targetVisible = approvalTargetVisible(state, approval);
  const roleAllowed = roles.some((role) => allowedRoles.includes(role));
  const allowed = approval.status === "待审批" && roleAllowed && !selfApproval && targetVisible;
  let message = "可以处理该审批。";
  if (approval.status !== "待审批") message = "该审批已处理。";
  else if (selfApproval) message = "发起人不能审批自己提交的申请。";
  else if (!roleAllowed) message = `当前账号有效角色为${roles.join("、")}，不属于该动作的审批角色。`;
  else if (!targetVisible) message = "该审批对象不在当前账号的数据范围内。";
  return {
    label: approval.action,
    risk: approval.risk,
    allowed,
    requiresApproval: false,
    approver: approval.approver,
    rule: approval.rule,
    message,
  };
}

export function approvalVisibleForCurrentUser(state: AppState, approval: ApprovalRequest): boolean {
  const user = currentUser(state);
  if (userHasGlobalScope(state)) return true;
  if (approval.requester === user.name) return true;
  return approvalTargetVisible(state, approval);
}

export function auditLogVisibleForCurrentUser(state: AppState, log: AuditLog): boolean {
  const user = currentUser(state);
  if (userHasGlobalScope(state)) return true;
  if (log.operator === user.name || log.operator === "当前用户") return true;
  if (log.object.startsWith("REL-")) return releaseVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("INC-")) return incidentVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("TSK-")) return taskVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("ORD-") || log.object.startsWith("SRV-")) return requestVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("RF-")) {
    const refund = state.refunds.find((item) => item.id === log.object);
    return refund ? requestVisibleForCurrentUser(state, refund.request) || incidentVisibleForCurrentUser(state, refund.incident) : false;
  }
  if (log.object.startsWith("CMD-")) return commandVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("API-")) {
    const operation = state.apiOperations.find((item) => item.id === log.object);
    return operation ? apiOperationVisibleForCurrentUser(state, operation) : false;
  }
  if (log.object.startsWith("INV-")) {
    const invitation = state.userInvitations.find((item) => item.id === log.object);
    return invitation ? userInvitationVisibleForCurrentUser(state, invitation) : false;
  }
  if (log.object.startsWith("tn-")) {
    const tenant = state.tenants.find((item) => item.id === log.object);
    return tenant ? tenantVisibleForCurrentUser(state, tenant) : false;
  }
  if (log.object.startsWith("tpl-")) return templateVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("pt-")) return pointIdVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("br-")) {
    const brand = state.brands.find((item) => item.id === log.object);
    return brand ? brandVisibleForCurrentUser(state, brand) : false;
  }
  if (log.object.startsWith("org-")) {
    const organization = state.organizations.find((item) => item.id === log.object);
    return organization ? organizationVisibleForCurrentUser(state, organization) : false;
  }
  if (log.object.startsWith("role-inst-")) return teamAssignmentVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("sku-")) return catalogItemVisibleForCurrentUser(state, log.object);
  if (log.object.startsWith("usr-")) return log.object === user.id;
  const device = state.devices.find((item) => item.id === log.object || item.sn === log.object || item.name === log.object);
  const tenant = state.tenants.find((item) => item.name === log.object);
  if (tenant) return tenantVisibleForCurrentUser(state, tenant);
  return device ? deviceVisibleForCurrentUser(state, device.id) : false;
}

export function apiOperationVisibleForCurrentUser(state: AppState, operation: ApiOperation): boolean {
  if (userHasGlobalScope(state)) return true;
  const object = operation.object;
  if (object.startsWith("REL-")) return releaseVisibleForCurrentUser(state, object);
  if (object.startsWith("INC-")) return incidentVisibleForCurrentUser(state, object);
  if (object.startsWith("TSK-")) return taskVisibleForCurrentUser(state, object);
  if (object.startsWith("ORD-") || object.startsWith("SRV-")) return requestVisibleForCurrentUser(state, object);
  if (object.startsWith("CMD-")) return commandVisibleForCurrentUser(state, object);
  if (object.startsWith("INV-")) {
    const invitation = state.userInvitations.find((item) => item.id === object);
    return invitation ? userInvitationVisibleForCurrentUser(state, invitation) : false;
  }
  if (object.startsWith("tn-")) {
    const tenant = state.tenants.find((item) => item.id === object);
    return tenant ? tenantVisibleForCurrentUser(state, tenant) : false;
  }
  if (object.startsWith("tpl-")) return templateVisibleForCurrentUser(state, object);
  if (object.startsWith("pt-")) return pointIdVisibleForCurrentUser(state, object);
  if (object.startsWith("br-")) {
    const brand = state.brands.find((item) => item.id === object);
    return brand ? brandVisibleForCurrentUser(state, brand) : false;
  }
  if (object.startsWith("org-")) {
    const organization = state.organizations.find((item) => item.id === object);
    return organization ? organizationVisibleForCurrentUser(state, organization) : false;
  }
  if (object.startsWith("role-inst-")) return teamAssignmentVisibleForCurrentUser(state, object);
  if (object.startsWith("sku-")) return catalogItemVisibleForCurrentUser(state, object);
  const device = state.devices.find((item) => item.id === object || item.sn === object || item.name === object);
  if (device) return deviceVisibleForCurrentUser(state, device.id);
  const invitation = state.userInvitations.find((item) => item.email === object);
  if (invitation) return userInvitationVisibleForCurrentUser(state, invitation);
  const tenant = state.tenants.find((item) => item.name === object);
  if (tenant) return tenantVisibleForCurrentUser(state, tenant);
  return operation.risk === "L1" || operation.risk === "L2";
}

function approvalTargetVisible(state: AppState, approval: ApprovalRequest): boolean {
  if (userHasGlobalScope(state)) return true;
  if (approval.target.startsWith("REL-")) return releaseVisibleForCurrentUser(state, approval.target);
  if (approval.target.startsWith("INC-")) return incidentVisibleForCurrentUser(state, approval.target);
  if (approval.target.startsWith("CMD-")) return commandVisibleForCurrentUser(state, approval.target);
  if (approval.target.startsWith("pt-")) return pointIdVisibleForCurrentUser(state, approval.target);
  if (approval.target.startsWith("role-inst-")) return teamAssignmentVisibleForCurrentUser(state, approval.target);
  if (approval.target.startsWith("RF-")) {
    const refund = state.refunds.find((item) => item.id === approval.target);
    return refund ? requestVisibleForCurrentUser(state, refund.request) || incidentVisibleForCurrentUser(state, refund.incident) : false;
  }
  return true;
}

function teamAssignmentVisibleForCurrentUser(state: AppState, assignmentId: string): boolean {
  const assignment = state.teamAssignments.find((item) => item.id === assignmentId);
  if (!assignment) return false;
  const user = currentUser(state);
  if (userHasGlobalScope(state)) return true;
  if (assignment.assigneeId === user.id || assignment.assigneeName === user.name) return true;
  const scopes = currentUserScopes(state);
  if (scopes.some((scope) => assignment.scope.includes(scope) || scope.includes(assignment.scope))) return true;
  return state.points.some((point) => {
    if (!pointVisibleForCurrentUser(state, point)) return false;
    return assignment.scope.includes(point.name) || assignment.scope.includes(point.brand) || assignment.scope.includes(point.city);
  });
}

function runIncidentAction(state: AppState, incidentId: string, action: IncidentWorkflowAction, payload?: IncidentActionPayload) {
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident) return;
  const policy = incidentActionPolicy(state, incident, action);
  if (!policy.allowed) {
    addAuditLog(state, policy.label, incident.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  const note = payload?.note?.trim() || "已按当前 SOP 完成处理。";
  const impact = payload?.impact?.trim();
  if (action === "close") {
    if (policy.requiresApproval) {
      incident.status = "waiting_manual_confirm";
      incident.statusLabel = "待关闭审批";
      const approval = addApprovalRequest(state, policy.label, incident.id, policy.approver || "运营负责人", policy.rule || "关闭高优先级异常需要审批", policy.risk);
      addProcessingRecord(state, incident.id, "提交关闭审批", `${note}${impact ? ` 影响结论：${impact}` : ""} 审批单 ${approval.id} 已生成。`);
      addAuditLog(state, "提交关闭审批", incident.id, policy.risk, "待审批", approval.id);
      return;
    }
    incident.status = "closed";
    incident.statusLabel = "已关闭";
    const refund = state.refunds.find((item) => item.incident === incident.id);
    if (refund) {
      updateRequestStatus(state, incident.order, "refund_pending", "退款处理中");
    } else if (incident.order && incident.order !== "-") {
      const request = updateRequestStatus(state, incident.order, incident.type.includes("未取走") ? "delivered" : "awaiting_delivery");
      if (request) addExecutionEvent(state, request.id, "异常中心", "异常关闭后更新履约状态", request.statusLabel);
    }
    addProcessingRecord(state, incident.id, "关闭异常", `${note}${impact ? ` 影响结论：${impact}` : ""}`);
    addAuditLog(state, "关闭异常", incident.id, "L2", "成功", impact);
  }
  if (action === "task") {
    const existing = state.tasks.find((task) => task.sourceIncident === incident.id);
    if (!existing) {
      const id = `TSK-${String(state.tasks.length + 1).padStart(3, "0")}`;
      state.tasks.unshift({
        id,
        name: `${incident.point} ${incident.type}处理`,
        type: incident.source === "设备事件" ? "设备任务" : "异常处理",
        owner: payload?.owner || incident.owner,
        point: incident.point,
        status: "已创建",
        due: "今天 18:00",
        sourceIncident: incident.id,
      });
      incident.status = "converted_to_field_service";
      incident.statusLabel = "已转现场处理";
      addProcessingRecord(state, incident.id, "转任务", `已创建任务 ${id}，负责人为 ${payload?.owner || incident.owner}。${note ? ` ${note}` : ""}`);
      addAuditLog(state, "异常转任务", incident.id, "L2", "成功", note);
    }
  }
  if (action === "refund") {
    const request = state.businessRequests.find((item) => item.id === incident.order);
    let refund = state.refunds.find((item) => item.incident === incident.id);
    if (!refund) {
      const id = `RF-${String(state.refunds.length + 1).padStart(3, "0")}`;
      refund = {
        id,
        request: incident.order,
        incident: incident.id,
        amount: request && request.amount ? `¥${request.amount}` : "-",
        status: "待客服确认",
        owner: "客服/售后",
        reason: incident.type,
      };
      state.refunds.unshift(refund);
    } else {
      refund.status = refund.status === "已完成" ? refund.status : "待客服确认";
      refund.owner = refund.owner || "客服/售后";
      refund.reason = refund.reason || incident.type;
    }
    incident.status = "converted_to_refund";
    incident.statusLabel = "已转退款";
    if (request) {
      updateRequestStatus(state, request.id, "refund_pending", "退款处理中");
      addExecutionEvent(state, request.id, "异常中心", "同步退款处理状态", "退款处理中");
    }
    const approval = addApprovalRequest(state, "发起退款", refund.id, policy.approver || "退款审批人/财务复核", policy.rule || "发起人与审批人不能相同", policy.risk);
    addProcessingRecord(state, incident.id, "转退款", `退款记录 ${refund.id} 已进入客服确认；审批单 ${approval.id} 已生成。${note ? ` ${note}` : ""}`);
    addAuditLog(state, "异常转退款", incident.id, "L2", "待审批", approval.id);
  }
  if (action === "advance") {
    const flow = [
      ["new", "triaged", "已分诊"],
      ["triaged", "assigned", "已分派"],
      ["assigned", "processing", "处理中"],
      ["processing", "waiting_manual_confirm", "待人工确认"],
      ["waiting_manual_confirm", "recovered", "已恢复"],
      ["recovered", "closed", "已关闭"],
    ];
    const next = flow.find(([from]) => from === incident.status);
    if (next) {
      incident.status = next[1];
      incident.statusLabel = next[2];
      if (incident.order && incident.order !== "-") addExecutionEvent(state, incident.order, "异常中心", "异常状态更新", next[2]);
      addProcessingRecord(state, incident.id, "推进状态", `异常状态更新为${next[2]}。${note ? ` ${note}` : ""}`);
      addAuditLog(state, "推进异常状态", incident.id, "L1", "成功", note);
    }
  }
}

function createIncident(state: AppState, payload: IncidentCreatePayload) {
  const point = filteredPoints(state).find((item) => item.name === payload.point);
  if (!point) {
    addAuditLog(state, "创建异常", payload.point, "L1", "已拒绝", "当前账号不能在该点位创建异常");
    return;
  }
  const id = `INC-${String(state.incidents.length + 1).padStart(3, "0")}`;
  const sla = payload.level === "P0" ? "15 分钟" : payload.level === "P1" ? "30 分钟" : "60 分钟";
  state.incidents.unshift({
    id,
    type: payload.type,
    level: payload.level,
    source: payload.source,
    point: point.name,
    owner: payload.owner,
    status: "new",
    statusLabel: "新异常",
    sla,
    order: "-",
    sop: "确认异常来源、影响范围、负责人和后续处理动作。",
  });
  addProcessingRecord(state, id, "创建异常", `${payload.source} / ${payload.note}`);
  addAuditLog(state, "创建异常", id, "L1", "成功", `${point.name} / ${payload.type} / ${payload.level}`);
}

function runTaskAction(state: AppState, taskId: string, action: TaskWorkflowAction, payload?: TaskActionPayload) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const policy = taskActionPolicy(state, task, action);
  if (!policy.allowed) {
    addAuditLog(state, policy.label, task.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  const note = payload?.note?.trim() || "已记录处理进展。";
  if (action === "start") {
    task.status = "处理中";
    addProcessingRecord(state, task.id, "开始处理", note);
    addAuditLog(state, "开始处理任务", task.id, "L1", "成功", note);
  }
  if (action === "resolve") {
    task.status = "已解决";
    const result = payload?.result?.trim();
    addProcessingRecord(state, task.id, "标记解决", `${note}${result ? ` 处理结果：${result}` : ""}`);
    addAuditLog(state, "解决任务", task.id, "L1", "成功", result || note);
    if (task.sourceIncident) {
      const incident = state.incidents.find((item) => item.id === task.sourceIncident);
      if (incident && incident.status !== "closed") {
        incident.status = "recovered";
        incident.statusLabel = "已恢复";
        addProcessingRecord(state, incident.id, "任务完成", `${task.id} 已解决，异常状态更新为已恢复。`);
        if (incident.order && incident.order !== "-") {
          const request = updateRequestStatus(state, incident.order, "awaiting_delivery");
          if (request) addExecutionEvent(state, request.id, "任务/工单", "现场任务完成", request.statusLabel);
        }
      }
    }
  }
}

function runDeviceCommand(state: AppState, payload: DeviceCommandPayload) {
  const device = state.devices.find((item) => item.id === payload.deviceId);
  if (!device) return;
  const policy = deviceCommandPolicy(state, device.id, payload.command);
  if (!policy.allowed) {
    addAuditLog(state, policy.label, device.id, policy.risk, "已拒绝", policy.message);
    return;
  }
  const user = currentUser(state);
  const id = `CMD-${String(state.commandRecords.length + 1).padStart(3, "0")}`;
  const command: CommandRecord = {
    id,
    device: device.id,
    time: currentTime(),
    command: policy.label,
    operator: user.name,
    risk: policy.risk,
    result: policy.requiresApproval ? "待审批" : "成功",
    reason: payload.reason.trim(),
  };
  state.commandRecords.unshift(command);

  if (policy.requiresApproval) {
    const approval = addApprovalRequest(state, "设备高风险命令", id, policy.approver || "设备运维负责人", policy.rule || "二次确认并写入高风险动作记录", policy.risk);
    command.approvalId = approval.id;
    addAuditLog(state, "提交设备命令", id, policy.risk, "待审批", `${device.name} / ${policy.label}；审批单 ${approval.id}`, user.name);
    return;
  }

  addDeviceEvent(state, device.id, `${policy.label}已执行`, "info", id);
  addAuditLog(state, "执行设备命令", id, policy.risk, "成功", `${device.name} / ${policy.label}`, user.name);
}

function applyDeviceCommandApproval(state: AppState, commandId: string, approved: boolean) {
  const command = state.commandRecords.find((item) => item.id === commandId);
  if (!command) return;
  const device = state.devices.find((item) => item.id === command.device);
  if (!approved) {
    command.result = "已驳回";
    return;
  }
  command.result = "成功";
  command.time = currentTime();
  if (device && command.command === "重启设备") device.status = "在线";
  addDeviceEvent(state, command.device, `${command.command}已执行`, command.risk === "L3" ? "warn" : "info", command.id);
  addAuditLog(state, "执行设备命令", command.id, command.risk, "成功", device ? `${device.name} / ${command.command}` : command.command);
}

function createConfigRelease(state: AppState, payload: ConfigReleasePayload) {
  const actionPolicy = configReleaseActionPolicy(state);
  if (!actionPolicy.allowed) {
    addAuditLog(state, actionPolicy.label, payload.name, actionPolicy.risk, "已拒绝", actionPolicy.message);
    return;
  }
  const user = currentUser(state);
  const policy = staticData.approvalPolicies.find((item) => item.action.includes("配置"));
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  const release: ReleaseRecord = {
    id,
    name: payload.name.trim(),
    scope: payload.scope.trim(),
    scopeRef: payload.scopeRef,
    status: "待审批",
    by: user.name,
    time: currentTime(),
  };
  const diff: ReleaseDiff = {
    release: id,
    object: payload.object.trim(),
    before: payload.before.trim() || "-",
    after: payload.after.trim(),
    impact: payload.impact.trim(),
  };
  state.releases.unshift(release);
  state.releaseDiffs.unshift(diff);
  const approval = addApprovalRequest(state, "配置发布", id, policy?.approver || "配置审批人", policy?.rule || "影响点位经营时必须审批", "L3");
  addAuditLog(state, "提交配置发布", id, "L3", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function submitReleaseRollback(state: AppState, payload: ReleaseRollbackPayload) {
  const release = state.releases.find((item) => item.id === payload.releaseId);
  const policy = releaseRollbackActionPolicy(state, payload.releaseId);
  if (!release || !policy.allowed) {
    addAuditLog(state, "提交配置回退", payload.releaseId, policy.risk, "已拒绝", policy.message);
    return;
  }
  const diffs = state.releaseDiffs.filter((diff) => diff.release === release.id);
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  const user = currentUser(state);
  state.releases.unshift({
    id,
    name: `回退：${release.name}`,
    scope: release.scope,
    scopeRef: release.scopeRef,
    status: "待审批",
    by: user.name,
    time: currentTime(),
    rollbackOf: release.id,
  });
  const rollbackDiffs = diffs.length
    ? diffs.map((diff) => ({
      release: id,
      object: `回退 ${diff.object}`,
      before: diff.after,
      after: diff.before,
      impact: `${diff.impact}；回退原因：${payload.reason.trim()}`,
    }))
    : [{
      release: id,
      object: `回退 ${release.name}`,
      before: "当前已发布配置",
      after: "恢复至发布前配置",
      impact: payload.reason.trim(),
    }];
  state.releaseDiffs.unshift(...rollbackDiffs);
  createRollbackChange(state, release.id, id, payload.reason.trim());
  const approval = addApprovalRequest(state, "配置回退", id, policy.approver || "配置审批人", policy.rule || "回退已发布配置必须审批", policy.risk);
  addAuditLog(state, "提交配置回退", id, "L3", "待审批", `来源发布 ${release.id}；${payload.reason.trim()}；审批单 ${approval.id}`);
}

function submitCatalogChange(state: AppState, payload: CatalogChangePayload) {
  const actionPolicy = configReleaseActionPolicy(state);
  const item = state.catalog.find((catalogItem) => catalogItem.id === payload.itemId);
  if (!item) return;
  if (!actionPolicy.allowed) {
    addAuditLog(state, actionPolicy.label, item.id, actionPolicy.risk, "已拒绝", actionPolicy.message);
    return;
  }
  const user = currentUser(state);
  const policy = staticData.approvalPolicies.find((approvalPolicy) => approvalPolicy.action.includes("配置"));
  const currentVariant = state.productVariants.find((variant) => variant.product === item.name || variant.sku === payload.variantSku);
  const nextItem: CatalogItem = {
    ...item,
    name: payload.name.trim(),
    status: payload.status.trim(),
    attrs: payload.attrs.map((attr) => attr.trim()).filter(Boolean),
    flow: payload.flow.trim(),
  };
  const nextVariant: ProductVariant = {
    product: nextItem.name,
    sku: payload.variantSku.trim(),
    spec: payload.variantSpec.trim(),
    price: payload.variantPrice.trim(),
    points: payload.variantPoints.trim(),
  };
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  const scope = catalogReleaseScopeSelection(state, item, payload.variantPoints);
  const release: ReleaseRecord = {
    id,
    name: `商品/服务配置变更：${item.name}`,
    scope: scope.value,
    scopeRef: scope,
    status: "待审批",
    by: user.name,
    time: currentTime(),
  };
  const diff: ReleaseDiff = {
    release: id,
    object: `商品/服务 ${item.name}`,
    before: summarizeCatalogConfig(item, currentVariant),
    after: summarizeCatalogConfig(nextItem, nextVariant),
    impact: payload.variantPoints.trim(),
  };
  const change: CatalogChange = {
    release: id,
    itemId: item.id,
    beforeItem: item,
    afterItem: nextItem,
    beforeVariant: currentVariant,
    afterVariant: nextVariant,
    reason: payload.reason.trim(),
    status: "待审批",
  };
  state.releases.unshift(release);
  state.releaseDiffs.unshift(diff);
  state.catalogChanges.unshift(change);
  const approval = addApprovalRequest(state, "配置发布", id, policy?.approver || "配置审批人", policy?.rule || "影响点位经营时必须审批", "L3");
  addAuditLog(state, "提交商品/服务配置发布", id, "L3", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function submitPointChange(state: AppState, payload: PointChangePayload) {
  const actionPolicy = configReleaseActionPolicy(state);
  const point = state.points.find((item) => item.id === payload.pointId);
  if (!point) return;
  if (!actionPolicy.allowed) {
    addAuditLog(state, actionPolicy.label, point.id, actionPolicy.risk, "已拒绝", actionPolicy.message);
    return;
  }
  const user = currentUser(state);
  const policy = staticData.approvalPolicies.find((approvalPolicy) => approvalPolicy.action.includes("配置"));
  const beforeChecks = state.pointChecks.filter((check) => check.point === point.name);
  const afterChecks = normalizePointChecks(point.name, payload.checks);
  const afterPoint: Point = {
    ...point,
    status: payload.status.trim(),
    owner: payload.owner.trim(),
  };
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  const release: ReleaseRecord = {
    id,
    name: `点位配置变更：${point.name}`,
    scope: `${point.brand} / ${point.city} / ${point.name}`,
    scopeRef: pointScopeSelection(point),
    status: "待审批",
    by: user.name,
    time: currentTime(),
  };
  const before = summarizePointConfig(point, beforeChecks);
  const after = summarizePointConfig(afterPoint, afterChecks);
  const diff: ReleaseDiff = {
    release: id,
    object: `点位 ${point.name}`,
    before,
    after,
    impact: summarizePointImpact(point, afterPoint, beforeChecks, afterChecks),
  };
  state.releases.unshift(release);
  state.releaseDiffs.unshift(diff);
  state.pointChanges.unshift({
    release: id,
    pointId: point.id,
    beforePoint: point,
    afterPoint,
    beforeChecks,
    afterChecks,
    reason: payload.reason.trim(),
    status: "待审批",
  });
  const approval = addApprovalRequest(state, "配置发布", id, policy?.approver || "配置审批人", policy?.rule || "影响点位经营时必须审批", "L3");
  addAuditLog(state, "提交点位配置发布", id, "L3", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function submitTemplateChange(state: AppState, payload: ScenarioTemplateChangePayload) {
  const actionPolicy = configReleaseActionPolicy(state);
  const template = state.templates.find((item) => item.id === payload.templateId);
  if (!template) return;
  if (!actionPolicy.allowed) {
    addAuditLog(state, actionPolicy.label, template.id, actionPolicy.risk, "已拒绝", actionPolicy.message);
    return;
  }
  const user = currentUser(state);
  const policy = staticData.approvalPolicies.find((approvalPolicy) => approvalPolicy.action.includes("配置"));
  const afterTemplate: ScenarioTemplate = {
    ...template,
    objectName: payload.objectName.trim(),
    fields: normalizeList(payload.fields),
    states: normalizeList(payload.states),
    exceptions: normalizeList(payload.exceptions),
    roles: normalizeList(payload.roles),
  };
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  const release: ReleaseRecord = {
    id,
    name: `场景模板变更：${template.name}`,
    scope: templateReleaseScope(state, template),
    scopeRef: templateScopeSelection(state, template),
    status: "待审批",
    by: user.name,
    time: currentTime(),
  };
  const diff: ReleaseDiff = {
    release: id,
    object: `场景模板 ${template.name}`,
    before: summarizeTemplateConfig(template),
    after: summarizeTemplateConfig(afterTemplate),
    impact: summarizeTemplateImpact(state, template, afterTemplate),
  };
  state.releases.unshift(release);
  state.releaseDiffs.unshift(diff);
  state.templateChanges.unshift({
    release: id,
    templateId: template.id,
    beforeTemplate: template,
    afterTemplate,
    reason: payload.reason.trim(),
    status: "待审批",
  });
  const approval = addApprovalRequest(state, "配置发布", id, policy?.approver || "配置审批人", policy?.rule || "影响点位经营时必须审批", "L3");
  addAuditLog(state, "提交场景模板配置发布", id, "L3", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function submitBrandChange(state: AppState, payload: BrandChangePayload) {
  const actionPolicy = configReleaseActionPolicy(state);
  const brand = state.brands.find((item) => item.id === payload.brandId);
  if (!brand) return;
  if (!actionPolicy.allowed || !brandVisibleForCurrentUser(state, brand)) {
    addAuditLog(state, actionPolicy.label, brand.id, actionPolicy.risk, "已拒绝", brandVisibleForCurrentUser(state, brand) ? actionPolicy.message : "该品牌不在当前账号的数据范围内");
    return;
  }
  const user = currentUser(state);
  const policy = staticData.approvalPolicies.find((approvalPolicy) => approvalPolicy.action.includes("配置"));
  const afterBrand: Brand = {
    ...brand,
    name: payload.name.trim(),
    status: payload.status.trim(),
    scenario: payload.scenario.trim(),
    owner: payload.owner.trim(),
    points: normalizeCount(payload.points),
  };
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  state.releases.unshift({
    id,
    name: `品牌配置变更：${brand.name}`,
    scope: `${brand.tenant} / ${brand.name}`,
    scopeRef: brandScopeSelection(brand),
    status: "待审批",
    by: user.name,
    time: currentTime(),
  });
  state.releaseDiffs.unshift({
    release: id,
    object: `品牌 ${brand.name}`,
    before: summarizeBrandConfig(brand),
    after: summarizeBrandConfig(afterBrand),
    impact: summarizeBrandImpact(state, brand, afterBrand),
  });
  state.brandChanges.unshift({
    release: id,
    brandId: brand.id,
    beforeBrand: brand,
    afterBrand,
    reason: payload.reason.trim(),
    status: "待审批",
  });
  const approval = addApprovalRequest(state, "配置发布", id, policy?.approver || "配置审批人", policy?.rule || "影响点位经营时必须审批", "L3");
  addAuditLog(state, "提交品牌配置发布", id, "L3", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function submitOrganizationChange(state: AppState, payload: OrganizationChangePayload) {
  const actionPolicy = configReleaseActionPolicy(state);
  const organization = state.organizations.find((item) => item.id === payload.organizationId);
  if (!organization) return;
  if (!actionPolicy.allowed || !organizationVisibleForCurrentUser(state, organization)) {
    addAuditLog(state, actionPolicy.label, organization.id, actionPolicy.risk, "已拒绝", organizationVisibleForCurrentUser(state, organization) ? actionPolicy.message : "该组织不在当前账号的数据范围内");
    return;
  }
  const user = currentUser(state);
  const policy = staticData.approvalPolicies.find((approvalPolicy) => approvalPolicy.action.includes("配置"));
  const afterOrganization: Organization = {
    ...organization,
    name: payload.name.trim(),
    type: payload.type.trim(),
    parent: payload.parent.trim(),
    owner: payload.owner.trim(),
    points: normalizeCount(payload.points),
    users: normalizeCount(payload.users),
  };
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  state.releases.unshift({
    id,
    name: `组织配置变更：${organization.name}`,
    scope: `${organization.tenant} / ${organization.name}`,
    scopeRef: organizationScopeSelection(organization),
    status: "待审批",
    by: user.name,
    time: currentTime(),
  });
  state.releaseDiffs.unshift({
    release: id,
    object: `组织 ${organization.name}`,
    before: summarizeOrganizationConfig(organization),
    after: summarizeOrganizationConfig(afterOrganization),
    impact: summarizeOrganizationImpact(organization, afterOrganization),
  });
  state.organizationChanges.unshift({
    release: id,
    organizationId: organization.id,
    beforeOrganization: organization,
    afterOrganization,
    reason: payload.reason.trim(),
    status: "待审批",
  });
  const approval = addApprovalRequest(state, "配置发布", id, policy?.approver || "配置审批人", policy?.rule || "影响点位经营时必须审批", "L3");
  addAuditLog(state, "提交组织配置发布", id, "L3", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function submitCustomerOnboarding(state: AppState, payload: CustomerOnboardingPayload) {
  const policy = customerOnboardingPolicy(state);
  const user = currentUser(state);
  const tenantName = payload.tenantName.trim();
  if (!policy.allowed) {
    addAuditLog(state, policy.label, tenantName || "客户开通", policy.risk, "已拒绝", policy.message, user.name);
    return;
  }
  const required = [payload.tenantName, payload.mode, payload.contact, payload.supportOwner, payload.brandName, payload.scenario, payload.organizationName, payload.city, payload.adminName, payload.adminEmail, payload.adminRole, payload.reason];
  if (required.some((value) => !value.trim()) || !payload.adminEmail.includes("@")) {
    addAuditLog(state, policy.label, tenantName || "客户开通", policy.risk, "已拒绝", "客户开通资料不完整。", user.name);
    return;
  }
  if (state.tenants.some((tenant) => tenant.name === tenantName)) {
    addAuditLog(state, policy.label, tenantName, policy.risk, "已拒绝", "租户/客户名称已存在，需要进入已有客户继续配置。", user.name);
    return;
  }
  if (state.userInvitations.some((invitation) => invitation.email.toLowerCase() === payload.adminEmail.trim().toLowerCase() && !["已取消", "已过期"].includes(invitation.status))) {
    addAuditLog(state, policy.label, payload.adminEmail.trim().toLowerCase(), policy.risk, "已拒绝", "管理员邮箱已有未结束的邀请。", user.name);
    return;
  }

  const tenantId = nextRecordId("tn", state.tenants.map((tenant) => tenant.id));
  const brandId = nextRecordId("br", state.brands.map((brand) => brand.id));
  const organizationId = nextRecordId("org", state.organizations.map((organization) => organization.id));
  const invitationId = nextRecordId("INV", state.userInvitations.map((invitation) => invitation.id));
  const supportOwner = payload.supportOwner.trim() || user.name;
  const tenant: Tenant = {
    id: tenantId,
    name: tenantName,
    mode: payload.mode.trim(),
    contact: payload.contact.trim(),
    status: "待开通",
    supportOwner,
  };
  const brand: Brand = {
    id: brandId,
    name: payload.brandName.trim(),
    tenant: tenant.name,
    status: "草稿",
    scenario: payload.scenario.trim(),
    owner: payload.contact.trim(),
    points: 0,
  };
  const organization: Organization = {
    id: organizationId,
    name: payload.organizationName.trim(),
    tenant: tenant.name,
    type: "城市运营",
    parent: `${tenant.name} 总部`,
    owner: payload.contact.trim(),
    points: 0,
    users: 0,
  };
  const scopeRef: ScopeSelection = {
    type: "tenant",
    id: tenant.id,
    label: tenant.name,
    value: `${tenant.name} / 全部品牌`,
    parent: tenant.mode,
  };
  const invitation: UserInvitation = {
    id: invitationId,
    tenant: tenant.name,
    email: payload.adminEmail.trim().toLowerCase(),
    name: payload.adminName.trim(),
    role: payload.adminRole.trim(),
    scope: scopeRef.value,
    scopeRef,
    status: "待接受",
    invitedBy: user.name,
    invitedAt: currentTime(),
    expiresAt: futureDateLabel(7),
    reason: payload.reason.trim(),
  };

  state.tenants.unshift(tenant);
  state.brands.unshift(brand);
  state.organizations.unshift(organization);
  state.userInvitations.unshift(invitation);
  addAuditLog(state, "开通租户/客户", tenant.id, "L4", "待开通", `品牌 ${brand.id}、组织 ${organization.id} 已创建；管理员邀请 ${invitation.id} 已发送至 ${invitation.email}`, user.name);
}

function inviteUser(state: AppState, payload: UserInvitationPayload) {
  const policy = userInvitationPolicy(state);
  const user = currentUser(state);
  const email = payload.email.trim().toLowerCase();
  const tenant = state.tenants.find((item) => item.name === payload.tenant);
  if (!tenant) {
    addAuditLog(state, policy.label, email || "用户邀请", policy.risk, "已拒绝", "所选租户/客户不存在。", user.name);
    return;
  }
  if (!payload.name.trim() || !email.includes("@") || !payload.role.trim() || !payload.scope.trim() || payload.reason.trim().length < 6) {
    addAuditLog(state, policy.label, email || "用户邀请", policy.risk, "已拒绝", "用户邀请资料不完整。", user.name);
    return;
  }
  if (!policy.allowed || !tenantVisibleForCurrentUser(state, tenant)) {
    addAuditLog(state, policy.label, email || tenant.id, policy.risk, "已拒绝", policy.allowed ? "该租户/客户不在当前账号的数据范围内。" : policy.message, user.name);
    return;
  }
  const duplicated = state.userInvitations.some((invitation) => invitation.email.toLowerCase() === email && !["已取消", "已过期"].includes(invitation.status));
  if (duplicated) {
    addAuditLog(state, policy.label, email, policy.risk, "已拒绝", "该邮箱已有未结束的邀请。", user.name);
    return;
  }
  const scopeRef = payload.scopeRef || {
    type: "tenant" as const,
    id: tenant.id,
    label: tenant.name,
    value: payload.scope.trim(),
    parent: tenant.mode,
  };
  const invitation: UserInvitation = {
    id: nextRecordId("INV", state.userInvitations.map((item) => item.id)),
    tenant: tenant.name,
    email,
    name: payload.name.trim(),
    role: payload.role.trim(),
    scope: payload.scope.trim(),
    scopeRef,
    status: "待接受",
    invitedBy: user.name,
    invitedAt: currentTime(),
    expiresAt: futureDateLabel(7),
    reason: payload.reason.trim(),
  };
  state.userInvitations.unshift(invitation);
  addAuditLog(state, "邀请用户", invitation.id, "L4", invitation.status, `${invitation.name} / ${invitation.role} / ${invitation.scope} / ${invitation.email}`, user.name);
}

function acceptInvitation(state: AppState, payload: InvitationAcceptancePayload) {
  const invitation = state.userInvitations.find((item) => item.id === payload.invitationId);
  if (!invitation) {
    addAuditLog(state, "接受邀请", payload.invitationId, "L3", "已拒绝", "邀请不存在。", "邀请接受页");
    return;
  }
  if (invitation.status !== "待接受") {
    addAuditLog(state, "接受邀请", invitation.id, "L3", "已拒绝", `邀请当前状态为${invitation.status}，不能重复接受。`, invitation.email);
    return;
  }
  if (invitationExpired(invitation.expiresAt)) {
    invitation.status = "已过期";
    addAuditLog(state, "接受邀请", invitation.id, "L3", "已拒绝", `邀请已于 ${invitation.expiresAt} 失效，需要管理员重新邀请。`, invitation.email);
    return;
  }
  if (payload.password.trim().length < 8) {
    addAuditLog(state, "接受邀请", invitation.id, "L3", "已拒绝", "密码长度不足。", invitation.email);
    return;
  }
  const email = invitation.email.trim().toLowerCase();
  if (state.users.some((user) => user.email?.toLowerCase() === email)) {
    addAuditLog(state, "接受邀请", invitation.id, "L3", "已拒绝", "该邮箱已存在账号。", invitation.email);
    return;
  }
  const accountId = nextRecordId("usr", state.users.map((user) => user.id));
  const user: User = {
    id: accountId,
    name: invitation.name,
    role: "待授权用户",
    scope: invitation.scope,
    status: "启用",
    login: "尚未登录",
    email,
    credential: payload.password,
    invitedBy: invitation.invitedBy,
    acceptedAt: currentTime(),
  };
  state.users.push(user);
  invitation.status = "已接受";
  invitation.acceptedAt = currentTime();
  invitation.accountId = accountId;
  addAuditLog(state, "接受邀请", invitation.id, "L3", "已接受", `账号 ${accountId} 已创建，基础角色为待授权用户；拟绑定角色 ${invitation.role} 仍需角色实例审批。`, invitation.email);
}

function submitDeviceChange(state: AppState, payload: DeviceChangePayload) {
  const actionPolicy = configReleaseActionPolicy(state);
  const device = state.devices.find((item) => item.id === payload.deviceId);
  if (!device) return;
  if (!actionPolicy.allowed || !deviceVisibleForCurrentUser(state, device.id)) {
    addAuditLog(state, actionPolicy.label, device.id, actionPolicy.risk, "已拒绝", deviceVisibleForCurrentUser(state, device.id) ? actionPolicy.message : "该设备不在当前账号的数据范围内");
    return;
  }
  const user = currentUser(state);
  const policy = staticData.approvalPolicies.find((approvalPolicy) => approvalPolicy.action.includes("配置"));
  const afterDevice: Device = {
    ...device,
    name: payload.name.trim(),
    point: payload.point.trim(),
    type: payload.type.trim(),
    status: payload.status.trim(),
    version: payload.version.trim(),
    capability: normalizeList(payload.capability),
  };
  const id = `REL-${String(state.releases.length + 1).padStart(3, "0")}`;
  state.releases.unshift({
    id,
    name: `设备配置变更：${device.name}`,
    scope: `${device.point} / ${device.name}`,
    scopeRef: deviceScopeSelection(state, device),
    status: "待审批",
    by: user.name,
    time: currentTime(),
  });
  state.releaseDiffs.unshift({
    release: id,
    object: `设备 ${device.name}`,
    before: summarizeDeviceConfig(device),
    after: summarizeDeviceConfig(afterDevice),
    impact: summarizeDeviceImpact(device, afterDevice),
  });
  state.deviceChanges.unshift({
    release: id,
    deviceId: device.id,
    beforeDevice: device,
    afterDevice,
    reason: payload.reason.trim(),
    status: "待审批",
  });
  const approval = addApprovalRequest(state, "配置发布", id, policy?.approver || "配置审批人", policy?.rule || "影响点位经营时必须审批", "L3");
  addAuditLog(state, "提交设备配置发布", id, "L3", "待审批", `${payload.reason.trim()}；审批单 ${approval.id}`);
}

function applyCatalogChange(state: AppState, releaseId: string, approved: boolean) {
  const change = state.catalogChanges.find((item) => item.release === releaseId);
  if (!change) return;
  if (!approved) {
    change.status = "已驳回";
    return;
  }
  const catalogIndex = state.catalog.findIndex((item) => item.id === change.itemId);
  if (catalogIndex >= 0) state.catalog[catalogIndex] = change.afterItem;
  if (change.afterVariant) {
    const variantIndex = state.productVariants.findIndex((variant) => variant.sku === change.afterVariant?.sku || variant.product === change.beforeItem.name);
    if (variantIndex >= 0) state.productVariants[variantIndex] = change.afterVariant;
    else state.productVariants.unshift(change.afterVariant);
  }
  change.status = "已生效";
  addAuditLog(state, "应用商品/服务配置", change.afterItem.id, "L3", "成功", `发布 ${releaseId} 已生效`);
}

function applyPointChange(state: AppState, releaseId: string, approved: boolean) {
  const change = state.pointChanges.find((item) => item.release === releaseId);
  if (!change) return;
  if (!approved) {
    change.status = "已驳回";
    return;
  }
  const pointIndex = state.points.findIndex((item) => item.id === change.pointId);
  if (pointIndex >= 0) state.points[pointIndex] = change.afterPoint;
  state.pointChecks = state.pointChecks.filter((check) => check.point !== change.beforePoint.name);
  state.pointChecks.unshift(...change.afterChecks);
  change.status = "已生效";
  addAuditLog(state, "应用点位配置", change.afterPoint.id, "L3", "成功", `发布 ${releaseId} 已生效`);
}

function applyTemplateChange(state: AppState, releaseId: string, approved: boolean) {
  const change = state.templateChanges.find((item) => item.release === releaseId);
  if (!change) return;
  if (!approved) {
    change.status = "已驳回";
    return;
  }
  const templateIndex = state.templates.findIndex((item) => item.id === change.templateId);
  if (templateIndex >= 0) state.templates[templateIndex] = change.afterTemplate;
  change.status = "已生效";
  addAuditLog(state, "应用场景模板配置", change.afterTemplate.id, "L3", "成功", `发布 ${releaseId} 已生效`);
}

function applyBrandChange(state: AppState, releaseId: string, approved: boolean) {
  const change = state.brandChanges.find((item) => item.release === releaseId);
  if (!change) return;
  if (!approved) {
    change.status = "已驳回";
    return;
  }
  const brandIndex = state.brands.findIndex((item) => item.id === change.brandId);
  const beforeName = change.beforeBrand.name;
  const afterName = change.afterBrand.name;
  if (brandIndex >= 0) state.brands[brandIndex] = change.afterBrand;
  if (beforeName !== afterName) {
    state.points.forEach((point) => {
      if (point.brand === beforeName) point.brand = afterName;
    });
    state.catalog.forEach((item) => {
      if (item.brand === beforeName) item.brand = afterName;
    });
    state.businessRequests.forEach((request) => {
      if (request.brand === beforeName) request.brand = afterName;
    });
  }
  change.status = "已生效";
  addAuditLog(state, "应用品牌配置", change.afterBrand.id, "L3", "成功", `发布 ${releaseId} 已生效`);
}

function applyOrganizationChange(state: AppState, releaseId: string, approved: boolean) {
  const change = state.organizationChanges.find((item) => item.release === releaseId);
  if (!change) return;
  if (!approved) {
    change.status = "已驳回";
    return;
  }
  const organizationIndex = state.organizations.findIndex((item) => item.id === change.organizationId);
  if (organizationIndex >= 0) state.organizations[organizationIndex] = change.afterOrganization;
  change.status = "已生效";
  addAuditLog(state, "应用组织配置", change.afterOrganization.id, "L3", "成功", `发布 ${releaseId} 已生效`);
}

function applyDeviceChange(state: AppState, releaseId: string, approved: boolean) {
  const change = state.deviceChanges.find((item) => item.release === releaseId);
  if (!change) return;
  if (!approved) {
    change.status = "已驳回";
    return;
  }
  const deviceIndex = state.devices.findIndex((item) => item.id === change.deviceId);
  if (deviceIndex >= 0) state.devices[deviceIndex] = change.afterDevice;
  change.status = "已生效";
  addDeviceEvent(state, change.afterDevice.id, "设备配置已生效", "info", releaseId);
  addAuditLog(state, "应用设备配置", change.afterDevice.id, "L3", "成功", `发布 ${releaseId} 已生效`);
}

function releaseHasReversibleChange(state: AppState, releaseId: string): boolean {
  return Boolean(
    state.catalogChanges.some((change) => change.release === releaseId && change.status === "已生效")
    || state.pointChanges.some((change) => change.release === releaseId && change.status === "已生效")
    || state.templateChanges.some((change) => change.release === releaseId && change.status === "已生效")
    || state.brandChanges.some((change) => change.release === releaseId && change.status === "已生效")
    || state.organizationChanges.some((change) => change.release === releaseId && change.status === "已生效")
    || state.deviceChanges.some((change) => change.release === releaseId && change.status === "已生效")
  );
}

function createRollbackChange(state: AppState, sourceReleaseId: string, rollbackReleaseId: string, reason: string) {
  const catalogChange = state.catalogChanges.find((change) => change.release === sourceReleaseId && change.status === "已生效");
  if (catalogChange) {
    const currentItem = state.catalog.find((item) => item.id === catalogChange.itemId) || catalogChange.afterItem;
    const currentVariant = catalogChange.afterVariant
      ? state.productVariants.find((variant) => variant.sku === catalogChange.afterVariant?.sku || variant.product === catalogChange.afterItem.name)
      : undefined;
    state.catalogChanges.unshift({
      release: rollbackReleaseId,
      itemId: catalogChange.itemId,
      beforeItem: currentItem,
      afterItem: catalogChange.beforeItem,
      beforeVariant: currentVariant || catalogChange.afterVariant,
      afterVariant: catalogChange.beforeVariant,
      reason,
      status: "待审批",
    });
    return;
  }

  const pointChange = state.pointChanges.find((change) => change.release === sourceReleaseId && change.status === "已生效");
  if (pointChange) {
    const currentPoint = state.points.find((point) => point.id === pointChange.pointId) || pointChange.afterPoint;
    const currentChecks = state.pointChecks.filter((check) => check.point === currentPoint.name);
    state.pointChanges.unshift({
      release: rollbackReleaseId,
      pointId: pointChange.pointId,
      beforePoint: currentPoint,
      afterPoint: pointChange.beforePoint,
      beforeChecks: currentChecks.length ? currentChecks : pointChange.afterChecks,
      afterChecks: pointChange.beforeChecks,
      reason,
      status: "待审批",
    });
    return;
  }

  const templateChange = state.templateChanges.find((change) => change.release === sourceReleaseId && change.status === "已生效");
  if (templateChange) {
    const currentTemplate = state.templates.find((template) => template.id === templateChange.templateId) || templateChange.afterTemplate;
    state.templateChanges.unshift({
      release: rollbackReleaseId,
      templateId: templateChange.templateId,
      beforeTemplate: currentTemplate,
      afterTemplate: templateChange.beforeTemplate,
      reason,
      status: "待审批",
    });
    return;
  }

  const brandChange = state.brandChanges.find((change) => change.release === sourceReleaseId && change.status === "已生效");
  if (brandChange) {
    const currentBrand = state.brands.find((brand) => brand.id === brandChange.brandId) || brandChange.afterBrand;
    state.brandChanges.unshift({
      release: rollbackReleaseId,
      brandId: brandChange.brandId,
      beforeBrand: currentBrand,
      afterBrand: brandChange.beforeBrand,
      reason,
      status: "待审批",
    });
    return;
  }

  const organizationChange = state.organizationChanges.find((change) => change.release === sourceReleaseId && change.status === "已生效");
  if (organizationChange) {
    const currentOrganization = state.organizations.find((organization) => organization.id === organizationChange.organizationId) || organizationChange.afterOrganization;
    state.organizationChanges.unshift({
      release: rollbackReleaseId,
      organizationId: organizationChange.organizationId,
      beforeOrganization: currentOrganization,
      afterOrganization: organizationChange.beforeOrganization,
      reason,
      status: "待审批",
    });
    return;
  }

  const deviceChange = state.deviceChanges.find((change) => change.release === sourceReleaseId && change.status === "已生效");
  if (deviceChange) {
    const currentDevice = state.devices.find((device) => device.id === deviceChange.deviceId) || deviceChange.afterDevice;
    state.deviceChanges.unshift({
      release: rollbackReleaseId,
      deviceId: deviceChange.deviceId,
      beforeDevice: currentDevice,
      afterDevice: deviceChange.beforeDevice,
      reason,
      status: "待审批",
    });
  }
}

function reviewApproval(state: AppState, approvalId: string, decision: "approve" | "reject", note?: string) {
  const approval = state.approvalRequests.find((item) => item.id === approvalId);
  if (!approval || approval.status !== "待审批") return;
  const policy = approvalActionPolicy(state, approval);
  if (!policy.allowed) {
    addAuditLog(state, `审批${decision === "approve" ? "通过" : "驳回"}`, approval.target, approval.risk, "已拒绝", policy.message);
    return;
  }
  const approved = decision === "approve";
  approval.status = approved ? "审批通过" : "已驳回";
  const detail = note?.trim() || (approved ? "审批通过，相关对象已更新。" : "审批驳回，等待发起人修正。");

  if (approval.target.startsWith("REL-")) {
    const release = state.releases.find((item) => item.id === approval.target);
    if (release) {
      release.status = approved ? "已发布" : "已驳回";
      release.time = currentTime();
    }
    applyCatalogChange(state, approval.target, approved);
    applyPointChange(state, approval.target, approved);
    applyTemplateChange(state, approval.target, approved);
    applyBrandChange(state, approval.target, approved);
    applyOrganizationChange(state, approval.target, approved);
    applyDeviceChange(state, approval.target, approved);
    if (release?.rollbackOf && approved) {
      const sourceRelease = state.releases.find((item) => item.id === release.rollbackOf);
      if (sourceRelease) {
        sourceRelease.status = "已回退";
        addAuditLog(state, "完成配置回退", sourceRelease.id, "L3", "已回退", `回退发布 ${release.id} 已审批通过并生效`);
      }
    }
  }

  if (approval.target.startsWith("role-inst-")) {
    if (approval.action.includes("复核")) {
      applyTeamAssignmentLifecycleApproval(state, approval.target, "review", approved, detail);
    } else if (approval.action.includes("回收")) {
      applyTeamAssignmentLifecycleApproval(state, approval.target, "revoke", approved, detail);
    } else {
      applyTeamAssignmentApproval(state, approval.target, approved);
    }
  }

  if (approval.target.startsWith("RF-")) {
    const refund = state.refunds.find((item) => item.id === approval.target);
    if (refund) {
      refund.status = approved ? "审批通过" : "已驳回";
      const request = state.businessRequests.find((item) => item.id === refund.request);
      if (approved && request) addExecutionEvent(state, request.id, "审批", "退款审批通过", "退款处理中");
    }
  }

  if (approval.target.startsWith("CMD-")) {
    applyDeviceCommandApproval(state, approval.target, approved);
  }

  if (approval.target.startsWith("INC-")) {
    const incident = state.incidents.find((item) => item.id === approval.target);
    if (incident) {
      incident.status = approved ? "closed" : "processing";
      incident.statusLabel = approved ? "已关闭" : "处理中";
      addProcessingRecord(state, incident.id, approved ? "关闭审批通过" : "关闭审批驳回", detail);
    }
  }

  addAuditLog(state, approved ? "审批通过" : "审批驳回", approval.target, approval.risk, approval.status, `${approval.action} / ${detail}`);
}

function addAuditLog(state: AppState, action: string, object: string, risk = "L1", result = "成功", detail?: string, operator = "当前用户") {
  const log: AuditLog = {
    id: `AUD-${String(state.auditLogs.length + 1).padStart(3, "0")}`,
    time: currentTime(),
    operator,
    action,
    object,
    risk,
    result,
    detail,
  };
  state.auditLogs.unshift(log);
}

function addApprovalRequest(state: AppState, action: string, target: string, approver: string, rule: string, risk: string): ApprovalRequest {
  const user = currentUser(state);
  const approval: ApprovalRequest = {
    id: `APR-${String(state.approvalRequests.length + 1).padStart(3, "0")}`,
    time: currentTime(),
    action,
    target,
    requester: user.name,
    approver,
    rule,
    status: "待审批",
    risk,
  };
  state.approvalRequests.unshift(approval);
  return approval;
}

function addProcessingRecord(state: AppState, target: string, action: string, note: string, operator = "当前用户") {
  const record: ProcessingRecord = {
    id: `rec-${String(state.processingRecords.length + 1).padStart(3, "0")}`,
    target,
    time: currentTime(),
    operator,
    action,
    note,
  };
  state.processingRecords.unshift(record);
}

function addExecutionEvent(state: AppState, requestId: string, source: string, event: string, result: string, operator = "当前用户") {
  if (!requestId || requestId === "-") return;
  state.executionEvents.unshift({
    id: `evt-${String(state.executionEvents.length + 1).padStart(3, "0")}`,
    request: requestId,
    time: currentTime(),
    source,
    event,
    operator,
    result,
  });
}

function addDeviceEvent(state: AppState, deviceId: string, event: string, level: string, related: string) {
  state.deviceEvents.unshift({
    id: `dev-evt-${String(state.deviceEvents.length + 1).padStart(3, "0")}`,
    device: deviceId,
    time: currentTime(),
    event,
    level,
    related,
  });
}

function updateRequestStatus(state: AppState, requestId: string, status: string, paid?: string): BusinessRequest | null {
  const request = state.businessRequests.find((item) => item.id === requestId);
  if (!request) return null;
  request.status = status;
  request.statusLabel = requestStatusLabel(request, status);
  request.updated = currentTime();
  if (paid) request.paid = paid;
  return request;
}

function requestStatusLabel(request: BusinessRequest, status: string): string {
  const labels: Record<string, Record<string, string>> = {
    "饮品亭": {
      awaiting_delivery: "待取杯",
      delivered: "已取杯",
      exception: "制作异常",
      refund_pending: "退款处理中",
      refunded: "已退款",
      cancelled: "已取消",
    },
    "机器人服务站": {
      awaiting_delivery: "待确认",
      delivered: "已确认",
      exception: "服务异常",
      refund_pending: "退款处理中",
      refunded: "已退款",
      cancelled: "已取消",
    },
  };
  return labels[request.scenario]?.[status] || status;
}

function summarizeCatalogConfig(item: CatalogItem, variant?: ProductVariant): string {
  const parts = [`状态：${item.status}`, `属性：${item.attrs.join("、") || "-"}`, `履约：${item.flow}`];
  if (variant) parts.push(`SKU：${variant.sku}`, `价格：${variant.price}`, `可售点位：${variant.points}`);
  return parts.join("；");
}

function normalizePointChecks(pointName: string, checks: Array<{ item: string; status: string }>): PointCheck[] {
  return checks
    .map((check) => ({ point: pointName, item: check.item.trim(), status: check.status.trim() }))
    .filter((check) => check.item && check.status);
}

function summarizePointConfig(point: Point, checks: PointCheck[]): string {
  const checkSummary = checks.length ? checks.map((check) => `${check.item}：${check.status}`).join("、") : "无上线检查项";
  return `营业状态：${point.status}；负责人：${point.owner}；上线检查：${checkSummary}`;
}

function summarizePointImpact(beforePoint: Point, afterPoint: Point, beforeChecks: PointCheck[], afterChecks: PointCheck[]): string {
  const changes: string[] = [];
  if (beforePoint.status !== afterPoint.status) changes.push(`营业状态 ${beforePoint.status} -> ${afterPoint.status}`);
  if (beforePoint.owner !== afterPoint.owner) changes.push(`负责人 ${beforePoint.owner} -> ${afterPoint.owner}`);
  const beforeOpen = beforeChecks.filter((check) => check.status !== "已完成").map((check) => check.item);
  const afterOpen = afterChecks.filter((check) => check.status !== "已完成").map((check) => check.item);
  if (beforeOpen.join("、") !== afterOpen.join("、")) changes.push(`阻塞项 ${beforeOpen.join("、") || "无"} -> ${afterOpen.join("、") || "无"}`);
  return changes.length ? changes.join("；") : "点位运营配置复核，无结构化字段变化";
}

function summarizeBrandConfig(brand: Brand): string {
  return `状态：${brand.status}；默认场景：${brand.scenario}；负责人：${brand.owner}；点位数：${brand.points}`;
}

function summarizeBrandImpact(state: AppState, beforeBrand: Brand, afterBrand: Brand): string {
  const changes: string[] = [];
  if (beforeBrand.name !== afterBrand.name) changes.push(`品牌名称 ${beforeBrand.name} -> ${afterBrand.name}`);
  if (beforeBrand.status !== afterBrand.status) changes.push(`状态 ${beforeBrand.status} -> ${afterBrand.status}`);
  if (beforeBrand.scenario !== afterBrand.scenario) changes.push(`默认场景 ${beforeBrand.scenario} -> ${afterBrand.scenario}`);
  if (beforeBrand.owner !== afterBrand.owner) changes.push(`负责人 ${beforeBrand.owner} -> ${afterBrand.owner}`);
  const affectedPoints = state.points.filter((point) => point.brand === beforeBrand.name).length;
  const affectedCatalog = state.catalog.filter((item) => item.brand === beforeBrand.name).length;
  const affectedRequests = state.businessRequests.filter((request) => request.brand === beforeBrand.name).length;
  changes.push(`影响点位 ${affectedPoints} 个、商品/服务 ${affectedCatalog} 个、请求 ${affectedRequests} 笔`);
  return changes.join("；");
}

function summarizeOrganizationConfig(organization: Organization): string {
  return `类型：${organization.type}；上级：${organization.parent}；负责人：${organization.owner}；点位：${organization.points}；用户：${organization.users}`;
}

function summarizeOrganizationImpact(beforeOrganization: Organization, afterOrganization: Organization): string {
  const changes: string[] = [];
  if (beforeOrganization.name !== afterOrganization.name) changes.push(`名称 ${beforeOrganization.name} -> ${afterOrganization.name}`);
  if (beforeOrganization.type !== afterOrganization.type) changes.push(`类型 ${beforeOrganization.type} -> ${afterOrganization.type}`);
  if (beforeOrganization.parent !== afterOrganization.parent) changes.push(`上级 ${beforeOrganization.parent} -> ${afterOrganization.parent}`);
  if (beforeOrganization.owner !== afterOrganization.owner) changes.push(`负责人 ${beforeOrganization.owner} -> ${afterOrganization.owner}`);
  if (beforeOrganization.points !== afterOrganization.points) changes.push(`点位数 ${beforeOrganization.points} -> ${afterOrganization.points}`);
  if (beforeOrganization.users !== afterOrganization.users) changes.push(`用户数 ${beforeOrganization.users} -> ${afterOrganization.users}`);
  return changes.length ? changes.join("；") : "组织配置复核，无结构化字段变化";
}

function summarizeDeviceConfig(device: Device): string {
  return `点位：${device.point}；类型：${device.type}；状态：${device.status}；版本：${device.version}；能力：${device.capability.join("、") || "-"}`;
}

function summarizeDeviceImpact(beforeDevice: Device, afterDevice: Device): string {
  const changes: string[] = [];
  if (beforeDevice.name !== afterDevice.name) changes.push(`名称 ${beforeDevice.name} -> ${afterDevice.name}`);
  if (beforeDevice.point !== afterDevice.point) changes.push(`点位 ${beforeDevice.point} -> ${afterDevice.point}`);
  if (beforeDevice.type !== afterDevice.type) changes.push(`类型 ${beforeDevice.type} -> ${afterDevice.type}`);
  if (beforeDevice.status !== afterDevice.status) changes.push(`状态 ${beforeDevice.status} -> ${afterDevice.status}`);
  if (beforeDevice.version !== afterDevice.version) changes.push(`版本 ${beforeDevice.version} -> ${afterDevice.version}`);
  if (beforeDevice.capability.join("、") !== afterDevice.capability.join("、")) changes.push(`能力 ${beforeDevice.capability.join("、") || "无"} -> ${afterDevice.capability.join("、") || "无"}`);
  return changes.length ? changes.join("；") : "设备配置复核，无结构化字段变化";
}

function summarizeTemplateConfig(template: ScenarioTemplate): string {
  return [
    `对象：${template.objectName}`,
    `字段：${template.fields.join("、") || "-"}`,
    `状态：${template.states.join("、") || "-"}`,
    `异常：${template.exceptions.join("、") || "-"}`,
    `责任角色：${template.roles.join("、") || "-"}`,
  ].join("；");
}

function summarizeTemplateImpact(state: AppState, beforeTemplate: ScenarioTemplate, afterTemplate: ScenarioTemplate): string {
  const affectedPoints = state.points.filter((point) => point.scenario === beforeTemplate.name);
  const changes: string[] = [`影响点位 ${affectedPoints.length} 个`];
  if (beforeTemplate.objectName !== afterTemplate.objectName) changes.push(`业务对象 ${beforeTemplate.objectName} -> ${afterTemplate.objectName}`);
  const listChanges = [
    ["字段", beforeTemplate.fields, afterTemplate.fields],
    ["状态", beforeTemplate.states, afterTemplate.states],
    ["异常", beforeTemplate.exceptions, afterTemplate.exceptions],
    ["责任角色", beforeTemplate.roles, afterTemplate.roles],
  ];
  listChanges.forEach(([label, beforeList, afterList]) => {
    const beforeValues = beforeList as string[];
    const afterValues = afterList as string[];
    const added = afterValues.filter((item) => !beforeValues.includes(item));
    const removed = beforeValues.filter((item) => !afterValues.includes(item));
    if (added.length || removed.length) {
      changes.push(`${label}${added.length ? `新增 ${added.join("、")}` : ""}${added.length && removed.length ? "，" : ""}${removed.length ? `移除 ${removed.join("、")}` : ""}`);
    }
  });
  return changes.join("；");
}

function templateReleaseScope(state: AppState, template: ScenarioTemplate): string {
  const points = state.points.filter((point) => point.scenario === template.name);
  const brands = unique(points.map((point) => point.brand));
  const cities = unique(points.map((point) => point.city));
  if (brands.length || cities.length) return `${template.name} / ${[brands.join("、"), cities.join("、")].filter(Boolean).join(" / ")}`;
  return `${template.name} / 尚未绑定点位`;
}

function releaseScopeFromPoints(state: AppState, points: string): string {
  const visiblePointNames = points.split("、").map((point) => point.trim()).filter(Boolean);
  const cities = unique(visiblePointNames.map((pointName) => state.points.find((point) => point.name === pointName)?.city || "").filter(Boolean));
  if (cities.length === 1) return cities[0];
  if (cities.length > 1) return cities.join("、");
  return "按可售范围";
}

function catalogReleaseScopeSelection(state: AppState, item: CatalogItem, points: string): ScopeSelection {
  const pointNames = points.split("、").map((point) => point.trim()).filter(Boolean);
  const matchedPoints = pointNames.map((pointName) => state.points.find((point) => point.name === pointName)).filter((point): point is Point => Boolean(point));
  if (matchedPoints.length === 1) return pointScopeSelection(matchedPoints[0]);

  const cities = unique(matchedPoints.map((point) => point.city));
  const brands = unique(matchedPoints.map((point) => point.brand));
  if (cities.length === 1 && brands.length === 1) {
    return { type: "city", id: `city-${cities[0]}`, label: cities[0], value: `${brands[0]} / ${cities[0]}`, parent: brands[0] };
  }

  const brand = state.brands.find((candidate) => candidate.name === item.brand);
  if (brand) return brandScopeSelection(brand);
  return { type: "brand", id: item.brand, label: item.brand, value: `${item.brand} / ${releaseScopeFromPoints(state, points)}`, parent: "品牌" };
}

function pointScopeSelection(point: Point): ScopeSelection {
  return { type: "point", id: point.id, label: point.name, value: `${point.brand} / ${point.city} / ${point.name}`, parent: point.brand };
}

function brandScopeSelection(brand: Brand): ScopeSelection {
  return { type: "brand", id: brand.id, label: brand.name, value: `${brand.tenant} / ${brand.name}`, parent: brand.tenant };
}

function organizationScopeSelection(organization: Organization): ScopeSelection {
  return { type: "organization", id: organization.id, label: organization.name, value: `${organization.tenant} / ${organization.name}`, parent: organization.tenant };
}

function deviceScopeSelection(state: AppState, device: Device): ScopeSelection {
  const point = state.points.find((item) => item.name === device.point);
  return {
    type: "device",
    id: device.id,
    label: device.name,
    value: `${point?.brand || "设备"} / ${device.point} / ${device.name}`,
    parent: device.point,
  };
}

function templateScopeSelection(state: AppState, template: ScenarioTemplate): ScopeSelection {
  return { type: "scenario", id: template.id, label: template.name, value: templateReleaseScope(state, template), parent: template.objectName };
}

function normalizeList(values: string[]): string[] {
  return unique(values.map((value) => value.trim()).filter(Boolean));
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function nextRecordId(prefix: string, ids: string[]): string {
  const max = ids.reduce((currentMax, id) => {
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    const value = match ? Number(match[1]) : 0;
    return Number.isFinite(value) && value > currentMax ? value : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function approvalRoles(action: string): string[] {
  if (action.includes("角色") || action.includes("权限")) return ["业务负责人", "租户管理员", "平台支持"];
  if (action.includes("退款")) return ["业务负责人", "运营负责人", "财务/结算", "退款审批人", "平台支持"];
  if (action.includes("配置")) return ["业务负责人", "运营负责人", "配置审批人", "平台支持"];
  if (action.includes("关闭")) return ["业务负责人", "运营负责人", "平台支持"];
  if (action.includes("设备")) return ["业务负责人", "运营负责人", "设备运维负责人", "机器人/设备运维", "平台支持"];
  return ["业务负责人", "运营负责人", "平台支持"];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function futureDateLabel(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function invitationExpired(expiresAt?: string) {
  if (!expiresAt) return false;
  const parts = expiresAt.replace(/[年月.-]/g, "/").replace("日", "").split("/").map((part) => Number(part));
  const [year, month, day] = parts;
  if (!year || !month || !day) return false;
  const expiryEnd = new Date(year, month - 1, day, 23, 59, 59, 999);
  return expiryEnd.getTime() < Date.now();
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function currentTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
