import type { AppState } from "../../types/core";
import {
  currentUser,
  currentUserRoles,
  currentUserPermissionPackages,
  filteredPoints,
  menuAccessPolicy,
} from "../../services/operations";
import {
  defaultPolicy,
  type Actor,
  type Order,
  type RefundState,
  type Fulfillment,
} from "./domain";
export const STORAGE_KEY = "roboops-refunds-v1";
export function actorFor(app: AppState): Actor {
  const roles = currentUserRoles(app),
    packages = currentUserPermissionPackages(app),
    user = currentUser(app);
  const allowed = menuAccessPolicy(app, "orders").allowed;
  const readonly = roles.some((r) =>
    ["审计员", "数据查看员", "财务/结算"].includes(r),
  );
  const operate = roles.some((r) =>
    [
      "平台支持",
      "租户管理员",
      "业务负责人",
      "运营负责人",
      "点位负责人",
      "客服/售后",
      "试运行操作员",
    ].includes(r),
  );
  return {
    id: user.id,
    name: user.name,
    pointIds: filteredPoints(app).map((p) => p.id),
    canRefund:
      allowed && !readonly && (operate || packages.includes("退款发起包")),
    canCancel:
      allowed && !readonly && (operate || packages.includes("订单处理包")),
    canApprove:
      allowed &&
      !readonly &&
      (roles.some((r) =>
        ["平台支持", "退款审批人", "业务负责人"].includes(r),
      ) ||
        packages.includes("退款审批包")),
    canConfigure:
      allowed &&
      !readonly &&
      roles.some((r) => ["平台支持", "租户管理员", "业务负责人"].includes(r)),
  };
}
export function seedState(app: AppState): RefundState {
  const s: RefundState = {
    version: 1,
    orders: [],
    refunds: [],
    batches: [],
    logs: [],
    policies: {},
  };
  const now = Date.now();
  for (const point of app.points.filter((p) => p.scenario === "饮品亭")) {
    const brand = app.brands.find((b) => b.name === point.brand);
    const tenantId = app.tenants.find((t) => t.name === brand?.tenant)?.id;
    if (!tenantId) continue;
    s.policies[tenantId] = { ...defaultPolicy };
    const device =
      app.devices.find(
        (d) => d.point === point.name && d.capability.includes("制饮"),
      )?.sn ||
      app.devices.find((d) => d.point === point.name)?.sn ||
      "DRK-ARM-1128";
    const states: Fulfillment[] = [
      "失败",
      "已完成",
      "制茶中",
      "待制作",
      "失败",
      "失败",
      "制茶中",
      "已取消",
      "已取餐",
      "失败",
      "失败",
      "异常待确认",
      "待制作",
      "已完成",
    ];
    states.forEach((fulfillment, i) => {
      const id = `TD-${point.id}-${String(i + 1).padStart(3, "0")}`;
      const parentId = `MP-${point.id}-${i < 3 ? "0819" : `09${String(i).padStart(2, "0")}`}`;
      const o: Order = {
        id,
        tenantId,
        pointId: point.id,
        point: point.name,
        device,
        parentId,
        externalItemId: `${parentId}-${i + 1}`,
        paymentId: `PAY-${parentId}`,
        source: "小程序",
        product: ["桂花乌龙轻乳茶", "茉莉鲜奶茶", "山茶花冷萃"][i % 3],
        specification: ["大杯 / 少糖 / 少冰", "中杯 / 标准糖 / 去冰"][i % 2],
        quantity: 1,
        paidCents: [1800, 2200, 2000][i % 3],
        paymentPaidCents: i < 3 ? 6000 : [1800, 2200, 2000][i % 3],
        currency: "CNY",
        paid: true,
        createdAt: new Date(now - (i + 1) * 180000).toISOString(),
        fulfillment,
        failureReason: fulfillment === "失败" ? "流量计异常，制作未完成" : "",
        cancelStatus: fulfillment === "已取消" ? "退单成功" : "未退单",
        cancelAttempts: 0,
        version: 1,
        demoOutcome:
          i === 4
            ? "首次退款失败"
            : i === 5
              ? "首次结果未知"
              : i === 6
                ? "首次退单失败"
                : "成功",
      };
      if (i === 9) {
        o.source = "历史订单";
        o.paymentId = "";
        o.externalItemId = "";
      }
      if (i === 12) {
        o.source = "后台手工";
        o.parentId = "";
        o.paymentId = "";
        o.paid = false;
        o.paidCents = 0;
        o.paymentPaidCents = 0;
      }
      if (i === 13) o.source = "设备扫码";
      s.orders.push(o);
      if ([7, 8, 10, 13].includes(i)) {
        s.refunds.push({
          id: `RF-SEED-${point.id}-${i}`,
          orderId: id,
          batchId: "历史记录",
          amountCents: i === 8 ? 800 : o.paidCents,
          status: i === 10 ? "退款处理中" : i === 13 ? "待审核" : "退款成功",
          reason: i === 13 ? "顾客反馈口味异常" : "订单售后",
          applicantId: "seed-customer-service",
          applicant: "客服 · 沈悦",
          createdAt: o.createdAt,
          updatedAt: o.createdAt,
          detail: i === 13 ? "已完成订单，等待售后审核" : "原路退款",
          channelRefundId: [7, 8].includes(i) ? `MOCK-HISTORY-${i}` : undefined,
        });
      }
    });
  }
  return mergeRequests(s, app);
}
export function mergeRequests(state: RefundState, app: AppState): RefundState {
  const s = structuredClone(state);
  for (const req of app.businessRequests) {
    if (s.orders.some((o) => o.id === req.id)) continue;
    const point = app.points.find((p) => p.name === req.point),
      brand = app.brands.find((b) => b.name === req.brand);
    const tenantId = app.tenants.find((t) => t.name === brand?.tenant)?.id;
    if (!point || !tenantId) continue;
    // Existing requests carry no payment/item mapping. Never invent refundable payment data.
    s.orders.push({
      id: req.id,
      tenantId,
      pointId: point.id,
      point: point.name,
      device: req.device,
      parentId: "",
      externalItemId: "",
      paymentId: "",
      source: "历史订单",
      product: req.label,
      specification: "原订单信息",
      quantity: 1,
      paidCents: Math.round(req.amount * 100),
      paymentPaidCents: Math.round(req.amount * 100),
      currency: "CNY",
      paid: req.paid === "已支付",
      createdAt: "2026-07-05T10:18:00+08:00",
      fulfillment:
        req.status === "exception"
          ? "异常待确认"
          : req.status === "delivered"
            ? "已取餐"
            : req.status === "awaiting_delivery"
              ? "已完成"
              : "制茶中",
      failureReason: "",
      cancelStatus: "未退单",
      cancelAttempts: 0,
      version: 1,
      demoOutcome: "成功",
    });
  }
  return s;
}
export function loadState(app: AppState): RefundState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (
        s.version === 1 &&
        Array.isArray(s.orders) &&
        Array.isArray(s.refunds) &&
        Array.isArray(s.batches) &&
        Array.isArray(s.logs) &&
        s.policies
      )
        return mergeRequests(s, app);
    }
  } catch {
    /* Recover only this feature's demo state. */
  }
  return seedState(app);
}
