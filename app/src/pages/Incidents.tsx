import { Plus, Send } from "lucide-react";
import type { Dispatch } from "react";
import { useState } from "react";
import { staticData } from "../data/mockData";
import { filteredIncidents, filteredPoints, type AppAction } from "../services/operations";
import type { AppState } from "../types/core";
import { Badge, DataTable, Section } from "../components/ui";
import { IncidentDetail, IncidentTable } from "./sharedViews";

export function Incidents({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const incidents = filteredIncidents(state);
  const selected = incidents.find((incident) => incident.id === selectedId) || incidents[0];
  const visiblePoints = filteredPoints(state);
  return (
    <>
      <div className="split-detail">
        <Section
          title="异常中心"
          meta="异常等级、负责人、SLA 和处理动作"
          action={<button className="text-button primary-action" type="button" disabled={!visiblePoints.length} title={visiblePoints.length ? "登记新的异常事件" : "当前账号没有可登记异常的点位"} onClick={() => setCreating(true)}><Plus className="lucide-icon" /> 新异常</button>}
        >
          <IncidentTable state={state} dispatch={dispatch} incidents={incidents} selectedId={selected?.id} onSelect={setSelectedId} />
        </Section>
        <IncidentDetail state={state} incident={selected} />
      </div>
      <Section title="分派规则" meta="按异常来源、等级、场景和点位匹配处理角色">
        <DataTable headers={["异常类型", "处理角色", "升级对象", "SLA"]} rows={staticData.incidentRoutingRules.map((rule) => [rule.type, rule.owner, rule.escalation, rule.sla])} />
      </Section>
      {creating ? <IncidentCreateDrawer state={state} dispatch={dispatch} onClose={() => { setCreating(false); setSelectedId(null); }} /> : null}
    </>
  );
}

function IncidentCreateDrawer({ state, dispatch, onClose }: { state: AppState; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const points = filteredPoints(state);
  const typeOptions = Array.from(new Set(staticData.incidentRoutingRules.map((rule) => rule.type)));
  const sourceOptions = ["设备事件", "顾客反馈", "现场巡检", "系统监控", "运营复核"];
  const firstType = typeOptions[0] || "人工录入异常";
  const firstRule = staticData.incidentRoutingRules.find((rule) => rule.type === firstType);
  const [point, setPoint] = useState(points[0]?.name || "");
  const [type, setType] = useState(firstType);
  const [source, setSource] = useState(sourceOptions[0]);
  const [level, setLevel] = useState("P2");
  const [owner, setOwner] = useState(firstRule?.owner || points[0]?.owner || "运营负责人");
  const [note, setNote] = useState("");
  const ownerOptions = Array.from(new Set([owner, points.find((item) => item.name === point)?.owner, ...staticData.incidentRoutingRules.map((rule) => rule.owner), "运营负责人", "客服/售后", "机器人/设备运维", "现场维护员"].filter(Boolean)));
  const canSubmit = point.trim().length > 0 && type.trim().length > 0 && source.trim().length > 0 && level.trim().length > 0 && owner.trim().length > 0 && note.trim().length >= 6;

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="incident-create-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">异常登记</p>
            <h3 id="incident-create-title">新异常</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value="L1" />
          <span>登记后进入异常中心，生成处理记录、审计日志和服务端同步记录。</span>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "create-incident", payload: { point, type, source, level, owner, note } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>点位</span>
              <select value={point} onChange={(event) => {
                const nextPoint = event.target.value;
                setPoint(nextPoint);
                const nextOwner = points.find((item) => item.name === nextPoint)?.owner;
                if (nextOwner) setOwner(nextOwner);
              }}>
                {points.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>异常类型</span>
              <select value={type} onChange={(event) => {
                const nextType = event.target.value;
                setType(nextType);
                const rule = staticData.incidentRoutingRules.find((item) => item.type === nextType);
                if (rule) setOwner(rule.owner);
              }}>
                {typeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">
              <span>来源</span>
              <select value={source} onChange={(event) => setSource(event.target.value)}>
                {sourceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">
              <span>等级</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                {["P2", "P1", "P0"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field full">
              <span>负责人</span>
              <select value={owner} onChange={(event) => setOwner(event.target.value)}>
                {ownerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field full">
              <span>情况说明</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="写清楚发生位置、触发来源、当前影响和已采取的动作" rows={4} />
            </label>
          </div>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}><Send className="lucide-icon" /> 登记异常</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
