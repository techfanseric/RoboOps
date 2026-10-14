import { FilePenLine, Plus, Trash2 } from "lucide-react";
import { useState, type Dispatch } from "react";
import { Badge, DataTable, DetailLink, EmptyState, NameCell, Section } from "../components/ui";
import { staticData } from "../data/mockData";
import { catalogItemVisibleForCurrentUser, configReleaseActionPolicy, filteredCatalogItems, filteredPoints, filteredBrands, releaseVisibleForCurrentUser, type AppAction } from "../services/operations";
import type { AppState, CatalogItem } from "../types/core";
import { LegacyCatalogChangeDrawer } from "../features/products/LegacyCatalogChangeDrawer";
import { ProductEditor } from "../features/products/ProductEditor";
import { ProductTemplateEditor } from "../features/products/ProductTemplateEditor";
import { activeGroups, activeOptionIndexes, validateProductPublication } from "../features/products/domain";
import { productImageSource } from "../features/products/images";
import type { ProductOperation } from "../features/products/types";
import "../features/products/products.css";

import { ProductCategoryManager, ProductCategoryAssignment } from "../features/products/ProductCategories";
import { categoryLabel } from "../features/products/categories";

const operationLabels: Record<ProductOperation, string> = { publish: "上架", unpublish: "下架", delete: "删除", restore: "恢复" };
export function Catalog({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [categoryManager, setCategoryManager] = useState(false);
  const [assigning, setAssigning] = useState<CatalogItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [configuring, setConfiguring] = useState(false);
  const [tab, setTab] = useState<"active" | "trash">("active");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ item?: CatalogItem; mode: "edit" | "prices" | "publish" } | null>(null);
  const [batch, setBatch] = useState<{ ids: string[]; operation: ProductOperation } | null>(null);
  const [notice, setNotice] = useState("");
  const policy = configReleaseActionPolicy(state);
  const all = state.catalog.filter((item) => catalogItemVisibleForCurrentUser(state, item.id) && (state.filters.brand === "all" || item.brand === state.filters.brand));
  const activeItems = filteredCatalogItems(state).filter((item) => !item.product?.deletedAt);
  const trash = all.filter((item) => item.product?.deletedAt);
  const visibleBrands = new Set(filteredBrands(state).map(row => row.name));
  const categoryOptions = (state.productCategories || []).filter(row => visibleBrands.has(row.brand) && (state.filters.brand === "all" || row.brand === state.filters.brand)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const effectiveCategoryFilter = categoryFilter === "unclassified" || categoryOptions.some(row => row.id === categoryFilter) ? categoryFilter : "all";
  const items = (tab === "trash" ? trash : activeItems).filter((item) => `${item.name} ${item.id} ${item.brand}`.toLowerCase().includes(query.toLowerCase()) && (effectiveCategoryFilter === "all" || (effectiveCategoryFilter === "unclassified" ? !item.categoryId : item.categoryId === effectiveCategoryFilter)));
  const selected = items.filter((item) => selectedIds.includes(item.id));
  const pending = (item: CatalogItem) => state.catalogChanges.some((change) => change.itemId === item.id && change.status === "待审批");
  const visibleChanges = state.catalogChanges.filter((change) => all.some((item) => item.id === change.itemId) && releaseVisibleForCurrentUser(state, change.release));
  const canBatch = (operation: ProductOperation) => policy.allowed && selected.length > 0 && selected.every((item) => !pending(item) && (operation === "publish" ? item.status !== "上架" : operation === "unpublish" ? item.status === "上架" : true));
  const changeTab = (next: "active" | "trash") => { setTab(next); setSelectedIds([]); };
  return <>
    {notice && <div className="product-notice" role="status">{notice}</div>}
    <div className="product-stats">{[["商品总数", activeItems.length], ["已上架", activeItems.filter((item) => item.status === "上架").length], ["待审批", all.filter(pending).length], ["回收站", trash.length]].map(([label, count]) => <div className="product-stat" key={label}><small>{label}</small><strong>{count}</strong></div>)}</div>
    <Section title="商品/服务目录" meta="管理商品内容、SKU 价格与可售范围；配置发布审批后生效" action={<div className="product-inline"><button className="text-button" type="button" disabled={!policy.allowed} onClick={() => setCategoryManager(true)}>分类管理</button><button className="text-button" type="button" disabled={!policy.allowed} onClick={() => setConfiguring(true)}>规格与计价配置</button><button type="button" className="text-button primary-action" disabled={!policy.allowed} title={policy.message} onClick={() => setEditor({ mode: "edit" })}><Plus className="lucide-icon"/> 创建商品</button></div>}>
      <div className="product-toolbar"><div className="product-tabs"><button type="button" className={`text-button ${tab === "active" ? "active" : ""}`} onClick={() => changeTab("active")}>商品列表 {activeItems.length}</button><button type="button" className={`text-button ${tab === "trash" ? "active" : ""}`} onClick={() => changeTab("trash")}><Trash2 className="lucide-icon"/> 回收站 {trash.length}</button></div><select aria-label="筛选商品分类" value={effectiveCategoryFilter} onChange={event => { setCategoryFilter(event.target.value); setSelectedIds([]); }}><option value="all">全部分类</option><option value="unclassified">未分类</option>{categoryOptions.map(row => <option key={row.id} value={row.id}>{row.name}{!row.enabled ? "（停用）" : ""}{state.filters.brand === "all" ? ` · ${row.brand}` : ""}</option>)}</select><input aria-label="搜索商品" placeholder="搜索商品名称、编号、品牌" value={query} onChange={(event) => setQuery(event.target.value)}/></div>
      <div className="product-selection-bar"><label className="checkbox-row"><input className="product-table-check" type="checkbox" aria-label="全选当前商品" checked={items.length > 0 && selected.length === items.length} onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item.id) : [])}/><span>全选</span></label><span>已选 {selected.length} 项 · 批量操作整批校验后提交审批</span>{(tab === "trash" ? ["restore"] : ["publish", "unpublish", "delete"]).map((operation) => <button type="button" key={operation} className="text-button" disabled={!canBatch(operation as ProductOperation)} onClick={() => setBatch({ ids: selected.map((item) => item.id), operation: operation as ProductOperation })}>批量{operationLabels[operation as ProductOperation]}</button>)}</div>
      {items.length ? <DataTable headers={["选择", "商品", "品牌 / 类型", "分类", "状态", "规格 / 价格", "操作"]} rows={items.map((item) => {
        const config = item.product;
        const effective = config?.legacyVariants ? [] : config?.prices.map((price) => Number(price.promotional || price.original)).filter((price) => Number.isFinite(price) && price > 0) || [];
        const priceRange = config?.legacyVariants?.[0]?.price || (effective.length ? `¥${Math.min(...effective).toFixed(2)}${Math.min(...effective) !== Math.max(...effective) ? `–${Math.max(...effective).toFixed(2)}` : ""}` : state.productVariants.find((variant) => variant.product === item.name)?.price || "待配置");
        return { key: item.id, cells: [<input className="product-table-check" type="checkbox" aria-label={`选择${item.name}`} checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))}/>, <div className="product-name">{config?.images[0] && <img className="product-thumb" src={productImageSource(config.images[0])} alt={`${item.name}封面`}/>}<NameCell primary={item.name} secondary={item.id}/></div>, <NameCell primary={item.brand} secondary={item.type}/>, categoryLabel(state, item.categoryId), <><Badge value={item.status}/>{pending(item) && <Badge value="待审批"/>}</>, <NameCell primary={priceRange} secondary={config?.legacyVariants ? `${config.legacyVariants.length} 个服务 SKU` : config ? `${activeGroups(config.optionGroups).reduce((total, group) => total * activeOptionIndexes(group).length, 1)} 个组合 / ${config.prices.length} 个价格档` : "历史商品 · 编辑补全新配置"}/>, <div className="product-table-actions">{tab === "trash" ? <button className="text-button" type="button" disabled={!policy.allowed || pending(item)} onClick={() => setBatch({ ids: [item.id], operation: "restore" })}>恢复</button> : <><button className="text-button" type="button" disabled={!policy.allowed || pending(item)} onClick={() => setAssigning(item)}>归类</button><button className="text-button" type="button" disabled={!policy.allowed || pending(item)} onClick={() => setEditor({ item, mode: "edit" })}><FilePenLine className="lucide-icon"/> 编辑</button><button className="text-button" type="button" disabled={!policy.allowed || pending(item)} onClick={() => setEditor({ item, mode: config && !config.legacyVariants ? "prices" : "edit" })}>编辑价格</button><button className="text-button" type="button" disabled={!policy.allowed || pending(item)} onClick={() => item.status === "上架" ? setBatch({ ids: [item.id], operation: "unpublish" }) : setEditor({ item, mode: "publish" })}>{item.status === "上架" ? "下架" : "上架"}</button><button className="text-button" type="button" disabled={!policy.allowed || pending(item)} onClick={() => setBatch({ ids: [item.id], operation: "delete" })}>删除</button></>}</div>] };
      })}/> : <EmptyState>{query ? "未找到匹配的商品" : effectiveCategoryFilter !== "all" ? "当前分类暂无商品，可调整分类筛选" : tab === "trash" ? "回收站为空，已删除商品可在此恢复" : "当前范围暂无商品，可创建新商品"}</EmptyState>}
      {!policy.allowed && <p className="product-help">{policy.message}</p>}
    </Section>
    <div className="grid two"><Section title="已有类型参考" meta="只读参考；本次业务配置入口为规格与计价配置"><DataTable headers={["类型", "属性组", "计价方式"]} rows={staticData.productTypes.map((type) => [type.name, type.attrs, type.pricing])}/></Section><Section title="配置规则" meta="按品牌维护规格模板，商品明确应用后生效"><p className="product-help">基础默认规格：无糖 / 少糖 / 正常糖，冰 / 热，中杯 / 大杯 / 超大杯。默认生成 18 个可选组合，共享 6 个杯型与温度价格档。</p><p className="product-help">通过“规格与计价配置”维护模板、字段规则、选项启停排序及计价维度。所有维度均可取消计价，使用统一价格。图片建议 800 × 600，保持原比例保存。删除采用回收站，恢复后为下架，需重新审批上架。</p></Section></div>
    <Section title="待发布变更" meta="创建商品可先存为草稿，经营配置变更进入发布与审批记录">{visibleChanges.length ? <DataTable headers={["发布", "对象", "状态", "原因", "详情"]} rows={visibleChanges.map((change) => [<NameCell primary={change.release} secondary={change.afterItem.brand}/>, change.afterItem.name, <Badge value={change.status}/>, change.reason, <DetailLink to={`/releases/${change.release}`} title={`打开${change.release}详情`}/>])}/> : <EmptyState>当前范围暂无目录变更</EmptyState>}</Section>
    {categoryManager && <ProductCategoryManager state={state} dispatch={dispatch} onClose={() => setCategoryManager(false)}/> }
    {assigning && <ProductCategoryAssignment state={state} item={assigning} dispatch={dispatch} onClose={message => { setAssigning(null); if (message) setNotice(message); }}/> }
    {configuring && <ProductTemplateEditor state={state} dispatch={dispatch} onClose={message => { setConfiguring(false); if (message) setNotice(message); }}/> }
    {editor && (editor.item?.type === "机器人服务" && (!editor.item.product || editor.item.product.legacyVariants) ? <LegacyCatalogChangeDrawer state={state} item={editor.item} dispatch={dispatch} onClose={() => setEditor(null)}/> : <ProductEditor key={`${editor.item?.id || "new"}-${editor.mode}`} state={state} item={editor.item} mode={editor.mode} dispatch={dispatch} onClose={(message) => { setEditor(null); if (message) setNotice(message); }}/>)}
    {batch && <ProductBatchDialog state={state} ids={batch.ids} operation={batch.operation} dispatch={dispatch} onClose={(message) => { setBatch(null); if (message) { setSelectedIds([]); setNotice(message); } }}/>}
  </>;
}
function ProductBatchDialog({ state, ids, operation, dispatch, onClose }: { state: AppState; ids: string[]; operation: ProductOperation; dispatch: Dispatch<AppAction>; onClose: (notice?: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const items = state.catalog.filter((item) => ids.includes(item.id));
  const policy = configReleaseActionPolicy(state);
  const submit = () => {
    const issues: string[] = [];
    if (!reason.trim()) issues.push("请填写变更原因");
    if (!policy.allowed) issues.push(policy.message);
    if (items.length !== ids.length || items.some((item) => !catalogItemVisibleForCurrentUser(state, item.id))) issues.push("选择中包含不存在或无权限的商品");
    if (items.some((item) => state.catalogChanges.some((change) => change.itemId === item.id && change.status === "待审批"))) issues.push("选择中包含已有待审批变更的商品");
    for (const item of items) {
      if (operation === "publish") { issues.push(...validateProductPublication(state, item, filteredPoints(state).map((point) => point.id)).map((issue) => `${item.name}：${issue}`)); if (item.status === "上架") issues.push(`${item.name}已上架`); }
      if (operation === "unpublish" && item.status !== "上架") issues.push(`${item.name}未上架`);
      if ((operation === "restore") !== Boolean(item.product?.deletedAt)) issues.push(`${item.name}状态与操作不匹配`);
    }
    if (issues.length) { setError(issues.join("；")); return; }
    dispatch({ type: "product-batch", payload: { ids, operation, reason } });
    onClose(`已提交 ${items.length} 个商品${operationLabels[operation]}审批，审批通过后生效`);
  };
  return <div className="drawer-scrim" role="presentation" onClick={() => onClose()}><aside className="action-drawer product-confirm" role="dialog" aria-modal="true" aria-labelledby="product-batch-title" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><h3 id="product-batch-title">{ids.length > 1 ? "批量" : ""}{operationLabels[operation]}商品</h3><button className="text-button" type="button" onClick={() => onClose()}>取消</button></div><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submit(); }}><div className="policy-strip"><Badge value="L3"/><span>审批通过后生效，同商品有待审批变更时禁止重复提交。</span></div><p className="product-confirm-summary">已选 {items.length} 项：{items.map((item) => item.name).join("、")}<br/>{operation === "delete" ? "删除后移入回收站，并取消商品可售资格；支持恢复。" : operation === "restore" ? "恢复后保持下架，可再次编辑并审批上架。" : "整个批次先校验，每个商品生成独立发布与审批记录。"}</p>{error && <div className="product-errors" role="alert">{error}</div>}<label className="field"><span>变更原因</span><textarea aria-label="批量商品变更原因" value={reason} onChange={(event) => setReason(event.target.value)} rows={3}/></label><div className="drawer-actions"><button className="text-button" type="button" onClick={() => onClose()}>取消</button><button className="text-button primary-action" type="submit" disabled={!policy.allowed}>提交{operationLabels[operation]}审批</button></div></form></aside></div>;
}
