import type {
  BusinessOrder,
  ExportTask,
  LegacyOrderState,
  ManualOrderInput,
  OrderDataLog,
  OrderReportsState,
  PointDraft,
  PointProfile,
  PrintLog,
  ReportType,
  ReportRow,
} from "./types";

export const ORDER_REPORTS_STORAGE_KEY = "roboops.order-reports.v1";
export const EXPORT_TASK_LIMIT = 50;
export const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;

function compactId(prefix: string, now: string, ordinal = 0) {
  return `${prefix}-${Date.parse(now).toString(36)}-${ordinal.toString(36)}`;
}

function withAudit(state: OrderReportsState, action: string, object: string, risk: "L0" | "L1" | "L2" | "L3", operator: string, detail: string, now: string, result: "成功" | "失败" | "已拒绝" = "成功"): OrderReportsState {
  return {
    ...state,
    auditLogs: [{ id: compactId("ORAUDIT", now, state.auditLogs.length + 1), time: now, operator, action, object, risk, result, detail }, ...state.auditLogs],
  };
}

export function validatePointUniqueness(points: PointProfile[], draft: PointDraft): string[] {
  const normalized = (value: string) => value.trim().toLocaleLowerCase();
  const others = points.filter((point) => point.id !== draft.id && point.groupId === draft.groupId);
  const checks: Array<[keyof Pick<PointProfile, "name" | "code" | "thirdPartyCode">, string]> = [
    ["name", "点位名称"],
    ["code", "点位编码"],
    ["thirdPartyCode", "第三方点位编码"],
  ];
  return checks.flatMap(([field, label]) => {
    const value = normalized(draft[field]);
    if (!value) return [`${label}不能为空`];
    return others.some((point) => normalized(point[field]) === value) ? [`${label}已存在`] : [];
  });
}

export function savePoint(state: OrderReportsState, draft: PointDraft): OrderReportsState {
  const errors = validatePointUniqueness(state.points, draft);
  if (errors.length) throw new Error(errors.join("；"));
  const point: PointProfile = { ...draft, id: draft.id || compactId("POINT", new Date().toISOString(), state.points.length + 1) };
  const points = draft.id ? state.points.map((item) => (item.id === draft.id ? point : item)) : [point, ...state.points];
  return { ...state, points };
}

function selectOrderDevice(state: OrderReportsState, groupId: string, pointId: string) {
  return state.devices
    .filter((device) => device.groupId === groupId && device.pointId === pointId && device.available && device.type === "制饮设备")
    .sort((left, right) => Date.parse(right.boundAt) - Date.parse(left.boundAt))[0];
}

function findOrderFormula(state: OrderReportsState, input: ManualOrderInput) {
  return state.formulas
    .filter((formula) => formula.groupId === input.groupId && formula.productCode === input.productCode && formula.specification === input.specification && formula.enabled && (formula.pointIds.length === 0 || formula.pointIds.includes(input.pointId)))
    .sort((left, right) => right.version - left.version)[0];
}

export function validateManualOrder(state: OrderReportsState, input: ManualOrderInput): string[] {
  const createdAt = input.createdAt || new Date().toISOString();
  const point = state.points.find((item) => item.id === input.pointId && item.groupId === input.groupId);
  const createdSecond = Math.floor(Date.parse(createdAt) / 1000);
  const duplicate = state.orders.some((order) => order.groupId === input.groupId && order.createdBy === input.createdBy && order.pointId === input.pointId && Math.floor(Date.parse(order.createdAt) / 1000) === createdSecond);
  const device = selectOrderDevice(state, input.groupId, input.pointId);
  const formula = findOrderFormula(state, input);
  const errors: string[] = [];
  if (!point) errors.push("订单未关联当前企业的有效点位");
  if (duplicate) errors.push("同一企业、用户、点位和创建时刻的手工订单不可重复");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) errors.push("商品数量必须为正整数");
  if (!device) errors.push("点位未绑定可用的目标制饮设备");
  if (!formula) errors.push("未匹配到当前点位启用的商品规格配方");
  if (formula && formula.materialSteps.length === 0) errors.push("匹配配方没有有效物料步骤");
  return errors;
}

