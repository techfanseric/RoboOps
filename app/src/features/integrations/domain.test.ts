import { describe, expect, it } from "vitest";
import { integrationRules, visibleSyncJobs } from "./domain";
import { integrationStorageKey } from "./IntegrationCenterPage";

describe("integrationRules", () => {
  it("平台、企业管理员与开发者使用同一个凭证事实源", () => {
    expect(integrationStorageKey()).toBe("roboops-integrations-v2:shared");
  });

  it("共享状态中的同步任务仍按企业范围投影", () => {
    const jobs = [
      { id: "S-1", enterprise: "企业甲", name: "甲任务", direction: "导出" as const, resource: "订单", progress: 1, total: 1, status: "成功" as const, updatedAt: 1 },
      { id: "S-2", enterprise: "企业乙", name: "乙任务", direction: "导入" as const, resource: "点位", progress: 0, total: 1, status: "失败" as const, updatedAt: 1 },
    ];
    expect(visibleSyncJobs(jobs, ["企业甲"]).map((job) => job.id)).toEqual(["S-1"]);
    expect(visibleSyncJobs(jobs, [], true)).toHaveLength(2);
  });
  it("只允许审批权限范围非空的待审批申请", () => {
    expect(integrationRules.canApprove({ status: "待审批", scopes: ["device:read"] })).toBe(true);
    expect(integrationRules.canApprove({ status: "待审批", scopes: [] })).toBe(false);
    expect(integrationRules.canApprove({ status: "已启用", scopes: ["device:read"] })).toBe(false);
  });

  it("企业授权同时受启用状态与有效期约束", () => {
    const now = new Date("2026-08-19T12:00:00");
    expect(integrationRules.authorizationIsActive({ status: "已启用", expiresAt: "2026-08-19" }, now)).toBe(true);
    expect(integrationRules.authorizationIsActive({ status: "已启用", expiresAt: "2026-08-18" }, now)).toBe(false);
    expect(integrationRules.authorizationIsActive({ status: "已停用", expiresAt: "2027-08-19" }, now)).toBe(false);
  });

  it("同步中任务不可修改且五分钟无进度判为停滞", () => {
    expect(integrationRules.canMutateSync({ status: "同步中" })).toBe(false);
    expect(integrationRules.canMutateSync({ status: "失败" })).toBe(true);
    expect(integrationRules.isStalled({ status: "同步中", updatedAt: 1_000 }, 301_001)).toBe(true);
    expect(integrationRules.isStalled({ status: "同步中", updatedAt: 1_000 }, 301_000)).toBe(false);
  });

  it("配额必须为正整数且未被耗尽", () => {
    expect(integrationRules.withinQuota(99, 100)).toBe(true);
    expect(integrationRules.withinQuota(100, 100)).toBe(false);
    expect(integrationRules.withinQuota(0, 1.5)).toBe(false);
  });
});
