import { describe, expect, it } from "vitest";
import { createInitialState } from "../../data/mockData";
import { actorFor, seedState } from "./store";
import { decision, resetDemo, submitBatch, type Actor } from "./domain";
describe("退款演示数据与权限映射", () => {
  it("仅饮品点位生成完整场景，父支付金额等于子单分摊", () => {
    const app = createInitialState(),
      s = seedState(app);
    expect(s.orders.filter((o) => o.id.startsWith("TD-"))).toHaveLength(
      app.points.filter((p) => p.scenario === "饮品亭").length * 14,
    );
    const grouped = new Map<string, number>();
    for (const o of s.orders.filter((o) => o.paymentId))
      grouped.set(o.paymentId, (grouped.get(o.paymentId) || 0) + o.paidCents);
    for (const o of s.orders.filter((o) => o.paymentId))
      expect(grouped.get(o.paymentId)).toBe(o.paymentPaidCents);
    expect(s.orders.every((o) => Date.parse(o.createdAt) <= Date.now())).toBe(
      true,
    );
  });
  it("历史订单保留原始金额但不虚构支付关联或把异常当作失败", () => {
    const app = createInitialState(),
      s = seedState(app),
      o = s.orders.find((o) => o.id === "ORD-20260705-002")!;
    expect(o).toMatchObject({
      paymentId: "",
      paidCents: 2600,
      fulfillment: "异常待确认",
    });
    const a: Actor = {
      id: "a",
      name: "a",
      pointIds: [o.pointId],
      canRefund: true,
      canCancel: true,
      canApprove: true,
      canConfigure: true,
    };
    expect(decision(s, o, a).allowed).toBe(false);
  });
  it("恢复演示订单仅影响当前范围，保留其他点位和历史订单", () => {
    const app = createInitialState(),
      s = seedState(app),
      o = s.orders[0];
    const a: Actor = {
      id: "a",
      name: "a",
      pointIds: [o.pointId],
      canRefund: true,
      canCancel: true,
      canApprove: true,
      canConfigure: true,
    };
    const submitted = submitBatch(s, [o.id], "退款", a, "");
    const reset = resetDemo(submitted, seedState(app), a);
    expect(reset.refunds.some((r) => r.orderId === o.id)).toBe(false);
    expect(reset.orders).toHaveLength(s.orders.length);
    expect(reset.orders.filter((o) => o.pointId !== a.pointIds[0])).toEqual(
      s.orders.filter((o) => o.pointId !== a.pointIds[0]),
    );
    expect(() => resetDemo(s, s, { ...a, canConfigure: false })).toThrow(
      "权限",
    );
  });
  it("审计账号不能退款或审核，平台支持可发起与审核", () => {
    const app = createInitialState();
    app.currentUserId = "usr-000";
    expect(actorFor(app)).toMatchObject({
      canRefund: true,
      canApprove: true,
      canConfigure: true,
    });
    app.currentUserId = "usr-014";
    expect(actorFor(app)).toMatchObject({
      canRefund: false,
      canApprove: false,
      canConfigure: false,
    });
  });
});