export function createManualOrder(state: OrderReportsState, input: ManualOrderInput): { state: OrderReportsState; order: BusinessOrder } {
  const now = input.createdAt || new Date().toISOString();
  const normalizedInput = { ...input, createdAt: now };
  const errors = validateManualOrder(state, normalizedInput);
  if (errors.length) throw new Error(errors.join("；"));
  const formula = findOrderFormula(state, normalizedInput)!;
  const dailyOrders = state.orders.filter((order) => order.groupId === input.groupId && order.createdAt.slice(0, 10) === now.slice(0, 10));
  const orderSequence = dailyOrders.length + 1;
  const productSequence = state.orders.filter((order) => order.pointId === input.pointId && order.createdAt.slice(0, 10) === now.slice(0, 10)).length + 1;
  const orderNo = `MO${now.slice(0, 10).replaceAll("-", "")}${String(orderSequence).padStart(5, "0")}`;
  const id = compactId("ORDER", now, orderSequence);
  const order: BusinessOrder = {
    id,
    groupId: input.groupId,
    createdBy: input.createdBy,
    createdAt: now,
    pointId: input.pointId,
    orderNo,
    pickupNo: `H${1 + (Math.abs(Date.parse(now) + orderSequence) % 9999)}`,
    productSequence,
    itemCode: `${orderNo.slice(-5)}${productSequence}`,
    productCode: input.productCode,
    productName: input.productName,
    specification: input.specification,
    quantity: input.quantity,
    formulaId: formula.id,
    comboCode: formula.comboCode,
    legacyState: 0,
    dispatchState: "未下发",
    retryCount: 0,
    refundState: "未申请",
    refundAttempts: 0,
    scanned: false,
    totalResourceUsage: formula.materialSteps.reduce((sum, step) => sum + step.expected * input.quantity, 0),
    steps: formula.materialSteps.map((step) => ({
      ...step,
      id: `${id}-STEP-${step.order}`,
      orderId: id,
      expected: step.expected * input.quantity,
      actual: 0,
      status: "待执行",
      exceptionReason: "",
      durationSeconds: 0,
    })),
    processSteps: formula.processEnabled ? formula.processSteps : [],
  };
  return { state: withAudit({ ...state, orders: [order, ...state.orders] }, "创建手工订单", orderNo, "L2", input.createdBy, `点位 ${input.pointId} / item ${order.itemCode}`, now), order };
}

export function dispatchOrder(state: OrderReportsState, orderId: string, retry: boolean, now = new Date().toISOString(), operator = "系统用户"): OrderReportsState {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) throw new Error("订单不存在");
  if (retry && order.dispatchState === "未下发") throw new Error("首次下发不能标记为重发");
  if (!retry && order.dispatchState !== "未下发") throw new Error("已下发订单必须使用显式重发");
  const device = selectOrderDevice(state, order.groupId, order.pointId);
  const formula = findOrderFormula(state, {
    groupId: order.groupId,
    createdBy: order.createdBy,
    pointId: order.pointId,
    productCode: order.productCode,
    productName: order.productName,
    specification: order.specification,
    quantity: order.quantity,
    createdAt: order.createdAt,
  });
  let failure = "";
  if (!device) failure = "点位没有可用制饮设备";
  else if (!formula) failure = "订单关联配方不存在或已停用";
  else if (!formula.materialSteps.length) failure = "配方物料步骤为空";
  const result = failure ? "失败" : "成功";
  const log: OrderDataLog = {
    id: compactId("DLOG", now, state.dataLogs.length + 1),
    orderId,
    event: retry ? "ORDER_RETRY" : "ORDER_PUSH",
    retry,
    result,
    reason: failure || (retry ? "显式重发已提交" : "订单下发已提交"),
    deviceSn: device?.sn || "-",
    time: now,
  };
  const next = {
    ...state,
    orders: state.orders.map((item) => item.id === orderId ? {
      ...item,
      deviceId: device?.id,
      formulaId: formula?.id,
      comboCode: formula?.comboCode,
      dispatchState: failure ? "下发失败" as const : "已下发" as const,
      retryCount: item.retryCount + (retry ? 1 : 0),
      totalResourceUsage: formula ? formula.materialSteps.reduce((sum, step) => sum + step.expected * item.quantity, 0) : item.totalResourceUsage,
      steps: formula ? formula.materialSteps.map((step) => ({ ...step, id: `${item.id}-STEP-${step.order}`, orderId: item.id, expected: step.expected * item.quantity, actual: 0, status: "待执行" as const, exceptionReason: "", durationSeconds: 0 })) : item.steps,
      processSteps: formula?.processEnabled ? formula.processSteps : [],
    } : item),
    dataLogs: [log, ...state.dataLogs],
  };
  return withAudit(next, retry ? "重发订单" : "下发订单", order.orderNo, "L3", operator, `${result} / retry=${retry} / ${log.reason}`, now, failure ? "失败" : "成功");
}

export function dispatchRefund(state: OrderReportsState, orderId: string, now = new Date().toISOString(), operator = "系统用户"): OrderReportsState {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) throw new Error("订单不存在");
  if (order.refundState === "退单下发成功") throw new Error("退单已成功下发，不可重复操作");
  const device = state.devices.find((item) => item.id === order.deviceId) || selectOrderDevice(state, order.groupId, order.pointId);
  const log: OrderDataLog = {
    id: compactId("DLOG", now, state.dataLogs.length + 1),
    orderId,
    event: "REFUND_PUSH",
    retry: false,
    result: device ? "成功" : "失败",
    reason: device ? "退单指令已独立下发" : "找不到可用设备，退单下发失败",
    deviceSn: device?.sn || "-",
    time: now,
  };
  const next = {
    ...state,
    orders: state.orders.map((item) => item.id === orderId ? { ...item, legacyState: (device ? (item.legacyState === 2 || item.legacyState === 3 ? 5 : 4) : item.legacyState) as LegacyOrderState, dispatchState: device ? "已退单" as const : item.dispatchState, refundState: device ? "退单下发成功" as const : "退单下发失败" as const, refundAttempts: item.refundAttempts + 1 } : item),
    dataLogs: [log, ...state.dataLogs],
  };
  return withAudit(next, "下发退单", order.orderNo, "L3", operator, `${log.result} / ${log.reason}`, now, device ? "成功" : "失败");
}

