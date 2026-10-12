import type { AppState, CatalogItem, ProductVariant } from "../../types/core";
import type { ProductAction, ProductActionContext, ProductConfiguration, ProductOptionGroup, ProductPrice, ProductRules, ProductTemplate } from "./types";

export const PRODUCT_RULES = { nameMax: 15, sellingPointMin: 2, sellingPointMax: 4, sellingPointLength: 8, introductionMax: 50, imageMin: 1, imageMax: 3, imageMaxBytes: 5 * 1024 * 1024, optionMax: 8, groupMax: 6, matrixMax: 64 };
export const DEFAULT_OPTION_GROUPS: ProductOptionGroup[] = [
  { id: "sweetness", name: "甜度", options: ["无糖", "少糖", "正常糖"], affectsPrice: false },
  { id: "temperature", name: "温度", options: ["冰", "热"], affectsPrice: true },
  { id: "cup", name: "杯型", options: ["中杯", "大杯", "超大杯"], affectsPrice: true },
];
export const characterCount = (value: string) => Array.from(value.trim()).length;
export function normalizeGroups(groups: ProductOptionGroup[]): ProductOptionGroup[] {
  return groups.map(group => ({ ...group, optionIds: group.options.map((_, index) => group.optionIds?.[index] || `${group.id}-option-${index + 1}`), disabledOptionIds: group.disabledOptionIds || [], enabled: group.enabled !== false }));
}
export const activeGroups = (groups: ProductOptionGroup[]) => normalizeGroups(groups).filter(group => group.enabled !== false);
export const activeOptionIndexes = (group: ProductOptionGroup) => group.options.map((_, index) => index).filter(index => !group.disabledOptionIds?.includes(group.optionIds![index]));
export function selectionLabel(groups: ProductOptionGroup[], selections: Record<string, string>): string {
  return activeGroups(groups).filter(group => group.affectsPrice).map(group => group.options[group.optionIds!.indexOf(selections[group.id])] || selections[group.id]).join(" / ") || "统一价格";
}
export function buildPriceMatrix(groups: ProductOptionGroup[], previous: ProductPrice[] = []): ProductPrice[] {
  const priced = activeGroups(groups).filter((group) => group.affectsPrice);
  let selections: Record<string, string>[] = [{}];
  for (const group of priced) {
    const indexes = activeOptionIndexes(group);
    if (selections.length * indexes.length > PRODUCT_RULES.matrixMax) return [];
    selections = selections.flatMap((row) => indexes.map(index => ({ ...row, [group.id]: group.optionIds![index] })));
  }
  return selections.map((selection) => {
    const key = JSON.stringify(Object.entries(selection).sort(([a], [b]) => a.localeCompare(b)));
    const legacySelection = Object.fromEntries(priced.map(group => [group.id, group.options[group.optionIds!.indexOf(selection[group.id])]]));
    const legacyKey = JSON.stringify(Object.entries(legacySelection).sort(([a], [b]) => a.localeCompare(b)));
    const existing = previous.find((price) => price.key === key || price.key === legacyKey);
    return { key, selections: selection, original: existing?.original || "", promotional: existing?.promotional || "" };
  });
}
export function migrateProductPrices(groups: ProductOptionGroup[], prices: ProductPrice[]): ProductPrice[] {
  const normalized = normalizeGroups(groups);
  return prices.map(price => {
    const selections = Object.fromEntries(Object.entries(price.selections).map(([groupId, value]) => {
      const group = normalized.find(row => row.id === groupId);
      const index = group?.optionIds?.includes(value) ? -1 : group?.options.indexOf(value) ?? -1;
      return [groupId, index >= 0 ? group!.optionIds![index] : value];
    }));
    const stableKey = JSON.stringify(Object.entries(selections).sort(([a], [b]) => a.localeCompare(b)));
    const oldKey = JSON.stringify(Object.entries(price.selections).sort(([a], [b]) => a.localeCompare(b)));
    return { ...price, selections, key: price.key === oldKey || price.key === stableKey ? stableKey : price.key };
  });
}
export function defaultProductTemplate(brand: string): ProductTemplate {
  return { id: `default-${brand}`, name: "默认饮品模板", brand, enabled: true, optionGroups: normalizeGroups(DEFAULT_OPTION_GROUPS), rules: { ...PRODUCT_RULES } };
}
export function productTemplatesForBrand(state: AppState, brand: string): ProductTemplate[] {
  const saved = (state.productTemplates || []).filter(template => template.brand === brand);
  return [...(saved.some(template => template.id === `default-${brand}`) ? [] : [defaultProductTemplate(brand)]), ...saved];
}
export function validateRules(rules: ProductRules): string[] {
  const limits: Record<keyof ProductRules, number> = { nameMax: 100, sellingPointMin: 10, sellingPointMax: 10, sellingPointLength: 100, introductionMax: 2000, imageMin: 10, imageMax: 10 };
  if (Object.entries(limits).some(([key, max]) => !Number.isInteger(rules[key as keyof ProductRules]) || rules[key as keyof ProductRules] < (key.endsWith("Min") ? 0 : 1) || rules[key as keyof ProductRules] > max) || rules.sellingPointMin > rules.sellingPointMax || rules.imageMin > rules.imageMax) return ["基础规则超出允许范围，最小数量不能超过最大数量"];
  return [];
}
export function validateGroups(groups: ProductOptionGroup[]): string[] {
  const normalized = normalizeGroups(groups);
  const errors: string[] = [];
  if (groups.length > PRODUCT_RULES.groupMax || new Set(groups.map(group => group.id)).size !== groups.length || new Set(groups.map(group => group.name.trim())).size !== groups.length || normalized.some(group => !group.id || !group.name.trim() || !group.options.length || group.options.length > PRODUCT_RULES.optionMax || new Set(group.options.map(option => option.trim())).size !== group.options.length || group.options.some(option => !option.trim()) || new Set(group.optionIds).size !== group.options.length || group.optionIds!.some(id => !id.trim()) || (group.enabled !== false && !activeOptionIndexes(group).length) || (group.required && group.enabled === false))) errors.push("规格名称、编码和选项不能为空或重复；启用规格至少保留一个选项；必需规格不能停用（最多 6 组，每组 8 项）");
  if (!buildPriceMatrix(groups).length) errors.push("计价组合超过 64 档，请减少选项或计价维度");
  return errors;
}
export function createProductConfiguration(item?: CatalogItem, state?: AppState): ProductConfiguration {
  if (item?.product) { const config = structuredClone(item.product); config.rules = { ...PRODUCT_RULES, ...config.rules }; config.optionGroups = normalizeGroups(config.optionGroups); config.prices = migrateProductPrices(config.optionGroups, config.prices); config.priceSkuIds = priceSkuIdsForItem(state, { ...item, product: config }); return config; }
  const brandDefault = item && !item.id ? state?.productTemplates?.find(template => template.id === `default-${item.brand}` && template.brand === item.brand && template.enabled) : undefined;
  const groups = normalizeGroups(structuredClone(brandDefault?.optionGroups || DEFAULT_OPTION_GROUPS));
  const variant = state?.productVariants.find((entry) => entry.product === item?.name);
  const original = variant?.price.replace(/[^\d.]/g, "") || "";
  return {
    version: 1, rules: { ...PRODUCT_RULES, ...brandDefault?.rules }, templateId: brandDefault?.id, sellingPoints: Array.from({ length: brandDefault?.rules.sellingPointMin ?? 2 }, () => ""), introduction: "", optionGroups: groups,
    prices: buildPriceMatrix(groups).map((price) => ({ ...price, original })), images: [],
    pointIds: state?.points.filter((point) => point.brand === item?.brand && variant?.points.includes(point.name)).map((point) => point.id) || [],
  };
}
export function validateProduct(item: CatalogItem, publishing = false): string[] {
  const errors: string[] = [];
  const config = item.product ? { ...item.product, optionGroups: normalizeGroups(item.product.optionGroups), prices: migrateProductPrices(item.product.optionGroups, item.product.prices) } : undefined;
  const rules = config?.rules || PRODUCT_RULES;
  if (!item.name.trim() || characterCount(item.name) > rules.nameMax) errors.push(`商品名需填写 1–${rules.nameMax} 个字`);
  if (!item.brand.trim() || !item.flow.trim() || !item.type.trim()) errors.push("请选择品牌、类型并填写履约模板");
  if (!config) return [...errors, "缺少商品配置"];
  if (config.version !== 1) errors.push("商品配置版本不支持");
  if (config.sellingPoints.length < rules.sellingPointMin || config.sellingPoints.length > rules.sellingPointMax || config.sellingPoints.some((point) => !point.trim() || characterCount(point) > rules.sellingPointLength)) errors.push(`卖点需填写 ${rules.sellingPointMin}–${rules.sellingPointMax} 条，每条 1–${rules.sellingPointLength} 个字`);
  if (!config.introduction.trim() || characterCount(config.introduction) > rules.introductionMax) errors.push(`商品简介需填写 1–${rules.introductionMax} 个字`);
  const groups = config.optionGroups;
  errors.push(...validateRules(rules), ...validateGroups(groups));
  const expected = buildPriceMatrix(groups);
  if (!expected.length || expected.length > PRODUCT_RULES.matrixMax) errors.push("价格组合需在 1–64 行之间，请减少规格选项");
  if (config.prices.length !== expected.length || new Set(config.prices.map((price) => price.key)).size !== expected.length || expected.some((price) => !config.prices.some((row) => row.key === price.key && JSON.stringify(Object.entries(row.selections).sort()) === JSON.stringify(Object.entries(price.selections).sort())))) errors.push("价格矩阵与规格不匹配");
  const validMoney = (value: string) => /^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
  if (config.prices.some((price) => !validMoney(price.original) || (price.promotional !== "" && (!validMoney(price.promotional) || Number(price.promotional) > Number(price.original))))) errors.push("原价需大于 0，最多两位小数；活动价可留空且不能超过原价");
  if (config.images.length < rules.imageMin || config.images.length > rules.imageMax) errors.push(`请上传 ${rules.imageMin}–${rules.imageMax} 张商品图片`);
  if (config.images.some((image) => !/^local-image:[a-zA-Z0-9-]+$/.test(image.url) || image.width <= 0 || image.height <= 0 || !Number.isFinite(image.width) || !Number.isFinite(image.height))) errors.push("图片需为有效上传的 JPG、PNG 或 WebP");
  if (new Set(config.pointIds).size !== config.pointIds.length) errors.push("可售点位不可重复");
  if (publishing && !config.pointIds.length) errors.push("上架前至少选择一个可售点位");
  return errors;
}
export const isLegacyService = (item: CatalogItem) => item.type === "机器人服务" && (!item.product || Boolean(item.product.legacyVariants));
/** Legacy services retain their service duration SKU and may be free. */
export function validateProductPublication(state: AppState, item: CatalogItem, visiblePointIds: string[]): string[] {
  if (!isLegacyService(item)) {
    const errors = validateProduct(item, true);
    if (item.product?.pointIds.some((id) => !visiblePointIds.includes(id) || state.points.find((point) => point.id === id)?.brand !== item.brand)) errors.push("可售点位超出当前权限范围或不属于商品品牌");
    return errors;
  }
  const errors: string[] = [];
  if (!item.name.trim() || !item.flow.trim() || !item.brand.trim()) errors.push("服务名称、品牌与履约模板不能为空");
  const variants = item.product?.legacyVariants || state.productVariants.filter((row) => row.productId === item.id || (!row.productId && row.product === item.name));
  if (!variants.length) errors.push("请先编辑并补齐服务 SKU、规格、价格与可售点位");
  for (const variant of variants) {
    const money = variant.price.trim().match(/^[¥￥]?\s*(\d+(?:\.\d{1,2})?)(?:\s*\/\s*.+)?$/);
    if (!variant.sku.trim() || !variant.spec.trim() || !money || !Number.isFinite(Number(money[1]))) errors.push("服务 SKU、规格及非负价格无效（允许免费服务）");
    const names = variant.points.split("、").map((name) => name.trim()).filter(Boolean);
    if (!names.length || names.some((name) => !state.points.some((point) => point.name === name && point.brand === item.brand && visiblePointIds.includes(point.id)))) errors.push("服务可售点位不能为空、超出权限范围或属于其他品牌");
  }
  return errors;
}
function nextId(prefix: string, existing: string[]) {
  let number = 1;
  while (existing.includes(`${prefix}-${String(number).padStart(3, "0")}`)) number++;
  return `${prefix}-${String(number).padStart(3, "0")}`;
}
function recordAudit(state: AppState, context: ProductActionContext, action: string, object: string, result: string, detail: string) {
  state.auditLogs.unshift({ id: nextId("AUD", state.auditLogs.map((row) => row.id)), time: context.now, operator: context.actor, action, object, risk: "L3", result, detail });
}
function stageChange(state: AppState, before: CatalogItem, after: CatalogItem, reason: string, context: ProductActionContext) {
  const id = nextId("REL", state.releases.map((row) => row.id));
  const brand = state.brands.find((row) => row.name === after.brand);
  const summarize = (item: CatalogItem) => {
    const config = item.product;
    const rules = config?.rules || PRODUCT_RULES;
    const groups = config ? normalizeGroups(config.optionGroups).map(group => `${group.name}（${group.enabled === false ? "停用" : "启用"}、${group.required ? "必需" : "可选"}、${group.affectsPrice ? "参与计价" : "不参与计价"}）：${group.options.map((option, index) => `${option}${group.disabledOptionIds?.includes(group.optionIds![index]) ? "[停用]" : "[启用]"}`).join(" / ")}`).join("；") || "无规格 / 统一价格" : "历史规格";
    const points = config?.pointIds.map(id => state.points.find(point => point.id === id)?.name || id).join("、") || "未配置";
    return `${item.name}；${item.status}；${config?.deletedAt ? "已删除" : "正常"}；类型 ${item.type}；履约 ${item.flow}；规格 ${groups}；规则 商品名≤${rules.nameMax}字，卖点${rules.sellingPointMin}–${rules.sellingPointMax}条 / 每条≤${rules.sellingPointLength}字，简介≤${rules.introductionMax}字，图片${rules.imageMin}–${rules.imageMax}张；${config?.prices.map(price => `${selectionLabel(config.optionGroups, price.selections)} ¥${price.original}${price.promotional ? ` / 活动 ¥${price.promotional}` : ""}`).join("、") || "历史配置"}；卖点 ${config?.sellingPoints.join("、") || "-"}；简介 ${config?.introduction || "-"}；图片 ${config?.images.map(image => `${image.name} [${image.id}]`).join("、") || "无"}；可售点位 ${points}`;
  };
  state.releases.unshift({ id, name: `商品配置变更：${after.name}`, scope: after.brand, scopeRef: { type: "brand", id: brand?.id || after.brand, label: after.brand, value: `${brand?.tenant || "品牌"} / ${after.brand}`, parent: brand?.tenant }, status: "待审批", by: context.actor, time: context.now });
  state.releaseDiffs.unshift({ release: id, object: `商品 ${after.name}`, before: summarize(before), after: summarize(after), impact: after.product?.pointIds.map((pointId) => state.points.find((point) => point.id === pointId)?.name).filter(Boolean).join("、") || "商品目录" });
  state.catalogChanges.unshift({ release: id, itemId: before.id, beforeItem: structuredClone(before), afterItem: structuredClone(after), reason, status: "待审批" });
  state.approvalRequests.unshift({ id: nextId("APR", state.approvalRequests.map((row) => row.id)), time: context.now, action: "配置发布", target: id, requester: context.actor, approver: "配置审批人", rule: "影响点位经营时必须审批", status: "待审批", risk: "L3" });
  recordAudit(state, context, "提交商品配置发布", after.id, "待审批", `${reason}；发布 ${id}`);
}
/** Mutates the reducer's cloned state. Validates the entire batch before writing any item. */
export function handleProductAction(state: AppState, action: ProductAction, context: ProductActionContext): { error?: string; message?: string } {
  const fail = (error: string) => { recordAudit(state, context, "商品管理", action.type, "已拒绝", error); return { error }; };
  if (!context.allowed) return fail("当前账号无商品配置权限");
  const pending = (id: string) => state.catalogChanges.some((change) => change.itemId === id && change.status === "待审批");
  const reason = action.payload.reason.trim();
  if (action.type === "product-template-save") {
    const template = structuredClone(action.payload.template);
    if (!context.visibleBrandNames.includes(template.brand)) return fail("模板品牌超出当前权限范围");
    const existing = state.productTemplates?.find(row => row.id === template.id);
    if (existing && existing.brand !== template.brand) return fail("模板不能迁移品牌");
    if (!template.id || !template.name.trim() || !reason) return fail("请填写模板名称和变更原因");
    const errors = [...validateRules(template.rules), ...validateGroups(template.optionGroups)];
    if (errors.length) return fail(errors.join("；"));
    template.optionGroups = normalizeGroups(template.optionGroups);
    state.productTemplates = [...(state.productTemplates || []).filter(row => row.id !== template.id), template];
    recordAudit(state, context, "保存商品规格模板", state.brands.find(brand => brand.name === template.brand)?.id || template.brand, "成功", `${template.id}；${template.brand} / ${template.name}；${reason}；仅新商品默认模板和后续明确应用模板的商品受影响`);
    return { message: "规格模板已保存，已有商品保持原配置" };
  }
  if (action.type === "product-save") {
    const input = structuredClone(action.payload.item);
    if (input.product) { input.product.rules = { ...PRODUCT_RULES, ...input.product.rules }; input.product.optionGroups = normalizeGroups(input.product.optionGroups); input.product.prices = migrateProductPrices(input.product.optionGroups, input.product.prices); }
    const existing = state.catalog.find((row) => row.id === input.id);
    if (existing && !context.visibleItemIds.includes(existing.id)) return fail("商品超出当前权限范围");
    if (!context.visibleBrandNames.includes(input.brand)) return fail("品牌超出当前权限范围");
    if (existing && (existing.product?.deletedAt || pending(existing.id))) return fail("商品已删除或已有待审批变更，请先恢复或完成审批");
    if (existing && existing.brand !== input.brand) return fail("已有商品不能迁移品牌，请新建商品");
    if (input.product?.pointIds.some((id) => !context.visiblePointIds.includes(id) || state.points.find((point) => point.id === id)?.brand !== input.brand)) return fail("可售点位超出当前权限范围或不属于商品品牌");
    if (existing?.product && input.product) input.product.priceSkuIds = { ...(input.product.priceSkuIds || {}), ...priceSkuIdsForItem(state, existing) };
    const publishing = action.payload.publish || existing?.status === "上架";
    const errors = validateProduct(input, publishing);
    if (errors.length) return fail(errors.join("；"));
    if (publishing && !reason) return fail("提交发布需填写变更原因");
    if (state.catalog.some((row) => row.id !== existing?.id && row.name.trim() === input.name.trim())) return fail("商品名称已存在，请使用不同名称");
    input.name = input.name.trim();
    input.attrs = input.product!.optionGroups.map((group) => group.name);
    input.status = publishing ? "上架" : existing?.status || "草稿";
    // Lifecycle fields are controlled exclusively by batch actions.
    delete input.product!.deletedAt;
    delete input.product!.previousStatus;
    delete input.product!.legacyVariants;
    if (!existing) {
      input.id = nextId("sku-product", state.catalog.map((row) => row.id));
      const draft = { ...structuredClone(input), status: "草稿" };
      state.catalog.unshift(draft);
      syncProductVariants(state, draft);
      recordAudit(state, context, "创建商品", draft.id, "成功", draft.name);
      if (publishing) stageChange(state, draft, input, reason, context);
    } else if (publishing) stageChange(state, existing, input, reason, context);
    else {
      state.catalog[state.catalog.findIndex((row) => row.id === existing.id)] = input;
      syncProductVariants(state, input, existing.name);
      recordAudit(state, context, "保存商品", input.id, "成功", input.name);
    }
    return { message: publishing ? "已提交配置审批，审批通过后生效" : "商品已保存" };
  }
  if (!["publish", "unpublish", "delete", "restore"].includes(action.payload.operation)) return fail("不支持的商品操作");
  const ids = [...new Set(action.payload.ids)];
  if (!ids.length) return fail("请至少选择一个商品");
  if (!reason) return fail("批量操作需填写变更原因");
  const changes: Array<{ before: CatalogItem; after: CatalogItem }> = [];
  for (const id of ids) {
    const before = state.catalog.find((item) => item.id === id);
    if (!before || !context.visibleItemIds.includes(id)) return fail("选择中包含不存在或无权限的商品，整批未提交");
    if (pending(id)) return fail(`${before.name}已有待审批变更，整批未提交`);
    const after = structuredClone(before);
    if (after.product && !after.product.legacyVariants) after.product = createProductConfiguration(after, state);
    const deleted = Boolean(before.product?.deletedAt);
    const operation = action.payload.operation;
    if (operation === "restore") {
      if (!deleted) return fail(`${before.name}未删除，整批未提交`);
      delete after.product!.deletedAt;
      delete after.product!.previousStatus;
      after.status = "下架";
    } else {
      if (deleted) return fail(`${before.name}已删除，整批未提交`);
      if (operation === "publish") {
        if (before.status === "上架") return fail(`${before.name}已上架，整批未提交`);
        const errors = validateProductPublication(state, before, context.visiblePointIds);
        if (errors.length) return fail(`${before.name}：${errors.join("；")}；整批未提交`);
        after.status = "上架";
      } else if (operation === "unpublish") {
        if (before.status !== "上架") return fail(`${before.name}不是上架商品，整批未提交`);
        after.status = "下架";
      } else {
        if (!after.product) {
          after.product = createProductConfiguration(before, state);
          after.product.legacyVariants = structuredClone(state.productVariants.filter((row) => row.productId === before.id || (!row.productId && row.product === before.name)));
        }
        after.product.previousStatus = before.status;
        after.product.deletedAt = context.now;
        after.status = "已删除";
      }
    }
    changes.push({ before, after });
  }
  for (const change of changes) stageChange(state, change.before, change.after, reason, context);
  return { message: `已提交 ${changes.length} 个商品审批，审批通过后生效` };
}
/** Recover legacy numbered SKUs before display names or matrix order change. */
function priceSkuIdsForItem(state: AppState | undefined, item: CatalogItem): Record<string, string> {
  const config = item.product;
  if (!config) return {};
  const map = { ...(config.priceSkuIds || {}) };
  const used = new Set(Object.values(map));
  const variants = state?.productVariants.filter(variant => variant.productId === item.id || (!variant.productId && variant.product === item.name)) || [];
  for (const price of migrateProductPrices(config.optionGroups, config.prices)) {
    if (map[price.key]) continue;
    const variant = variants.find(row => row.spec === selectionLabel(config.optionGroups, price.selections) && !used.has(row.sku));
    if (variant) { map[price.key] = variant.sku; used.add(variant.sku); }
  }
  return map;
}
export function syncProductVariants(state: AppState, item: CatalogItem, previousName?: string) {
  if (!item.product) return;
  const skuIds = priceSkuIdsForItem(state, item);
  const reservedIds = new Set([...Object.values(skuIds), ...state.productVariants.map(variant => variant.sku)]);
  const names = [item.name, previousName].filter(Boolean);
  state.productVariants = state.productVariants.filter((variant) => variant.productId !== item.id && !( !variant.productId && names.includes(variant.product) && !state.catalog.some((row) => row.id !== item.id && row.name === variant.product)));
  if (item.product.deletedAt) return;
  const points = item.product.pointIds.map((id) => state.points.find((point) => point.id === id)?.name).filter(Boolean).join("、");
  if (item.product.legacyVariants) {
    state.productVariants.unshift(...item.product.legacyVariants.map((variant) => ({ ...variant, productId: item.id, product: item.name })));
    return;
  }
  const variants: ProductVariant[] = item.product.prices.map(price => {
    if (!skuIds[price.key]) {
      let number = 1;
      while (reservedIds.has(`${item.id}-${String(number).padStart(2, "0")}`)) number++;
      skuIds[price.key] = `${item.id}-${String(number).padStart(2, "0")}`;
      reservedIds.add(skuIds[price.key]);
    }
    return { productId: item.id, product: item.name, sku: skuIds[price.key], spec: selectionLabel(item.product!.optionGroups, price.selections), price: `¥${price.promotional || price.original}${price.promotional ? `（原价 ¥${price.original}）` : ""}`, points };
  });
  item.product.priceSkuIds = skuIds;
  state.productVariants.unshift(...variants);
}
