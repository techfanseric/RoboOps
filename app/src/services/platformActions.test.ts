import { describe, expect, it } from "vitest";
import { createInitialState } from "../data/mockData";
import { appReducer } from "./operations";

describe("平台级主状态动作", () => {
  it("集成管理员与开发者演示账号可登录", () => {
    const admin = appReducer(createInitialState(), { type: "login", identifier: "方衡", password: "RoboOps@2026" });
    expect(admin.auth.authenticated).toBe(true);
    expect(admin.currentUserId).toBe("usr-020");
    const developer = appReducer(createInitialState(), { type: "login", identifier: "许工", password: "RoboOps@2026" });
    expect(developer.auth.authenticated).toBe(true);
    expect(developer.currentUserId).toBe("usr-021");
  });

  it("平台支持可停用企业并写入 L4 审计", () => {
    const state = { ...createInitialState(), currentUserId: "usr-000" };
    const next = appReducer(state, { type: "platform-toggle-tenant", tenantId: "tn-001" });
    expect(next.tenants.find((item) => item.id === "tn-001")?.status).toBe("停用");
    expect(next.auditLogs[0]).toMatchObject({ action: "变更企业状态", object: "tn-001", risk: "L4", result: "成功" });
  });

  it("非平台角色不可变更企业状态", () => {
    const state = { ...createInitialState(), currentUserId: "usr-006" };
    const next = appReducer(state, { type: "platform-toggle-tenant", tenantId: "tn-001" });
    expect(next.tenants.find((item) => item.id === "tn-001")?.status).toBe("启用");
    expect(next.auditLogs[0]).toMatchObject({ action: "变更企业状态", result: "已拒绝" });
  });

  it("禁止平台支持停用自己的当前账号", () => {
    const state = { ...createInitialState(), currentUserId: "usr-000" };
    const next = appReducer(state, { type: "platform-toggle-user", userId: state.currentUserId });
    expect(next.users.find((item) => item.id === state.currentUserId)?.status).toBe("启用");
    expect(next.auditLogs[0]).toMatchObject({ action: "变更账号状态", result: "已拒绝" });
  });

  it("领域动作可汇入主系统审计", () => {
    const state = createInitialState();
    const next = appReducer(state, { type: "feature-audit", action: "轮换 MQTT 凭证", object: "mqtt-001", risk: "L4", result: "成功", detail: "凭证版本升级" });
    expect(next.auditLogs[0]).toMatchObject({ action: "轮换 MQTT 凭证", object: "mqtt-001", risk: "L4", detail: "凭证版本升级" });
  });
});
