import type { IncidentRule, ScopeLevel, StatusActionMeta, StatusCenterAction, StatusCenterAudit, StatusCenterState, StatusDefinition, StatusRelease } from "./types";

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const nowText = () => new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");
const fail = (state: StatusCenterState, message: string) => ({ ...state, lastError: message, lastNotice: undefined });
const success = (state: StatusCenterState, message: string) => ({ ...state, lastError: undefined, lastNotice: message });

function addAudit(state: StatusCenterState, action: string, object: string, risk: StatusCenterAudit["risk"], result: StatusCenterAudit["result"], detail: string, actor: string) {
  const entry: StatusCenterAudit = { id: uid("SC-AUD"), time: nowText(), actor, action, object, risk, result, detail };
  return { ...state, audits: [entry, ...state.audits].slice(0, 300) };
}

function scopeAllowed(tenant: string, scopeLevel: ScopeLevel, targets: string[], meta: StatusActionMeta) {
  if (tenant !== "*" && !meta.tenantNames.includes(tenant)) return false;
  if (scopeLevel === "单台设备") return targets.every((target) => meta.deviceIds.includes(target));
  return true;
}

export function validateStatusDefinition(definition: StatusDefinition, state: StatusCenterState) {
  if (!definition.name.trim() || !/^[A-Z][A-Z0-9_]{1,39}$/.test(definition.code)) return "状态名称不能为空，编码需为 2-40 位大写字母、数字或下划线。";
  if (definition.name.trim().length > 60 || definition.description.length > 500 || definition.appliesTo.some((item) => item.length > 60)) return "状态名称、业务说明或适用对象超过允许长度。";
  if (!definition.appliesTo.length) return "状态至少需要一个适用对象。";
  if (!Number.isInteger(definition.triggerAfterMinutes) || definition.triggerAfterMinutes < 0) return "触发时长必须是非负整数分钟。";
  if (definition.autoCreateIncident && !["警告", "故障", "不可用"].includes(definition.category)) return "只有警告、故障或不可用状态可以自动生成异常。";
  if (definition.recoveryStatusCode && !state.statusDefinitions.some((item) => item.code === definition.recoveryStatusCode && item.dimension === definition.dimension && item.enabled)) return "恢复状态必须引用同一维度内的启用状态。";
  if (definition.scopeLevel !== "平台默认" && !definition.scopeTargets.length) return "非平台默认配置必须选择作用范围。";
  if (definition.scopeLevel === "平台默认" && definition.tenant !== "*") return "平台默认状态必须使用全平台租户范围。";
  const duplicate = state.statusDefinitions.some((item) => item.id !== definition.id && item.code === definition.code && item.tenant === definition.tenant && item.scopeLevel === definition.scopeLevel && item.scopeTargets.join("|") === definition.scopeTargets.join("|"));
  return duplicate ? "相同租户和作用范围内已经存在该状态编码。" : undefined;
}

export function validateIncidentRule(rule: IncidentRule, state: StatusCenterState) {
  if (!rule.name.trim() || !/^[A-Z][A-Z0-9_]{1,49}$/.test(rule.code)) return "异常名称不能为空，编码需为 2-50 位大写字母、数字或下划线。";
  if (rule.name.trim().length > 60 || rule.sop.length > 500 || rule.triggerCondition.length > 300 || rule.recoveryCondition.length > 300) return "异常名称、触发条件、恢复条件或处理 SOP 超过允许长度。";
  if (!rule.deviceTypes.length || !rule.source.trim() || !rule.rawCodes.length || !rule.triggerCondition.trim()) return "异常规则必须包含适用设备、来源、原始错误码和触发条件。";
  if (![rule.consecutiveCount, rule.dedupeMinutes, rule.slaMinutes].every((value) => Number.isInteger(value) && value > 0)) return "连续次数、去重窗口和 SLA 必须是正整数。";
  if (!rule.owner.trim() || !rule.escalation.trim() || !rule.sop.trim()) return "默认负责人、升级对象和处理 SOP 不能为空。";
  if (rule.autoRecover && !rule.recoveryCondition.trim()) return "启用自动恢复时必须填写恢复条件。";
  if (rule.scopeLevel !== "平台默认" && !rule.scopeTargets.length) return "非平台默认规则必须选择作用范围。";
  if (rule.scopeLevel === "平台默认" && rule.tenant !== "*") return "平台默认规则必须使用全平台租户范围。";
  const duplicate = state.incidentRules.some((item) => item.id !== rule.id && item.code === rule.code && item.tenant === rule.tenant && item.scopeLevel === rule.scopeLevel && item.scopeTargets.join("|") === rule.scopeTargets.join("|"));
  return duplicate ? "相同租户和作用范围内已经存在该异常编码。" : undefined;
}

