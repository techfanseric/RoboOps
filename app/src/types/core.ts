import type { LucideIcon } from "lucide-react";

export type ViewId =
  | "workbench"
  | "brands"
  | "templates"
  | "points"
  | "devices"
  | "catalog"
  | "orders"
  | "incidents"
  | "tasks"
  | "releases"
  | "reports"
  | "roles";

export interface NavItem {
  id: ViewId;
  icon: LucideIcon;
  label: string;
  count: string;
  path: string;
}

export interface Tenant {
  id: string;
  name: string;
  mode: string;
  contact: string;
  status: string;
  supportOwner: string;
}

export interface Brand {
  id: string;
  name: string;
  tenant: string;
  status: string;
  scenario: string;
  owner: string;
  points: number;
}

export interface Organization {
  id: string;
  name: string;
  tenant: string;
  type: string;
  parent: string;
  owner: string;
  points: number;
  users: number;
}

export interface User {
  id: string;
  name: string;
  role: string;
  scope: string;
  status: string;
  login: string;
  email?: string;
  credential?: string;
  invitedBy?: string;
  acceptedAt?: string;
}

export interface UserInvitation {
  id: string;
  tenant: string;
  email: string;
  name: string;
  role: string;
  scope: string;
  scopeRef?: ScopeSelection;
  status: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  reason: string;
  acceptedAt?: string;
  accountId?: string;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  objectName: string;
  fields: string[];
  states: string[];
  exceptions: string[];
  roles: string[];
}

export interface Point {
  id: string;
  name: string;
  brand: string;
  scenario: string;
  city: string;
  status: string;
  owner: string;
}

export interface Device {
  id: string;
  sn: string;
  name: string;
  point: string;
  type: string;
  status: string;
  version: string;
  capability: string[];
}

export interface CatalogItem {
  id: string;
  name: string;
  type: string;
  brand: string;
  status: string;
  attrs: string[];
  flow: string;
}

export interface BusinessRequest {
  id: string;
  label: string;
  brand: string;
  point: string;
  scenario: string;
  status: string;
  statusLabel: string;
  paid: string;
  amount: number;
  device: string;
  owner: string;
  updated: string;
}

export interface ExecutionEvent {
  id: string;
  request: string;
  time: string;
  source: string;
  event: string;
  operator: string;
  result: string;
}

export interface Incident {
  id: string;
  type: string;
  level: string;
  source: string;
  point: string;
  owner: string;
  status: string;
  statusLabel: string;
  sla: string;
  order: string;
  sop: string;
}

export interface ProcessingRecord {
  id: string;
  target: string;
  time: string;
  operator: string;
  action: string;
  note: string;
}

export interface RefundCase {
  id: string;
  request: string;
  incident: string;
  amount: string;
  status: string;
  owner: string;
  reason: string;
}

export interface Task {
  id: string;
  name: string;
  type: string;
  owner: string;
  point: string;
  status: string;
  due: string;
  sourceIncident?: string;
}

export interface PointCheck {
  point: string;
  item: string;
  status: string;
}

export interface DeviceEvent {
  id: string;
  device: string;
  time: string;
  event: string;
  level: string;
  related: string;
}

export interface CommandRecord {
  id: string;
  device: string;
  time: string;
  command: string;
  operator: string;
  risk: string;
  result: string;
  reason?: string;
  approvalId?: string;
}

export interface ProductType {
  name: string;
  attrs: string;
  pricing: string;
}

export interface ProductVariant {
  product: string;
  sku: string;
  spec: string;
  price: string;
  points: string;
}

export interface ReleaseRecord {
  id: string;
  name: string;
  scope: string;
  scopeRef?: ScopeSelection;
  status: string;
  by: string;
  time: string;
  rollbackOf?: string;
}

export interface ReleaseDiff {
  release: string;
  object: string;
  before: string;
  after: string;
  impact: string;
}

export interface CatalogChange {
  release: string;
  itemId: string;
  beforeItem: CatalogItem;
  afterItem: CatalogItem;
  beforeVariant?: ProductVariant;
  afterVariant?: ProductVariant;
  reason: string;
  status: string;
}

export interface PointChange {
  release: string;
  pointId: string;
  beforePoint: Point;
  afterPoint: Point;
  beforeChecks: PointCheck[];
  afterChecks: PointCheck[];
  reason: string;
  status: string;
}

export interface ScenarioTemplateChange {
  release: string;
  templateId: string;
  beforeTemplate: ScenarioTemplate;
  afterTemplate: ScenarioTemplate;
  reason: string;
  status: string;
}

export interface BrandChange {
  release: string;
  brandId: string;
  beforeBrand: Brand;
  afterBrand: Brand;
  reason: string;
  status: string;
}

export interface OrganizationChange {
  release: string;
  organizationId: string;
  beforeOrganization: Organization;
  afterOrganization: Organization;
  reason: string;
  status: string;
}

