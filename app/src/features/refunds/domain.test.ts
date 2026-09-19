import { describe, expect, it } from "vitest";
import {
  available,
  changePolicy,
  decision,
  defaultPolicy,
  refunded,
  reviewRefund,
  settle,
  simulateFailure,
  submitBatch,
  type Actor,
  type Order,
  type RefundState,
} from "./domain";
const actor: Actor = {
  id: "operator",
  name: "运营",
  pointIds: ["p"],
  canRefund: true,
  canCancel: true,
  canApprove: true,
  canConfigure: true,
};
const reviewer = { ...actor, id: "reviewer", name: "审核人" };
function fixture(): RefundState {
  const base: Order = {
    id: "a",
    tenantId: "t",
    pointId: "p",
    point: "深圳湾",
    device: "dev",
    parentId: "parent",
    externalItemId: "item-a",
    paymentId: "pay",
    source: "小程序",
    product: "鲜奶茶",
    specification: "少糖",
    quantity: 1,
    paidCents: 1800,
    paymentPaidCents: 4000,
    currency: "CNY",
    paid: true,
    createdAt: new Date().toISOString(),
    fulfillment: "失败",
    failureReason: "流量异常",
    cancelStatus: "未退单",
    cancelAttempts: 0,
    version: 1,
    demoOutcome: "成功",
  };
  return {
    version: 1,
    orders: [
      base,
      {
        ...base,
        id: "b",
        externalItemId: "item-b",
        paidCents: 2200,
        fulfillment: "制茶中",
      },
    ],
    refunds: [],
    batches: [],
    logs: [],
    policies: { t: { ...defaultPolicy } },
  };
}
describe("退款金额、状态与幂等", () => {
  it("失败订单免审核并以支付回执为成功依据，履约状态独立", () => {
    const s = submitBatch(fixture(), ["a"], "退款", actor, "");
    expect(s.refunds[0]).toMatchObject({
      status: "退款处理中",
      amountCents: 1800,
    });
    expect(available(s, s.orders[0])).toBe(0);
    const done = settle(s, actor);
    expect(done.refunds[0].status).toBe("退款成功");
    expect(done.orders[0].fulfillment).toBe("失败");
    expect(decision(done, done.orders[0], actor).allowed).toBe(false);
  });
  it("部分退款不影响兄弟子单，剩余金额可以再次退款", () => {
    let s = settle(
      submitBatch(fixture(), ["a"], "退款", actor, "", { a: 700 }),
      actor,
    );
    expect(available(s, s.orders[0])).toBe(1100);
    expect(available(s, s.orders[1])).toBe(2200);
    s = settle(submitBatch(s, ["a"], "退款", actor, ""), actor);
    expect(refunded(s, "a")).toBe(1800);
  });
  it("拒绝超额、负数和非整数分，部分有效批次仍逐单处理", () => {
    for (const amount of [1801, -1, 0, 0.5, NaN]) {
      const s = submitBatch(fixture(), ["a"], "退款", actor, "", { a: amount });
      expect(s.refunds).toHaveLength(0);
      expect(s.batches[0].entries[0].skipped).toBeTruthy();
    }
    const s = fixture();
    s.orders[1].paymentId = "";
    const next = submitBatch(s, ["a", "b"], "退款", actor, "退款");
    expect(next.refunds).toHaveLength(1);
    expect(next.batches[0].entries[1].skipped).toContain("关联");
  });
  it("同一批次token幂等，重复订单去重，另一批次也不能重复冻结金额", () => {
    const s = submitBatch(
      fixture(),
      ["a", "a"],
      "退款",
      actor,
      "",
      {},
      "token",
    );
    expect(s.refunds).toHaveLength(1);
    expect(submitBatch(s, ["a"], "退款", actor, "", {}, "token")).toBe(s);
    expect(submitBatch(s, ["a"], "退款", actor, "").refunds).toHaveLength(1);
  });
  it("共享支付余额受约束，不同租户同号支付不串单", () => {
    const s = fixture();
    s.orders.forEach((o) => (o.paymentPaidCents = 2500));
    const next = submitBatch(s, ["a", "b"], "退款", actor, "售后");
    expect(next.refunds.reduce((n, r) => n + r.amountCents, 0)).toBe(2500);
    const other = { ...s.orders[0], id: "c", tenantId: "other" };
    next.orders.push(other);
    expect(available(next, other)).toBe(1800);
  });
  it("支付结果未知保留金额，只查询原单，重复回执不重复退款", () => {
    const s = fixture();
    s.orders[0].demoOutcome = "首次结果未知";
    let next = settle(submitBatch(s, ["a"], "退款", actor, ""), actor);
    const id = next.refunds[0].id;
    expect(next.refunds[0].status).toBe("结果待确认");
    expect(available(next, next.orders[0])).toBe(0);
    next = settle(next, actor, id);
    next = settle(next, actor, id);
    expect(next.refunds).toHaveLength(1);
    expect(refunded(next, "a")).toBe(1800);
  });
  it("明确退款失败释放金额并允许新退款，历史失败记录保留", () => {
    const s = fixture();
    s.orders[0].demoOutcome = "首次退款失败";
    let next = settle(submitBatch(s, ["a"], "退款", actor, ""), actor);
    expect(next.refunds[0].status).toBe("退款失败");
    expect(available(next, next.orders[0])).toBe(1800);
    next = settle(submitBatch(next, ["a"], "退款", actor, ""), actor);
    expect(next.refunds.map((r) => r.status)).toEqual(["退款成功", "退款失败"]);
  });
});
describe("退单、审核和动态状态", () => {
  it("制茶中先审核，禁止自审，退单回执后才发起支付退款", () => {
    let s = submitBatch(fixture(), ["b"], "退款", actor, "顾客取消");
    const id = s.refunds[0].id;
    expect(s.refunds[0].status).toBe("待审核");
    expect(() => reviewRefund(s, id, true, actor, "同意")).toThrow("发起人");
    s = reviewRefund(s, id, true, reviewer, "同意");
    expect(s.refunds[0].status).toBe("待退单");
    s = settle(s, actor);
    expect(s.refunds[0].status).toBe("退款处理中");
    expect(s.orders[1].fulfillment).toBe("已取消");
    s = settle(s, actor);
    expect(s.refunds[0].status).toBe("退款成功");
  });
  it("退单失败暂停退款，重试成功后继续，退单批次结果不被后续重试覆盖", () => {
    const f = fixture();
    f.orders[1].demoOutcome = "首次退单失败";
    f.policies.t.making = "直接退款";
    let s = settle(submitBatch(f, ["b"], "退款", actor, "取消"), actor);
    expect(s.refunds[0].status).toBe("待退单");
    expect(s.orders[1].cancelStatus).toBe("退单失败");
    s = settle(submitBatch(s, ["b"], "退单", actor, ""), actor);
    expect(s.refunds[0].status).toBe("退款处理中");
    s = settle(s, actor);
    expect(s.refunds[0].status).toBe("退款成功");
    const d = fixture();
    d.orders[1].demoOutcome = "首次退单失败";
    let t = settle(submitBatch(d, ["b"], "退单", actor, ""), actor);
    const first = t.batches[0].id;
    t = settle(submitBatch(t, ["b"], "退单", actor, ""), actor);
    expect(t.batches.find((b) => b.id === first)?.entries[0].cancelStatus).toBe(
      "退单失败",
    );
  });
  it("单独退单不产生退款，已完成订单不能设备退单", () => {
    let s = settle(submitBatch(fixture(), ["b"], "退单", actor, ""), actor);
    expect(s.refunds).toHaveLength(0);
    expect(s.orders[1].fulfillment).toBe("已取消");
    s.orders[0].fulfillment = "已完成";
    s = submitBatch(s, ["a"], "退单", actor, "");
    expect(s.batches[0].entries[0].skipped).toBeTruthy();
  });
  it("审核驳回释放金额，批准前按最新状态重新校验", () => {
    const s = submitBatch(fixture(), ["b"], "退款", actor, "售后");
    const id = s.refunds[0].id;
    const denied = reviewRefund(s, id, false, reviewer, "无退款依据");
    expect(available(denied, denied.orders[1])).toBe(2200);
    s.orders[1].fulfillment = "已完成";
    s.policies.t.completed = "不可退款";
    expect(() => reviewRefund(s, id, true, reviewer, "同意")).toThrow(
      "状态已变化",
    );
  });
  it("新失败回执按自动规则退款，已有待审核申请自动转免审", () => {
    let s = changePolicy(
      fixture(),
      "t",
      { ...defaultPolicy, failed: "自动退款" },
      actor,
    );
    expect(s.refunds).toHaveLength(0);
    s = simulateFailure(s, "b", actor);
    expect(s.refunds[0]).toMatchObject({
      status: "退款处理中",
      applicantId: "system-refund",
    });
    let pending = submitBatch(fixture(), ["b"], "退款", actor, "售后");
    pending = simulateFailure(pending, "b", actor);
    expect(pending.refunds).toHaveLength(1);
    expect(pending.refunds[0].status).toBe("退款处理中");
  });
  it("异常不等于失败，缺关联与未支付不可退款，失败忽略其他状态的禁退策略", () => {
    const s = fixture();
    s.orders[0].fulfillment = "异常待确认";
    expect(decision(s, s.orders[0], actor).allowed).toBe(false);
    s.orders[0].fulfillment = "失败";
    s.policies.t.making = "不可退款";
    expect(decision(s, s.orders[0], actor).approval).toBe(false);
    s.orders[0].paymentId = "";
    expect(decision(s, s.orders[0], actor).reason).toContain("关联");
    s.orders[0].paid = false;
    expect(decision(s, s.orders[0], actor).reason).toContain("未支付");
  });
  it("只读、空范围、越权审核、局部范围改企业规则均被拒绝", () => {
    const s = fixture();
    expect(
      submitBatch(s, ["a"], "退款", { ...actor, canRefund: false }, "").refunds,
    ).toHaveLength(0);
    expect(
      submitBatch(s, ["a"], "退款", { ...actor, pointIds: [] }, "").refunds,
    ).toHaveLength(0);
    const pending = submitBatch(s, ["b"], "退款", actor, "售后");
    expect(() =>
      reviewRefund(
        pending,
        pending.refunds[0].id,
        true,
        { ...reviewer, pointIds: [] },
        "同意",
      ),
    ).toThrow("权限");
    s.orders[1].pointId = "outside";
    expect(() => changePolicy(s, "t", defaultPolicy, actor)).toThrow("权限");
  });
});
