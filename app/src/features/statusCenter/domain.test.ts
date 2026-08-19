import { describe, expect, it } from "vitest";
import { createInitialState } from "../../data/mockData";
import { buildDeviceHealthRows, buildDeviceTimeline, impactForScope, statusCenterStateForScope } from "./access";
import { statusCenterReducer, validateIncidentRule, validateStatusDefinition } from "./domain";
import { statusCenterSeed } from "./seed";
import type { IncidentRule, StatusActionMeta, StatusDefinition } from "./types";

const fullMeta: StatusActionMeta = {
  actor: "配置管理员甲",
  roles: ["平台支持"],
  tenantNames: ["星舟具身智能", "云栖商业空间"],
  pointIds: ["point-001", "point-002", "point-003", "point-004", "point-005"],
  pointNames: ["点位一", "点位二", "点位三", "点位四", "点位五"],
  brandNames: ["品牌一", "品牌二"],
  scenarioNames: ["场景一", "场景二"],
  deviceIds: ["dev-001", "dev-002", "dev-003", "dev-004", "dev-005", "dev-006"],
  deviceTypes: ["人形机器人", "制饮设备"],
  canManage: true,
  canApprove: true,
  canPublish: true,
  auditOnly: false,
};

function draftStatus(overrides: Partial<StatusDefinition> = {}): StatusDefinition {
  return { ...structuredClone(statusCenterSeed.statusDefinitions[1]), id: "STATUS-TEST", code: "TEST_STATUS", name: "测试状态", tenant: "*", scopeLevel: "平台默认", scopeTargets: [], version: 0, ...overrides };
}

function draftRule(overrides: Partial<IncidentRule> = {}): IncidentRule {
  return { ...structuredClone(statusCenterSeed.incidentRules[0]), id: "RULE-TEST", code: "TEST_INCIDENT", name: "测试异常", tenant: "*", scopeLevel: "平台默认", scopeTargets: [], version: 0, ...overrides };
}

