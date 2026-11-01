import { describe, expect, it } from "vitest";
import { createInitialState } from "../data/mockData";
import { appReducer } from "./operations";
import { createProductConfiguration, effectiveProductRules, handleProductAction, productNameConflict, PRODUCT_RULES, validateProduct } from "../features/products/domain";
import type { AppState, CatalogItem } from "../types/core";
const setup = () => ({ ...createInitialState(), currentUserId: "usr-000" });
function product(state: AppState): CatalogItem {
  const item = { ...state.catalog[0], id: "feedback-product", name: "反馈测试", status: "草稿", product: createProductConfiguration() };
  item.product.introduction = "简介";
  item.product.images = [{ id: "test", name: "test", url: "local-image:test", width: 800, height: 600 }];
  item.product.prices.forEach(row => { row.original = "20"; });
  return item;
}
const context = (state: AppState) => ({ allowed: true, actor: "测试", visibleItemIds: state.catalog.map(item => item.id), visibleBrandNames: state.brands.map(item => item.name), visiblePointIds: state.points.map(item => item.id), now: "2026-11-02" });
describe("合并后的商品反馈规则", () => {
  it("卖点可不填、可填一条20字，简介200字；超限拒绝", () => {
    const item = product(setup());
    expect(validateProduct(item)).toEqual([]);
    item.product!.sellingPoints = ["茶".repeat(20)]; item.product!.introduction = "茶".repeat(200);
    expect(validateProduct(item)).toEqual([]);
    item.product!.sellingPoints = ["茶".repeat(21)]; item.product!.introduction += "茶";
    expect(validateProduct(item).join()).toContain("20"); expect(validateProduct(item).join()).toContain("200");
  });
  it("升级旧默认文案规则，保留自定义模板规则", () => {
    expect(effectiveProductRules({ ...PRODUCT_RULES, sellingPointMin: 2, sellingPointLength: 8, introductionMax: 50 })).toMatchObject({ sellingPointMin: 0, sellingPointLength: 20, introductionMax: 200 });
    const custom = { ...PRODUCT_RULES, sellingPointMin: 1, introductionMax: 300 };
    expect(effectiveProductRules(custom)).toMatchObject(custom);
  });
  it("同品牌查重忽略回收站，跨品牌允许同名", () => {
    const item = product(setup()); const other = { ...structuredClone(item), id: "other" };
    expect(productNameConflict([other], item)).toBe(true);
    other.product!.deletedAt = "2026-11-02"; expect(productNameConflict([other], item)).toBe(false);
    delete other.product!.deletedAt; other.brand = "其他品牌"; expect(productNameConflict([other], item)).toBe(false);
  });
  it("保存允许与回收站商品重名，恢复重名商品拦截", () => {
    const state = setup(); const item = product(state); const recycled = structuredClone(item); recycled.id = "recycled"; recycled.product!.deletedAt = "2026-11-02"; state.catalog.push(recycled);
    const result = handleProductAction(state, { type: "product-save", payload: { item, reason: "保存", publish: false } }, context(state));
    expect(result.error).toBeUndefined();
    expect(handleProductAction(state, { type: "product-batch", payload: { ids: [recycled.id], operation: "restore", reason: "恢复" } }, context(state)).error).toContain("重名");
  });
  it("永久删除只移除商品及其SKU，保留历史订单和分类", () => {
    const initial = setup(); const item = initial.catalog[1]; item.product = createProductConfiguration(item, initial); item.product.deletedAt = "2026-11-02";
    const next = appReducer(initial, { type: "product-purge", payload: { itemId: item.id, reason: "清理回收站" } });
    expect(next.catalog.some(row => row.id === item.id)).toBe(false);
    expect(next.productVariants.some(row => row.productId === item.id || row.product === item.name)).toBe(false);
    expect(next.businessRequests).toEqual(initial.businessRequests); expect(next.productCategories).toEqual(initial.productCategories); expect(next.catalogChanges).toEqual(initial.catalogChanges);
  });
  it("只读账号、在用商品、待审批商品不能永久删除", () => {
    const initial = setup(); const action = { type: "product-purge" as const, payload: { itemId: initial.catalog[0].id, reason: "清理" } };
    expect(appReducer(initial, action).catalog).toEqual(initial.catalog);
    initial.catalog[0].product = createProductConfiguration(initial.catalog[0], initial); initial.catalog[0].product.deletedAt = "2026-11-02";
    expect(appReducer({ ...initial, currentUserId: "usr-013" }, action).catalog).toEqual(initial.catalog);
    initial.catalogChanges.push({ release: "test", itemId: action.payload.itemId, beforeItem: initial.catalog[0], afterItem: initial.catalog[0], reason: "test", status: "待审批" });
    expect(appReducer(initial, action).catalog).toEqual(initial.catalog);
  });
  it("审批时再查重，冲突恢复不会被标记为已发布", () => {
    let state = setup(); const item = state.catalog[1]; item.product = createProductConfiguration(item, state); item.product.deletedAt = "2026-11-02";
    state = appReducer(state, { type: "product-batch", payload: { ids: [item.id], operation: "restore", reason: "恢复" } });
    const approval = state.approvalRequests[0];
    state.catalog.push({ ...structuredClone(item), id: "conflicting", product: createProductConfiguration() });
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: approval.id, decision: "approve" });
    expect(state.approvalRequests[0].status).toBe("已驳回");
    expect(state.releases.find(row => row.id === approval.target)?.status).toBe("已驳回");
    expect(state.catalog.find(row => row.id === item.id)?.product?.deletedAt).toBeTruthy();
  });
  it("永久删除后创建商品不复用历史商品ID", () => {
    let state = setup(); const item = product(state); item.id = "sku-product-001"; item.product!.deletedAt = "2026-11-02"; state.catalog.push(item);
    state = appReducer(state, { type: "product-purge", payload: { itemId: item.id, reason: "清理" } });
    const fresh = product(state); fresh.id = "";
    state = appReducer(state, { type: "product-save", payload: { item: fresh, reason: "新增", publish: false } });
    expect(state.catalog.find(row => row.name === fresh.name)?.id).toBe("sku-product-002");
  });

});
