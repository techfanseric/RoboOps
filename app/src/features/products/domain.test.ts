import { describe, expect, it } from "vitest";
import { createInitialState } from "../../data/mockData";
import type { AppState, CatalogItem } from "../../types/core";
import { buildPriceMatrix, characterCount, createProductConfiguration, DEFAULT_OPTION_GROUPS, handleProductAction, syncProductVariants, validateProduct, validateProductPublication } from "./domain";
import type { ProductActionContext } from "./types";

function product(state: AppState, name = "测试拿铁"): CatalogItem {
  const config = createProductConfiguration();
  config.sellingPoints = ["浓醇好喝", "现磨鲜制"];
  config.introduction = "柔和奶香与咖啡香气。";
  config.prices = config.prices.map((row) => ({ ...row, original: "29.00", promotional: "25.00" }));
  config.images = [{ id: "image-1", url: "local-image:image-1", name: "coffee.jpg", width: 600, height: 600 }];
  config.pointIds = state.points.filter((point) => point.brand === state.brands[0].name).slice(0, 1).map((point) => point.id);
  return { id: "", name, type: "饮品商品", brand: state.brands[0].name, status: "草稿", attrs: [], flow: "饮品亭履约模板", product: config };
}
function context(state: AppState): ProductActionContext {
  return { allowed: true, actor: "测试运营", visibleItemIds: state.catalog.map((item) => item.id), visibleBrandNames: state.brands.map((brand) => brand.name), visiblePointIds: state.points.map((point) => point.id), now: "10-12 18:00" };
}
function save(state: AppState, item: CatalogItem) {
  const result = handleProductAction(state, { type: "product-save", payload: { item, reason: "测试", publish: false } }, context(state));
  expect(result.error).toBeUndefined();
  return state.catalog.find((row) => row.name === item.name)!;
}

describe("商品配置和价格", () => {
  it("18 个选择组合共享 6 个杯型温度价格档；非计价扩展不改变价格", () => {
    const config = createProductConfiguration();
    expect(config.optionGroups.reduce((count, group) => count * group.options.length, 1)).toBe(18);
    expect(config.prices).toHaveLength(6);
    const prices = config.prices.map((row) => ({ ...row, original: "30", promotional: "20" }));
    const groups = [...DEFAULT_OPTION_GROUPS, { id: "milk", name: "奶基底", options: ["燕麦奶", "牛奶"], affectsPrice: false }];
    expect(buildPriceMatrix(groups, prices)).toEqual(prices);
    expect(buildPriceMatrix(groups.map((group) => group.id === "milk" ? { ...group, affectsPrice: true } : group), prices)).toHaveLength(12);
  });
  it("保留未变组合价格，并允许清空活动价", () => {
    const config = createProductConfiguration();
    config.prices[0].original = "29";
    config.prices[0].promotional = "";
    const groups = config.optionGroups.map((group) => group.id === "cup" ? { ...group, options: [...group.options, "迷你杯"] } : group);
    const prices = buildPriceMatrix(groups, config.prices);
    expect(prices.find((row) => row.key === config.prices[0].key)).toMatchObject({ original: "29", promotional: "" });
    expect(prices).toHaveLength(8);
  });
  it("按Unicode字符计数，并校验商品名、卖点与简介边界", () => {
    const state = createInitialState();
    const item = product(state);
    expect(characterCount("😀咖啡")).toBe(3);
    item.name = "😀".repeat(15);
    expect(validateProduct(item)).toEqual([]);
    item.name += "😀";
    item.product!.sellingPoints = ["123456789"];
    item.product!.introduction = "字".repeat(51);
    expect(validateProduct(item).join("；")).toContain("1–15");
    expect(validateProduct(item).join("；")).toContain("2–4");
    expect(validateProduct(item).join("；")).toContain("1–50");
  });
  it.each(["NaN", "-1", "0", "1.001", "1e2", "Infinity"])("拒绝无效原价 %s", (value) => {
    const item = product(createInitialState());
    item.product!.prices[0].original = value;
    expect(validateProduct(item).some((error) => error.includes("原价"))).toBe(true);
  });
  it("活动价不能超过原价或为负，且矩阵必须完整无重复", () => {
    const item = product(createInitialState());
    item.product!.prices[0].promotional = "30";
    expect(validateProduct(item).join("；")).toContain("不能超过原价");
    item.product!.prices[0].promotional = "-2";
    expect(validateProduct(item).join("；")).toContain("原价");
    item.product!.prices[0].promotional = "";
    expect(validateProduct(item)).toEqual([]);
    item.product!.prices[1] = { ...item.product!.prices[0] };
    expect(validateProduct(item).join("；")).toContain("矩阵");
  });
  it("保留原图比例、不强制4:3；拒绝空图片与不支持的资产引用", () => {
    const item = product(createInitialState());
    expect(validateProduct(item)).toEqual([]);
    item.product!.images[0].url = "https://untrusted/image.jpg";
    expect(validateProduct(item).join("；")).toContain("图片");
    item.product!.images = [];
    expect(validateProduct(item).join("；")).toContain("1–3");
  });
  it("限制价格矩阵扩展大小", () => {
    expect(buildPriceMatrix([...DEFAULT_OPTION_GROUPS, { id: "extras", name: "配料", options: Array.from({ length: 20 }, (_, index) => String(index)), affectsPrice: true }])).toEqual([]);
  });
});

