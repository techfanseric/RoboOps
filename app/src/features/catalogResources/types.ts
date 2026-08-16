export type EntityStatus = "启用" | "停用";
export type StorageType = "常温" | "冷藏" | "冷冻" | "热保存" | "其他" | "保温桶冷藏";
export type FormulaScope = "全国" | "区域" | "点位";
export type BatchStatus = "可用" | "临期" | "已过期" | "已报损";

export interface SpecOption { id: string; code: string; name: string; alias?: string; sort: number; enabled: boolean }
export interface SpecGroup { id: string; code: string; name: string; sort: number; options: SpecOption[] }
export interface SpecTemplate { id: string; code: string; name: string; groupIds: string[]; status: EntityStatus; updatedAt: string }

export interface FormulaStep { id: string; order: number; materialId: string; amount: number; unit: string }
export interface Formula {
  id: string;
  productCode: string;
  productName: string;
  specCodes: string[];
  combinationCode: string;
  version: number;
  scope: FormulaScope;
  targets: string[];
  status: EntityStatus;
  steps: FormulaStep[];
  processId?: string;
  deliveryStatus: "待下发" | "下发中" | "已完成" | "部分失败";
  deliveryResults: FormulaDeliveryResult[];
  updatedAt: string;
}
export interface FormulaDeliveryResult { pointId: string; status: "下发中" | "成功" | "失败"; reason: string; updatedAt: string }
export interface ProcessPlan { id: string; code: string; name: string; status: EntityStatus; formulaCombinationCodes: string[]; steps: Array<{ order: number; speed: number; direction: "正转" | "反转"; seconds: number }> }

export interface Unit { id: string; code: string; name: string; precision: number }
export interface Material {
  id: string;
  code: string;
  name: string;
  unitId: string;
  density?: number;
  storageType: StorageType;
  compatibleHardware: string[];
  defaultValidMinutes: number;
  defaultWarningMinutes: number;
  calibrationPrecision: number;
  status: EntityStatus;
}
export interface Bin {
  id: string;
  pointId: string;
  deviceSn: string;
  number: string;
  materialId: string;
  capacity: number;
  remaining: number;
  warningThreshold: number;
  status: "正常" | "低余量" | "停用";
  suppliedAt?: string;
  expiresAt?: string;
}

export interface ValidityRule { materialId: string; validMinutes: number; warningMinutes: number }
export interface ValidityPlan { id: string; code: string; name: string; status: EntityStatus; autoWaste: boolean; pointIds: string[]; rules: ValidityRule[]; deliveryStatus: "待下发" | "下发中" | "已完成" | "部分失败" }
export interface Batch {
  id: string;
  code: string;
  pointId: string;
  materialId: string;
  activatedAt: string;
  expiresAt: string;
  warningAt: string;
  initialAmount: number;
  availableAmount: number;
  wastedAmount: number;
  status: BatchStatus;
  firstPrintedAt?: string;
  firstPrintAmount?: number;
  printCount: number;
}

export interface ResourceLog { id: string; action: string; objectType: string; objectId: string; time: string; operator: string; note: string }
export interface PrintLog { id: string; batchId: string; kind: "首次打印" | "补打"; amount: number; operator: string; time: string }
export interface Point { id: string; name: string; region: string; tenantId: string; validityEnabled: boolean }

export type CatalogResourcesPermission = "read" | "manage" | "field" | "system";
export interface CatalogResourcesScope {
  tenantId: string;
  userId: string;
  actor: string;
  roles: string[];
  permissions: CatalogResourcesPermission[];
  pointIds?: string[];
  points?: Point[];
}
export interface ActionMeta { actor: string; permissions: CatalogResourcesPermission[]; pointIds?: string[] }
export interface CatalogResourcesAuditEvent { action: string; object: string; risk: "L1" | "L2" | "L3"; result: "成功" | "拒绝"; detail: string }

export interface CatalogResourcesState {
  schemaVersion: 1;
  tenantId: string;
  specGroups: SpecGroup[];
  specTemplates: SpecTemplate[];
  formulas: Formula[];
  processPlans: ProcessPlan[];
  units: Unit[];
  materials: Material[];
  bins: Bin[];
  validityPlans: ValidityPlan[];
  batches: Batch[];
  points: Point[];
  logs: ResourceLog[];
  printLogs: PrintLog[];
  lastError?: string;
  lastNotice?: string;
}

export type CatalogResourcesAction = (
  | { type: "clear-feedback" }
  | { type: "save-spec-group"; payload: SpecGroup }
  | { type: "add-spec-template"; payload: { name: string; code: string; groupIds: string[] } }
  | { type: "add-formula"; payload: { productCode: string; productName: string; specCodes: string[]; scope: FormulaScope; targets: string[]; steps: Array<{ materialId: string; amount: number; unit: string }>; processId?: string } }
  | { type: "publish-formula"; payload: { formulaId: string; pointIds: string[] } }
  | { type: "retry-formula-delivery"; payload: { formulaId: string; pointId: string } }
  | { type: "save-process-plan"; payload: ProcessPlan }
  | { type: "save-unit"; payload: Unit }
  | { type: "add-material"; payload: Omit<Material, "id" | "status"> }
  | { type: "adjust-bin"; payload: { binId: string; mode: "补料" | "出料" | "调整容量"; amount: number } }
  | { type: "save-validity-plan"; payload: ValidityPlan }
  | { type: "delete-validity-plan"; payload: { planId: string } }
  | { type: "bind-validity-plan"; payload: { planId: string; pointId: string } }
  | { type: "add-batch"; payload: { pointId: string; materialId: string; activatedAt: string; amount: number } }
  | { type: "waste-batch"; payload: { batchId: string; amount: number; reason: string } }
  | { type: "print-batch"; payload: { batchId: string; amount: number } }
  | { type: "run-auto-waste"; payload: { now: string } }
) & { meta?: ActionMeta };

export interface ActionResult { state: CatalogResourcesState; error?: string }
