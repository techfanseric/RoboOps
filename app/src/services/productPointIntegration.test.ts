import { afterAll, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../data/mockData";
import { appPointsToOrderPoints } from "../features/crossDomainSnapshot";
import type { PointCreatePayload } from "../features/pointCreation/model";
import { createProductConfiguration } from "../features/products/domain";
import type { CatalogItem, AppState } from "../types/core";
import { appReducer, auditLogVisibleForCurrentUser, filteredPoints, pointReadiness, sellableVariantsAtPoint } from "./operations";

const pointDraft: PointCreatePayload = {
  name: "前城中心16楼咖啡", code: "M03", brand: "RoboTea Lab", scenario: "饮品亭",
  organization_id: "org-001", province: "广东省", city: "深圳市", area: "南山区",
  address: "前城中心16楼", owner: "点位负责人", status: "待上线", lat: 22.53, lng: 113.94, channel: "小程序",
};

let sequence = 0;
vi.stubGlobal("crypto", { randomUUID: () => `integration-${++sequence}` });
afterAll(() => vi.unstubAllGlobals());

function productDraft(name = "前城咖啡"): CatalogItem {
  const product = createProductConfiguration();
  product.sellingPoints = ["现磨咖啡", "香浓顺滑"];
  product.introduction = "现磨咖啡，香浓顺滑";
  product.prices = product.prices.map((price) => ({ ...price, original: "25.00", promotional: "20.00" }));
  product.images = [{ id: "image-1", name: "咖啡.png", url: "local-image:integration-1", width: 800, height: 600 }];
  product.pointIds = ["pt-002"];
  return { id: "new", name, brand: "RoboTea Lab", type: "饮品商品", flow: "饮品亭履约模板", attrs: [], status: "草稿", product };
}

function approveLatest(state: AppState): AppState {
  return appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
}

describe("商品和点位主状态集成", () => {
  it("城市运营创建的市后缀点位可在列表及订单桥接中使用，并保留上线阻断", () => {
    const state = createInitialState();
    const next = appReducer(state, { type: "create-point", payload: pointDraft });
    const point = next.points.find((item) => item.code === pointDraft.code)!;
    expect(point).toBeDefined();
    expect(state.points.some((item) => item.code === pointDraft.code)).toBe(false);
    expect(filteredPoints(next).map((item) => item.id)).toContain(point.id);
    expect(pointReadiness(next, point)).toMatchObject({ status: "待处理" });
    expect(pointReadiness(next, point).blockers).toEqual(expect.arrayContaining(["绑定设备", "可售商品/服务"]));
    expect(appPointsToOrderPoints(next, "tenant").find((item) => item.id === point.id)).toMatchObject({
      code: "M03", province: "广东省", city: "深圳市", district: "南山区", address: "前城中心16楼", latitude: 22.53, longitude: 113.94,
    });
    // A different authorized colleague must also see the point audit, via its stable point id.
    expect(auditLogVisibleForCurrentUser({ ...next, currentUserId: "usr-001" }, next.auditLogs[0])).toBe(true);
  });

  it("非管理角色或越界城市的新增动作均不写入业务数据", () => {
    for (const state of [{ ...createInitialState(), currentUserId: "usr-013" }, createInitialState()]) {
      const payload = state.currentUserId === "usr-013" ? pointDraft : { ...pointDraft, city: "上海市" };
      const next = appReducer(state, { type: "create-point", payload });
      expect(next.points).toEqual(state.points);
      expect(next.pointChecks).toEqual(state.pointChecks);
      expect(next.auditLogs[0]).toMatchObject({ action: "新增点位", result: "已拒绝" });
    }
  });

  it("重复编码创建不会累加品牌和组织点位数", () => {
    const created = appReducer(createInitialState(), { type: "create-point", payload: pointDraft });
    const next = appReducer(created, { type: "create-point", payload: { ...pointDraft, name: "另一个咖啡点", code: "m03" } });
    expect(next.points).toEqual(created.points);
    expect(next.brands).toEqual(created.brands);
    expect(next.organizations).toEqual(created.organizations);
    expect(next.auditLogs[0].result).toBe("已拒绝");
  });

  it("创建发布及价格编辑通过审批生效，SKU和原活动价同步", () => {
    const staged = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: true, reason: "首发商品" } });
    const id = staged.catalog[0].id;
    expect(staged.catalog[0].status).toBe("草稿");
    const published = approveLatest(staged);
    expect(published.catalog.find((item) => item.id === id)?.status).toBe("上架");
    expect(published.productVariants.filter((item) => item.product === "前城咖啡")).toHaveLength(6);
    expect(published.productVariants.find((item) => item.product === "前城咖啡")?.price).toContain("20.00");
    const edited = structuredClone(published.catalog.find((item) => item.id === id)!);
    edited.product!.prices = edited.product!.prices.map((price) => ({ ...price, promotional: "" }));
    const changed = appReducer({ ...published, currentUserId: "usr-002" }, { type: "product-save", payload: { item: edited, publish: false, reason: "取消优惠" } });
    expect(changed.catalog.find((item) => item.id === id)?.product?.prices[0].promotional).toBe("20.00");
    const applied = approveLatest(changed);
    expect(applied.catalog.find((item) => item.id === id)?.product?.prices[0].promotional).toBe("");
    expect(applied.productVariants.find((item) => item.product === "前城咖啡")?.price).toBe("¥25.00");
  });

  it("已删除商品审批恢复到下架，恢复不会直接变为可售", () => {
    const staged = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: true, reason: "发布" } });
    const published = approveLatest(staged);
    const id = published.catalog[0].id;
    const deleted = approveLatest(appReducer({ ...published, currentUserId: "usr-002" }, { type: "product-batch", payload: { ids: [id], operation: "delete", reason: "删除" } }));
    expect(deleted.catalog.find((item) => item.id === id)?.product?.deletedAt).toBeTruthy();
    expect(deleted.productVariants.some((item) => item.product === "前城咖啡")).toBe(false);
    const restored = approveLatest(appReducer({ ...deleted, currentUserId: "usr-002" }, { type: "product-batch", payload: { ids: [id], operation: "restore", reason: "恢复" } }));
    expect(restored.catalog.find((item) => item.id === id)).toMatchObject({ status: "下架" });
    expect(restored.catalog.find((item) => item.id === id)?.product?.deletedAt).toBeUndefined();
    expect(sellableVariantsAtPoint(restored, "南山机器人饮品亭").some((item) => item.product === "前城咖啡")).toBe(false);
  });

  it("整批校验失败不产生部分审批；同一商品待审批期间不可再次编辑", () => {
    const saved = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: false, reason: "" } });
    const invalid = appReducer(saved, { type: "product-batch", payload: { ids: [saved.catalog[0].id, "missing"], operation: "publish", reason: "批量上架" } });
    expect(invalid.catalogChanges).toEqual(saved.catalogChanges);
    expect(invalid.approvalRequests).toEqual(saved.approvalRequests);
    const pending = appReducer(saved, { type: "product-batch", payload: { ids: [saved.catalog[0].id], operation: "publish", reason: "上架" } });
    const second = appReducer(pending, { type: "product-save", payload: { item: { ...pending.catalog[0], name: "再次改名" }, publish: false, reason: "编辑" } });
    expect(second.catalog).toEqual(pending.catalog);
    expect(second.catalogChanges).toEqual(pending.catalogChanges);
    expect(second.auditLogs[0].result).toBe("已拒绝");
  });

  it("改名保留稳定商品SKU关联，重名拒绝不会清除其他商品价格", () => {
    const saved = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: false, reason: "" } });
    const id = saved.catalog[0].id;
    const renamed = appReducer(saved, { type: "product-save", payload: { item: { ...saved.catalog[0], name: "前城拿铁" }, publish: false, reason: "" } });
    expect(renamed.productVariants.filter((item) => item.productId === id)).toHaveLength(6);
    expect(renamed.productVariants.filter((item) => item.productId === id).every((item) => item.product === "前城拿铁")).toBe(true);
    expect(renamed.productVariants.some((item) => item.product === "前城咖啡")).toBe(false);
    const duplicate = appReducer(renamed, { type: "product-save", payload: { item: productDraft("前城拿铁"), publish: false, reason: "" } });
    expect(duplicate.catalog).toEqual(renamed.catalog);
    expect(duplicate.productVariants).toEqual(renamed.productVariants);
    expect(duplicate.auditLogs[0].result).toBe("已拒绝");
  });

  it("完整商品无法通过旧单SKU入口绕过配置矩阵及审批锁", () => {
    const saved = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: false, reason: "" } });
    const changed = appReducer(saved, { type: "submit-catalog-change", payload: {
      itemId: saved.catalog[0].id, name: "绕过旧入口", status: "上架", attrs: [], flow: "饮品亭履约模板",
      variantSku: "BYPASS", variantSpec: "中杯", variantPrice: "¥1", variantPoints: "南山机器人饮品亭", reason: "旧入口",
    } });
    expect(changed.catalog).toEqual(saved.catalog);
    expect(changed.catalogChanges).toEqual(saved.catalogChanges);
    expect(changed.auditLogs[0].result).toBe("已拒绝");
  });

  it("历史机器人服务删除恢复后仍可旧入口审批改价并保持原服务规格", () => {
    let state = { ...createInitialState(), currentUserId: "usr-000" };
    state.users = state.users.map((user) => user.id === "usr-010" ? { ...user, scope: "RoboOps 平台 / 全部租户" } : user);
    const id = "sku-003";
    const original = state.productVariants.find((variant) => variant.product === "展厅讲解服务")!;
    state = approveLatest(appReducer(state, { type: "product-batch", payload: { ids: [id], operation: "delete", reason: "服务停售" } }));
    state = approveLatest(appReducer({ ...state, currentUserId: "usr-000" }, { type: "product-batch", payload: { ids: [id], operation: "restore", reason: "服务恢复" } }));
    expect(state.productVariants.filter((variant) => variant.productId === id)).toEqual([{ ...original, productId: id }]);
    const edited = appReducer({ ...state, currentUserId: "usr-000" }, { type: "submit-catalog-change", payload: {
      itemId: id, name: "展厅讲解服务", status: "上架", attrs: ["服务时长", "预约时间"], flow: "机器人服务履约模板",
      variantSku: original.sku, variantSpec: "30 分钟", variantPrice: "¥12", variantPoints: original.points, reason: "恢复后调整服务价格与时长",
    } });
    expect(edited.auditLogs[0].result).toBe("待审批");
    expect(edited.productVariants.find((variant) => variant.productId === id)?.price).toBe("¥0");
    const approved = approveLatest(edited);
    expect(approved.catalog.find((item) => item.id === id)?.status).toBe("上架");
    expect(approved.productVariants.filter((variant) => variant.productId === id)).toEqual([
      { ...original, productId: id, spec: "30 分钟", price: "¥12" },
    ]);
    expect(approved.catalog.find((item) => item.id === id)?.product?.legacyVariants?.[0]).toMatchObject({ spec: "30 分钟", price: "¥12" });
  });
});
