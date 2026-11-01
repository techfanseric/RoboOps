import { describe, expect, it } from "vitest";
import { createInitialState } from "../../data/mockData";
import { blankPointDraft, createPoint, validatePointCreation } from "./model";
function fixture() {
  const state = createInitialState();
  const payload = { ...blankPointDraft(state), name: "前城中心16楼咖啡", code: "M03", province: "广东省", city: "深圳市", area: "南山区", address: "前城中心16楼", owner: "点位负责人" };
  return { state, payload };
}
describe("点位创建", () => {
  it("保存完整字段和上线检查，保持原状态不变", () => {
    const { state, payload } = fixture();
    const next = createPoint(state, { ...payload, lat: 22.5, lng: 113.9, channel: "小程序" });
    expect(next.points[0]).toMatchObject({ ...payload, lat: 22.5, lng: 113.9, channel: "小程序" });
    expect(next.points[0].id).toMatch(/^pt-/);
    expect(next.pointChecks.filter((item) => item.point === payload.name)).toHaveLength(5);
    expect(next.pointChecks.filter((item) => item.point === payload.name && item.status === "待处理")).toHaveLength(4);
    expect(next.auditLogs[0].result).toBe("成功");
    expect(state.points.some((item) => item.name === payload.name)).toBe(false);
    expect(next.organizations.find((item) => item.id === payload.organization_id)?.points).toBe((state.organizations.find((item) => item.id === payload.organization_id)?.points || 0) + 1);
  });
  it("拒绝重名和忽略大小写的重复编码", () => {
    const { state, payload } = fixture();
    const first = createPoint(state, payload);
    expect(createPoint(first, { ...payload, name: "另一个点位", code: " m03 " }).points).toHaveLength(first.points.length);
    expect(createPoint(first, { ...payload, code: "M04" }).auditLogs[0].result).toBe("已拒绝");
  });
  it("拒绝错误组织、未知场景和直接营业", () => {
    const { state, payload } = fixture();
    for (const change of [{ organization_id: "org-002" }, { scenario: "未知场景" }, { status: "营业中" }]) {
      const next = createPoint(state, { ...payload, ...change });
      expect(next.points).toHaveLength(state.points.length);
      expect(next.auditLogs[0].result).toBe("已拒绝");
    }
  });
  it("拒绝不完整或非法坐标，允许零坐标和留空", () => {
    const { state, payload } = fixture();
    for (const change of [{ lat: 1 }, { lat: NaN, lng: 1 }, { lat: 91, lng: 1 }, { lat: 1, lng: Infinity }, { lat: 1, lng: -181 }]) expect(validatePointCreation(state, { ...payload, ...change }).length).toBeGreaterThan(0);
    expect(validatePointCreation(state, { ...payload, lat: 0, lng: 0 })).toEqual([]);
    expect(validatePointCreation(state, payload)).toEqual([]);
  });
  it("角色和城市范围在 reducer helper 二次检查", () => {
    const { state, payload } = fixture();
    state.currentUserId = "usr-008";
    expect(validatePointCreation(state, payload)).toEqual([]);
    expect(createPoint(state, { ...payload, city: "上海市" }).points).toHaveLength(state.points.length);
    state.currentUserId = "usr-003";
    expect(createPoint(state, payload).auditLogs[0].result).toBe("已拒绝");
    state.currentUserId = "usr-008";
    state.users = state.users.map((user) => user.id === "usr-008" ? { ...user, scope: "深圳湾展厅 A 点" } : user);
    expect(createPoint(state, payload).points).toHaveLength(state.points.length);
  });
});