function releaseFor(state: StatusCenterState, objectType: StatusRelease["objectType"], draft: StatusDefinition | IncidentRule, summary: string, impactDeviceIds: string[], impactPointIds: string[], actor: string): StatusRelease {
  const collection = objectType === "状态字典" ? state.statusDefinitions : state.incidentRules;
  const previous = collection.find((item) => item.id === draft.id);
  return {
    id: uid("SC-REL"),
    objectType,
    objectId: draft.id,
    objectName: draft.name,
    tenant: draft.tenant,
    scopeLevel: draft.scopeLevel,
    scopeTargets: draft.scopeTargets,
    summary,
    impactDeviceIds: [...new Set(impactDeviceIds)],
    impactPointIds: [...new Set(impactPointIds)],
    requester: actor,
    approver: "配置审批人",
    status: "待审批",
    createdAt: nowText(),
    version: (previous?.version || 0) + 1,
    draft: { ...draft, version: (previous?.version || 0) + 1, updatedAt: nowText() },
    previous,
    results: [],
  };
}

function recordDenied(state: StatusCenterState, action: string, object: string, detail: string, actor: string, risk: StatusCenterAudit["risk"] = "L3") {
  return fail(addAudit(state, action, object, risk, "拒绝", detail, actor), detail);
}

export function statusCenterReducer(state: StatusCenterState, action: StatusCenterAction): StatusCenterState {
  if (action.type === "clear-feedback") return { ...state, lastError: undefined, lastNotice: undefined };
  if (action.type === "expire-silences") return { ...state, silences: state.silences.filter((item) => new Date(item.expiresAt).getTime() > new Date(action.payload.now).getTime()) };
  const actor = action.meta.actor;

  if (action.type === "submit-status-change") {
    if (!action.meta.canManage) return recordDenied(state, "提交状态配置", action.payload.definition.id, "当前角色没有状态字典配置权限。", actor);
    if (!scopeAllowed(action.payload.definition.tenant, action.payload.definition.scopeLevel, action.payload.definition.scopeTargets, action.meta)) return recordDenied(state, "提交状态配置", action.payload.definition.id, "配置范围超出当前账号的数据范围。", actor);
    if (action.payload.impactDeviceIds.some((id) => !action.meta.deviceIds.includes(id)) || action.payload.impactPointIds.some((id) => !action.meta.pointIds.includes(id))) return recordDenied(state, "提交状态配置", action.payload.definition.id, "影响范围包含当前账号无权管理的点位或设备。", actor);
    if (!action.payload.summary.trim() || action.payload.summary.length > 300) return recordDenied(state, "提交状态配置", action.payload.definition.id, "变更说明不能为空且不能超过 300 个字符。", actor);
    const error = validateStatusDefinition(action.payload.definition, state);
    if (error) return recordDenied(state, "提交状态配置", action.payload.definition.id, error, actor);
    const release = releaseFor(state, "状态字典", action.payload.definition, action.payload.summary, action.payload.impactDeviceIds, action.payload.impactPointIds, actor);
    return success(addAudit({ ...state, releases: [release, ...state.releases] }, "提交状态配置", release.id, "L3", "成功", `${release.objectName} v${release.version}，等待非发起人审批`, actor), "状态配置已提交审批，尚未影响运行设备。");
  }

  if (action.type === "submit-rule-change") {
    if (!action.meta.canManage) return recordDenied(state, "提交异常规则", action.payload.rule.id, "当前角色没有异常规则配置权限。", actor);
    if (!scopeAllowed(action.payload.rule.tenant, action.payload.rule.scopeLevel, action.payload.rule.scopeTargets, action.meta)) return recordDenied(state, "提交异常规则", action.payload.rule.id, "配置范围超出当前账号的数据范围。", actor);
    if (action.payload.impactDeviceIds.some((id) => !action.meta.deviceIds.includes(id)) || action.payload.impactPointIds.some((id) => !action.meta.pointIds.includes(id))) return recordDenied(state, "提交异常规则", action.payload.rule.id, "影响范围包含当前账号无权管理的点位或设备。", actor);
    if (!action.payload.summary.trim() || action.payload.summary.length > 300) return recordDenied(state, "提交异常规则", action.payload.rule.id, "变更说明不能为空且不能超过 300 个字符。", actor);
    const error = validateIncidentRule(action.payload.rule, state);
    if (error) return recordDenied(state, "提交异常规则", action.payload.rule.id, error, actor);
    const release = releaseFor(state, "异常规则", action.payload.rule, action.payload.summary, action.payload.impactDeviceIds, action.payload.impactPointIds, actor);
    return success(addAudit({ ...state, releases: [release, ...state.releases] }, "提交异常规则", release.id, "L3", "成功", `${release.objectName} v${release.version}，等待非发起人审批`, actor), "异常规则已提交审批，尚未影响告警生成。");
  }

  if (action.type === "approve-release") {
    const release = state.releases.find((item) => item.id === action.payload.releaseId);
    if (!release) return recordDenied(state, "审批状态异常配置", action.payload.releaseId, "发布记录不存在。", actor, "L4");
    if (!action.meta.canApprove) return recordDenied(state, "审批状态异常配置", release.id, "当前角色没有配置审批权限。", actor, "L4");
    if (release.requester === actor) return recordDenied(state, "审批状态异常配置", release.id, "发起人不能审批自己的配置。", actor, "L4");
    if (release.status !== "待审批") return recordDenied(state, "审批状态异常配置", release.id, `当前状态 ${release.status} 不能审批。`, actor, "L4");
    const releases = state.releases.map((item) => item.id === release.id ? { ...item, status: "已批准" as const, approver: actor, approvedAt: nowText() } : item);
    return success(addAudit({ ...state, releases }, "审批状态异常配置", release.id, "L4", "成功", `${release.objectName} v${release.version} 已批准`, actor), "配置已经批准，等待发布人执行发布。");
  }

  if (action.type === "publish-release") {
    const release = state.releases.find((item) => item.id === action.payload.releaseId);
    if (!release) return recordDenied(state, "发布状态异常配置", action.payload.releaseId, "发布记录不存在。", actor, "L4");
    if (!action.meta.canPublish) return recordDenied(state, "发布状态异常配置", release.id, "当前角色没有配置发布权限。", actor, "L4");
    if (release.status !== "已批准") return recordDenied(state, "发布状态异常配置", release.id, "只有已批准配置可以发布。", actor, "L4");
    if (action.payload.targets.some((target) => !release.impactDeviceIds.includes(target.id))) return recordDenied(state, "发布状态异常配置", release.id, "发布目标超出审批时确认的设备快照。", actor, "L4");
    const results = action.payload.targets.map((target, index) => ({ targetId: target.id, targetName: target.name, status: (index > 0 && index % 4 === 0 ? "失败" : "成功") as "成功" | "失败", reason: index > 0 && index % 4 === 0 ? "设备离线，等待失败重试" : "配置回执成功" }));
    const publishedStatus = results.some((item) => item.status === "失败") ? "部分失败" as const : "已发布" as const;
    let next = { ...state };
    if (release.objectType === "状态字典") next.statusDefinitions = [...state.statusDefinitions.filter((item) => item.id !== release.objectId), release.draft as StatusDefinition];
    else next.incidentRules = [...state.incidentRules.filter((item) => item.id !== release.objectId), release.draft as IncidentRule];
    next.releases = state.releases.map((item) => item.id === release.id ? { ...item, status: publishedStatus, publishedAt: nowText(), results } : item);
    return success(addAudit(next, "发布状态异常配置", release.id, "L4", "成功", `${release.objectName} v${release.version}：${results.filter((item) => item.status === "成功").length}/${results.length} 成功`, actor), publishedStatus === "部分失败" ? "配置已部分发布，可在发布记录查看失败设备。" : "配置已发布并生成逐设备结果。");
  }

  if (action.type === "retry-release-targets") {
    const release = state.releases.find((item) => item.id === action.payload.releaseId);
    if (!release) return recordDenied(state, "重试失败设备", action.payload.releaseId, "发布记录不存在。", actor, "L4");
    if (!action.meta.canPublish) return recordDenied(state, "重试失败设备", release.id, "当前角色没有配置发布权限。", actor, "L4");
    if (release.status !== "部分失败" || !release.results.some((item) => item.status === "失败")) return recordDenied(state, "重试失败设备", release.id, "当前发布没有可重试的失败设备。", actor, "L4");
    const results = release.results.map((item) => item.status === "失败" ? { ...item, status: "成功" as const, reason: "显式重试后配置回执成功" } : item);
    const releases = state.releases.map((item) => item.id === release.id ? { ...item, status: "已发布" as const, publishedAt: nowText(), results } : item);
    return success(addAudit({ ...state, releases }, "重试失败设备", release.id, "L4", "成功", `${release.objectName} v${release.version} 的失败设备已全部重试成功`, actor), "失败设备已显式重试，发布结果已更新。大规模重试应由真实下发服务执行。");
  }

  if (action.type === "rollback-release") {
    const release = state.releases.find((item) => item.id === action.payload.releaseId);
    if (!release) return recordDenied(state, "回退状态异常配置", action.payload.releaseId, "发布记录不存在。", actor, "L4");
    if (!action.meta.canPublish || !["已发布", "部分失败"].includes(release.status) || !release.previous) return recordDenied(state, "回退状态异常配置", release.id, "当前发布不可回退或没有历史版本。", actor, "L4");
    let next = { ...state };
    if (release.objectType === "状态字典") next.statusDefinitions = [...state.statusDefinitions.filter((item) => item.id !== release.objectId), release.previous as StatusDefinition];
    else next.incidentRules = [...state.incidentRules.filter((item) => item.id !== release.objectId), release.previous as IncidentRule];
    next.releases = state.releases.map((item) => item.id === release.id ? { ...item, status: "已回退" as const } : item);
    return success(addAudit(next, "回退状态异常配置", release.id, "L4", "成功", `已恢复 ${release.objectName} 的上一版本`, actor), "已回退到上一版本，历史发布记录保持不变。");
  }

  if (action.type === "mute-device") {
    if (!action.meta.deviceIds.includes(action.payload.deviceId)) return recordDenied(state, "设置异常静默", action.payload.deviceId, "设备不在当前账号的数据范围内。", actor, "L2");
    if (action.meta.auditOnly) return recordDenied(state, "设置异常静默", action.payload.deviceId, "审计角色只能查看，不能设置静默。", actor, "L2");
    if (!action.payload.reason.trim() || action.payload.reason.length > 200 || !Number.isInteger(action.payload.minutes) || action.payload.minutes < 5 || action.payload.minutes > 1440) return recordDenied(state, "设置异常静默", action.payload.deviceId, "静默原因不能为空且不能超过 200 字，时长必须为 5-1440 分钟。", actor, "L2");
    const createdAt = new Date();
    const silence = { id: uid("SILENCE"), deviceId: action.payload.deviceId, ruleCode: action.payload.ruleCode, reason: action.payload.reason.trim(), operator: actor, createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + action.payload.minutes * 60_000).toISOString() };
    return success(addAudit({ ...state, silences: [silence, ...state.silences.filter((item) => item.deviceId !== silence.deviceId || item.ruleCode !== silence.ruleCode)] }, "设置异常静默", action.payload.deviceId, "L2", "成功", `${action.payload.minutes} 分钟；${silence.reason}`, actor), "静默窗口已生效；P0 安全异常仍应由接入服务强制上报。");
  }
  return state;
}
