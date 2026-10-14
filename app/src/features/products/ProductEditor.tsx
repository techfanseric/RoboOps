import { useState, type Dispatch } from "react";
import { Badge } from "../../components/ui";
import { configReleaseActionPolicy, filteredBrands, filteredPoints, type AppAction } from "../../services/operations";
import type { AppState, CatalogItem } from "../../types/core";
import { buildPriceMatrix, characterCount, createProductConfiguration, PRODUCT_RULES, validateProduct, productTemplatesForBrand, selectionLabel, activeGroups, activeOptionIndexes } from "./domain";
import { productImageSource, uploadProductImage } from "./images";
import { SpecificationFields } from "./SpecificationFields";
import "./business-config.css";
import type { ProductConfiguration } from "./types";

import { CategoryField } from "./ProductCategories";
import { validateProductCategory } from "./categories";

export function ProductEditor({ state, item, mode, dispatch, onClose }: { state: AppState; item?: CatalogItem; mode: "edit" | "publish" | "prices"; dispatch: Dispatch<AppAction>; onClose: (notice?: string) => void }) {
  const brands = filteredBrands(state).filter((brand) => state.filters.brand === "all" || brand.name === state.filters.brand);
  const [draft, setDraft] = useState<CatalogItem>(() => { const base = item || { id: "", name: "", type: "饮品商品", brand: brands[0]?.name || "", status: "草稿", attrs: [], flow: "饮品亭履约模板" }; return { ...base, product: createProductConfiguration(base, state) }; });
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState(mode === "prices" ? "prices" : "basic");
  const [templateId, setTemplateId] = useState("");
  const [resetPrices, setResetPrices] = useState(false);
  const config = draft.product!;
  const rules = config.rules || PRODUCT_RULES;
  const templates = productTemplatesForBrand(state, draft.brand).filter(template => template.enabled);
  const policy = configReleaseActionPolicy(state);
  const points = filteredPoints(state).filter((point) => point.brand === draft.brand);
  const updateConfig = (patch: Partial<ProductConfiguration>) => setDraft((current) => ({ ...current, product: { ...current.product!, ...patch } }));
  const archivedPrices = () => [...config.prices, ...(config.priceArchive || []).filter(row => !config.prices.some(price => price.key === row.key))];
  const changeGroups = (groups: ProductConfiguration["optionGroups"]) => updateConfig({ optionGroups: groups, prices: buildPriceMatrix(groups, archivedPrices()), priceArchive: archivedPrices() });
  const submit = (publish: boolean) => {
    const publishing = publish || item?.status === "上架";
    const nextErrors = [...validateProduct(draft, publishing), ...validateProductCategory(state, draft, item)];
    if (publishing && !reason.trim()) nextErrors.push("提交发布需填写变更原因");
    if (!policy.allowed) nextErrors.push(policy.message);
    if (state.catalog.some((row) => row.id !== item?.id && row.name.trim() === draft.name.trim())) nextErrors.push("商品名称已存在，请使用不同名称");
    if (item && state.catalogChanges.some((change) => change.itemId === item.id && change.status === "待审批")) nextErrors.push("商品已有待审批变更，请等待审批完成");
    if (config.pointIds.some((id) => !points.some((point) => point.id === id))) nextErrors.push("已选可售点位超出当前范围，请重新选择");
    if (nextErrors.length) { setErrors(nextErrors); return; }
    dispatch({ type: "product-save", payload: { item: draft, reason, publish } });
    onClose(publishing ? "商品已提交配置审批，审批通过后生效" : "商品草稿已保存");
  };
  const totalCombinations = activeGroups(config.optionGroups).reduce((total, group) => total * activeOptionIndexes(group).length, 1);
  return <div className="drawer-scrim" role="presentation" onClick={() => onClose()}>
    <aside className="action-drawer wide product-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title" onClick={(event) => event.stopPropagation()}>
      <div className="drawer-head"><div><p className="page-kicker">{item?.id || "NEW PRODUCT"}</p><h3 id="product-editor-title">{mode === "prices" ? "编辑 SKU 价格" : mode === "publish" ? "发布商品" : item ? "编辑商品" : "创建商品"}</h3></div><button className="text-button" type="button" onClick={() => onClose()}>取消</button></div>
      <div className="policy-strip"><Badge value="L3"/><span>{item?.status === "上架" || mode === "publish" ? "商品内容和价格审批通过后生效。" : "保存草稿立即生效；上架、下架、删除、恢复须审批。"}</span></div>
      {mode !== "prices" && <nav className="product-editor-tabs" aria-label="商品编辑步骤">{[["basic", "基础信息"], ["options", "规格与价格"], ["images", "商品图片"], ["scope", "发布设置"]].map(([key, title]) => <button key={key} className={`text-button ${step === key ? "active" : ""}`} type="button" onClick={() => setStep(key)}>{title}</button>)}</nav>}
      <form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submit(mode === "publish"); }}>
        {errors.length > 0 && <div className="product-errors" role="alert"><strong>请检查以下信息</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        {step === "basic" && <div className="form-grid">
          <label className="field full"><span>商品名 <small>{characterCount(draft.name)}/{rules.nameMax} 字</small></span><input aria-label="商品名" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：燕麦拿铁"/></label>
          <label className="field"><span>品牌</span><select value={draft.brand} disabled={Boolean(item)} onChange={(event) => { const base = { ...draft, brand: event.target.value, categoryId: undefined, product: undefined }; const defaults = createProductConfiguration(base, state); setDraft({ ...base, product: { ...defaults, sellingPoints: config.sellingPoints, introduction: config.introduction, images: config.images, pointIds: [] } }); }}>{brands.map((brand) => <option key={brand.id}>{brand.name}</option>)}</select></label>
          <label className="field"><span>商品类型</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{Array.from(new Set(["饮品商品", "机器人服务", ...state.catalog.map((row) => row.type)])).map((type) => <option key={type}>{type}</option>)}</select></label>
          <CategoryField state={state} brand={draft.brand} value={draft.categoryId} retainedId={item?.categoryId} onChange={categoryId => setDraft({ ...draft, categoryId })}/>
          <div className="field full"><span>商品卖点 <small>{rules.sellingPointMin}–{rules.sellingPointMax} 条，每条最多 {rules.sellingPointLength} 个字</small></span><div className="product-selling-points">{config.sellingPoints.map((value, index) => <div className="product-inline" key={index}><input aria-label={`卖点 ${index + 1}`} value={value} placeholder={`卖点 ${index + 1}`} onChange={(event) => updateConfig({ sellingPoints: config.sellingPoints.map((row, rowIndex) => rowIndex === index ? event.target.value : row) })}/><small>{characterCount(value)}/{rules.sellingPointLength}</small><button className="text-button" type="button" aria-label={`删除卖点 ${index + 1}`} disabled={config.sellingPoints.length <= rules.sellingPointMin} onClick={() => updateConfig({ sellingPoints: config.sellingPoints.filter((_, rowIndex) => rowIndex !== index) })}>移除</button></div>)}</div><button className="text-button" type="button" disabled={config.sellingPoints.length >= rules.sellingPointMax} onClick={() => updateConfig({ sellingPoints: [...config.sellingPoints, ""] })}>＋ 添加卖点</button></div>
          <label className="field full"><span>商品简介 <small>{characterCount(config.introduction)}/{rules.introductionMax} 字</small></span><textarea aria-label="商品简介" value={config.introduction} rows={3} placeholder="描述口味、原料与商品特色" onChange={(event) => updateConfig({ introduction: event.target.value })}/></label>
        </div>}
        {(step === "options" || step === "prices") && <>
          {step === "options" && <><div className="business-template-apply"><label className="field"><span>应用品牌规格模板</span><select aria-label="应用品牌规格模板" value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">选择模板</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="checkbox-row"><input type="checkbox" checked={resetPrices} onChange={event => setResetPrices(event.target.checked)}/>应用时清空价格</label><button className="text-button" type="button" disabled={!templateId} onClick={() => { const template = templates.find(row => row.id === templateId); if (!template) return; const groups = structuredClone(template.optionGroups); updateConfig({ optionGroups: groups, prices: buildPriceMatrix(groups, resetPrices ? [] : archivedPrices()), rules: structuredClone(template.rules), templateId: template.id, priceArchive: resetPrices ? [] : archivedPrices() }); }}>应用模板</button></div><p className="product-help">仅应用时更新本商品的规格和基础规则。默认保留编码相同的价格；新增组合价格留空，删除组合不再展示。模板后续更新不会自动修改本商品。</p><SpecificationFields groups={config.optionGroups} allowRequiredChange={false} onChange={changeGroups}/></>}
          <div className="product-subhead"><strong>SKU 价格矩阵</strong><span>{totalCombinations} 个可选组合 · {config.prices.length} 个价格档</span></div>
          <p className="product-help">原价必填；活动价留空表示无活动。不参与计价的规格共享同档价格；无计价维度时仅填写统一价格。金额单位为元。</p>
          <div className="product-price-table"><table><thead><tr>{activeGroups(config.optionGroups).filter((group) => group.affectsPrice).map((group) => <th key={group.id}>{group.name}</th>)}<th>原价（元）</th><th>活动价（元）</th></tr></thead><tbody>{config.prices.map((price, index) => <tr key={price.key}>{activeGroups(config.optionGroups).filter((group) => group.affectsPrice).map((group) => <td key={group.id}>{group.options[group.optionIds!.indexOf(price.selections[group.id])] || price.selections[group.id]}</td>)}{(["original", "promotional"] as const).map((field) => <td key={field}><input inputMode="decimal" aria-label={`${selectionLabel(config.optionGroups, price.selections)}${field === "original" ? "原价" : "活动价"}`} value={price[field]} placeholder={field === "original" ? "必填" : "无活动"} onChange={(event) => updateConfig({ prices: config.prices.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: event.target.value } : row) })}/></td>)}</tr>)}</tbody></table></div>
          {!config.prices.length && <div className="product-errors" role="alert">价格组合超过上限或缺少计价规格，请减少选项（最多 64 个价格档）。</div>}
        </>}
        {step === "images" && <><div className="product-subhead"><strong>商品图片</strong><span>{config.images.length}/{rules.imageMax} 张</span></div><p className="product-help">上传 {rules.imageMin}–{rules.imageMax} 张 JPG、PNG 或 WebP，原图每张不超过 5 MB。建议 800 × 600（4:3），系统保持原图比例压缩保存。第一张作为封面。</p><div className="product-image-grid">{config.images.map((image, index) => <div className="product-image-card" key={image.id}><img src={productImageSource(image)} alt={image.name}/><span>{index === 0 ? "封面 · " : ""}{image.width} × {image.height}</span><div className="product-inline"><button type="button" className="text-button" disabled={index === 0} onClick={() => updateConfig({ images: [image, ...config.images.filter((row) => row.id !== image.id)] })}>设为封面</button><button type="button" className="text-button" onClick={() => updateConfig({ images: config.images.filter((row) => row.id !== image.id) })}>移除</button></div></div>)}{config.images.length < rules.imageMax && <label className="product-upload"><span>{uploading ? "正在处理图片…" : "＋ 上传图片"}</span><input aria-label="上传商品图片" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={async (event) => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length + config.images.length > rules.imageMax) { setErrors([`最多上传 ${rules.imageMax} 张图片，请减少选择数量`]); return; } setUploading(true); try { const uploaded = []; for (const file of files) uploaded.push(await uploadProductImage(file)); updateConfig({ images: [...config.images, ...uploaded] }); setErrors([]); } catch (error) { setErrors([error instanceof Error ? error.message : "图片上传失败"]); } finally { setUploading(false); } }}/></label>}</div></>}
        {step === "scope" && <div className="form-grid"><label className="field full"><span>履约模板</span><input value={draft.flow} onChange={(event) => setDraft({ ...draft, flow: event.target.value })}/></label><div className="field full"><span>可售点位 <small>上架前至少选择一个；只显示当前范围内同品牌点位</small></span>{points.length ? <div className="product-point-grid">{points.map((point) => <label className="checkbox-row" key={point.id}><input type="checkbox" checked={config.pointIds.includes(point.id)} onChange={(event) => updateConfig({ pointIds: event.target.checked ? [...config.pointIds, point.id] : config.pointIds.filter((id) => id !== point.id) })}/><span>{point.name}</span></label>)}</div> : <p className="product-help">当前范围无同品牌点位，可先保存草稿。</p>}</div></div>}
        <label className="field product-reason"><span>变更原因 <small>{item?.status === "上架" || mode === "publish" ? "必填" : "提交上架时必填"}</small></span><textarea aria-label="商品变更原因" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明本次发布或价格调整的原因" rows={2}/></label>
        <div className="drawer-actions"><button className="text-button" type="button" onClick={() => onClose()}>取消</button>{mode !== "publish" && <button className="text-button" type="submit" disabled={!policy.allowed || uploading}>{item?.status === "上架" ? "提交变更审批" : item ? "保存商品" : "保存草稿"}</button>}{mode !== "prices" && item?.status !== "上架" && <button className="text-button primary-action" type="button" disabled={!policy.allowed || uploading} onClick={() => submit(true)}>提交上架审批</button>}</div>
      </form>
    </aside>
  </div>;
}
