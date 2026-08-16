import type { Batch, CatalogResourcesAction, CatalogResourcesPermission, CatalogResourcesState, Formula, FormulaScope, Point, ResourceLog } from "./types";

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const todayKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const fail = (state: CatalogResourcesState, message: string): CatalogResourcesState => ({ ...state, lastError: message, lastNotice: undefined });
const success = (state: CatalogResourcesState, message: string): CatalogResourcesState => ({ ...state, lastError: undefined, lastNotice: message });
const addLog = (state: CatalogResourcesState, action: string, objectType: string, objectId: string, note: string, operator: string): CatalogResourcesState => {
  const log: ResourceLog = { id: uid("LOG"), action, objectType, objectId, time: new Date().toISOString(), operator, note };
  return { ...state, logs: [log, ...state.logs].slice(0, 200) };
};

function requiredPermission(action: CatalogResourcesAction): CatalogResourcesPermission | undefined {
  if (action.type === "clear-feedback") return undefined;
  if (["adjust-bin", "add-batch", "waste-batch", "print-batch"].includes(action.type)) return "field";
  if (action.type === "run-auto-waste") return "system";
  return "manage";
}

export function canRunCatalogResourcesAction(action: CatalogResourcesAction) {
  const required = requiredPermission(action);
  if (!required) return true;
  const permissions = action.meta?.permissions || [];
  return permissions.includes(required) || (required === "field" && permissions.includes("manage"));
}

export function formulaCombinationCode(productCode: string, specCodes: string[]) {
  return [productCode.trim().toUpperCase(), ...specCodes.map((code) => code.trim().toUpperCase()).filter(Boolean)].join("-");
}

export function scopesOverlap(aScope: FormulaScope, aTargets: string[], bScope: FormulaScope, bTargets: string[], points: Point[] = []) {
  if (aScope === "全国" || bScope === "全国") return true;
  const expand = (scope: FormulaScope, targets: string[]) => scope === "点位"
    ? targets
    : points.filter((point) => targets.includes(point.region)).map((point) => point.id);
  if (points.length) return expand(aScope, aTargets).some((pointId) => expand(bScope, bTargets).includes(pointId));
  return aScope === bScope && aTargets.some((target) => bTargets.includes(target));
}

export function deriveBatchStatus(batch: Batch, now = new Date()): Batch["status"] {
  if (batch.wastedAmount > 0) return "已报损";
  if (now >= new Date(batch.expiresAt)) return "已过期";
  if (now >= new Date(batch.warningAt)) return "临期";
  return "可用";
}