describe("商品状态与审批", () => {
  it("创建保存完整草稿，同步稳定SKU；提交上架前实际状态仍为草稿", () => {
    const state = createInitialState();
    const draft = save(state, product(state));
    expect(draft.id).toMatch(/^sku-product-/);
    expect(draft.status).toBe("草稿");
    expect(state.productVariants.filter((variant) => variant.productId === draft.id)).toHaveLength(6);
    const result = handleProductAction(state, { type: "product-batch", payload: { ids: [draft.id], operation: "publish", reason: "开始营业" } }, context(state));
    expect(result.error).toBeUndefined();
    expect(state.catalog.find((row) => row.id === draft.id)?.status).toBe("草稿");
    expect(state.catalogChanges[0].afterItem.status).toBe("上架");
    expect(state.approvalRequests[0].target).toBe(state.catalogChanges[0].release);
  });
  it("同商品待审批时拦截再次编辑，避免过期审批覆盖", () => {
    const state = createInitialState();
    const draft = save(state, product(state));
    handleProductAction(state, { type: "product-batch", payload: { ids: [draft.id], operation: "publish", reason: "开始营业" } }, context(state));
    const changes = state.catalogChanges.length;
    const edited = structuredClone(draft);
    edited.name = "改名商品";
    expect(handleProductAction(state, { type: "product-save", payload: { item: edited, reason: "修改", publish: false } }, context(state)).error).toContain("待审批");
    expect(state.catalogChanges).toHaveLength(changes);
    expect(state.catalog.find((item) => item.id === draft.id)?.name).toBe("测试拿铁");
  });
  it("批量全部校验成功才创建审批，混入越权/无效商品不产生部分修改", () => {
    const state = createInitialState();
    const first = save(state, product(state, "拿铁一号"));
    const second = save(state, product(state, "拿铁二号"));
    second.product!.images = [];
    const initial = state.catalogChanges.length;
    expect(handleProductAction(state, { type: "product-batch", payload: { ids: [first.id, second.id], operation: "publish", reason: "批量上架" } }, context(state)).error).toContain("整批未提交");
    expect(state.catalogChanges).toHaveLength(initial);
    expect(handleProductAction(state, { type: "product-batch", payload: { ids: [first.id, "nonexistent"], operation: "delete", reason: "清理" } }, context(state)).error).toContain("整批未提交");
    expect(first.product?.deletedAt).toBeUndefined();
  });
  it("权限、品牌与点位作用域在domain校验", () => {
    const state = createInitialState();
    const item = product(state);
    expect(handleProductAction(state, { type: "product-save", payload: { item, reason: "", publish: false } }, { ...context(state), allowed: false }).error).toContain("权限");
    expect(handleProductAction(state, { type: "product-save", payload: { item, reason: "", publish: false } }, { ...context(state), visibleBrandNames: [] }).error).toContain("品牌");
    expect(handleProductAction(state, { type: "product-save", payload: { item, reason: "", publish: false } }, { ...context(state), visiblePointIds: [] }).error).toContain("点位");
    expect(state.catalog.some((row) => row.name === item.name)).toBe(false);
  });
  it("拒绝重复商品名，编辑改名和SKU同步不清除其他商品", () => {
    const state = createInitialState();
    const first = save(state, product(state, "拿铁一号"));
    const second = save(state, product(state, "拿铁二号"));
    const firstVariants = structuredClone(state.productVariants.filter((row) => row.productId === first.id));
    const duplicate = structuredClone(second); duplicate.name = first.name;
    expect(handleProductAction(state, { type: "product-save", payload: { item: duplicate, reason: "", publish: false } }, context(state)).error).toContain("名称已存在");
    const edited = structuredClone(second); edited.name = "拿铁三号";
    save(state, edited);
    expect(state.productVariants.filter((row) => row.productId === first.id)).toEqual(firstVariants);
    expect(state.productVariants.some((row) => row.product === "拿铁二号")).toBe(false);
  });
  it("软删除移除SKU，恢复后保持下架，重新上架仍需审批", () => {
    const state = createInitialState();
    const draft = save(state, product(state));
    handleProductAction(state, { type: "product-batch", payload: { ids: [draft.id], operation: "delete", reason: "暂停售卖" } }, context(state));
    const deletion = state.catalogChanges[0];
    expect(draft.product?.deletedAt).toBeUndefined();
    state.catalog[state.catalog.findIndex((row) => row.id === draft.id)] = deletion.afterItem;
    deletion.status = "已生效";
    syncProductVariants(state, deletion.afterItem, draft.name);
    expect(state.productVariants.filter((row) => row.productId === draft.id)).toHaveLength(0);
    const result = handleProductAction(state, { type: "product-batch", payload: { ids: [draft.id], operation: "restore", reason: "恢复商品" } }, context(state));
    expect(result.error).toBeUndefined();
    expect(state.catalogChanges[0].afterItem.status).toBe("下架");
    expect(state.catalogChanges[0].afterItem.product?.deletedAt).toBeUndefined();
    expect(state.catalogChanges[0].afterItem.product?.prices).toEqual(draft.product!.prices);
  });
  it("历史服务商品删除恢复保留原SKU规格与价格，不迁移成饮品矩阵", () => {
    const state = createInitialState();
    const service = state.catalog.find((item) => item.type === "机器人服务")!;
    const original = structuredClone(state.productVariants.filter((variant) => variant.product === service.name));
    handleProductAction(state, { type: "product-batch", payload: { ids: [service.id], operation: "delete", reason: "维护" } }, context(state));
    const change = state.catalogChanges[0];
    expect(change.afterItem.product?.legacyVariants).toEqual(original);
    state.catalog[state.catalog.findIndex((item) => item.id === service.id)] = change.afterItem;
    change.status = "已生效";
    syncProductVariants(state, change.afterItem, service.name);
    expect(state.productVariants.filter((variant) => variant.product === service.name)).toEqual([]);
    handleProductAction(state, { type: "product-batch", payload: { ids: [service.id], operation: "restore", reason: "恢复" } }, context(state));
    const restored = state.catalogChanges[0].afterItem;
    syncProductVariants(state, restored, service.name);
    expect(state.productVariants.filter((variant) => variant.product === service.name)).toEqual(original.map((variant) => ({ ...variant, productId: service.id })));
  });

  it("历史免费服务支持批量上架且保留原SKU，恢复快照也可上架", () => {
    const state = createInitialState();
    const service = state.catalog.find((item) => item.name === "展厅讲解服务")!;
    service.status = "下架";
    const original = structuredClone(state.productVariants.filter((variant) => variant.product === service.name));
    expect(original[0].price).toBe("¥0");
    expect(validateProductPublication(state, service, context(state).visiblePointIds)).toEqual([]);
    expect(handleProductAction(state, { type: "product-batch", payload: { ids: [service.id], operation: "publish", reason: "恢复免费服务" } }, context(state)).error).toBeUndefined();
    expect(state.catalogChanges[0].afterItem.status).toBe("上架");
    expect(state.productVariants.filter((variant) => variant.product === service.name)).toEqual(original);
    state.catalogChanges[0].status = "已驳回";
    service.product = { ...createProductConfiguration(service, state), legacyVariants: original };
    expect(validateProductPublication(state, service, context(state).visiblePointIds)).toEqual([]);
    expect(handleProductAction(state, { type: "product-batch", payload: { ids: [service.id], operation: "publish", reason: "恢复服务" } }, context(state)).error).toBeUndefined();
    const after = state.catalogChanges[0].afterItem;
    syncProductVariants(state, after, service.name);
    expect(state.productVariants.filter((variant) => variant.product === service.name)).toEqual(original.map((variant) => ({ ...variant, productId: service.id })));
  });
  it("历史服务发布校验拒绝无SKU、负价、其他品牌及无权限点位", () => {
    const state = createInitialState();
    const service = state.catalog.find((item) => item.name === "展厅讲解服务")!;
    expect(validateProductPublication(state, service, [])).not.toEqual([]);
    const variant = state.productVariants.find((row) => row.product === service.name)!;
    variant.price = "¥-1";
    expect(validateProductPublication(state, service, context(state).visiblePointIds).join("；")).toContain("非负价格");
    variant.price = "¥0";
    variant.points = state.points.find((point) => point.brand !== service.brand)!.name;
    expect(validateProductPublication(state, service, context(state).visiblePointIds).join("；")).toContain("其他品牌");
    state.productVariants = state.productVariants.filter((row) => row.product !== service.name);
    expect(validateProductPublication(state, service, context(state).visiblePointIds).join("；")).toContain("补齐服务");
  });

});

