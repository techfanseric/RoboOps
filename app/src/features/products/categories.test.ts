import { describe, expect, it } from "vitest";
import { createInitialState } from "../../data/mockData";
import { appReducer, auditLogVisibleForCurrentUser, releaseRollbackActionPolicy } from "../../services/operations";
import { handleProductAction, createProductConfiguration } from "./domain";
import { categoriesForBrand, categoryLabel, categoryUsage, categoryApprovalSummary } from "./categories";
import type { AppState, ProductCategory } from "../../types/core";
import type { ProductAction, ProductActionContext } from "./types";
const context = (state: AppState): ProductActionContext => ({ allowed: true, actor: "测试运营", visibleItemIds: state.catalog.map(row => row.id), visibleBrandNames: state.brands.map(row => row.name), visiblePointIds: state.points.map(row => row.id), now: "10-14 12:00" });
function setup() {
  const state = createInitialState();
  state.catalogChanges = [];
  const item = state.catalog[0];
  const category: ProductCategory = { id: "category-coffee", brand: item.brand, name: "咖啡", sortOrder: 10, enabled: true };
  state.productCategories = [category];
  return { state, item, category };
}
const save = (category: ProductCategory): ProductAction => ({ type: "product-category-save", payload: { category, reason: "配置分类" } });
const assign = (itemId: string, categoryId?: string): ProductAction => ({ type: "product-category-assign", payload: { itemId, categoryId, reason: "调整分类" } });