describe("状态与异常中心领域规则", () => {
  it("校验状态编码、适用对象与同维度恢复状态", () => {
    expect(validateStatusDefinition(draftStatus({ code: "bad-code" }), statusCenterSeed)).toContain("编码");
    expect(validateStatusDefinition(draftStatus({ appliesTo: [] }), statusCenterSeed)).toContain("适用对象");
    expect(validateStatusDefinition(draftStatus({ recoveryStatusCode: "SAFE" }), statusCenterSeed)).toContain("同一维度");
    expect(validateStatusDefinition(draftStatus({ recoveryStatusCode: "ONLINE" }), statusCenterSeed)).toBeUndefined();
  });

  it("校验异常触发、去重、SLA 和自动恢复条件", () => {
    expect(validateIncidentRule(draftRule({ consecutiveCount: 0 }), statusCenterSeed)).toContain("正整数");
    expect(validateIncidentRule(draftRule({ autoRecover: true, recoveryCondition: "" }), statusCenterSeed)).toContain("恢复条件");
    expect(validateIncidentRule(draftRule(), statusCenterSeed)).toBeUndefined();
  });

  it("提交只产生待审批发布单，不直接改变生效状态", () => {
    const definition = draftStatus();
    const next = statusCenterReducer(statusCenterSeed, { type: "submit-status-change", payload: { definition, summary: "新增测试状态", impactDeviceIds: ["dev-001"], impactPointIds: ["point-001"] }, meta: fullMeta });
    expect(next.statusDefinitions.some((item) => item.id === definition.id)).toBe(false);
    expect(next.releases[0]).toMatchObject({ objectId: definition.id, status: "待审批", requester: fullMeta.actor, version: 1 });
  });

  it("拒绝空变更说明和超长业务字段", () => {
    const noSummary = statusCenterReducer(statusCenterSeed, { type: "submit-status-change", payload: { definition: draftStatus(), summary: "", impactDeviceIds: ["dev-001"], impactPointIds: ["point-001"] }, meta: fullMeta });
    expect(noSummary.releases).toHaveLength(0);
    expect(noSummary.lastError).toContain("变更说明");
    expect(validateStatusDefinition(draftStatus({ name: "超".repeat(61) }), statusCenterSeed)).toContain("超过允许长度");
    expect(validateIncidentRule(draftRule({ sop: "长".repeat(501) }), statusCenterSeed)).toContain("超过允许长度");
  });

  it("发起人不能自批，非发起审批人可以批准", () => {
    const submitted = statusCenterReducer(statusCenterSeed, { type: "submit-rule-change", payload: { rule: draftRule(), summary: "新增规则", impactDeviceIds: ["dev-001"], impactPointIds: ["point-001"] }, meta: fullMeta });
    const selfApproved = statusCenterReducer(submitted, { type: "approve-release", payload: { releaseId: submitted.releases[0].id }, meta: fullMeta });
    expect(selfApproved.releases[0].status).toBe("待审批");
    expect(selfApproved.lastError).toContain("不能审批自己的配置");
    const reviewer = { ...fullMeta, actor: "配置审批人乙" };
    const approved = statusCenterReducer(submitted, { type: "approve-release", payload: { releaseId: submitted.releases[0].id }, meta: reviewer });
    expect(approved.releases[0].status).toBe("已批准");
  });

  it("发布冻结审批目标并保留逐设备结果，失败设备必须显式重试", () => {
    const submitted = statusCenterReducer(statusCenterSeed, { type: "submit-status-change", payload: { definition: draftStatus(), summary: "测试多设备发布", impactDeviceIds: fullMeta.deviceIds, impactPointIds: fullMeta.pointIds }, meta: fullMeta });
    const approved = statusCenterReducer(submitted, { type: "approve-release", payload: { releaseId: submitted.releases[0].id }, meta: { ...fullMeta, actor: "审批人乙" } });
    const outside = statusCenterReducer(approved, { type: "publish-release", payload: { releaseId: approved.releases[0].id, targets: [{ id: "outside", name: "越界设备" }] }, meta: fullMeta });
    expect(outside.lastError).toContain("超出审批");
    const published = statusCenterReducer(approved, { type: "publish-release", payload: { releaseId: approved.releases[0].id, targets: fullMeta.deviceIds.map((id) => ({ id, name: id })) }, meta: fullMeta });
    expect(published.releases[0].status).toBe("部分失败");
    expect(published.releases[0].results.filter((item) => item.status === "失败")).toHaveLength(1);
    const retried = statusCenterReducer(published, { type: "retry-release-targets", payload: { releaseId: published.releases[0].id }, meta: fullMeta });
    expect(retried.releases[0].status).toBe("已发布");
    expect(retried.releases[0].results.every((item) => item.status === "成功")).toBe(true);
  });

  it("已有版本发布后支持回退且保留发布历史", () => {
    const current = statusCenterSeed.statusDefinitions[1];
    const changed = { ...current, name: "离线（新版）" };
    const submitted = statusCenterReducer(statusCenterSeed, { type: "submit-status-change", payload: { definition: changed, summary: "调整名称", impactDeviceIds: ["dev-001"], impactPointIds: ["point-001"] }, meta: fullMeta });
    const approved = statusCenterReducer(submitted, { type: "approve-release", payload: { releaseId: submitted.releases[0].id }, meta: { ...fullMeta, actor: "审批人乙" } });
    const published = statusCenterReducer(approved, { type: "publish-release", payload: { releaseId: approved.releases[0].id, targets: [{ id: "dev-001", name: "设备一" }] }, meta: fullMeta });
    const rolledBack = statusCenterReducer(published, { type: "rollback-release", payload: { releaseId: published.releases[0].id }, meta: fullMeta });
    expect(rolledBack.statusDefinitions.find((item) => item.id === current.id)?.name).toBe(current.name);
    expect(rolledBack.releases[0].status).toBe("已回退");
  });

  it("点位范围账号不能提交影响企业其他设备的配置", () => {
    const limited = { ...fullMeta, tenantNames: ["星舟具身智能"], pointIds: ["point-001"], deviceIds: ["dev-001"] };
    const next = statusCenterReducer(statusCenterSeed, { type: "submit-rule-change", payload: { rule: draftRule({ tenant: "星舟具身智能", scopeLevel: "企业", scopeTargets: ["星舟具身智能"] }), summary: "越界企业规则", impactDeviceIds: ["dev-001", "dev-002"], impactPointIds: ["point-001", "point-002"] }, meta: limited });
    expect(next.releases).toHaveLength(0);
    expect(next.lastError).toContain("无权管理");
  });

  it("静默限制设备范围、角色和 5-1440 分钟，并可自动过期", () => {
    const denied = statusCenterReducer(statusCenterSeed, { type: "mute-device", payload: { deviceId: "dev-001", reason: "维护", minutes: 4 }, meta: fullMeta });
    expect(denied.lastError).toContain("5-1440");
    const auditDenied = statusCenterReducer(statusCenterSeed, { type: "mute-device", payload: { deviceId: "dev-001", reason: "维护", minutes: 30 }, meta: { ...fullMeta, auditOnly: true } });
    expect(auditDenied.silences).toHaveLength(0);
    const muted = statusCenterReducer(statusCenterSeed, { type: "mute-device", payload: { deviceId: "dev-001", reason: "计划维护", minutes: 30 }, meta: fullMeta });
    expect(muted.silences).toHaveLength(1);
    const expired = statusCenterReducer(muted, { type: "expire-silences", payload: { now: "2999-01-01T00:00:00.000Z" } });
    expect(expired.silences).toHaveLength(0);
  });

  it("空设备范围严格显示空数据，不回退为企业全部设备", () => {
    const scoped = statusCenterStateForScope({ ...statusCenterSeed, silences: [{ id: "silence", deviceId: "dev-001", reason: "测试", operator: "甲", createdAt: "2026-01-01", expiresAt: "2999-01-01" }] }, { ...fullMeta, deviceIds: [], pointIds: [] });
    expect(scoped.silences).toHaveLength(0);
    expect(scoped.releases).toHaveLength(0);
  });

  it("品牌、场景和型号配置按当前授权对象投影，审计不会向普通配置角色全平台展开", () => {
    const scopedState = {
      ...statusCenterSeed,
      statusDefinitions: [
        draftStatus({ id: "visible-brand", scopeLevel: "品牌", scopeTargets: ["品牌一"] }),
        draftStatus({ id: "hidden-brand", code: "HIDDEN_BRAND", scopeLevel: "品牌", scopeTargets: ["其他品牌"] }),
      ],
      audits: [
        { id: "own", time: "现在", actor: fullMeta.actor, action: "查看", object: "visible-brand", risk: "L1" as const, result: "成功" as const, detail: "本人记录" },
        { id: "other", time: "现在", actor: "其他企业管理员", action: "查看", object: "hidden-brand", risk: "L1" as const, result: "成功" as const, detail: "其他范围记录" },
      ],
    };
    const visible = statusCenterStateForScope(scopedState, { ...fullMeta, roles: ["商品/配置管理员"] });
    expect(visible.statusDefinitions.map((item) => item.id)).toEqual(["visible-brand"]);
    expect(visible.audits.map((item) => item.id)).toEqual(["own"]);
  });

  it("当前范围内的零设备影响配置仍保留发布记录", () => {
    const release = { id: "zero-impact", objectType: "状态字典" as const, objectId: "future-model", objectName: "未来型号状态", tenant: "*", scopeLevel: "平台默认" as const, scopeTargets: [], summary: "预先配置", impactDeviceIds: [], impactPointIds: [], requester: "甲", approver: "乙", status: "待审批" as const, createdAt: "现在", version: 1, draft: draftStatus(), results: [] };
    const visible = statusCenterStateForScope({ ...statusCenterSeed, releases: [release] }, fullMeta);
    expect(visible.releases.map((item) => item.id)).toContain("zero-impact");
  });

  it("运行快照聚合四类状态、异常关联与时间线", () => {
    const appState = createInitialState();
    const rows = buildDeviceHealthRows(appState, statusCenterSeed);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual(expect.objectContaining({ connectionStatus: expect.any(String), operationStatus: expect.any(String), businessStatus: expect.any(String), safetyStatus: expect.any(String) }));
    expect(buildDeviceTimeline(appState, statusCenterSeed, rows[0].deviceId).some((item) => item.kind === "状态")).toBe(true);
  });

  it("企业级影响范围使用完整拓扑而非当前筛选投影", () => {
    const appState = createInitialState();
    const tenant = appState.brands[0].tenant;
    const impact = impactForScope(appState, tenant, "企业", [tenant]);
    const expectedPointNames = new Set(appState.points.filter((point) => appState.brands.find((brand) => brand.name === point.brand)?.tenant === tenant).map((point) => point.name));
    expect(impact.deviceIds).toHaveLength(appState.devices.filter((device) => expectedPointNames.has(device.point)).length);
  });
});