describe("可配置商品审批和 SKU 身份", () => {
  it("非计价规格、规则和图片变更在审批前后均可读", () => {
    const state = createInitialState();
    const saved = save(state, product(state));
    saved.status = "上架";
    const edited = structuredClone(saved);
    edited.product!.optionGroups[0].options[0] = "不加糖";
    edited.product!.optionGroups[0].required = true;
    edited.product!.optionGroups[0].disabledOptionIds = [edited.product!.optionGroups[0].optionIds![1]];
    edited.product!.rules!.nameMax = 25;
    edited.flow = "企业履约模板";
    edited.product!.images[0] = { ...edited.product!.images[0], id: "image-2", name: "new.jpg", url: "local-image:image-2" };
    edited.product!.pointIds = state.points.filter(point => point.brand === edited.brand).slice(1, 2).map(point => point.id);
    const result = handleProductAction(state, { type: "product-save", payload: { item: edited, reason: "修改规格和规则", publish: false } }, context(state));
    expect(result.error).toBeUndefined();
    const diff = state.releaseDiffs[0];
    expect(diff.before).toContain("无糖[启用]");
    expect(diff.after).toContain("不加糖[启用]");
    expect(diff.after).toContain("少糖[停用]");
    expect(diff.after).toContain("甜度（启用、必需、不参与计价）");
    expect(diff.before).toContain("商品名≤15字");
    expect(diff.after).toContain("商品名≤25字");
    expect(diff.after).toContain("企业履约模板");
    expect(diff.before).toContain("coffee.jpg [image-1]");
    expect(diff.after).toContain("new.jpg [image-2]");
    expect(diff.before).toContain(state.points.find(point => point.id === saved.product!.pointIds[0])!.name);
    expect(diff.after).toContain(state.points.find(point => point.id === edited.product!.pointIds[0])!.name);
  });
  it("旧编号升级后，改名排序、停用恢复和新增组合不改变或复用 SKU", () => {
    const state = createInitialState();
    const saved = save(state, product(state));
    const initial = { ...saved.product!.priceSkuIds! };
    delete saved.product!.priceSkuIds;
    let edited = { ...saved, product: createProductConfiguration(saved, state) };
    expect(edited.product.priceSkuIds).toEqual(initial);
    edited.product.optionGroups.reverse();
    const cup = edited.product.optionGroups.find(group => group.id === "cup")!;
    cup.options.reverse(); cup.optionIds!.reverse(); cup.options[0] = "至尊杯";
    edited.product.prices = buildPriceMatrix(edited.product.optionGroups, edited.product.prices);
    edited = save(state, edited) as typeof edited;
    expect(edited.product.priceSkuIds).toEqual(initial);
    const currentCup = edited.product.optionGroups.find(group => group.id === "cup")!;
    const disabledId = currentCup.optionIds![0];
    const archive = structuredClone(edited.product.prices);
    currentCup.disabledOptionIds = [disabledId];
    edited.product.priceArchive = archive;
    edited.product.prices = buildPriceMatrix(edited.product.optionGroups, archive);
    edited = save(state, edited) as typeof edited;
    const disabledKeys = archive.filter(price => price.selections.cup === disabledId).map(price => price.key);
    expect(state.productVariants.filter(variant => variant.productId === saved.id).some(variant => disabledKeys.some(key => initial[key] === variant.sku))).toBe(false);
    const restoredCup = edited.product.optionGroups.find(group => group.id === "cup")!;
    restoredCup.disabledOptionIds = [];
    restoredCup.options.push("试饮杯"); restoredCup.optionIds!.push("trial-cup");
    edited.product.prices = buildPriceMatrix(edited.product.optionGroups, archive).map(price => ({ ...price, original: price.original || "10" }));
    edited = save(state, edited) as typeof edited;
    for (const [key, sku] of Object.entries(initial)) expect(edited.product.priceSkuIds![key]).toBe(sku);
    const newSkus = edited.product.prices.filter(price => price.selections.cup === "trial-cup").map(price => edited.product.priceSkuIds![price.key]);
    expect(newSkus.every(sku => !Object.values(initial).includes(sku))).toBe(true);
    expect(new Set(state.productVariants.filter(variant => variant.productId === saved.id).map(variant => variant.sku)).size).toBe(8);
  });
});
