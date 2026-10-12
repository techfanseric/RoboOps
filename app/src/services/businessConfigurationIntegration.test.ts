import { afterAll, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../data/mockData";
import { defaultPointFields, getPointFieldTemplate, type PointFieldTemplate, type PointFieldValue } from "../features/pointCreation/config";
import { applyPointDefaults, type PointCreatePayload } from "../features/pointCreation/model";
import { buildPriceMatrix, createProductConfiguration, defaultProductTemplate, productTemplatesForBrand } from "../features/products/domain";
import type { AppState, CatalogItem } from "../types/core";
import { appReducer } from "./operations";

let sequence = 0;
vi.stubGlobal("crypto", { randomUUID: () => `business-config-${++sequence}` });
afterAll(() => vi.unstubAllGlobals());

function pointTemplate(state = createInitialState()): PointFieldTemplate {
  const template = getPointFieldTemplate(state, "RoboTea Lab", "饮品亭");
  template.fields.push({ key: "access_type", label: "入场方式", type: "select", enabled: true, required: true, defaultValue: "badge", options: [{ value: "badge", label: "工牌进入", enabled: true }, { value: "guest", label: "访客登记", enabled: true }] });
  template.fields.push({ key: "floor", label: "楼层", type: "number", enabled: true, required: true, defaultValue: 16 });
  template.fields.push({ key: "opening_day", label: "计划开业日期", type: "date", enabled: true, required: false, defaultValue: "2026-11-01" });
  return template;
}
const pointDraft: PointCreatePayload = { name: "配置验收咖啡点", code: "CONFIG-01", brand: "RoboTea Lab", scenario: "饮品亭", organization_id: "org-001", province: "广东省", city: "深圳市", area: "南山区", address: "前城中心16楼", owner: "点位负责人", status: "待上线", lat: null, lng: null, channel: "" };
function productDraft(): CatalogItem {
  const product = createProductConfiguration();
  product.sellingPoints = ["现磨咖啡", "香浓顺滑"];
  product.introduction = "现磨咖啡，香浓顺滑";
  product.images = [{ id: "config-image", name: "咖啡.png", url: "local-image:config-image", width: 800, height: 600 }];
  product.prices = product.prices.map((price, i) => ({ ...price, original: String(20 + i), promotional: String(15 + i) }));
  product.pointIds = ["pt-002"];
  return { id: "new", name: "配置验收咖啡", type: "饮品商品", brand: "RoboTea Lab", status: "草稿", flow: "饮品亭履约模板", attrs: [], product };
}
function approveLatest(state: AppState) {
  return appReducer({ ...state, currentUserId: "usr-010" }, { type: "review-approval", approvalId: state.approvalRequests[0].id, decision: "approve" });
}

describe("本次商品和点位业务配置主状态集成", () => {
  it("字段配置按品牌和场景保存，JSON重新加载后生成默认值并保留新增数据", () => {
    const initial = createInitialState();
    const configured = appReducer(initial, { type: "save-point-field-template", payload: pointTemplate(initial) });
    expect(configured.auditLogs[0].result).toBe("成功");
    const reloaded = JSON.parse(JSON.stringify(configured)) as AppState;
    const draft = applyPointDefaults(reloaded, pointDraft);
    expect(draft.customFields).toMatchObject({ access_type: "badge", floor: 16, opening_day: "2026-11-01" });
    const created = appReducer(reloaded, { type: "create-point", payload: draft });
    const point = created.points.find(p => p.code === pointDraft.code)!;
    expect(point.customFields).toEqual(draft.customFields);
    expect(JSON.parse(JSON.stringify(created)).points.find((p: { code: string }) => p.code === pointDraft.code).customFields).toEqual(draft.customFields);
    expect(initial.points.some(p => p.code === pointDraft.code)).toBe(false);
    expect(getPointFieldTemplate(created, "RoboTea Lab", "冰淇淋亭").fields).toEqual(defaultPointFields());
    expect(getPointFieldTemplate({ ...created, currentUserId: "usr-000" }, "RoboService Hub", "饮品亭").fields).toEqual(defaultPointFields());
  });

  it("缺失必填扩展字段、停用选项、类型错误和伪造字段均拒绝新增", () => {
    const configured = appReducer(createInitialState(), { type: "save-point-field-template", payload: pointTemplate() });
    const good = applyPointDefaults(configured, pointDraft);
    const disabled = structuredClone(pointTemplate());
    disabled.fields.find(f => f.key === "access_type")!.options![1].enabled = false;
    const state = appReducer(configured, { type: "save-point-field-template", payload: disabled });
    const invalidFields: Record<string, PointFieldValue>[] = [{ floor: 16 }, { ...good.customFields, access_type: "guest" }, { ...good.customFields, floor: "16" }, { ...good.customFields, unknown: "extra" }];
    for (const customFields of invalidFields) {
      const rejected = appReducer(state, { type: "create-point", payload: { ...good, customFields } });
      expect(rejected.points).toEqual(state.points);
      expect(rejected.brands).toEqual(state.brands);
      expect(rejected.auditLogs[0].result).toBe("已拒绝");
    }
  });

  it("字段改名保留稳定编码和历史值，停用不会重写旧点位", () => {
    let state = appReducer(createInitialState(), { type: "save-point-field-template", payload: pointTemplate() });
    state = appReducer(state, { type: "create-point", payload: applyPointDefaults(state, pointDraft) });
    const before = structuredClone(state.points);
    const template = getPointFieldTemplate(state, pointDraft.brand, pointDraft.scenario);
    template.fields.find(f => f.key === "access_type")!.label = "园区通行方式";
    template.fields.find(f => f.key === "access_type")!.options![0].label = "员工工牌";
    template.fields.find(f => f.key === "floor")!.enabled = false;
    const updated = appReducer(state, { type: "save-point-field-template", payload: template });
    expect(updated.auditLogs[0].result).toBe("成功");
    expect(updated.points).toEqual(before);
    const nextDraft = applyPointDefaults(updated, { ...pointDraft, name: "另一个配置点", code: "CONFIG-02" });
    expect(nextDraft.customFields?.floor).toBeUndefined();
    expect(nextDraft.customFields?.access_type).toBe("badge");
    expect(appReducer(updated, { type: "create-point", payload: nextDraft }).points).toHaveLength(updated.points.length + 1);
  });

  it("无权账号和越界品牌不能保存两种配置，停用账号也不能保存", () => {
    const initial = createInitialState();
    const productTemplate = { ...defaultProductTemplate("RoboTea Lab"), id: "test-template", name: "验收模板" };
    for (const state of [{ ...initial, currentUserId: "usr-013" }, { ...initial, users: initial.users.map(u => u.id === initial.currentUserId ? { ...u, status: "停用" } : u) }]) {
      const pointRejected = appReducer(state, { type: "save-point-field-template", payload: pointTemplate(initial) });
      const productRejected = appReducer(state, { type: "product-template-save", payload: { template: productTemplate, reason: "测试配置权限" } });
      expect(pointRejected.pointFieldTemplates).toEqual(state.pointFieldTemplates);
      expect(productRejected.productTemplates).toEqual(state.productTemplates);
      expect(pointRejected.auditLogs[0].result).toBe("已拒绝");
      expect(productRejected.auditLogs[0].result).toBe("已拒绝");
    }
    const outside = pointTemplate(initial);
    outside.brandId = initial.brands.find(b => b.name === "RoboService Hub")!.id;
    expect(appReducer(initial, { type: "save-point-field-template", payload: outside }).auditLogs[0].result).toBe("已拒绝");
    expect(appReducer(initial, { type: "product-template-save", payload: { template: { ...productTemplate, brand: "RoboService Hub" }, reason: "越界" } }).auditLogs[0].result).toBe("已拒绝");
  });

  it("字段配置不可取消城市范围、编码、坐标保护或删除历史选项", () => {
    const state = appReducer(createInitialState(), { type: "save-point-field-template", payload: pointTemplate() });
    for (const key of ["city", "code", "lat"]) {
      const template = getPointFieldTemplate(state, pointDraft.brand, pointDraft.scenario);
      template.fields.find(f => f.key === key)!.enabled = false;
      expect(appReducer(state, { type: "save-point-field-template", payload: template }).auditLogs[0].result).toBe("已拒绝");
    }
    const template = getPointFieldTemplate(state, pointDraft.brand, pointDraft.scenario);
    template.fields.find(f => f.key === "access_type")!.options!.pop();
    expect(appReducer(state, { type: "save-point-field-template", payload: template }).auditLogs[0].result).toBe("已拒绝");
    for (const payload of [{ city: "上海市" }, { lat: 91, lng: 120 }, { lat: 22, lng: null }]) {
      const rejected = appReducer(state, { type: "create-point", payload: { ...applyPointDefaults(state, pointDraft), ...payload } });
      expect(rejected.points).toEqual(state.points);
      expect(rejected.auditLogs[0].result).toBe("已拒绝");
    }
  });

  it("保存模板可放宽基础字数与图片限制，已有商品快照保持原配置", () => {
    const saved = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: false, reason: "" } });
    const original = structuredClone(saved.catalog[0]);
    const template = { ...defaultProductTemplate("RoboTea Lab"), id: "config-custom", name: "长名称无图模板", rules: { ...defaultProductTemplate("RoboTea Lab").rules, nameMax: 30, imageMin: 0, imageMax: 5 } };
    const configured = appReducer(saved, { type: "product-template-save", payload: { template, reason: "适用于新饮品" } });
    expect(configured.catalog[0]).toEqual(original);
    expect(configured.productTemplates?.find(t => t.id === template.id)?.rules).toMatchObject({ nameMax: 30, imageMin: 0, imageMax: 5 });
    const item = productDraft(); item.name = "这是超过十五个字但小于三十个字的商品名"; item.product!.rules = template.rules; item.product!.images = []; item.product!.templateId = template.id;
    const next = appReducer(JSON.parse(JSON.stringify(configured)), { type: "product-save", payload: { item, publish: false, reason: "" } });
    expect(next.catalog[0].name).toBe(item.name);
    expect(next.catalog[0].product?.rules).toEqual(template.rules);
  });

  it("稳定选项编码改名后原价和活动价不丢失，SKU展示使用新名称", () => {
    const saved = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: false, reason: "" } });
    const edited = structuredClone(saved.catalog[0]);
    const before = structuredClone(edited.product!.prices);
    edited.product!.optionGroups.find(g => g.id === "cup")!.options[0] = "标准中杯";
    const next = appReducer(saved, { type: "product-save", payload: { item: edited, publish: false, reason: "" } });
    expect(next.catalog[0].product!.prices).toEqual(before);
    expect(next.productVariants.filter(v => v.productId === edited.id).map(v => v.spec)).toContain("冰 / 标准中杯");
    expect(next.productVariants.find(v => v.productId === edited.id)?.price).toBe("¥15（原价 ¥20）");
  });

  it("统一价格及任选计价维度可保存发布，审批后可售SKU随矩阵同步", () => {
    const item = productDraft();
    item.product!.optionGroups = item.product!.optionGroups.map(g => ({ ...g, affectsPrice: false }));
    item.product!.prices = buildPriceMatrix(item.product!.optionGroups).map(row => ({ ...row, original: "25", promotional: "20" }));
    const published = approveLatest(appReducer(createInitialState(), { type: "product-save", payload: { item, publish: true, reason: "统一售价" } }));
    const id = published.catalog[0].id;
    expect(published.catalog[0].status).toBe("上架");
    expect(published.productVariants.filter(v => v.productId === id)).toHaveLength(1);
    expect(published.productVariants.find(v => v.productId === id)?.spec).toBe("统一价格");
    const edited = structuredClone(published.catalog[0]);
    edited.product!.optionGroups.find(g => g.id === "sweetness")!.affectsPrice = true;
    edited.product!.prices = buildPriceMatrix(edited.product!.optionGroups).map(row => ({ ...row, original: "25", promotional: "" }));
    const applied = approveLatest(appReducer({ ...published, currentUserId: "usr-002" }, { type: "product-save", payload: { item: edited, publish: false, reason: "按甜度计价" } }));
    expect(applied.productVariants.filter(v => v.productId === id).map(v => v.spec)).toEqual(["无糖", "少糖", "正常糖"]);
  });

  it("历史文字选项价格矩阵可直接批量上架，并保持原活动价格", () => {
    const item = productDraft(); item.id = "legacy-config-product";
    const groups = item.product!.optionGroups;
    item.product!.prices = item.product!.prices.map(price => {
      const selections = Object.fromEntries(Object.entries(price.selections).map(([key, id]) => {
        const group = groups.find(g => g.id === key)!;
        return [key, group.options[group.optionIds!.indexOf(id)]];
      }));
      return { ...price, selections, key: JSON.stringify(Object.entries(selections).sort(([a], [b]) => a.localeCompare(b))) };
    });
    item.product!.optionGroups = groups.map(({ optionIds: _optionIds, ...group }) => group);
    const state = createInitialState(); state.catalog.unshift(item);
    const staged = appReducer(state, { type: "product-batch", payload: { ids: [item.id], operation: "publish", reason: "历史商品上架" } });
    expect(staged.auditLogs[0].result).toBe("待审批");
    const applied = approveLatest(staged);
    expect(applied.catalog.find(c => c.id === item.id)?.status).toBe("上架");
    expect(applied.productVariants.filter(v => v.productId === item.id)).toHaveLength(6);
    expect(applied.productVariants.find(v => v.productId === item.id)?.price).toBe("¥15（原价 ¥20）");
  });

  it("迁移不会吞掉重复价格行，稳定编码与其他选项展示名重合也不丢价", () => {
    const saved = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: false, reason: "" } });
    const duplicate = structuredClone(saved.catalog[0]);
    duplicate.product!.prices.push(structuredClone(duplicate.product!.prices[0]));
    const rejected = appReducer(saved, { type: "product-save", payload: { item: duplicate, publish: false, reason: "" } });
    expect(rejected.catalog).toEqual(saved.catalog);
    expect(rejected.auditLogs[0].result).toBe("已拒绝");
    const renamed = structuredClone(saved.catalog[0]);
    const before = structuredClone(renamed.product!.prices);
    const cup = renamed.product!.optionGroups.find(g => g.id === "cup")!;
    cup.options[1] = cup.optionIds![0];
    const next = appReducer(saved, { type: "product-save", payload: { item: renamed, publish: false, reason: "" } });
    expect(next.auditLogs[0].result).toBe("成功");
    expect(next.catalog[0].product!.prices).toEqual(before);
    expect(next.catalog[0].product!.optionGroups.find(g => g.id === "cup")!.options[1]).toBe(cup.optionIds![0]);
  });

  it("默认品牌模板覆盖只出现一次，其他品牌默认值和历史商品不受影响", () => {
    const state = createInitialState();
    const originalCatalog = structuredClone(state.catalog);
    const template = defaultProductTemplate("RoboTea Lab");
    template.name = "品牌默认统一价模板";
    template.optionGroups = template.optionGroups.map(g => ({ ...g, affectsPrice: false }));
    template.rules.nameMax = 25;
    const configured = appReducer(state, { type: "product-template-save", payload: { template, reason: "更新后续创建默认模板" } });
    const templates = productTemplatesForBrand(configured, template.brand);
    expect(templates.filter(t => t.id === template.id)).toEqual([template]);
    expect(configured.catalog).toEqual(originalCatalog);
    expect(productTemplatesForBrand(configured, "RoboService Hub")[0].rules.nameMax).toBe(15);
    const roundTrip = JSON.parse(JSON.stringify(configured)) as AppState;
    expect(productTemplatesForBrand(roundTrip, template.brand)[0].rules.nameMax).toBe(25);
  });

  it("规格及选项排序保留对应价格，伪造价格编码不能保存", () => {
    const saved = appReducer(createInitialState(), { type: "product-save", payload: { item: productDraft(), publish: false, reason: "" } });
    const reordered = structuredClone(saved.catalog[0]);
    const cup = reordered.product!.optionGroups.find(g => g.id === "cup")!;
    cup.name = "容量";
    cup.options.reverse(); cup.optionIds!.reverse();
    reordered.product!.optionGroups.reverse();
    reordered.product!.prices = buildPriceMatrix(reordered.product!.optionGroups, reordered.product!.prices);
    const next = appReducer(saved, { type: "product-save", payload: { item: reordered, publish: false, reason: "" } });
    expect(next.auditLogs[0].result).toBe("成功");
    for (const price of saved.catalog[0].product!.prices) {
      expect(next.catalog[0].product!.prices.find(p => p.key === price.key)).toEqual(price);
    }
    const forged = structuredClone(next.catalog[0]); forged.product!.prices[0].key = "FORGED";
    const rejected = appReducer(next, { type: "product-save", payload: { item: forged, publish: false, reason: "" } });
    expect(rejected.auditLogs[0].result).toBe("已拒绝");
    expect(rejected.catalog).toEqual(next.catalog);
  });
});
