import type { AppState, CatalogItem, ProductCategory } from "../../types/core";

export const categoriesForBrand = (state: AppState, brand: string) => (state.productCategories || []).filter(row => row.brand === brand).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
export function categoryLabel(state: AppState, id?: string): string {
  if (!id) return "未分类";
  const category = state.productCategories?.find(row => row.id === id);
  return category ? `${category.name}${category.enabled ? "" : "（停用）"}` : "历史分类（不存在）";
}
export function validateCategory(state: AppState, category: ProductCategory, visibleBrands: string[]): string[] {
  const errors: string[] = [];
  const existing = state.productCategories?.find(row => row.id === category.id);
  if (!category.id.trim() || !category.name.trim() || Array.from(category.name.trim()).length > 30) errors.push("分类名称需填写 1–30 个字，编码不能为空");
  if (!visibleBrands.includes(category.brand)) errors.push("分类品牌超出当前权限范围");
  if (existing && existing.brand !== category.brand) errors.push("已有分类不能迁移品牌");
  if (!Number.isInteger(category.sortOrder) || category.sortOrder < 0 || category.sortOrder > 9999) errors.push("排序需为 0–9999 的整数");
  if (typeof category.enabled !== "boolean") errors.push("分类启用状态无效");
  if (state.productCategories?.some(row => row.id !== category.id && row.brand === category.brand && row.name.trim() === category.name.trim())) errors.push("同品牌分类名称不能重复（含停用分类）");
  return errors;
}
export function validateProductCategory(state: AppState, item: CatalogItem, previous?: CatalogItem): string[] {
  if (!item.categoryId) return [];
  const category = state.productCategories?.find(row => row.id === item.categoryId);
  if (!category || category.brand !== item.brand) return ["请选择商品所属品牌的有效分类"];
  if (!category.enabled && (previous?.categoryId !== item.categoryId || previous.brand !== item.brand)) return ["停用分类不能新选；已有商品可保留原分类"];
  return [];
}

/** Count stored associations separately from proposed associations awaiting approval. */
export function categoryUsage(state: AppState, id: string) {
  const associated = state.catalog.filter(item => item.categoryId === id);
  return {
    active: associated.filter(item => !item.product?.deletedAt).length,
    trash: associated.filter(item => item.product?.deletedAt).length,
    pending: state.catalogChanges.filter(change => change.status === "待审批" && change.afterItem.categoryId === id && change.beforeItem.categoryId !== id).length,
  };
}

export function categoryApprovalSummary(state: AppState, releaseId: string) {
  const change = state.catalogChanges.find(row => row.release === releaseId && (row.categoryOnly || row.beforeItem.categoryId !== row.afterItem.categoryId));
  if (!change) return undefined;
  const item = state.catalog.find(row => row.id === change.itemId);
  const target = state.productCategories?.find(row => row.id === change.afterItem.categoryId);
  const rollback = state.releases.some(row => row.id === releaseId && row.rollbackOf);
  return {
    itemName: item?.name || change.afterItem.name,
    current: categoryLabel(state, item?.categoryId),
    target: categoryLabel(state, change.afterItem.categoryId),
    status: change.status,
    note: change.status !== "待审批" ? "历史差异保留提交时名称；本表显示分类当前名称及状态。" :
      target?.enabled === false ? (rollback ? "回退目标已停用；批准后恢复历史归属，新商品仍不能选择该分类。" : "目标分类在申请提交后已停用；此申请保留原分类关联，批准后归入该停用分类，新商品仍不能选择。") :
      "审批前商品保留当前分类；批准后才变更归属，驳回不改变原分类。分类改名按当前名称显示，历史差异保留提交时名称。",
  };
}