describe("商品分类与历史兼容", () => {
  it("旧状态没有分类集合仍可归为未分类；新增后按排序展示并留审计", () => {
    const { state, category } = setup(); delete state.productCategories;
    expect(categoryLabel(state)).toBe("未分类"); expect(categoriesForBrand(state, category.brand)).toEqual([]);
    expect(handleProductAction(state, save(category), context(state)).error).toBeUndefined();
    handleProductAction(state, save({ ...category, id: "category-tea", name: "茶饮", sortOrder: 0 }), context(state));
    expect(categoriesForBrand(state, category.brand).map(row => row.name)).toEqual(["茶饮", "咖啡"]);
    expect(state.auditLogs[0].action).toBe("保存商品分类");
  });
  it("同品牌含停用分类不能重名，不同品牌可以同名", () => {
    const { state, category } = setup(); state.productCategories![0].enabled = false;
    expect(handleProductAction(state, save({ ...category, id: "new" }), context(state)).error).toContain("不能重复");
    const brand = state.brands.find(row => row.name !== category.brand)!.name;
    expect(handleProductAction(state, save({ ...category, id: "other", brand }), context(state)).error).toBeUndefined();
  });
  it("非法名称、排序与品牌迁移拒绝且不改数据", () => {
    const { state, category } = setup();
    for (const patch of [{ name: " " }, { name: "名".repeat(31) }, { sortOrder: NaN }, { sortOrder: -1 }, { sortOrder: 1.5 }, { sortOrder: 10000 }, { brand: "不存在" }]) {
      expect(handleProductAction(state, save({ ...category, ...patch }), context(state)).error).toBeTruthy();
      expect(state.productCategories).toEqual([category]);
    }
    expect(handleProductAction(state, save({ ...category, brand: state.brands.find(row => row.name !== category.brand)!.name }), context(state)).error).toContain("不能迁移");
  });
  it("改名及停用保留关联、商品状态及SKU；已有归属可保留，新选被拒绝", () => {
    const { state, item, category } = setup(); item.categoryId = category.id;
    const original = structuredClone(state.productVariants); const status = item.status;
    handleProductAction(state, save({ ...category, name: "现磨咖啡", enabled: false }), context(state));
    expect(state.catalog[0].categoryId).toBe(category.id); expect(state.catalog[0].status).toBe(status);
    expect(categoryLabel(state, item.categoryId)).toBe("现磨咖啡（停用）"); expect(state.productVariants).toEqual(original);
    const other = { ...item, id: "other-item", categoryId: undefined, status: "草稿" }; state.catalog.push(other);
    expect(handleProductAction(state, assign(other.id, category.id), context(state)).error).toContain("停用分类");
  });
  it("草稿归类、清空立即保存，价格与SKU不变", () => {
    const { state, item, category } = setup(); item.status = "草稿"; const variants = structuredClone(state.productVariants);
    expect(handleProductAction(state, assign(item.id, category.id), context(state)).error).toBeUndefined();
    expect(state.catalog[0].categoryId).toBe(category.id); expect(state.catalogChanges).toHaveLength(0);
    handleProductAction(state, assign(item.id), context(state));
    expect(state.catalog[0].categoryId).toBeUndefined(); expect(state.productVariants).toEqual(variants);
  });
  it("不存在、跨品牌分类和无权限操作不能绕过界面校验", () => {
    const { state, item, category } = setup();
    const other = { ...category, id: "other", brand: state.brands.find(row => row.name !== category.brand)!.name }; state.productCategories!.push(other);
    for (const id of ["missing", other.id]) expect(handleProductAction(state, assign(item.id, id), context(state)).error).toContain("有效分类");
    expect(handleProductAction(state, save(category), { ...context(state), allowed: false }).error).toContain("权限");
    expect(handleProductAction(state, save(category), { ...context(state), visibleBrandNames: [] }).error).toContain("权限");
    expect(handleProductAction(state, assign(item.id, category.id), { ...context(state), visibleItemIds: [] }).error).toContain("权限");
    expect(state.catalog[0].categoryId).toBeUndefined();
  });
  it("已删除、待审批和无变化不能重复归类", () => {
    const { state, item, category } = setup(); item.status = "上架";
    handleProductAction(state, assign(item.id, category.id), context(state));
    expect(handleProductAction(state, assign(item.id, category.id), context(state)).error).toContain("待审批");
    state.catalogChanges = []; item.categoryId = category.id;
    expect(handleProductAction(state, assign(item.id, category.id), context(state)).error).toContain("未改变");
  });
  it("已上架历史商品只改分类可独立审批，批准保留原SKU", () => {
    let { state, item, category } = setup(); item.status = "上架"; state.currentUserId = "usr-000";
    const variants = structuredClone(state.productVariants);
    state = appReducer(state, assign(item.id, category.id));
    expect(state.catalog.find(row => row.id === item.id)?.categoryId).toBeUndefined();
    const change = state.catalogChanges[0]; expect(change.afterItem.categoryId).toBe(category.id);
    expect(state.releaseDiffs[0].after).toContain(`分类 咖啡 [${category.id}]`);
    // Renaming/stopping a category while its assignment is pending preserves that stable association.
    state = appReducer(state, save({ ...category, name: "现磨咖啡", enabled: false }));
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    expect(state.catalogChanges[0].status).toBe("已生效");
    expect(state.catalog.find(row => row.id === item.id)?.categoryId).toBe(category.id);
    expect(state.productVariants).toEqual(variants);
  });
  it("完整商品保存验证分类，停用原分类可保留，新商品不能选择", () => {
    const { state, category } = setup();
    const product = createProductConfiguration();
    product.sellingPoints = ["浓醇咖啡", "香浓顺滑"]; product.introduction = "现磨咖啡";
    product.images = [{ id: "image-1", url: "local-image:test-1", name: "test.png", width: 800, height: 600 }];
    product.prices = product.prices.map(row => ({ ...row, original: "20" }));
    const draft = { id: "", name: "分类测试咖啡", type: "饮品商品", brand: category.brand, flow: "饮品亭", attrs: [], status: "草稿", categoryId: category.id, product };
    expect(handleProductAction(state, { type: "product-save", payload: { item: draft, publish: false, reason: "" } }, context(state)).error).toBeUndefined();
    const saved = state.catalog[0];
    handleProductAction(state, save({ ...category, enabled: false }), context(state));
    expect(handleProductAction(state, { type: "product-save", payload: { item: { ...saved, name: "改名咖啡" }, publish: false, reason: "" } }, context(state)).error).toBeUndefined();
    expect(handleProductAction(state, { type: "product-save", payload: { item: { ...draft, name: "第二杯咖啡" }, publish: false, reason: "" } }, context(state)).error).toContain("停用分类");
  });
  it("完整商品归类审批及驳回不改SKU、价格和原归属", () => {
    let { state, category } = setup(); state.currentUserId = "usr-000";
    const product = createProductConfiguration(); product.prices = product.prices.map(row => ({ ...row, original: "30", promotional: "25" }));
    const item = { ...state.catalog[1], product, status: "上架" }; state.catalog[1] = item;
    const originalVariants = structuredClone(state.productVariants);
    state = appReducer(state, assign(item.id, category.id));
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "reject", note: "暂不调整" });
    expect(state.catalogChanges[0].status).toBe("已驳回"); expect(state.catalog[1].categoryId).toBeUndefined();
    expect(state.catalog[1].product?.prices).toEqual(product.prices); expect(state.productVariants).toEqual(originalVariants);
  });
  it("已删除商品不能归类；已上架换分类需要原因", () => {
    const { state, item, category } = setup(); item.product = { ...createProductConfiguration(), deletedAt: "10-14" };
    expect(handleProductAction(state, assign(item.id, category.id), context(state)).error).toContain("已删除");
    delete item.product.deletedAt; item.status = "上架";
    expect(handleProductAction(state, { type: "product-category-assign", payload: { itemId: item.id, categoryId: category.id, reason: "" } }, context(state)).error).toContain("原因");
  });

  it("分类审计按所属品牌对授权同事可见", () => {
    const { state, category } = setup(); handleProductAction(state, save(category), context(state));
    expect(auditLogVisibleForCurrentUser({ ...state, currentUserId: "usr-010" }, state.auditLogs[0])).toBe(true);
  });
  it("完整商品分类审批和回退仅改分类，不重建或覆盖其他配置", () => {
    let { state, item, category } = setup(); state.currentUserId = "usr-000"; item.status = "上架";
    item.product = createProductConfiguration();
    const variants = structuredClone(state.productVariants);
    state = appReducer(state, assign(item.id, category.id));
    const release = state.catalogChanges[0].release;
    expect(state.catalogChanges[0].categoryOnly).toBe(true);
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    expect(state.catalog[0].categoryId).toBe(category.id); expect(state.productVariants).toEqual(variants);
    state.catalog[0].flow = "后续更新的履约模板";
    state = appReducer({ ...state, currentUserId: "usr-000" }, { type: "submit-release-rollback", payload: { releaseId: release, reason: "撤销归类" } });
    expect(state.catalogChanges[0].categoryOnly).toBe(true);
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    expect(state.catalog[0].categoryId).toBeUndefined(); expect(state.catalog[0].flow).toBe("后续更新的履约模板"); expect(state.productVariants).toEqual(variants);
  });

  it("重新启用后可新归类，停用期间保留关联", () => {
    const { state, item, category } = setup(); item.status = "草稿";
    handleProductAction(state, save({ ...category, enabled: false }), context(state));
    expect(handleProductAction(state, assign(item.id, category.id), context(state)).error).toContain("停用");
    handleProductAction(state, save(category), context(state));
    expect(handleProductAction(state, assign(item.id, category.id), context(state)).error).toBeUndefined();
    expect(state.catalog[0].categoryId).toBe(category.id);
  });
  it("历史服务编辑入口校验分类且旧调用不丢原关联", () => {
    let { state } = setup(); state.currentUserId = "usr-000";
    const item = state.catalog.find(row => row.type === "机器人服务")!;
    const variant = state.productVariants.find(row => row.product === item.name)!;
    state.productCategories!.push({ id: "category-service", name: "接待服务", brand: item.brand, sortOrder: 0, enabled: true });
    item.categoryId = "category-service";
    const payload = { itemId: item.id, name: item.name, status: item.status, attrs: item.attrs, flow: item.flow, variantSku: variant.sku, variantSpec: variant.spec, variantPrice: variant.price, variantPoints: variant.points, reason: "修改服务" };
    const denied = appReducer(state, { type: "submit-catalog-change", payload: { ...payload, categoryId: "category-coffee" } });
    expect(denied.catalogChanges).toHaveLength(0); expect(denied.auditLogs[0].result).toBe("已拒绝");
    state = appReducer(state, { type: "submit-catalog-change", payload });
    expect(state.catalogChanges[0].afterItem.categoryId).toBe("category-service");
  });

  it("关联数区分当前、回收站和待审批归入，停用不减少历史关联", () => {
    const { state, item, category } = setup(); item.categoryId = category.id;
    state.catalog.push({ ...item, id: "deleted", product: { ...createProductConfiguration(), deletedAt: "10-14" } });
    const pendingItem = { ...item, id: "pending-item", categoryId: undefined, status: "上架" }; state.catalog.push(pendingItem);
    handleProductAction(state, assign(pendingItem.id, category.id), context(state));
    handleProductAction(state, save({ ...category, enabled: false }), context(state));
    expect(categoryUsage(state, category.id)).toEqual({ active: 1, trash: 1, pending: 1 });
  });
  it("审批期间分类改名停用显示当前目标并保留提交时历史差异", () => {
    const { state, item, category } = setup(); item.status = "上架";
    handleProductAction(state, assign(item.id, category.id), context(state));
    const releaseId = state.catalogChanges[0].release; const diff = structuredClone(state.releaseDiffs[0]);
    handleProductAction(state, save({ ...category, name: "精品咖啡", enabled: false }), context(state));
    expect(categoryApprovalSummary(state, releaseId)).toMatchObject({ current: "未分类", target: "精品咖啡（停用）", status: "待审批" });
    expect(categoryApprovalSummary(state, releaseId)?.note).toContain("提交后已停用");
    expect(state.releaseDiffs[0]).toEqual(diff); expect(diff.after).toContain("分类 咖啡");
  });
  it("同商品存在待审批归类时不能从旧发布绕过限制提交回退", () => {
    let { state, item, category } = setup(); state.currentUserId = "usr-000"; item.status = "上架";
    state = appReducer(state, assign(item.id, category.id)); const firstRelease = state.catalogChanges[0].release;
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    state = appReducer({ ...state, currentUserId: "usr-000" }, assign(item.id));
    const count = state.catalogChanges.length;
    expect(releaseRollbackActionPolicy(state, firstRelease).message).toContain("待审批");
    state = appReducer(state, { type: "submit-release-rollback", payload: { releaseId: firstRelease, reason: "不能并行回退" } });
    expect(state.catalogChanges).toHaveLength(count); expect(state.auditLogs[0].result).toBe("已拒绝");
  });
  it("分类已再次调整的历史发布不能以旧目标冒充当前配置申请回退", () => {
    let { state, item, category } = setup(); state.currentUserId = "usr-000"; item.status = "上架";
    state = appReducer(state, assign(item.id, category.id)); const firstRelease = state.catalogChanges[0].release;
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    state = appReducer({ ...state, currentUserId: "usr-000" }, assign(item.id));
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    expect(releaseRollbackActionPolicy({ ...state, currentUserId: "usr-000" }, firstRelease)).toMatchObject({ allowed: false });
    expect(releaseRollbackActionPolicy({ ...state, currentUserId: "usr-000" }, firstRelease).message).toContain("分类已在此发布后调整");
  });
  it("分类停用后商品删除进回收站及审批恢复仍保留分类", () => {
    let { state, item, category } = setup(); item.categoryId = category.id; state.currentUserId = "usr-000";
    state = appReducer(state, save({ ...category, enabled: false }));
    state = appReducer(state, { type: "product-batch", payload: { ids: [item.id], operation: "delete", reason: "暂停销售" } });
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    expect(categoryUsage(state, category.id).trash).toBe(1);
    state = appReducer({ ...state, currentUserId: "usr-000" }, { type: "product-batch", payload: { ids: [item.id], operation: "restore", reason: "恢复历史商品" } });
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    expect(state.catalog[0]).toMatchObject({ categoryId: category.id, status: "下架" });
    expect(categoryLabel(state, state.catalog[0].categoryId)).toBe("咖啡（停用）");
  });

  it("完整编辑换分类也显示审批期间的当前名称与停用状态", () => {
    const { state, item, category } = setup(); item.status = "上架";
    handleProductAction(state, assign(item.id, category.id), context(state));
    const change = state.catalogChanges[0]; change.categoryOnly = false;
    handleProductAction(state, save({ ...category, name: "精品咖啡", enabled: false }), context(state));
    expect(categoryApprovalSummary(state, change.release)?.target).toBe("精品咖啡（停用）");
  });
  it("已删除商品不能通过历史分类发布回退绕过归类限制", () => {
    let { state, item, category } = setup(); state.currentUserId = "usr-000"; item.status = "上架";
    state = appReducer(state, assign(item.id, category.id)); const release = state.catalogChanges[0].release;
    state = appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
    state.catalog[0].product = { ...createProductConfiguration(), deletedAt: "10-14" };
    const policy = releaseRollbackActionPolicy({ ...state, currentUserId: "usr-000" }, release);
    expect(policy.allowed).toBe(false); expect(policy.message).toContain("已删除");
  });

});
