import { FilePenLine, Send } from "lucide-react";
import type { Dispatch } from "react";
import { useState } from "react";
import { staticData } from "../data/mockData";
import {
  configReleaseActionPolicy,
  filteredCatalogItems,
  filteredPoints,
  filteredProductVariants,
  releaseVisibleForCurrentUser,
  type AppAction,
} from "../services/operations";
import type { AppState, CatalogItem, ProductVariant } from "../types/core";
import { Badge, DataTable, DefinitionList, DetailLink, EmptyState, NameCell, Section } from "../components/ui";

export function Catalog({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const items = filteredCatalogItems(state);
  const variants = filteredProductVariants(state);
  const releasePolicy = configReleaseActionPolicy(state);
  const selected = items.find((item) => item.id === selectedId) || items[0];
  const visibleChanges = state.catalogChanges.filter((change) => items.some((item) => item.id === change.itemId) && releaseVisibleForCurrentUser(state, change.release));

  return (
    <>
      <div className="split-detail">
        <Section
          title="商品/服务目录"
          meta="配置商品、服务项目、销售属性和履约模板"
          action={
            <button className="text-button primary-action" type="button" disabled={!selected || !releasePolicy.allowed} title={releasePolicy.message} onClick={() => selected && setEditing(selected)}>
              <FilePenLine className="lucide-icon" /> 申请变更
            </button>
          }
        >
          {items.length ? (
            <DataTable
              headers={["名称", "类型", "品牌", "状态", "属性", "履约模板"]}
              rows={items.map((item) => ({
                key: item.id,
                selected: selected?.id === item.id,
                onClick: () => setSelectedId(item.id),
                label: `查看${item.name}`,
                cells: [<NameCell primary={item.name} secondary={item.id} />, <Badge value={item.type} />, item.brand, <Badge value={item.status} />, item.attrs.map((attr) => <Badge key={attr} value={attr} tone="neutral" />), item.flow],
              }))}
            />
          ) : (
            <EmptyState>当前账号的数据范围内暂无商品/服务</EmptyState>
          )}
        </Section>
        <CatalogDetail state={state} item={selected} variants={variants.filter((variant) => variant.product === selected?.name)} onEdit={() => selected && setEditing(selected)} />
      </div>

      <div className="grid two">
        <Section title="类型管理" meta="属性组、计价方式和履约口径">
          <DataTable headers={["类型", "属性组", "计价方式"]} rows={staticData.productTypes.map((type) => [type.name, type.attrs, type.pricing])} />
        </Section>
        <Section title="SKU / 可售范围" meta="规格、价格和当前可售点位">
          <DataTable headers={["商品/服务", "SKU", "规格", "价格", "可售点位"]} rows={variants.map((variant) => [variant.product, variant.sku, variant.spec, variant.price, variant.points])} />
        </Section>
      </div>

      <Section title="待发布变更" meta="目录变更必须进入配置发布和审批记录">
        {visibleChanges.length ? (
          <DataTable
            headers={["发布", "对象", "状态", "原因", "详情"]}
            rows={visibleChanges.map((change) => [
              <NameCell primary={change.release} secondary={change.afterItem.brand} />,
              change.afterItem.name,
              <Badge value={change.status} />,
              change.reason,
              <DetailLink to={`/releases/${change.release}`} title={`打开${change.release}详情`} />,
            ])}
          />
        ) : (
          <EmptyState>当前范围暂无待发布目录变更</EmptyState>
        )}
      </Section>

      {editing ? <CatalogChangeDrawer state={state} item={editing} dispatch={dispatch} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function CatalogDetail({ state, item, variants, onEdit }: { state: AppState; item?: CatalogItem; variants: ProductVariant[]; onEdit: () => void }) {
  if (!item) return <EmptyState>当前筛选范围暂无商品/服务</EmptyState>;
  const changes = state.catalogChanges.filter((change) => change.itemId === item.id && releaseVisibleForCurrentUser(state, change.release));
  return (
    <aside className="detail-panel">
      <div className="band-header">
        <div>
          <h3 className="band-title">目录配置</h3>
          <p className="band-meta">{item.id} / {item.brand}</p>
        </div>
        <button className="text-button" type="button" onClick={onEdit}>
          <FilePenLine className="lucide-icon" /> 变更
        </button>
      </div>
      <div className="detail-stack">
        <DefinitionList
          rows={[
            ["类型", <Badge value={item.type} />],
            ["状态", <Badge value={item.status} />],
            ["履约模板", item.flow],
            ["销售属性", item.attrs.map((attr) => <Badge key={attr} value={attr} tone="neutral" />)],
            ["待发布", changes.length ? changes.map((change) => <Badge key={change.release} value={`${change.release} ${change.status}`} />) : "-"],
          ]}
        />
        <DataTable headers={["SKU", "规格", "价格", "可售点位"]} rows={variants.map((variant) => [variant.sku, variant.spec, variant.price, variant.points])} />
      </div>
    </aside>
  );
}

function CatalogChangeDrawer({ state, item, dispatch, onClose }: { state: AppState; item: CatalogItem; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const currentVariant = state.productVariants.find((variant) => variant.product === item.name);
  const policy = configReleaseActionPolicy(state);
  const points = filteredPoints(state);
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
            dispatch({
              type: "submit-catalog-change",
              payload: {
                itemId: item.id,
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
          <div className="form-grid">
            <label className="field">
              <span>名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>状态</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {["上架", "暂停销售", "草稿"].map((option) => <option key={option} value={option}>{option}</option>)}
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
