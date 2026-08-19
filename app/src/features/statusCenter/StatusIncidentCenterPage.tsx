import { BellOff, Check, ChevronRight, Plus, RotateCcw, Send, Settings2, UploadCloud } from "lucide-react";
import { useMemo, useState, type Dispatch } from "react";
import { Link } from "react-router-dom";
import { Badge, DataTable, DefinitionList, EmptyState, KpiTile, NameCell, Section } from "../../components/ui";
import { filteredDevices } from "../../services/operations";
import type { AppAction } from "../../services/operations";
import type { AppState } from "../../types/core";
import { Incidents } from "../../pages/Incidents";
import { DeviceCommandActions } from "../../pages/sharedViews";
import { buildDeviceHealthRows, buildDeviceTimeline, impactForScope, scopeTargetsForLevel, statusCenterScopeFromAppState, statusCenterStateForScope } from "./access";
import { statusCenterReducer } from "./domain";
import { useStatusCenter } from "./useStatusCenter";
import type { IncidentRule, ScopeLevel, StatusCenterAction, StatusDefinition, StatusDimension } from "./types";

type Tab = "overview" | "incidents" | "statuses" | "rules" | "releases";
type AuditEvent = { action: string; object: string; risk: string; result: string; detail: string };

const tabs: Array<{ id: Tab; label: string; note: string }> = [
  { id: "overview", label: "实时状态总览", note: "统一查看设备当前健康、四类状态和异常关联" },
  { id: "incidents", label: "异常事件", note: "承接既有异常分派、处理、退款和关闭流程" },
  { id: "statuses", label: "状态字典", note: "定义连接、运行、业务和安全状态的业务含义" },
  { id: "rules", label: "异常规则", note: "配置异常触发、去重、SLA、负责人和恢复条件" },
  { id: "releases", label: "发布记录", note: "审批、发布、逐设备结果、失败重试和回退" },
];

