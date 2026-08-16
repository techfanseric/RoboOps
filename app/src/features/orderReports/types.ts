export type PointStatus = "营业中" | "试运行" | "维护中" | "暂停营业";

export interface PointProfile {
  id: string;
  groupId: string;
  name: string;
  code: string;
  thirdPartyCode: string;
  province: string;
  city: string;
  district: string;
  address: string;
  longitude: number;
  latitude: number;
  status: PointStatus;
}

export interface DeviceTarget {
  id: string;
  groupId: string;
  pointId: string;
  sn: string;
  type: "制饮设备" | "服务机器人";
  available: boolean;
  boundAt: string;
}

export interface FormulaStep {
  order: number;
  materialCode: string;
  materialName: string;
  expected: number;
  unit: string;
}

export interface ProcessStep {
  order: number;
  name: string;
  seconds: number;
  rpm?: number;
  direction?: "正转" | "反转";
}

export interface OrderFormula {
  id: string;
  groupId: string;
  productCode: string;
  productName?: string;
  specification: string;
  comboCode: string;
  version: number;
  enabled: boolean;
  pointIds: string[];
  materialSteps: FormulaStep[];
  processEnabled: boolean;
  processSteps: ProcessStep[];
}

export type LegacyOrderState = 0 | 1 | 2 | 3 | 4 | 5;
export type DispatchState = "未下发" | "已下发" | "下发失败" | "已退单";

export interface ProductionStep extends FormulaStep {
  id: string;
  orderId: string;
  actual: number;
  status: "待执行" | "完成" | "异常";
  exceptionReason: string;
  durationSeconds: number;
}

export interface BusinessOrder {
  id: string;
  groupId: string;
  createdBy: string;
  createdAt: string;
  pointId: string;
  deviceId?: string;
  orderNo: string;
  pickupNo: string;
  productSequence: number;
  itemCode: string;
  productCode: string;
  productName: string;
  specification: string;
  quantity: number;
  formulaId?: string;
  comboCode?: string;
  legacyState: LegacyOrderState;
  dispatchState: DispatchState;
  retryCount: number;
  refundState: "未申请" | "退单下发成功" | "退单下发失败";
  refundAttempts: number;
  scanned: boolean;
  totalResourceUsage: number;
  executionStartedAt?: string;
  executionFinishedAt?: string;
  steps: ProductionStep[];
  processSteps: ProcessStep[];
}

export interface OrderDataLog {
  id: string;
  orderId: string;
  event: "ORDER_PUSH" | "ORDER_RETRY" | "REFUND_PUSH";
  retry: boolean;
  result: "成功" | "失败";
  reason: string;
  deviceSn: string;
  time: string;
}

export interface PrintLog {
  id: string;
  orderId: string;
  printType: "首次打印" | "补打";
  result: "成功" | "失败";
  operator: string;
  time: string;
  reason: string;
}

export type ReportType = "商品销售" | "点位销售" | "生产明细" | "物料用量" | "料仓用量" | "标定记录" | "损耗记录";

export interface ReportRow {
  id: string;
  type: ReportType;
  dimension: string;
  point: string;
  value: number;
  unit: string;
  occurredAt: string;
  detail: string;
  pointIds?: string[];
}

export type ExportTaskStatus = "待执行" | "执行中" | "成功" | "失败";

export interface ExportTask {
  id: string;
  reportType: ReportType;
  filters: string;
  status: ExportTaskStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  fileName?: string;
  failureReason?: string;
}

export interface FeatureAuditRecord {
  id: string;
  time: string;
  operator: string;
  action: string;
  object: string;
  risk: "L0" | "L1" | "L2" | "L3";
  result: "成功" | "失败" | "已拒绝";
  detail: string;
}

export type OrderReportsAuditEvent = Omit<FeatureAuditRecord, "id" | "time">;

export interface OrderReportsSnapshot {
  points: PointProfile[];
  devices: DeviceTarget[];
  formulas: OrderFormula[];
  reportRows?: ReportRow[];
}

export interface OrderReportsState {
  version: 1;
  points: PointProfile[];
  devices: DeviceTarget[];
  formulas: OrderFormula[];
  orders: BusinessOrder[];
  dataLogs: OrderDataLog[];
  printLogs: PrintLog[];
  reportRows: ReportRow[];
  exportTasks: ExportTask[];
  auditLogs: FeatureAuditRecord[];
}

export interface ManualOrderInput {
  groupId: string;
  createdBy: string;
  pointId: string;
  productCode: string;
  productName: string;
  specification: string;
  quantity: number;
  createdAt?: string;
}

export type PointDraft = Omit<PointProfile, "id"> & { id?: string };