export function catalogResourcesReducer(state: CatalogResourcesState, action: CatalogResourcesAction): CatalogResourcesState {
  if (action.type === "clear-feedback") return { ...state, lastError: undefined, lastNotice: undefined };
  if (!canRunCatalogResourcesAction(action)) return fail(state, `当前账号没有${requiredPermission(action) === "field" ? "现场作业" : requiredPermission(action) === "system" ? "系统任务" : "资源配置管理"}权限。`);
  const scopedPointIds = action.meta?.pointIds;
  const pointAllowed = (pointId: string) => scopedPointIds === undefined || scopedPointIds.includes(pointId);
  const rejectPoint = (pointId: string) => !pointAllowed(pointId) ? fail(state, `点位 ${pointId} 不在当前账号授权范围内。`) : undefined;
  const actor = action.meta?.actor || "未知操作人";
  if (action.type === "save-spec-group") {
    const group = action.payload;
    if (!group.name.trim() || !group.code.trim() || !group.options.length) return fail(state, "规格组必须包含名称、编码和至少一个规格项。");
    if (state.specGroups.some((item) => item.id !== group.id && item.code.toLowerCase() === group.code.toLowerCase())) return fail(state, "规格组编码已存在。");
    const codes = group.options.map((item) => item.code.trim().toLowerCase());
    if (codes.some((code) => !code) || new Set(codes).size !== codes.length) return fail(state, "规格项编码不能为空且不可重复。");
    const exists = state.specGroups.some((item) => item.id === group.id);
    return success(addLog({ ...state, specGroups: exists ? state.specGroups.map((item) => item.id === group.id ? group : item) : [...state.specGroups, group] }, exists ? "编辑" : "新增", "规格组", group.id, `${group.name} / ${group.options.length} 项`, actor), "规格组已保存。");
  }
  if (action.type === "add-spec-template") {
    const { name, code, groupIds } = action.payload;
    if (!name.trim() || !code.trim() || !groupIds.length) return fail(state, "规格模板必须填写名称、编码并至少选择一个规格组。");
    if (state.specTemplates.some((item) => item.code.toLowerCase() === code.trim().toLowerCase())) return fail(state, "规格模板编码已存在。");
    const id = uid("ST");
    if (groupIds.some((groupId) => !state.specGroups.some((group) => group.id === groupId))) return fail(state, "规格模板引用了不存在的规格组。");
    return success(addLog({ ...state, specTemplates: [{ id, name: name.trim(), code: code.trim().toUpperCase(), groupIds, status: "启用", updatedAt: new Date().toISOString() }, ...state.specTemplates] }, "新增", "规格模板", id, `创建模板 ${name}`, actor), "规格模板已创建。");
  }
  if (action.type === "add-formula") {
    const payload = action.payload;
    const affectedPointIds = payload.scope === "全国" ? state.points.map((point) => point.id) : payload.scope === "区域" ? state.points.filter((point) => payload.targets.includes(point.region)).map((point) => point.id) : payload.targets;
    if (scopedPointIds !== undefined && (affectedPointIds.length === 0 || affectedPointIds.some((pointId) => !pointAllowed(pointId)))) return fail(state, "配方范围包含当前账号未授权点位，不能影响范围外的启用版本。");
    const specCodes = payload.specCodes.map((code) => code.trim()).filter(Boolean);
    const validSteps = payload.steps.filter((step) => step.materialId && Number.isFinite(step.amount) && step.amount > 0 && step.unit);
    if (!payload.productCode.trim() || !payload.productName.trim() || !specCodes.length || !validSteps.length) return fail(state, "配方必须包含商品、至少一个有效规格和一组有效物料步骤。");
    if (specCodes.length > 10) return fail(state, "配方规格最多支持十个维度。");
    const enabledSpecCodes = new Set(state.specGroups.flatMap((group) => group.options.filter((option) => option.enabled).map((option) => option.code.toUpperCase())));
    if (specCodes.some((code) => !enabledSpecCodes.has(code.toUpperCase()))) return fail(state, "配方引用了不存在或已停用的规格项。");
    if (validSteps.length !== payload.steps.length) return fail(state, "配方物料步骤存在空引用或无效用量，不能静默忽略。");
    if (validSteps.some((step) => !state.materials.some((material) => material.id === step.materialId) || !state.units.some((unit) => [unit.id, unit.code, unit.name].some((value) => value.toLowerCase() === step.unit.toLowerCase())))) return fail(state, "配方物料步骤引用了不存在的物料或单位。");
    if (payload.scope !== "全国" && !payload.targets.length) return fail(state, "区域或点位配方必须选择适用目标。");
    if (payload.processId && state.processPlans.find((plan) => plan.id === payload.processId)?.status !== "启用") return fail(state, "只有启用中的工艺方案可绑定到配方。");
    const combinationCode = formulaCombinationCode(payload.productCode, specCodes);
    const sameCombination = state.formulas.filter((formula) => formula.combinationCode === combinationCode);
    const version = Math.max(0, ...sameCombination.map((formula) => formula.version)) + 1;
    const conflicts = sameCombination.filter((formula) => formula.status === "启用" && scopesOverlap(formula.scope, formula.targets, payload.scope, payload.targets, state.points));
    const formulas = state.formulas.map((formula) => conflicts.some((conflict) => conflict.id === formula.id) ? { ...formula, status: "停用" as const, steps: [], updatedAt: new Date().toISOString() } : formula);
    const id = uid("FM");
    const next: Formula = { id, productCode: payload.productCode.trim().toUpperCase(), productName: payload.productName.trim(), specCodes, combinationCode, version, scope: payload.scope, targets: payload.targets, status: "启用", deliveryStatus: "待下发", deliveryResults: [], processId: payload.processId, updatedAt: new Date().toISOString(), steps: validSteps.map((step, index) => ({ ...step, id: uid("FS"), order: index + 1 })) };
    const note = conflicts.length ? `创建 v${version}，停用 ${conflicts.length} 份冲突配方并清除旧步骤` : `创建 v${version}，等待下发`;
    return success(addLog({ ...state, formulas: [next, ...formulas] }, "新增版本", "执行配方", id, note, actor), note);
  }
  if (action.type === "publish-formula") {
    if (action.payload.pointIds.some((pointId) => !pointAllowed(pointId))) return fail(state, "配方下发包含当前账号未授权点位。");
    const formula = state.formulas.find((item) => item.id === action.payload.formulaId);
    if (!formula || formula.status !== "启用" || !formula.steps.length) return fail(state, "只有包含有效步骤的启用配方可以下发。");
    const eligible = action.payload.pointIds.filter((pointId) => state.points.some((point) => point.id === pointId && (formula.scope === "全国" || (formula.scope === "点位" ? formula.targets.includes(point.id) : formula.targets.includes(point.region)))));
    if (!eligible.length) return fail(state, "配方下发至少需要一个当前范围内的点位。");
    const time = new Date().toISOString();
    const results = eligible.map((pointId, index) => ({ pointId, status: (index % 3 === 2 ? "失败" : "成功") as "成功" | "失败", reason: index % 3 === 2 ? "点位设备离线" : "设备回执成功", updatedAt: time }));
    const deliveryStatus = results.some((item) => item.status === "失败") ? "部分失败" as const : "已完成" as const;
    const formulas = state.formulas.map((item) => item.id === formula.id ? { ...item, deliveryStatus, deliveryResults: results, updatedAt: time } : item);
    return success(addLog({ ...state, formulas }, "下发", "执行配方", formula.id, `${eligible.length} 个点位，${results.filter((item) => item.status === "失败").length} 个失败`, actor), "配方逐点位下发结果已生成。");
  }
  if (action.type === "retry-formula-delivery") {
    const denied = rejectPoint(action.payload.pointId); if (denied) return denied;
    const formula = state.formulas.find((item) => item.id === action.payload.formulaId);
    const result = formula?.deliveryResults.find((item) => item.pointId === action.payload.pointId);
    if (!formula || !result || result.status !== "失败") return fail(state, "只有失败的逐点位下发记录可以重试。");
    const retriedResults = formula.deliveryResults.map((entry) => entry.pointId === action.payload.pointId ? { ...entry, status: "成功" as const, reason: "重试回执成功", updatedAt: new Date().toISOString() } : entry);
    const formulas = state.formulas.map((item) => item.id !== formula.id ? item : { ...item, deliveryStatus: retriedResults.some((entry) => entry.status === "失败") ? "部分失败" as const : "已完成" as const, deliveryResults: retriedResults });
    return success(addLog({ ...state, formulas }, "重试下发", "执行配方", formula.id, `点位 ${action.payload.pointId}`, actor), "失败点位已重试成功。");
  }
  if (action.type === "save-process-plan") {
    const plan = action.payload;
    if (!plan.name.trim() || !plan.code.trim() || !plan.steps.length || plan.steps.some((step) => !Number.isInteger(step.order) || step.speed <= 0 || step.seconds <= 0)) return fail(state, "工艺方案必须填写名称、编码和有效步骤。");
    if (state.processPlans.some((item) => item.id !== plan.id && item.code.toLowerCase() === plan.code.toLowerCase())) return fail(state, "工艺方案编码已存在。");
    const exists = state.processPlans.some((item) => item.id === plan.id);
    return success(addLog({ ...state, processPlans: exists ? state.processPlans.map((item) => item.id === plan.id ? plan : item) : [...state.processPlans, plan] }, exists ? "编辑" : "新增", "工艺方案", plan.id, `${plan.steps.length} 个步骤`, actor), "工艺方案已保存。");
  }
  if (action.type === "save-unit") {
    const unit = action.payload;
    if (!unit.name.trim() || !unit.code.trim() || !Number.isInteger(unit.precision) || unit.precision < 0) return fail(state, "单位名称、编码和非负整数精度不能为空。");
    if (state.units.some((item) => item.id !== unit.id && (item.code.toLowerCase() === unit.code.toLowerCase() || item.name === unit.name))) return fail(state, "单位名称或编码已存在。");
    const exists = state.units.some((item) => item.id === unit.id);
    return success(addLog({ ...state, units: exists ? state.units.map((item) => item.id === unit.id ? unit : item) : [...state.units, unit] }, exists ? "编辑" : "新增", "计量单位", unit.id, `${unit.name} / 精度 ${unit.precision}`, actor), "计量单位已保存。");
  }
  if (action.type === "add-material") {
    const payload = action.payload;
    if (!payload.code.trim() || !payload.name.trim() || !payload.unitId) return fail(state, "物料名称、编码和单位不能为空。");
    if (state.materials.some((item) => item.code.toLowerCase() === payload.code.trim().toLowerCase())) return fail(state, "物料编码已存在。");
    if (state.materials.some((item) => item.name.trim() === payload.name.trim())) return fail(state, "物料名称已存在。");
    if (!Number.isInteger(payload.defaultValidMinutes) || payload.defaultValidMinutes < -1 || ![payload.defaultWarningMinutes, payload.calibrationPrecision].every((value) => Number.isInteger(value) && value >= 0)) return fail(state, "有效期只能为 -1 或非负整数，预警和精度必须是非负整数。");
    if (payload.defaultValidMinutes > 0 && payload.defaultWarningMinutes >= payload.defaultValidMinutes) return fail(state, "预警分钟数必须小于有效分钟数。");
    if (!state.units.some((unit) => unit.id === payload.unitId)) return fail(state, "物料引用的计量单位不存在。");
    const id = uid("MAT");
    return success(addLog({ ...state, materials: [{ ...payload, id, code: payload.code.trim().toUpperCase(), name: payload.name.trim(), status: "启用" }, ...state.materials] }, "新增", "物料", id, `创建物料 ${payload.name}`, actor), "物料已创建。");
  }
  if (action.type === "adjust-bin") {
    const { binId, mode, amount } = action.payload;
    const bin = state.bins.find((item) => item.id === binId);
    if (bin && !pointAllowed(bin.pointId)) return fail(state, "该料仓不在当前账号授权点位范围内。");
    if (!bin || !Number.isInteger(amount) || amount <= 0) return fail(state, "数量必须是大于 0 的整数。");
    if (mode === "补料" && bin.remaining + amount > bin.capacity) return fail(state, `补料后将超过容量 ${bin.capacity}，本次最多可补 ${bin.capacity - bin.remaining}。`);
    if (mode === "出料" && amount > bin.remaining) return fail(state, `出料不能超过当前余量 ${bin.remaining}。`);
    if (mode === "调整容量" && amount < bin.remaining) return fail(state, `新容量不能小于当前余量 ${bin.remaining}。`);
    const material = state.materials.find((item) => item.id === bin.materialId);
    const now = new Date();
    const nextBins = state.bins.map((item) => {
      if (item.id !== binId) return item;
      const remaining = mode === "补料" ? item.remaining + amount : mode === "出料" ? item.remaining - amount : item.remaining;
      const expiresAt = mode === "补料" && material ? (material.defaultValidMinutes === -1 ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString() : new Date(now.getTime() + material.defaultValidMinutes * 60_000).toISOString()) : item.expiresAt;
      return { ...item, capacity: mode === "调整容量" ? amount : item.capacity, remaining, suppliedAt: mode === "补料" ? now.toISOString() : item.suppliedAt, expiresAt, status: remaining <= item.warningThreshold ? "低余量" as const : "正常" as const };
    });
    return success(addLog({ ...state, bins: nextBins }, mode, "料仓", binId, `${mode} ${amount}，已校验容量与余量`, actor), `${mode}已记录。`);
  }
  if (action.type === "save-validity-plan") {
    const plan = action.payload;
    if (plan.pointIds.some((pointId) => !pointAllowed(pointId))) return fail(state, "效期方案包含当前账号未授权点位。");
    if (!plan.name.trim() || !plan.code.trim() || !plan.rules.length) return fail(state, "效期方案必须填写名称、编码和至少一条物料规则。");
    if (state.validityPlans.some((item) => item.id !== plan.id && item.code.toLowerCase() === plan.code.toLowerCase())) return fail(state, "效期方案编码已存在。");
    if (plan.rules.some((rule) => !state.materials.some((material) => material.id === rule.materialId) || !Number.isInteger(rule.validMinutes) || rule.validMinutes < -1 || !Number.isInteger(rule.warningMinutes) || rule.warningMinutes < 0 || (rule.validMinutes > 0 && rule.warningMinutes >= rule.validMinutes))) return fail(state, "效期方案包含无效物料、有效期或预警参数。");
    const occupied = state.validityPlans.filter((item) => item.id !== plan.id).flatMap((item) => item.pointIds);
    if (plan.pointIds.some((pointId) => occupied.includes(pointId))) return fail(state, "点位已绑定其他效期方案，请先通过绑定动作切换。");
    const exists = state.validityPlans.some((item) => item.id === plan.id);
    const previousPointIds = state.validityPlans.find((item) => item.id === plan.id)?.pointIds || [];
    const hiddenPointIds = scopedPointIds === undefined ? [] : previousPointIds.filter((pointId) => !pointAllowed(pointId));
    const normalized = { ...plan, pointIds: [...new Set([...hiddenPointIds, ...plan.pointIds])], deliveryStatus: "待下发" as const };
    return success(addLog({ ...state, validityPlans: exists ? state.validityPlans.map((item) => item.id === plan.id ? normalized : item) : [...state.validityPlans, normalized] }, exists ? "编辑" : "新增", "效期方案", plan.id, `${plan.rules.length} 条物料规则`, actor), "效期方案已保存并等待下发。");
  }
  if (action.type === "delete-validity-plan") {
    const plan = state.validityPlans.find((item) => item.id === action.payload.planId);
    if (!plan) return fail(state, "效期方案不存在。");
    if (plan.pointIds.length) return fail(state, "已绑定点位的效期方案不可删除，请先切换或解绑。");
    return success(addLog({ ...state, validityPlans: state.validityPlans.filter((item) => item.id !== plan.id) }, "删除", "效期方案", plan.id, plan.name, actor), "效期方案已删除。");
  }
  if (action.type === "bind-validity-plan") {
    const denied = rejectPoint(action.payload.pointId); if (denied) return denied;
    const plan = state.validityPlans.find((item) => item.id === action.payload.planId);
    const point = state.points.find((item) => item.id === action.payload.pointId);
    if (!plan || !point) return fail(state, "效期方案或点位不存在。");
    if (!point.validityEnabled) return fail(state, "该点位未启用效期管理，无法绑定方案。");
    const previous = state.validityPlans.find((item) => item.pointIds.includes(point.id) && item.id !== plan.id);
    const plans = state.validityPlans.map((item) => item.id === plan.id ? { ...item, pointIds: [...new Set([...item.pointIds, point.id])], deliveryStatus: "待下发" as const } : { ...item, pointIds: item.pointIds.filter((id) => id !== point.id) });
    const note = previous ? `从“${previous.name}”切换为“${plan.name}”，等待下发` : `绑定“${plan.name}”，等待下发`;
    return success(addLog({ ...state, validityPlans: plans }, "绑定方案", "点位", point.id, note, actor), note);
  }
  if (action.type === "add-batch") {
    const { pointId, materialId, activatedAt, amount } = action.payload;
    const denied = rejectPoint(pointId); if (denied) return denied;
    const activation = new Date(activatedAt);
    const point = state.points.find((item) => item.id === pointId);
    const plan = state.validityPlans.find((item) => item.status === "启用" && item.pointIds.includes(pointId));
    const rule = plan?.rules.find((item) => item.materialId === materialId);
    if (!point?.validityEnabled || !plan || !rule) return fail(state, "点位必须启用效期并绑定包含该物料的效期方案。");
    if (Number.isNaN(activation.getTime()) || todayKey(activation) !== todayKey(new Date())) return fail(state, "批次启用时间只允许录入当天时间。");
    if (!Number.isInteger(amount) || amount <= 0) return fail(state, "批次数量必须是大于 0 的整数。");
    if (state.batches.some((batch) => batch.pointId === pointId && batch.materialId === materialId && new Date(batch.activatedAt).getTime() === activation.getTime())) return fail(state, "该点位的同一物料在相同启用时间已有批次，请勿重复录入。");
    const expiresAt = rule.validMinutes === -1 ? new Date(activation.getFullYear(), activation.getMonth(), activation.getDate(), 23, 59, 59) : new Date(activation.getTime() + rule.validMinutes * 60_000);
    const warningAt = new Date(expiresAt.getTime() - rule.warningMinutes * 60_000);
    const id = uid("BATCH");
    const batch: Batch = { id, code: `B${todayKey(activation).replaceAll("-", "")}-${String(state.batches.length + 1).padStart(3, "0")}`, pointId, materialId, activatedAt, expiresAt: expiresAt.toISOString(), warningAt: warningAt.toISOString(), initialAmount: amount, availableAmount: amount, wastedAmount: 0, status: "可用", printCount: 0 };
    batch.status = deriveBatchStatus(batch);
    return success(addLog({ ...state, batches: [batch, ...state.batches] }, "录入批次", "批次", id, `${point.name} 当日批次，数量 ${amount}`, actor), "批次已录入，可进行首次打印。");
  }
  if (action.type === "waste-batch") {
    const { batchId, amount, reason } = action.payload;
    const batch = state.batches.find((item) => item.id === batchId);
    if (batch && !pointAllowed(batch.pointId)) return fail(state, "该批次不在当前账号授权点位范围内。");
    if (!batch || !Number.isInteger(amount) || amount <= 0 || !reason.trim()) return fail(state, "报损数量必须为正整数，并填写原因。");
    const currentStatus = deriveBatchStatus(batch);
    if (currentStatus === "已过期" || currentStatus === "已报损") return fail(state, `${currentStatus}批次不可再次报损。`);
    const printableRemaining = batch.firstPrintAmount == null ? batch.availableAmount : Math.max(0, batch.firstPrintAmount - batch.wastedAmount);
    const maximum = Math.min(batch.availableAmount, printableRemaining);
    if (amount > maximum) return fail(state, `报损量不能超过批次可用/打印重量 ${maximum}。`);
    const batches = state.batches.map((item) => item.id === batchId ? { ...item, availableAmount: item.availableAmount - amount, wastedAmount: item.wastedAmount + amount, status: "已报损" as const } : item);
    return success(addLog({ ...state, batches }, "报损", "批次", batchId, `${amount}；原因：${reason.trim()}`, actor), "报损已记录，该批次不再参与可用量或打印。");
  }
  if (action.type === "print-batch") {
    const { batchId, amount } = action.payload;
    const batch = state.batches.find((item) => item.id === batchId);
    if (batch && !pointAllowed(batch.pointId)) return fail(state, "该批次不在当前账号授权点位范围内。");
    if (!batch || !Number.isInteger(amount) || amount <= 0) return fail(state, "打印数量必须是大于 0 的整数。");
    const currentStatus = batch ? deriveBatchStatus(batch) : "已过期";
    if (currentStatus === "已报损" || currentStatus === "已过期") return fail(state, `${currentStatus}批次不可打印。`);
    const maximum = batch.printCount === 0 ? batch.availableAmount : Math.min(batch.availableAmount, batch.firstPrintAmount || 0);
    if (amount > maximum) return fail(state, `打印重量不能超过批次${batch.printCount ? "首次打印" : "可用"}重量 ${maximum}。`);
    const kind = batch.printCount === 0 ? "首次打印" as const : "补打" as const;
    const time = new Date().toISOString();
    const batches = state.batches.map((item) => item.id === batchId ? { ...item, printCount: item.printCount + 1, firstPrintedAt: item.firstPrintedAt || time, firstPrintAmount: item.firstPrintAmount ?? amount, status: currentStatus } : item);
    const printLog = { id: uid("PRINT"), batchId, kind, amount, operator: actor, time };
    return success(addLog({ ...state, batches, printLogs: [printLog, ...state.printLogs] }, kind, "批次", batchId, `${kind} ${amount}`, actor), `${kind}记录已生成。`);
  }
  if (action.type === "run-auto-waste") {
    const now = new Date(action.payload.now);
    if (Number.isNaN(now.getTime()) || now.getHours() < 6) return fail(state, "自动报损只能在当天 06:00 后执行。");
    const eligible = state.batches.filter((batch) => {
      if (!pointAllowed(batch.pointId)) return false;
      const point = state.points.find((item) => item.id === batch.pointId);
      const plan = state.validityPlans.find((item) => item.status === "启用" && item.autoWaste && item.pointIds.includes(batch.pointId));
      return point?.validityEnabled && plan && batch.wastedAmount === 0 && batch.availableAmount > 0 && now >= new Date(batch.expiresAt);
    });
    if (!eligible.length) return success(state, "没有符合条件的过期批次。");
    const ids = new Set(eligible.map((batch) => batch.id));
    let next = { ...state, batches: state.batches.map((batch) => ids.has(batch.id) ? { ...batch, wastedAmount: batch.wastedAmount + batch.availableAmount, availableAmount: 0, status: "已报损" as const } : batch) };
    for (const batch of eligible) next = addLog(next, "自动报损", "批次", batch.id, `06:00 后处理过期批次 ${batch.availableAmount}`, actor);
    return success(next, `已自动报损 ${eligible.length} 个过期批次。`);
  }
  return state;
}