export function printOrder(state: OrderReportsState, orderId: string, operator: string, now = new Date().toISOString()): OrderReportsState {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) throw new Error("订单不存在，不能打印");
  const previous = state.printLogs.filter((log) => log.orderId === orderId && log.result === "成功");
  const log: PrintLog = {
    id: compactId("PRINT", now, state.printLogs.length + 1),
    orderId,
    printType: previous.length ? "补打" : "首次打印",
    result: "成功",
    operator,
    time: now,
    reason: previous.length ? `第 ${previous.length + 1} 次打印` : "订单首次打印",
  };
  return withAudit({ ...state, printLogs: [log, ...state.printLogs] }, log.printType, order.orderNo, "L1", operator, log.reason, now);
}

export function legacyOrderCounts(orders: BusinessOrder[]) {
  return {
    total: orders.length,
    waiting: orders.filter((order) => order.legacyState === 0).length,
    exception: orders.filter((order) => order.legacyState === 1).length,
    completed: orders.filter((order) => ([2, 3, 5] as LegacyOrderState[]).includes(order.legacyState)).length,
    refunded: orders.filter((order) => ([4, 5] as LegacyOrderState[]).includes(order.legacyState)).length,
  };
}

export function startExport(state: OrderReportsState, reportType: ReportType, filters: string, createdBy: string, now = new Date().toISOString()): OrderReportsState {
  const task: ExportTask = {
    id: compactId("EXPORT", now, state.exportTasks.length + 1),
    reportType,
    filters,
    status: "待执行",
    createdBy,
    createdAt: now,
    updatedAt: now,
    isRead: false,
  };
  return withAudit({ ...state, exportTasks: [task, ...state.exportTasks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, EXPORT_TASK_LIMIT) }, "导出报表", reportType, "L3", createdBy, filters, now);
}

export function expireExportTasks(state: OrderReportsState, now = new Date().toISOString()): OrderReportsState {
  const timestamp = Date.parse(now);
  return {
    ...state,
    exportTasks: state.exportTasks.map((task) => {
      if ((task.status === "待执行" || task.status === "执行中") && timestamp - Date.parse(task.updatedAt) > EXPORT_TIMEOUT_MS) {
        return { ...task, status: "失败", updatedAt: now, failureReason: "超过 5 分钟未更新，任务已超时" };
      }
      return task;
    }),
  };
}

export function clearExportTask(state: OrderReportsState, taskId: string, operator = "系统用户", now = new Date().toISOString()): OrderReportsState {
  const task = state.exportTasks.find((item) => item.id === taskId);
  if (!task) throw new Error("导出任务不存在");
  if (task.status === "待执行" || task.status === "执行中") throw new Error("处理中任务不可清理");
  return withAudit({ ...state, exportTasks: state.exportTasks.filter((item) => item.id !== taskId) }, "清理导出任务", task.id, "L1", operator, `${task.reportType} / ${task.status}`, now);
}

export function markExportTaskRead(state: OrderReportsState, taskId: string, operator = "系统用户", now = new Date().toISOString()): OrderReportsState {
  const task = state.exportTasks.find((item) => item.id === taskId);
  if (!task) throw new Error("导出任务不存在");
  if (task.status === "待执行" || task.status === "执行中") throw new Error("处理中任务不可标记已读");
  if (task.isRead) return state;
  return withAudit({ ...state, exportTasks: state.exportTasks.map((item) => item.id === taskId ? { ...item, isRead: true } : item) }, "标记导出任务已读", task.id, "L0", operator, task.reportType, now);
}

export function completeExportTask(state: OrderReportsState, taskId: string, now = new Date().toISOString()): OrderReportsState {
  return {
    ...state,
    exportTasks: state.exportTasks.map((task) => task.id === taskId ? { ...task, status: "成功", updatedAt: now, fileName: `${task.reportType}-${now.slice(0, 10)}.xlsx` } : task),
  };
}

export function filterReportRows(rows: ReportRow[], range: "今日" | "近 7 天" | "近 30 天", now = new Date()): ReportRow[] {
  const end = now.getTime();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "近 7 天") start.setDate(start.getDate() - 6);
  if (range === "近 30 天") start.setDate(start.getDate() - 29);
  return rows.filter((row) => {
    const occurredAt = Date.parse(row.occurredAt.replace(" ", "T"));
    return Number.isFinite(occurredAt) && occurredAt >= start.getTime() && occurredAt <= end;
  });
}
