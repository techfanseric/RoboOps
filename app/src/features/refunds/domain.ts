export type Fulfillment =
  | "待制作"
  | "制茶中"
  | "已完成"
  | "已取餐"
  | "失败"
  | "已取消"
  | "异常待确认";
export type RefundStatus =
  | "待审核"
  | "待退单"
  | "退款处理中"
  | "退款成功"
  | "退款失败"
  | "结果待确认"
  | "已驳回";
export type CancelStatus = "未退单" | "退单处理中" | "退单成功" | "退单失败";
export type Rule = "直接退款" | "审核后退款" | "不可退款";
export interface Policy {
  failed: "人工发起" | "自动退款";
  waiting: Rule;
  making: Rule;
  completed: Rule;
  stopBeforeRefund: boolean;
}
export const defaultPolicy: Policy = {
  failed: "人工发起",
  waiting: "直接退款",
  making: "审核后退款",
  completed: "审核后退款",
  stopBeforeRefund: true,
};
export interface Order {
  id: string;
  tenantId: string;
  pointId: string;
  point: string;
  device: string;
  parentId: string;
  externalItemId: string;
  paymentId: string;
  source: "小程序" | "设备扫码" | "后台手工" | "历史订单";
  product: string;
  specification: string;
  quantity: number;
  paidCents: number;
  paymentPaidCents: number;
  currency: "CNY";
  paid: boolean;
  createdAt: string;
  fulfillment: Fulfillment;
  failureReason: string;
  cancelStatus: CancelStatus;
  cancelAttempts: number;
  version: number;
  demoOutcome: "成功" | "首次退款失败" | "首次结果未知" | "首次退单失败";
}
export interface Refund {
  id: string;
  orderId: string;
  batchId: string;
  amountCents: number;
  status: RefundStatus;
  reason: string;
  applicantId: string;
  applicant: string;
  approver?: string;
  createdAt: string;
  updatedAt: string;
  channelRefundId?: string;
  detail: string;
}
export interface Batch {
  id: string;
  action: "退款" | "退单";
  createdAt: string;
  operator: string;
  entries: Array<{
    orderId: string;
    refundId?: string;
    skipped?: string;
    cancelAttempt?: number;
    cancelStatus?: CancelStatus;
  }>;
}
export interface Audit {
  id: string;
  orderId: string;
  time: string;
  operator: string;
  action: string;
  detail: string;
}
export interface RefundState {
  version: 1;
  orders: Order[];
  refunds: Refund[];
  batches: Batch[];
  logs: Audit[];
  policies: Record<string, Policy>;
}
export interface Actor {
  id: string;
  name: string;
  pointIds: string[];
  canRefund: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canConfigure: boolean;
}
export interface Decision {
  allowed: boolean;
  approval: boolean;
  stop: boolean;
  available: number;
  reason: string;
}
export const activeStatuses: RefundStatus[] = [
  "待审核",
  "待退单",
  "退款处理中",
  "结果待确认",
];
export const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
export const policyFor = (s: RefundState, o: Order) =>
  s.policies[o.tenantId] || defaultPolicy;
export const visible = (o: Order, a: Actor) => a.pointIds.includes(o.pointId);
export const refunded = (s: RefundState, id: string) =>
  s.refunds
    .filter((r) => r.orderId === id && r.status === "退款成功")
    .reduce((n, r) => n + r.amountCents, 0);
const committed = (r: Refund) =>
  r.status === "退款成功" || activeStatuses.includes(r.status);
