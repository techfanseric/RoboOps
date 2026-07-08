import { Plus, Send } from "lucide-react";
import type { Dispatch } from "react";
import { useState } from "react";
import { staticData } from "../data/mockData";
import { ScopeSelector, firstScopeSelection } from "../components/ScopeSelector";
import { Badge, DataTable, DetailLink, NameCell, Section } from "../components/ui";
import { ReadonlyGrid, ReleaseDetail } from "./sharedViews";
import { configReleaseActionPolicy, releaseVisibleForCurrentUser, type AppAction } from "../services/operations";
import type { AppState } from "../types/core";

export function ConfigReleases({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const releasePolicy = configReleaseActionPolicy(state);
  const releases = state.releases.filter((item) => releaseVisibleForCurrentUser(state, item.id));
  const release = releases.find((item) => item.id === selectedId) || releases[0];
  return (
    <>
      <div className="split-detail">
        <Section
          title="配置发布"
          meta="配置版本、发布范围、审批状态和发布记录"
          action={<button className="text-button primary-action" type="button" disabled={!releasePolicy.allowed} title={releasePolicy.message} onClick={() => setCreating(true)}><Plus className="lucide-icon" /> 新建发布</button>}
        >
          <DataTable headers={["发布", "范围", "状态", "发布人", "时间", "详情"]} rows={releases.map((item) => ({
            key: item.id,
            selected: release?.id === item.id,
            onClick: () => setSelectedId(item.id),
            label: `查看${item.name}`,
            cells: [<NameCell primary={item.name} secondary={item.id} />, item.scope, <Badge value={item.status} />, item.by, item.time, <DetailLink to={`/releases/${item.id}`} title={`打开${item.name}详情`} />],
          }))} />
        </Section>
        {release ? <ReleaseDetail state={state} release={release} dispatch={dispatch} /> : null}
      </div>
      <div className="grid two">
        <Section title="发布准备" meta="发起前需要确认影响对象和回退依据">
          <ReadonlyGrid fields={[["发布对象", "商品/服务、点位配置、设备模板、场景模板"], ["发布范围", "租户、品牌、组织、城市、点位、设备、场景模板"], ["审批策略", "影响点位经营或设备运行时进入配置审批"], ["回退依据", "保留发布前值、影响范围和操作日志"]]} />
        </Section>
        <Section title="审批策略" meta="配置发布相关规则">
          <DataTable headers={["动作", "审批人", "规则"]} rows={staticData.approvalPolicies.filter((policy) => policy.action.includes("配置")).map((policy) => [policy.action, policy.approver, policy.rule])} />
        </Section>
      </div>
      {creating ? <ReleaseCreateDrawer state={state} dispatch={dispatch} onClose={() => { setCreating(false); setSelectedId(null); }} /> : null}
    </>
  );
}

function ReleaseCreateDrawer({ state, dispatch, onClose }: { state: AppState; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [object, setObject] = useState("商品/服务");
  const [scopeSelection, setScopeSelection] = useState(() => firstScopeSelection(state, "brand"));
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [impact, setImpact] = useState("");
  const [reason, setReason] = useState("");
  const policy = configReleaseActionPolicy(state);
  const scope = scopeSelection.value;
  const canSubmit = policy.allowed && [name, object, scope, before, after, impact, reason].every((value) => value.trim().length > 0);

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="release-create-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">配置发布</p>
            <h3 id="release-create-title">新建发布</h3>
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
            dispatch({ type: "create-release", payload: { name, object, scope, scopeRef: scopeSelection, before, after, impact, reason } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>发布名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：深圳湾展厅商品可售范围调整" />
            </label>
            <label className="field">
              <span>发布对象</span>
              <select value={object} onChange={(event) => setObject(event.target.value)}>
                {["商品/服务", "点位配置", "设备模板", "场景模板", "状态显示名", "异常字典"].map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
            <ScopeSelector state={state} value={scopeSelection} onChange={setScopeSelection} />
            <label className="field">
              <span>影响范围</span>
              <input value={impact} onChange={(event) => setImpact(event.target.value)} placeholder="说明影响的点位、设备、商品或请求" />
            </label>
            <label className="field full">
              <span>发布前</span>
              <textarea value={before} onChange={(event) => setBefore(event.target.value)} placeholder="记录当前配置、版本或状态" rows={3} />
            </label>
            <label className="field full">
              <span>发布后</span>
              <textarea value={after} onChange={(event) => setAfter(event.target.value)} placeholder="记录拟发布的配置、版本或状态" rows={3} />
            </label>
            <label className="field full">
              <span>发布原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明为什么发布、影响哪些点位或设备、审批人需要关注什么" rows={4} />
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
