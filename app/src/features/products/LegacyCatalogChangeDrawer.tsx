import { Send } from "lucide-react";
import { useState, type Dispatch } from "react";
import { Badge } from "../../components/ui";
import { configReleaseActionPolicy, filteredPoints, type AppAction } from "../../services/operations";
import { CategoryField } from "./ProductCategories";
import { validateProductCategory } from "./categories";
import type { AppState, CatalogItem } from "../../types/core";

export function LegacyCatalogChangeDrawer({ state, item, dispatch, onClose }: { state: AppState; item: CatalogItem; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const currentVariant = state.productVariants.find((variant) => variant.product === item.name);
  const policy = configReleaseActionPolicy(state);
  const points = filteredPoints(state);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [categoryError, setCategoryError] = useState("");
  const [name, setName] = useState(item.name);
  const [status, setStatus] = useState(item.status);
  const [attrs, setAttrs] = useState(item.attrs.join("\n"));
  const [flow, setFlow] = useState(item.flow);
  const [variantSku, setVariantSku] = useState(currentVariant?.sku || "");
  const [variantSpec, setVariantSpec] = useState(currentVariant?.spec || "");
  const [variantPrice, setVariantPrice] = useState(currentVariant?.price || "");
  const [selectedPoints, setSelectedPoints] = useState(() => points.filter((point) => currentVariant?.points.includes(point.name)).map((point) => point.name));
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && [name, status, flow, variantSku, variantSpec, variantPrice, reason].every((value) => value.trim().length > 0) && selectedPoints.length > 0;

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="catalog-change-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{item.id}</p>
            <h3 id="catalog-change-title">申请商品/服务配置变更</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={policy.risk} />
          <span>{policy.message}</span>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            const errors = validateProductCategory(state, { ...item, categoryId }, item);
            if (errors.length) { setCategoryError(errors.join("；")); return; }
            dispatch({
              type: "submit-catalog-change",
              payload: {
                itemId: item.id,
                categoryId,
                name,
                status,
                attrs: attrs.split(/\n|、|,/).map((attr) => attr.trim()).filter(Boolean),
                flow,
                variantSku,
                variantSpec,
                variantPrice,
                variantPoints: selectedPoints.join("、"),
                reason,
              },
            });
            onClose();
          }}
        >
          {categoryError && <div role="alert" className="product-errors">{categoryError}</div>}
          <div className="form-grid">
            <CategoryField state={state} brand={item.brand} value={categoryId} retainedId={item.categoryId} onChange={setCategoryId}/>
            <label className="field">
              <span>名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>状态</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {["上架", "下架", "暂停销售", "草稿"].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>履约模板</span>
              <input value={flow} onChange={(event) => setFlow(event.target.value)} />
            </label>
            <label className="field">
              <span>SKU</span>
              <input value={variantSku} onChange={(event) => setVariantSku(event.target.value)} />
            </label>
            <label className="field">
              <span>规格</span>
              <input value={variantSpec} onChange={(event) => setVariantSpec(event.target.value)} />
            </label>
            <label className="field">
              <span>价格</span>
              <input value={variantPrice} onChange={(event) => setVariantPrice(event.target.value)} />
            </label>
            <label className="field full">
              <span>销售属性</span>
              <textarea value={attrs} onChange={(event) => setAttrs(event.target.value)} rows={3} />
            </label>
            <div className="field full">
              <span>可售点位</span>
              <div className="checkbox-grid">
                {points.map((point) => (
                  <label className="checkbox-row" key={point.id}>
                    <input
                      type="checkbox"
                      checked={selectedPoints.includes(point.name)}
                      onChange={(event) => {
                        setSelectedPoints((current) => (event.target.checked ? [...current, point.name] : current.filter((nameValue) => nameValue !== point.name)));
                      }}
                    />
                    <span>{point.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="field full">
              <span>变更原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明为什么变更、影响哪些点位或请求、审批人需要核对什么" rows={4} />
            </label>
          </div>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}><Send className="lucide-icon" /> 提交审批</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