export function available(s: RefundState, o: Order) {
  if (!o.paid || !o.paymentId || !o.externalItemId) return 0;
  const childUsed = s.refunds
    .filter((r) => r.orderId === o.id && committed(r))
    .reduce((n, r) => n + r.amountCents, 0);
  const siblings = new Set(
    s.orders
      .filter((x) => x.tenantId === o.tenantId && x.paymentId === o.paymentId)
      .map((x) => x.id),
  );
  const paymentUsed = s.refunds
    .filter((r) => siblings.has(r.orderId) && committed(r))
    .reduce((n, r) => n + r.amountCents, 0);
  return Math.max(
    0,
    Math.min(o.paidCents - childUsed, o.paymentPaidCents - paymentUsed),
  );
}
export function refundLabel(s: RefundState, o: Order): string {
  const latest = s.refunds.find((r) => r.orderId === o.id);
  if (latest && activeStatuses.includes(latest.status)) return latest.status;
  const total = refunded(s, o.id);
  if (o.paidCents > 0 && total >= o.paidCents) return "已全额退款";
  if (latest && ["退款失败", "已驳回"].includes(latest.status))
    return latest.status;
  return total > 0 ? "部分已退款" : "未退款";
}
export function decision(s: RefundState, o: Order, a: Actor): Decision {
  const remaining = available(s, o);
  const deny = (reason: string): Decision => ({
    allowed: false,
    approval: false,
    stop: false,
    available: remaining,
    reason,
  });
  if (!visible(o, a) || !a.canRefund) return deny("没有该订单的退款权限");
  if (!o.paid || !o.paidCents) return deny("订单未支付或无需支付");
  if (!o.paymentId || !o.externalItemId) return deny("支付关联待补齐");
  if (
    s.refunds.some(
      (r) => r.orderId === o.id && activeStatuses.includes(r.status),
    )
  )
    return deny("已有处理中退款，请查看原记录");
  if (remaining <= 0) return deny("已无可退金额");
  if (o.fulfillment === "异常待确认") return deny("异常尚未确认为订单失败");
  const policy = policyFor(s, o);
  const rule =
    o.fulfillment === "失败" || o.fulfillment === "已取消"
      ? "直接退款"
      : o.fulfillment === "待制作"
        ? policy.waiting
        : o.fulfillment === "制茶中"
          ? policy.making
          : policy.completed;
  if (rule === "不可退款") return deny("当前订单状态不允许退款");
  const stop =
    policy.stopBeforeRefund && ["待制作", "制茶中"].includes(o.fulfillment);
  return {
    allowed: true,
    approval: rule === "审核后退款",
    stop,
    available: remaining,
    reason:
      o.fulfillment === "失败"
        ? "失败订单 · 免审核"
        : `${rule}${stop ? " · 先退单" : ""}`,
  };
}
export function cancelReason(o: Order, a: Actor): string {
  if (!a.canCancel || !visible(o, a)) return "没有该订单的退单权限";
  if (o.cancelStatus === "退单成功") return "已退单，不可重复操作";
  if (o.cancelStatus === "退单处理中") return "退单正在处理中";
  if (!["待制作", "制茶中"].includes(o.fulfillment))
    return "当前履约已结束或状态未确认，无需退单";
  return "";
}
const uid = (prefix: string) =>
  `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
function log(
  s: RefundState,
  orderId: string,
  operator: string,
  action: string,
  detail: string,
) {
  s.logs.unshift({
    id: uid("LOG"),
    orderId,
    operator,
    action,
    detail,
    time: new Date().toISOString(),
  });
}
function startCancellation(o: Order) {
  o.cancelStatus = "退单处理中";
  o.cancelAttempts++;
  o.version++;
}
export function submitBatch(
  state: RefundState,
  ids: string[],
  action: "退款" | "退单",
  actor: Actor,
  reason: string,
  amounts: Record<string, number> = {},
  token = uid("BATCH"),
) {
  if (state.batches.some((b) => b.id === token)) return state;
  const s = structuredClone(state);
  const batch: Batch = {
    id: token,
    action,
    createdAt: new Date().toISOString(),
    operator: actor.name,
    entries: [],
  };
  for (const id of new Set(ids)) {
    const o = s.orders.find((x) => x.id === id);
    if (!o || !visible(o, actor)) continue;
    if (action === "退单") {
      const denial = cancelReason(o, actor);
      batch.entries.push({ orderId: id, skipped: denial || undefined });
      if (!denial) {
        startCancellation(o);
        const entry = batch.entries[batch.entries.length - 1];
        entry.cancelAttempt = o.cancelAttempts;
        entry.cancelStatus = o.cancelStatus;
        log(
          s,
          id,
          actor.name,
          "发起退单",
          reason || "取消履约，不涉及支付退款",
        );
      }
      continue;
    }
    const d = decision(s, o, actor);
    const amount = amounts[id] ?? d.available;
    const denial = !d.allowed
      ? d.reason
      : !Number.isInteger(amount) || amount <= 0 || amount > d.available
        ? "退款金额无效或超过剩余可退金额"
        : !reason.trim() && o.fulfillment !== "失败"
          ? "请填写退款原因"
          : "";
    if (denial) {
      batch.entries.push({ orderId: id, skipped: denial });
      continue;
    }
    const r: Refund = {
      id: uid("RF"),
      orderId: id,
      batchId: token,
      amountCents: amount,
      status: d.approval ? "待审核" : d.stop ? "待退单" : "退款处理中",
      reason: reason.trim() || o.failureReason || "订单失败",
      applicantId: actor.id,
      applicant: actor.name,
      createdAt: batch.createdAt,
      updatedAt: batch.createdAt,
      detail: d.reason,
    };
    s.refunds.unshift(r);
    batch.entries.push({ orderId: id, refundId: r.id });
    if (!d.approval && d.stop && o.cancelStatus !== "退单处理中")
      startCancellation(o);
    log(
      s,
      id,
      actor.name,
      "发起退款",
      `${money(amount)} · ${r.status} · ${r.reason}`,
    );
  }
  s.batches.unshift(batch);
  return s;
}
export function reviewRefund(
  state: RefundState,
  id: string,
  approved: boolean,
  actor: Actor,
  note: string,
) {
  const s = structuredClone(state),
    r = s.refunds.find((x) => x.id === id),
    o = s.orders.find((x) => x.id === r?.orderId);
  if (!r || !o || !visible(o, actor) || !actor.canApprove)
    throw new Error("没有该退款的审核权限");
  if (r.status !== "待审核") throw new Error("退款已处理，请刷新记录");
  if (r.applicantId === actor.id)
    throw new Error("发起人不能审核自己的退款，请切换审核账号");
  if (!note.trim()) throw new Error("请填写审核意见");
  r.approver = actor.name;
  if (!approved) r.status = "已驳回";
  else {
    // Recheck current fulfillment and current policy, excluding this reservation.
    const without = { ...s, refunds: s.refunds.filter((x) => x.id !== r.id) };
    const d = decision(without, o, { ...actor, canRefund: true });
    if (!d.allowed || r.amountCents > d.available)
      throw new Error(`订单状态已变化：${d.reason}`);
    r.status = d.stop ? "待退单" : "退款处理中";
    if (d.stop && o.cancelStatus !== "退单处理中") startCancellation(o);
  }
  r.detail = note.trim();
  r.updatedAt = new Date().toISOString();
  log(s, o.id, actor.name, approved ? "审核通过" : "审核驳回", note);
  return s;
}
// Deterministic mock gateway. A submitted request is not a successful payment refund.
export function settle(state: RefundState, actor: Actor, queryId?: string) {
  const s = structuredClone(state);
  for (const o of s.orders.filter((o) => visible(o, actor))) {
    if (o.cancelStatus === "退单处理中" && !queryId) {
      const failed = o.demoOutcome === "首次退单失败" && o.cancelAttempts === 1;
      o.cancelStatus = failed ? "退单失败" : "退单成功";
      if (!failed && ["待制作", "制茶中"].includes(o.fulfillment))
        o.fulfillment = "已取消";
      o.version++;
      for (const b of s.batches)
        for (const e of b.entries)
          if (
            b.action === "退单" &&
            e.orderId === o.id &&
            e.cancelAttempt === o.cancelAttempts &&
            !e.skipped
          )
            e.cancelStatus = o.cancelStatus;
      log(
        s,
        o.id,
        "设备回执",
        o.cancelStatus,
        failed ? "设备暂时离线；退款未执行，可重试退单" : "设备已确认停止履约",
      );
      for (const r of s.refunds.filter(
        (r) => r.orderId === o.id && r.status === "待退单",
      )) {
        if (!failed) r.status = "退款处理中";
        r.detail = failed
          ? "设备退单失败，退款仍保留；请重试退单"
          : "退单成功，已提交支付退款";
      }
      continue;
    }
    for (const r of s.refunds.filter((r) => r.orderId === o.id)) {
      if (
        queryId
          ? r.id !== queryId || r.status !== "结果待确认"
          : r.status !== "退款处理中"
      )
        continue;
      const attempt = s.refunds.filter((x) => x.orderId === o.id).length;
      r.status = queryId
        ? "退款成功"
        : o.demoOutcome === "首次退款失败" && attempt === 1
          ? "退款失败"
          : o.demoOutcome === "首次结果未知" && attempt === 1
            ? "结果待确认"
            : "退款成功";
      r.detail =
        r.status === "退款失败"
          ? "支付渠道暂时不可用，可重新发起退款"
          : r.status === "结果待确认"
            ? "渠道响应超时；已保留金额，请查询原退款，勿重复提交"
            : "原路退款成功";
      if (r.status === "退款成功") r.channelRefundId = `MOCK-${r.id}`;
      r.updatedAt = new Date().toISOString();
      log(
        s,
        o.id,
        "支付回执",
        r.status,
        `${money(r.amountCents)} · ${r.detail}`,
      );
    }
  }
  return s;
}
export function changePolicy(
  state: RefundState,
  tenantId: string,
  policy: Policy,
  actor: Actor,
) {
  if (
    !actor.canConfigure ||
    !state.orders.some((o) => o.tenantId === tenantId && visible(o, actor)) ||
    state.orders.some((o) => o.tenantId === tenantId && !visible(o, actor))
  )
    throw new Error("没有策略配置权限");
  const s = structuredClone(state);
  s.policies[tenantId] = policy;
  // Configuration does not retroactively refund historical orders. Automatic mode reacts to new failure events.
  return s;
}
export function simulateFailure(state: RefundState, id: string, actor: Actor) {
  const s = structuredClone(state),
    o = s.orders.find((o) => o.id === id);
  if (
    !o ||
    !visible(o, actor) ||
    !actor.canConfigure ||
    !["待制作", "制茶中", "异常待确认"].includes(o.fulfillment)
  )
    throw new Error("当前订单不能模拟失败回执");
  o.fulfillment = "失败";
  o.failureReason = "设备回执：制作失败";
  o.version++;
  log(s, id, actor.name, "收到失败回执", o.failureReason);
  const pending = s.refunds.find(
    (r) => r.orderId === id && ["待审核", "待退单"].includes(r.status),
  );
  if (pending) {
    pending.status = "退款处理中";
    pending.detail = "订单失败，转为免审核退款";
    pending.updatedAt = new Date().toISOString();
    log(s, id, "失败免审规则", "免审核退款", pending.detail);
    return s;
  }
  return policyFor(s, o).failed === "自动退款"
    ? submitBatch(
        s,
        [id],
        "退款",
        {
          ...actor,
          id: "system-refund",
          name: "自动退款规则",
          canRefund: true,
        },
        o.failureReason,
      )
    : s;
}

export function resetDemo(state: RefundState, seed: RefundState, actor: Actor) {
  if (!actor.canConfigure) throw new Error("没有重置演示数据的权限");
  const ids = new Set(
    state.orders
      .filter((o) => visible(o, actor) && o.id.startsWith("TD-"))
      .map((o) => o.id),
  );
  const replacements = seed.orders.filter(
    (o) => visible(o, actor) && o.id.startsWith("TD-"),
  );
  replacements.forEach((o) => ids.add(o.id));
  return {
    ...state,
    orders: [...replacements, ...state.orders.filter((o) => !ids.has(o.id))],
    refunds: [
      ...seed.refunds.filter((r) => ids.has(r.orderId)),
      ...state.refunds.filter((r) => !ids.has(r.orderId)),
    ],
    batches: state.batches
      .map((b) => ({
        ...b,
        entries: b.entries.filter((e) => !ids.has(e.orderId)),
      }))
      .filter((b) => b.entries.length),
    logs: state.logs.filter((l) => !ids.has(l.orderId)),
  };
}