export interface DeviceChange {
  release: string;
  deviceId: string;
  beforeDevice: Device;
  afterDevice: Device;
  reason: string;
  status: string;
}

export interface PermissionPackage {
  name: string;
  risk: string;
  actions: string;
}

export interface ApprovalPolicy {
  action: string;
  approver: string;
  rule: string;
}

export interface IncidentRoutingRule {
  type: string;
  owner: string;
  escalation: string;
  sla: string;
}

export interface RoleTemplate {
  name: string;
  scope: string;
  packages: string[];
  risk: string;
}

export interface AuditLog {
  id: string;
  time: string;
  operator: string;
  action: string;
  object: string;
  risk: string;
  result: string;
  detail?: string;
}

export interface ApprovalRequest {
  id: string;
  time: string;
  action: string;
  target: string;
  requester: string;
  approver: string;
  rule: string;
  status: string;
  risk: string;
}

export interface ApiOperation {
  id: string;
  time: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  action: string;
  object: string;
  risk: string;
  status: string;
  idempotencyKey: string;
  summary: string;
  syncStatus: "待同步" | "同步中" | "同步成功" | "同步失败" | "需要补偿" | "已补偿";
  attempts: number;
  lastError?: string;
  syncedAt?: string;
  nextRetryAt?: string;
  serverRequestId?: string;
  rollbackPlan?: string;
  rolledBackAt?: string;
}

export interface StaticData {
  tenants: Tenant[];
  brands: Brand[];
  organizations: Organization[];
  users: User[];
  templates: ScenarioTemplate[];
  points: Point[];
  catalog: CatalogItem[];
  productTypes: ProductType[];
  productVariants: ProductVariant[];
  releases: ReleaseRecord[];
  releaseDiffs: ReleaseDiff[];
  permissionPackages: PermissionPackage[];
  approvalPolicies: ApprovalPolicy[];
  incidentRoutingRules: IncidentRoutingRule[];
  roles: RoleTemplate[];
}

export interface MutableData {
  tenants: Tenant[];
  brands: Brand[];
  organizations: Organization[];
  users: User[];
  userInvitations: UserInvitation[];
  templates: ScenarioTemplate[];
  points: Point[];
  catalog: CatalogItem[];
  productVariants: ProductVariant[];
  businessRequests: BusinessRequest[];
  devices: Device[];
  executionEvents: ExecutionEvent[];
  deviceEvents: DeviceEvent[];
  commandRecords: CommandRecord[];
  pointChecks: PointCheck[];
  incidents: Incident[];
  tasks: Task[];
  refunds: RefundCase[];
  releases: ReleaseRecord[];
  releaseDiffs: ReleaseDiff[];
  catalogChanges: CatalogChange[];
  pointChanges: PointChange[];
  templateChanges: ScenarioTemplateChange[];
  brandChanges: BrandChange[];
  organizationChanges: OrganizationChange[];
  deviceChanges: DeviceChange[];
  auditLogs: AuditLog[];
  approvalRequests: ApprovalRequest[];
  processingRecords: ProcessingRecord[];
  apiOperations: ApiOperation[];
}

export interface Filters {
  brand: string;
  scenario: string;
  point: string;
}

export interface TeamSettings {
  mode: string;
  scale: string;
  coverage: string;
  service: string;
}

export interface TeamAssignment {
  id: string;
  role: string;
  owner: string;
  scope: string;
  scopeRef?: ScopeSelection;
  packageSummary: string;
  status: string;
  assigneeId?: string;
  assigneeName?: string;
  permissionPackages?: string[];
  activatedAt?: string;
  expiresAt?: string;
  reviewAt?: string;
  lastReviewedAt?: string;
  revokedAt?: string;
  revokeReason?: string;
  pendingLifecycleAction?: "review" | "revoke";
  pendingLifecycleReason?: string;
  pendingLifecycleApprovalId?: string;
  note?: string;
}

export interface AuthState {
  authenticated: boolean;
  loginAt?: string;
  expiresAt?: string;
  expiresAtEpoch?: number;
  sessionId?: string;
  provider?: "local-credential" | "enterprise-sso";
  lastError?: string;
  lastFailureAt?: string;
  failedAttempts?: number;
}

export type ScopeType = "tenant" | "brand" | "organization" | "city" | "point" | "device" | "scenario";

export interface ScopeSelection {
  type: ScopeType;
  id: string;
  label: string;
  value: string;
  parent?: string;
}

export interface AppState extends MutableData {
  auth: AuthState;
  currentUserId: string;
  filters: Filters;
  team: TeamSettings;
  teamAppliedAt?: string;
  teamAssignments: TeamAssignment[];
}

export interface PointReadiness {
  status: "可营业" | "待处理";
  blockers: string[];
  checks: PointCheck[];
}

export interface BusinessSnapshot {
  points: Point[];
  requests: BusinessRequest[];
  incidents: Incident[];
  tasks: Task[];
  devices: Device[];
  readyPoints: Point[];
  liveRequests: BusinessRequest[];
  refunding: RefundCase[];
}