export function StatusIncidentCenterPage({ state, appDispatch, onAudit }: { state: AppState; appDispatch: Dispatch<AppAction>; onAudit?: (event: AuditEvent) => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { state: fullDomain, dispatch } = useStatusCenter();
  const scope = useMemo(() => statusCenterScopeFromAppState(state), [state]);
  const domain = useMemo(() => statusCenterStateForScope(fullDomain, scope), [fullDomain, scope]);

  const run = (action: StatusCenterAction, confirmation?: string) => {
    const metaAction = "meta" in action ? action : undefined;
    const risk = action.type === "mute-device" ? "L2" : ["approve-release", "publish-release", "retry-release-targets", "rollback-release"].includes(action.type) ? "L4" : "L3";
    const label = action.type === "submit-status-change" ? "提交状态配置" : action.type === "submit-rule-change" ? "提交异常规则" : action.type === "approve-release" ? "审批状态异常配置" : action.type === "publish-release" ? "发布状态异常配置" : action.type === "retry-release-targets" ? "重试失败设备" : action.type === "rollback-release" ? "回退状态异常配置" : action.type === "mute-device" ? "设置异常静默" : action.type;
    const object = metaAction ? ("releaseId" in metaAction.payload ? metaAction.payload.releaseId : "deviceId" in metaAction.payload ? metaAction.payload.deviceId : "definition" in metaAction.payload ? metaAction.payload.definition.id : metaAction.payload.rule.id) : "状态与异常中心";
    if (confirmation && !window.confirm(confirmation)) {
      onAudit?.({ action: label, object, risk, result: "取消", detail: "操作者取消二次确认，未改变业务状态。" });
      return false;
    }
    const preview = statusCenterReducer(fullDomain, action);
    dispatch(action);
    const rejected = Boolean(preview.lastError);
    onAudit?.({ action: label, object, risk, result: rejected ? "拒绝" : "成功", detail: rejected ? preview.lastError! : preview.lastNotice || "操作已记录" });
    return !rejected;
  };

  return (
    <div className="status-center-page">
      <div className="status-center-heading">
        <div>
          <p className="page-kicker">STATUS & INCIDENT CONTROL</p>
          <h2>状态与异常中心</h2>
          <p>把“设备现在怎么样”与“异常怎么处理”放在同一处；当前为前端业务仿真，数据源、自动判定与下发回执均预留 API 接入边界。</p>
        </div>
        <div className="status-center-context">
          <Badge value={scope.auditOnly ? "只读视角" : "业务操作视角"} />
          <span>{scope.tenantNames.length || 0} 个企业 · {scope.pointIds.length} 个点位 · {scope.deviceIds.length} 台设备</span>
        </div>
      </div>
      <nav className="section-tabs" aria-label="状态与异常中心页签" role="tablist">
        {tabs.map((item) => <button key={item.id} id={`status-tab-${item.id}`} className={tab === item.id ? "active" : ""} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`status-panel-${item.id}`} title={item.note} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </nav>
      {domain.lastError ? <div className="feedback-banner bad" role="alert">{domain.lastError}</div> : null}
      {domain.lastNotice ? <div className="feedback-banner ok" role="status">{domain.lastNotice}</div> : null}
      <div id={`status-panel-${tab}`} role="tabpanel" aria-labelledby={`status-tab-${tab}`}>
        {tab === "overview" ? <OverviewTab state={state} appDispatch={appDispatch} domain={domain} scope={scope} run={run} /> : null}
        {tab === "incidents" ? <Incidents state={state} dispatch={appDispatch} /> : null}
        {tab === "statuses" ? <StatusDictionaryTab state={state} domain={domain} scope={scope} run={run} /> : null}
        {tab === "rules" ? <RuleTab state={state} domain={domain} scope={scope} run={run} /> : null}
        {tab === "releases" ? <ReleaseTab state={state} domain={domain} scope={scope} run={run} /> : null}
      </div>
    </div>
  );
}

function OverviewTab({ state, appDispatch, domain, scope, run }: { state: AppState; appDispatch: Dispatch<AppAction>; domain: ReturnType<typeof statusCenterStateForScope>; scope: ReturnType<typeof statusCenterScopeFromAppState>; run: (action: StatusCenterAction, confirmation?: string) => boolean }) {
  const rows = useMemo(() => buildDeviceHealthRows(state, domain), [state, domain]);
  const [selectedId, setSelectedId] = useState(rows[0]?.deviceId || "");
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState("全部健康状态");
  const [type, setType] = useState("全部设备类型");
  const visible = rows.filter((row) => (health === "全部健康状态" || row.health === health) && (type === "全部设备类型" || row.type === type) && `${row.name}${row.sn}${row.pointName}${row.currentException || ""}`.toLowerCase().includes(search.toLowerCase()));
  const selected = rows.find((row) => row.deviceId === selectedId) || visible[0];
  const device = filteredDevices(state).find((item) => item.id === selected?.deviceId);
  const timeline = selected ? buildDeviceTimeline(state, domain, selected.deviceId) : [];
  const activeIncidents = rows.reduce((sum, row) => sum + row.incidentCount, 0);
  return (
    <div className="detail-stack">
      <div className="grid kpi status-kpis">
        <KpiTile title="可见设备" value={rows.length} foot="跟随顶部企业、品牌、场景和点位范围" />
        <KpiTile title="正常" value={rows.filter((row) => row.health === "正常").length} foot="连接、运行、业务和安全状态均正常" />
        <KpiTile title="需关注" value={rows.filter((row) => row.health === "关注").length} foot="存在提醒或待维护状态" />
        <KpiTile title="故障 / 不可用" value={rows.filter((row) => ["故障", "不可用"].includes(row.health)).length} foot={`${activeIncidents} 条关联中的未关闭异常`} />
      </div>
      <div className="split-detail">
        <Section title="设备健康视图" meta="状态是当前快照，异常是需要跟踪处置的事件；两者不混为一个字段">
          <div className="toolbar-row status-filter-row">
            <input aria-label="搜索设备" placeholder="搜索设备、SN、点位或当前异常" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select aria-label="健康状态" value={health} onChange={(event) => setHealth(event.target.value)}>{["全部健康状态", "正常", "关注", "故障", "不可用"].map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="设备类型" value={type} onChange={(event) => setType(event.target.value)}><option>全部设备类型</option>{[...new Set(rows.map((row) => row.type))].map((item) => <option key={item}>{item}</option>)}</select>
          </div>
          {visible.length ? <DataTable headers={["设备", "点位", "连接 / 运行", "业务 / 安全", "健康", "当前异常"]} rows={visible.map((row) => ({ key: row.deviceId, selected: selected?.deviceId === row.deviceId, onClick: () => setSelectedId(row.deviceId), cells: [<NameCell primary={row.name} secondary={`${row.sn} · ${row.type}`} />, <NameCell primary={row.pointName} secondary={row.brand} />, <span className="badge-pair"><Badge value={row.connectionStatus} /><Badge value={row.operationStatus} /></span>, <span className="badge-pair"><Badge value={row.businessStatus} /><Badge value={row.safetyStatus} /></span>, <Badge value={row.health} />, row.currentException ? <NameCell primary={row.currentException} secondary={`${row.severity || "-"} · ${row.owner || "待分派"}`} /> : <span className="secondary">无未关闭异常</span>] }))} /> : <EmptyState>当前筛选下没有设备；空数据范围不会回退展示其他点位设备。</EmptyState>}
        </Section>
        <aside className="detail-panel">
          {selected && device ? <div className="detail-stack">
            <div className="band-header">
              <div><p className="page-kicker">{selected.sn}</p><h3 className="band-title">{selected.name}</h3><p className="band-meta">{selected.pointName} · {selected.type}</p></div>
              <DeviceCommandActions state={state} device={device} dispatch={appDispatch} />
            </div>
            <div className="status-dimension-grid">
              {[['连接状态', selected.connectionStatus], ['运行状态', selected.operationStatus], ['业务状态', selected.businessStatus], ['安全状态', selected.safetyStatus]].map(([label, value]) => <div className="status-dimension" key={label}><span>{label}</span><Badge value={value} /></div>)}
            </div>
            <DefinitionList rows={[["综合健康", <Badge value={selected.health} />], ["当前异常", selected.currentException || "无"], ["异常负责人", selected.owner || "-"], ["最近心跳/事件", selected.lastHeartbeatAt], ["静默窗口", selected.mutedUntil ? new Date(selected.mutedUntil).toLocaleString("zh-CN", { hour12: false }) : "未设置"]]} />
            {selected.currentIncidentId ? <Link className="text-button" to={`/incidents/${selected.currentIncidentId}`}>打开异常详情 <ChevronRight className="lucide-icon" /></Link> : null}
            {!scope.auditOnly ? <MuteForm deviceId={selected.deviceId} scope={scope} run={run} /> : <div className="note-box">当前角色为只读视角，不能设置静默或执行设备动作。</div>}
            <div><h4 className="subhead">设备状态时间线</h4><div className="status-timeline">{timeline.slice(0, 12).map((item) => <div className="status-timeline-item" key={item.id}><span className={`timeline-marker ${item.tone}`} /><div><div className="record-head"><strong>{item.title}</strong><span>{item.time}</span></div><p>{item.kind} · {item.detail}</p></div></div>)}</div></div>
          </div> : <EmptyState>选择一台设备查看四类状态、异常关联、静默和状态时间线。</EmptyState>}
        </aside>
      </div>
    </div>
  );
}

function MuteForm({ deviceId, scope, run }: { deviceId: string; scope: ReturnType<typeof statusCenterScopeFromAppState>; run: (action: StatusCenterAction, confirmation?: string) => boolean }) {
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(30);
  return <form className="compact-form" onSubmit={(event) => { event.preventDefault(); if (run({ type: "mute-device", payload: { deviceId, reason, minutes }, meta: scope }, `确认将该设备的非安全类异常静默 ${minutes} 分钟？`)) setReason(""); }}>
    <h4 className="subhead"><BellOff className="lucide-icon" /> 异常静默</h4>
    <div className="form-grid"><label className="field"><span>时长（分钟）</span><input type="number" min={5} max={1440} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label><label className="field"><span>原因</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：现场计划维护" /></label></div>
    <button className="text-button" type="submit" disabled={!reason.trim()}>设置静默</button>
  </form>;
}

function StatusDictionaryTab({ state, domain, scope, run }: { state: AppState; domain: ReturnType<typeof statusCenterStateForScope>; scope: ReturnType<typeof statusCenterScopeFromAppState>; run: (action: StatusCenterAction, confirmation?: string) => boolean }) {
  const [editing, setEditing] = useState<StatusDefinition | null>(null);
  const [selectedId, setSelectedId] = useState(domain.statusDefinitions[0]?.id || "");
  const selected = domain.statusDefinitions.find((item) => item.id === selectedId) || domain.statusDefinitions[0];
  return <div className="split-detail"><Section title="状态字典" meta="统一业务口径；保存草案不会影响运行设备，必须经过审批和发布">
    <div className="toolbar-row"><span className="secondary">共 {domain.statusDefinitions.length} 个状态定义</span><button className="text-button primary-action" type="button" disabled={!scope.canManage} title={scope.canManage ? "新增状态定义" : "当前角色没有配置权限"} onClick={() => setEditing(newStatus(scope))}><Plus className="lucide-icon" /> 新状态</button></div>
    <DataTable headers={["状态", "维度", "分类", "作用范围", "业务影响", "版本"]} rows={domain.statusDefinitions.map((item) => ({ key: item.id, selected: selected?.id === item.id, onClick: () => setSelectedId(item.id), cells: [<NameCell primary={item.name} secondary={item.code} />, item.dimension, <Badge value={item.category} />, <NameCell primary={item.scopeLevel} secondary={item.scopeTargets.join("、") || "平台默认"} />, [item.affectsOrder && "影响接单", item.affectsDispatch && "影响派单", item.affectsPointOperation && "影响点位营业"].filter(Boolean).join("、") || "不阻断业务", `v${item.version}`] }))} />
  </Section><aside className="detail-panel">{selected ? <div className="detail-stack"><div className="band-header"><div><p className="page-kicker">{selected.code}</p><h3 className="band-title">{selected.name}</h3><p className="band-meta">{selected.description}</p></div><button className="text-button" type="button" disabled={!scope.canManage} onClick={() => setEditing(structuredClone(selected))}><Settings2 className="lucide-icon" /> 编辑</button></div><DefinitionList rows={[["适用对象", selected.appliesTo.join("、")], ["触发延迟", `${selected.triggerAfterMinutes} 分钟`], ["自动建异常", selected.autoCreateIncident ? "是" : "否"], ["人工确认恢复", selected.manualConfirm ? "需要" : "不需要"], ["恢复状态", selected.recoveryStatusCode || "无"], ["启用状态", <Badge value={selected.enabled ? "启用" : "停用"} />], ["更新时间", selected.updatedAt]]} /><div className="note-box">状态只表达设备当前处境；需要负责人、SLA 和处置过程的情况，由异常规则生成异常事件。</div></div> : <EmptyState>暂无可见状态配置。</EmptyState>}</aside>{editing ? <StatusDrawer state={state} definitions={domain.statusDefinitions} value={editing} scope={scope} onClose={() => setEditing(null)} onSubmit={(definition, summary) => { const impact = impactForScope(state, definition.tenant, definition.scopeLevel, definition.scopeTargets); if (run({ type: "submit-status-change", payload: { definition, summary, impactDeviceIds: impact.deviceIds, impactPointIds: impact.pointIds }, meta: scope }, `确认提交 ${definition.name} 的配置变更？影响 ${impact.pointIds.length} 个点位、${impact.deviceIds.length} 台设备，提交后仍需非发起人审批。`)) setEditing(null); }} /> : null}</div>;
}

function RuleTab({ state, domain, scope, run }: { state: AppState; domain: ReturnType<typeof statusCenterStateForScope>; scope: ReturnType<typeof statusCenterScopeFromAppState>; run: (action: StatusCenterAction, confirmation?: string) => boolean }) {
  const [editing, setEditing] = useState<IncidentRule | null>(null);
  const [selectedId, setSelectedId] = useState(domain.incidentRules[0]?.id || "");
  const selected = domain.incidentRules.find((item) => item.id === selectedId) || domain.incidentRules[0];
  return <div className="split-detail"><Section title="异常规则" meta="从原始错误码到异常事件的业务映射；展示触发、去重、分派、升级与恢复口径"><div className="toolbar-row"><span className="secondary">共 {domain.incidentRules.length} 条启停规则</span><button className="text-button primary-action" type="button" disabled={!scope.canManage} onClick={() => setEditing(newRule(scope))}><Plus className="lucide-icon" /> 新规则</button></div><DataTable headers={["规则", "等级", "来源", "触发 / 去重", "负责人", "SLA"]} rows={domain.incidentRules.map((item) => ({ key: item.id, selected: selected?.id === item.id, onClick: () => setSelectedId(item.id), cells: [<NameCell primary={item.name} secondary={item.code} />, <Badge value={item.severity} />, <NameCell primary={item.source} secondary={item.rawCodes.join("、")} />, <NameCell primary={item.triggerCondition} secondary={`${item.consecutiveCount} 次 · ${item.dedupeMinutes} 分钟去重`} />, item.owner, `${item.slaMinutes} 分钟`] }))} /></Section><aside className="detail-panel">{selected ? <div className="detail-stack"><div className="band-header"><div><p className="page-kicker">{selected.code}</p><h3 className="band-title">{selected.name}</h3><p className="band-meta">{selected.scopeLevel} · {selected.scopeTargets.join("、") || "平台默认"}</p></div><button className="text-button" type="button" disabled={!scope.canManage} onClick={() => setEditing(structuredClone(selected))}><Settings2 className="lucide-icon" /> 编辑</button></div><DefinitionList rows={[["触发条件", selected.triggerCondition], ["异常等级", <Badge value={selected.severity} />], ["默认负责人", selected.owner], ["升级对象", selected.escalation], ["通知", selected.notificationChannels.join("、")], ["自动建任务", selected.autoCreateTask ? "是" : "否"], ["影响业务", [selected.affectsOrder && "接单", selected.affectsPointOperation && "点位营业"].filter(Boolean).join("、") || "不阻断"], ["恢复机制", selected.autoRecover ? `自动：${selected.recoveryCondition}` : `人工：${selected.recoveryCondition}`]]} /><div><h4 className="subhead">处理 SOP</h4><div className="note-box">{selected.sop}</div></div></div> : <EmptyState>暂无可见异常规则。</EmptyState>}</aside>{editing ? <RuleDrawer state={state} value={editing} scope={scope} onClose={() => setEditing(null)} onSubmit={(rule, summary) => { const impact = impactForScope(state, rule.tenant, rule.scopeLevel, rule.scopeTargets); if (run({ type: "submit-rule-change", payload: { rule, summary, impactDeviceIds: impact.deviceIds, impactPointIds: impact.pointIds }, meta: scope }, `确认提交 ${rule.name} 的规则变更？影响 ${impact.pointIds.length} 个点位、${impact.deviceIds.length} 台设备。`)) setEditing(null); }} /> : null}</div>;
}

function ReleaseTab({ state, domain, scope, run }: { state: AppState; domain: ReturnType<typeof statusCenterStateForScope>; scope: ReturnType<typeof statusCenterScopeFromAppState>; run: (action: StatusCenterAction, confirmation?: string) => boolean }) {
  const [selectedId, setSelectedId] = useState(domain.releases[0]?.id || "");
  const selected = domain.releases.find((item) => item.id === selectedId) || domain.releases[0];
  const devices = new Map(state.devices.map((device) => [device.id, device]));
  return <div className="split-detail"><Section title="发布记录" meta="草案提交、非发起人审批、影响快照、逐设备结果和历史回退"><DataTable headers={["发布单", "对象", "范围", "发起 / 审批", "状态", "时间"]} rows={domain.releases.map((item) => ({ key: item.id, selected: selected?.id === item.id, onClick: () => setSelectedId(item.id), cells: [<NameCell primary={item.id} secondary={`v${item.version}`} />, <NameCell primary={item.objectName} secondary={item.objectType} />, <NameCell primary={item.scopeLevel} secondary={`${item.impactPointIds.length} 点位 / ${item.impactDeviceIds.length} 设备`} />, <NameCell primary={item.requester} secondary={item.approver} />, <Badge value={item.status} />, item.createdAt] }))} />{!domain.releases.length ? <EmptyState>尚无配置发布记录。请先在状态字典或异常规则中提交变更。</EmptyState> : null}</Section><aside className="detail-panel">{selected ? <div className="detail-stack"><div><p className="page-kicker">{selected.id}</p><h3 className="band-title">{selected.objectName} v{selected.version}</h3><p className="band-meta">{selected.summary}</p></div><div className="policy-strip"><Badge value="L4" /><span>审批人与发起人必须不同；发布目标冻结为审批时的影响快照。</span></div><DefinitionList rows={[["配置类型", selected.objectType], ["作用范围", `${selected.scopeLevel} / ${selected.scopeTargets.join("、") || "平台默认"}`], ["发起人", selected.requester], ["审批人", selected.approver], ["影响快照", `${selected.impactPointIds.length} 个点位、${selected.impactDeviceIds.length} 台设备`], ["当前状态", <Badge value={selected.status} />]]} /><div className="drawer-actions release-actions">{selected.status === "待审批" ? <button className="text-button primary-action" type="button" disabled={!scope.canApprove || selected.requester === scope.actor} onClick={() => run({ type: "approve-release", payload: { releaseId: selected.id }, meta: scope }, "确认审批通过？审批结果将进入主审计，且发起人不能审批自己的变更。") }><Check className="lucide-icon" /> 审批通过</button> : null}{selected.status === "已批准" ? <button className="text-button primary-action" type="button" disabled={!scope.canPublish} onClick={() => run({ type: "publish-release", payload: { releaseId: selected.id, targets: selected.impactDeviceIds.map((id) => ({ id, name: devices.get(id)?.name || id })) }, meta: scope }, `确认向审批快照中的 ${selected.impactDeviceIds.length} 台设备发布？当前仅模拟逐设备回执。`)}><UploadCloud className="lucide-icon" /> 执行发布</button> : null}{selected.status === "部分失败" ? <button className="text-button primary-action" type="button" disabled={!scope.canPublish} onClick={() => run({ type: "retry-release-targets", payload: { releaseId: selected.id }, meta: scope }, "确认仅重试本次发布中的失败设备？")}><RotateCcw className="lucide-icon" /> 重试失败设备</button> : null}{["已发布", "部分失败"].includes(selected.status) && selected.previous ? <button className="text-button danger-action" type="button" disabled={!scope.canPublish} onClick={() => run({ type: "rollback-release", payload: { releaseId: selected.id }, meta: scope }, "确认回退到上一版本？这会改变当前生效配置并记录 L4 审计。") }><RotateCcw className="lucide-icon" /> 回退上一版本</button> : null}</div>{selected.results.length ? <DataTable headers={["设备", "结果", "说明"]} rows={selected.results.map((result) => [<NameCell primary={result.targetName} secondary={result.targetId} />, <Badge value={result.status} />, result.reason])} /> : <div className="note-box">发布前不会生成设备结果；页面不伪造真实网络下发过程。</div>}</div> : <EmptyState>选择一条发布记录查看审批与逐设备结果。</EmptyState>}</aside></div>;
}

function ScopeFields({ state, tenant, level, targets, setTenant, setLevel, setTargets }: { state: AppState; tenant: string; level: ScopeLevel; targets: string[]; setTenant: (value: string) => void; setLevel: (value: ScopeLevel) => void; setTargets: (value: string[]) => void }) {
  const options = scopeTargetsForLevel(state, level, tenant);
  return <><label className="field"><span>所属企业</span><select value={tenant} onChange={(event) => { setTenant(event.target.value); setTargets([]); }}><option value="*">全平台</option>{state.tenants.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label className="field"><span>作用层级</span><select value={level} onChange={(event) => { setLevel(event.target.value as ScopeLevel); setTargets([]); }}>{(["平台默认", "企业", "品牌", "场景", "设备型号", "单台设备"] as ScopeLevel[]).map((item) => <option key={item}>{item}</option>)}</select></label>{level !== "平台默认" ? <label className="field full"><span>作用对象</span><select value={targets[0] || ""} onChange={(event) => setTargets(event.target.value ? [event.target.value] : [])}><option value="">请选择</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}</>;
}

function StatusDrawer({ state, definitions, value, scope, onClose, onSubmit }: { state: AppState; definitions: StatusDefinition[]; value: StatusDefinition; scope: ReturnType<typeof statusCenterScopeFromAppState>; onClose: () => void; onSubmit: (value: StatusDefinition, summary: string) => void }) {
  const [form, setForm] = useState(value); const [summary, setSummary] = useState(""); const set = <K extends keyof StatusDefinition>(key: K, next: StatusDefinition[K]) => setForm((current) => ({ ...current, [key]: next })); const impact = impactForScope(state, form.tenant, form.scopeLevel, form.scopeTargets);
  return <div className="drawer-scrim" role="presentation" onClick={onClose}><aside className="action-drawer wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="page-kicker">状态字典草案</p><h3>{value.version ? `编辑 ${value.name}` : "新状态"}</h3></div><button className="text-button" type="button" onClick={onClose}>取消</button></div><div className="policy-strip"><Badge value="L3" /><span>影响预览：{impact.pointIds.length} 个点位、{impact.deviceIds.length} 台设备。提交后不会立即生效。</span></div><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form, summary); }}><div className="form-grid"><label className="field"><span>状态名称</span><input value={form.name} onChange={(event) => set("name", event.target.value)} /></label><label className="field"><span>状态编码</span><input value={form.code} onChange={(event) => set("code", event.target.value.toUpperCase())} /></label><label className="field"><span>状态维度</span><select value={form.dimension} onChange={(event) => { set("dimension", event.target.value as StatusDimension); set("recoveryStatusCode", undefined); }}>{["连接状态", "运行状态", "业务状态", "安全状态"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="field"><span>状态分类</span><select value={form.category} onChange={(event) => set("category", event.target.value as StatusDefinition["category"])}>{["正常", "提醒", "警告", "故障", "不可用"].map((item) => <option key={item}>{item}</option>)}</select></label><ScopeFields state={state} tenant={form.tenant} level={form.scopeLevel} targets={form.scopeTargets} setTenant={(next) => set("tenant", next)} setLevel={(next) => set("scopeLevel", next)} setTargets={(next) => set("scopeTargets", next)} /><label className="field"><span>适用对象（逗号分隔）</span><input value={form.appliesTo.join(",")} onChange={(event) => set("appliesTo", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label><label className="field"><span>触发延迟（分钟）</span><input type="number" min={0} value={form.triggerAfterMinutes} onChange={(event) => set("triggerAfterMinutes", Number(event.target.value))} /></label><label className="field full"><span>恢复后的状态</span><select value={form.recoveryStatusCode || ""} onChange={(event) => set("recoveryStatusCode", event.target.value || undefined)}><option value="">无需关联恢复状态</option>{definitions.filter((item) => item.id !== form.id && item.dimension === form.dimension && item.enabled).map((item) => <option key={item.id} value={item.code}>{item.name}（{item.code}）</option>)}</select></label><label className="field full"><span>业务说明</span><textarea rows={3} value={form.description} onChange={(event) => set("description", event.target.value)} /></label><div className="field full checkbox-grid">{[["affectsOrder", "影响接单"], ["affectsDispatch", "影响派单"], ["affectsPointOperation", "影响点位营业"], ["manualConfirm", "恢复需人工确认"], ["autoCreateIncident", "自动创建异常"], ["enabled", "启用"]].map(([key, label]) => <label className="check-line" key={key}><input type="checkbox" checked={Boolean(form[key as keyof StatusDefinition])} onChange={(event) => set(key as keyof StatusDefinition, event.target.checked as never)} /> {label}</label>)}</div><label className="field full"><span>变更说明</span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="写清楚变更原因、业务影响和验证方式" /></label></div><div className="drawer-actions"><button className="text-button" type="button" onClick={onClose}>取消</button><button className="text-button primary-action" type="submit" disabled={!summary.trim() || !scope.canManage}><Send className="lucide-icon" /> 提交审批</button></div></form></aside></div>;
}

function RuleDrawer({ state, value, scope, onClose, onSubmit }: { state: AppState; value: IncidentRule; scope: ReturnType<typeof statusCenterScopeFromAppState>; onClose: () => void; onSubmit: (value: IncidentRule, summary: string) => void }) {
  const [form, setForm] = useState(value); const [summary, setSummary] = useState(""); const set = <K extends keyof IncidentRule>(key: K, next: IncidentRule[K]) => setForm((current) => ({ ...current, [key]: next })); const impact = impactForScope(state, form.tenant, form.scopeLevel, form.scopeTargets);
  return <div className="drawer-scrim" role="presentation" onClick={onClose}><aside className="action-drawer wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="page-kicker">异常规则草案</p><h3>{value.version ? `编辑 ${value.name}` : "新规则"}</h3></div><button className="text-button" type="button" onClick={onClose}>取消</button></div><div className="policy-strip"><Badge value="L3" /><span>规则影响 {impact.pointIds.length} 个点位、{impact.deviceIds.length} 台设备；真实错误码接入由后续 API/事件服务完成。</span></div><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form, summary); }}><div className="form-grid"><label className="field"><span>异常名称</span><input value={form.name} onChange={(event) => set("name", event.target.value)} /></label><label className="field"><span>异常编码</span><input value={form.code} onChange={(event) => set("code", event.target.value.toUpperCase())} /></label><ScopeFields state={state} tenant={form.tenant} level={form.scopeLevel} targets={form.scopeTargets} setTenant={(next) => set("tenant", next)} setLevel={(next) => set("scopeLevel", next)} setTargets={(next) => set("scopeTargets", next)} /><label className="field"><span>适用设备类型</span><input value={form.deviceTypes.join(",")} onChange={(event) => set("deviceTypes", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label><label className="field"><span>信号来源</span><input value={form.source} onChange={(event) => set("source", event.target.value)} /></label><label className="field"><span>原始错误码</span><input value={form.rawCodes.join(",")} onChange={(event) => set("rawCodes", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label><label className="field"><span>异常等级</span><select value={form.severity} onChange={(event) => set("severity", event.target.value as IncidentRule["severity"])}>{["P0", "P1", "P2"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="field full"><span>触发条件</span><input value={form.triggerCondition} onChange={(event) => set("triggerCondition", event.target.value)} /></label><label className="field"><span>连续次数</span><input type="number" min={1} value={form.consecutiveCount} onChange={(event) => set("consecutiveCount", Number(event.target.value))} /></label><label className="field"><span>去重窗口（分钟）</span><input type="number" min={1} value={form.dedupeMinutes} onChange={(event) => set("dedupeMinutes", Number(event.target.value))} /></label><label className="field"><span>默认负责人</span><input value={form.owner} onChange={(event) => set("owner", event.target.value)} /></label><label className="field"><span>升级对象</span><input value={form.escalation} onChange={(event) => set("escalation", event.target.value)} /></label><label className="field"><span>SLA（分钟）</span><input type="number" min={1} value={form.slaMinutes} onChange={(event) => set("slaMinutes", Number(event.target.value))} /></label><label className="field"><span>通知渠道</span><input value={form.notificationChannels.join(",")} onChange={(event) => set("notificationChannels", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label><label className="field full"><span>处理 SOP</span><textarea rows={3} value={form.sop} onChange={(event) => set("sop", event.target.value)} /></label><label className="field full"><span>恢复条件</span><input value={form.recoveryCondition} onChange={(event) => set("recoveryCondition", event.target.value)} /></label><div className="field full checkbox-grid">{[["notifyPointOwner", "通知点位负责人"], ["autoCreateTask", "自动建现场任务"], ["affectsOrder", "影响接单"], ["affectsPointOperation", "影响点位营业"], ["autoRecover", "自动恢复"], ["enabled", "启用"]].map(([key, label]) => <label className="check-line" key={key}><input type="checkbox" checked={Boolean(form[key as keyof IncidentRule])} onChange={(event) => set(key as keyof IncidentRule, event.target.checked as never)} /> {label}</label>)}</div><label className="field full"><span>变更说明</span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label></div><div className="drawer-actions"><button className="text-button" type="button" onClick={onClose}>取消</button><button className="text-button primary-action" type="submit" disabled={!summary.trim() || !scope.canManage}><Send className="lucide-icon" /> 提交审批</button></div></form></aside></div>;
}

function newStatus(scope: ReturnType<typeof statusCenterScopeFromAppState>): StatusDefinition { return { id: `STATUS-DRAFT-${Date.now()}`, code: "NEW_STATUS", name: "新状态", dimension: "运行状态", category: "提醒", appliesTo: ["全部设备"], tenant: scope.tenantNames.length === 1 ? scope.tenantNames[0] : "*", scopeLevel: scope.tenantNames.length === 1 ? "企业" : "平台默认", scopeTargets: scope.tenantNames.length === 1 ? [scope.tenantNames[0]] : [], affectsOrder: false, affectsDispatch: false, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: false, triggerAfterMinutes: 0, description: "", enabled: true, version: 0, updatedAt: "草案" }; }
function newRule(scope: ReturnType<typeof statusCenterScopeFromAppState>): IncidentRule { return { id: `RULE-DRAFT-${Date.now()}`, code: "NEW_INCIDENT", name: "新异常规则", tenant: scope.tenantNames.length === 1 ? scope.tenantNames[0] : "*", scopeLevel: scope.tenantNames.length === 1 ? "企业" : "平台默认", scopeTargets: scope.tenantNames.length === 1 ? [scope.tenantNames[0]] : [], deviceTypes: ["全部设备"], source: "设备事件", rawCodes: ["RAW_CODE"], triggerCondition: "满足业务判定条件", consecutiveCount: 1, dedupeMinutes: 10, severity: "P2", owner: "机器人/设备运维", escalation: "运营负责人", slaMinutes: 30, sop: "检查设备当前状态、最近事件与业务影响，确认后按流程处置。", notificationChannels: ["站内"], notifyPointOwner: true, autoCreateTask: false, affectsOrder: false, affectsPointOperation: false, autoRecover: true, recoveryCondition: "状态恢复并连续确认 2 次", enabled: true, version: 0, updatedAt: "草案" }; }

export default StatusIncidentCenterPage;
