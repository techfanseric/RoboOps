import { ArrowRight, Check, ListPlus, Play, Power, Receipt, RefreshCcw, Undo2, UploadCloud, X } from "lucide-react";
import type { Dispatch, ReactNode } from "react";
import { useState } from "react";
import { staticData } from "../data/mockData";
import {
  activeIncidents,
  activeTasks,
  auditLogVisibleForCurrentUser,
  businessSnapshot,
  filteredBusinessRequests,
  filteredDevices,
  filteredIncidents,
  filteredPoints,
  filteredTasks,
  approvalActionPolicy,
  incidentReasonBars,
  incidentActionPolicy,
  pointDevices,
  pointHealthScore,
  pointIncidents,
  pointReadiness,
  pointRequests,
  pointTasks,
  releaseVisibleForCurrentUser,
  releaseRollbackActionPolicy,
  teamRecommendation,
  deviceCommandPolicy,
  taskActionPolicy,
  type DeviceCommandAction,
  type IncidentWorkflowAction,
  type AppAction,
  type TaskWorkflowAction,
} from "../services/operations";
import type { AppState, ApprovalRequest, BusinessRequest, Device, Incident, Point, ReleaseRecord, Task } from "../types/core";
import { Badge, DataTable, DefinitionList, DetailLink, EmptyState, IconButton, MetricBars, NameCell, ReadonlyField, RecordList } from "../components/ui";
import { resolveScopeSelection, scopeTypeLabel } from "../components/ScopeSelector";

const incidentActionText: Record<IncidentWorkflowAction, { title: string; note: string; submit: string }> = {
  advance: { title: "推进异常状态", note: "处理说明", submit: "确认推进" },
  task: { title: "转为任务", note: "处理要求", submit: "创建任务" },
  refund: { title: "转入退款处理", note: "退款原因", submit: "提交退款" },
  close: { title: "关闭异常", note: "关闭原因", submit: "提交关闭" },
};

const taskActionText: Record<TaskWorkflowAction, { title: string; note: string; submit: string }> = {
  start: { title: "开始处理任务", note: "处理计划", submit: "开始处理" },
  resolve: { title: "提交任务结果", note: "处理说明", submit: "标记解决" },
};

const deviceCommandText: Record<DeviceCommandAction, { title: string; note: string; submit: string }> = {
  "sync-status": { title: "同步设备状态", note: "同步原因", submit: "执行同步" },
  "sync-config": { title: "同步设备配置", note: "配置依据", submit: "提交审批" },
  restart: { title: "重启设备", note: "重启原因", submit: "提交审批" },
};

export function PointBars({ state, points = filteredPoints(state) }: { state: AppState; points?: Point[] }) {
  return (
    <MetricBars
      rows={points.map((point) => {
        const health = pointHealthScore(state, point);
        return { label: point.name, value: health.score, tone: health.tone };
      })}
    />
  );
}

export function IncidentTable({ state, dispatch, incidents = filteredIncidents(state), selectedId, onSelect }: { state: AppState; dispatch: Dispatch<AppAction>; incidents?: Incident[]; selectedId?: string; onSelect?: (incidentId: string) => void }) {
  if (!incidents.length) return <EmptyState>当前筛选范围暂无异常</EmptyState>;
  return (
    <>
      <DataTable
        headers={["异常", "等级", "来源", "点位", "负责人", "状态", "SLA", "动作", "详情"]}
        rows={incidents.map((incident) => ({
          key: incident.id,
          selected: selectedId === incident.id,
          onClick: onSelect ? () => onSelect(incident.id) : undefined,
          label: `查看${incident.id}`,
          cells: [
            <NameCell primary={incident.type} secondary={incident.id} />,
            <Badge value={incident.level} />,
            incident.source,
            incident.point,
            incident.owner,
            <Badge value={incident.statusLabel} />,
            incident.sla,
            <IncidentActions state={state} dispatch={dispatch} incident={incident} />,
            <DetailLink to={`/incidents/${incident.id}`} title={`打开${incident.id}详情`} />,
          ],
        }))}
      />
    </>
  );
}

export function IncidentActions({ state, dispatch, incident }: { state: AppState; dispatch: Dispatch<AppAction>; incident: Incident }) {
  const [pendingAction, setPendingAction] = useState<IncidentWorkflowAction | null>(null);
  const actions: Array<[IncidentWorkflowAction, ReactNode]> = [
    ["advance", <ArrowRight className="lucide-icon" />],
    ["task", <ListPlus className="lucide-icon" />],
    ["refund", <Receipt className="lucide-icon" />],
    ["close", <Check className="lucide-icon" />],
  ];
  return (
    <>
      <div className="actions">
        {actions.map(([action, icon]) => {
          const policy = incidentActionPolicy(state, incident, action);
          return (
            <IconButton key={action} title={policy.allowed ? policy.label : policy.message} disabled={!policy.allowed} onClick={() => setPendingAction(action)}>
              {icon}
            </IconButton>
          );
        })}
      </div>
      {pendingAction ? <IncidentActionDrawer state={state} dispatch={dispatch} incident={incident} action={pendingAction} onClose={() => setPendingAction(null)} /> : null}
    </>
  );
}

function IncidentActionDrawer({ state, dispatch, incident, action, onClose }: { state: AppState; dispatch: Dispatch<AppAction>; incident: Incident; action: IncidentWorkflowAction; onClose: () => void }) {
  const copy = incidentActionText[action];
  const policy = incidentActionPolicy(state, incident, action);
  const [note, setNote] = useState("");
  const [impact, setImpact] = useState("");
  const [owner, setOwner] = useState(incident.owner);
  const canSubmit = policy.allowed && note.trim().length > 0 && impact.trim().length > 0;

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer" role="dialog" aria-modal="true" aria-labelledby="incident-action-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{incident.id}</p>
            <h3 id="incident-action-title">{copy.title}</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={policy.risk} />
          <span>{policy.message}</span>
        </div>
        {policy.requiresApproval ? (
          <div className="note-box">审批人：{policy.approver || "按策略匹配"}。规则：{policy.rule || "提交后进入审批队列"}。</div>
        ) : null}
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "incident", incidentId: incident.id, action, payload: { note, impact, owner } });
            onClose();
          }}
        >
          {action === "task" ? (
            <label className="field">
              <span>任务负责人</span>
              <select value={owner} onChange={(event) => setOwner(event.target.value)}>
                {[incident.owner, "现场维护员", "机器人/设备运维", "客服/售后", "运营负责人"].filter((value, index, values) => values.indexOf(value) === index).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>{copy.note}</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="写清楚处理依据、沟通结果或现场判断" rows={4} />
          </label>
          <label className="field">
            <span>影响结论</span>
            <textarea value={impact} onChange={(event) => setImpact(event.target.value)} placeholder="说明对请求、点位、设备或顾客的影响；没有影响可写无" rows={3} />
          </label>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}>{copy.submit}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function TodoTable({ state }: { state: AppState }) {
  const incidentTodos = activeIncidents(state).slice(0, 2).map((incident) => ({
    type: "异常",
    title: incident.type,
    object: incident.id,
    owner: incident.owner,
    due: incident.sla,
    status: incident.statusLabel,
  }));
  const taskTodos = activeTasks(state).slice(0, 3).map((task) => ({
    type: "任务",
    title: task.name,
    object: task.id,
    owner: task.owner,
    due: task.due,
    status: task.status,
  }));
  return (
    <DataTable
      headers={["类型", "事项", "负责人", "时限", "状态"]}
      rows={[...incidentTodos, ...taskTodos].map((item) => [
        <Badge value={item.type} tone="neutral" />,
        <NameCell primary={item.title} secondary={item.object} />,
        item.owner,
        item.due,
        <Badge value={item.status} />,
      ])}
    />
  );
}

export function ReleaseSnapshot({ state }: { state: AppState }) {
  const releases = state.releases.filter((release) => releaseVisibleForCurrentUser(state, release.id)).slice(0, 3);
  return (
    <DataTable
      headers={["发布", "范围", "状态", "发布人"]}
      rows={releases.map((release) => [
        <NameCell primary={release.name} secondary={release.id} />,
        release.scope,
        <Badge value={release.status} />,
        release.by,
      ])}
    />
  );
}

export function OperationalFlow({ state, showFinancial = true }: { state: AppState; showFinancial?: boolean }) {
  const { points, requests, incidents, tasks, readyPoints, liveRequests, refunding } = businessSnapshot(state);
  const completed = requests.filter((request) => request.status === "delivered").length;
  const reviewed = state.auditLogs.filter((log) => auditLogVisibleForCurrentUser(state, log) && ["关闭异常", "异常转退款", "异常转任务", "推进异常状态"].includes(log.action)).length;
  const manualConfirmations = tasks.filter((task) => task.type.includes("人工") || task.owner.includes("现场")).length;
  const stages: Array<[string, ReactNode, string]> = [
    ["上线准备", `${readyPoints.length}/${points.length}`, readyPoints.length === points.length ? "ok" : "warn"],
    ["接单履约", liveRequests.length, liveRequests.length ? "info" : "neutral"],
    ["交付完成", completed, completed ? "ok" : "neutral"],
    ["异常处理", incidents.length, incidents.length ? "bad" : "ok"],
    ["任务执行", tasks.length, tasks.length ? "warn" : "ok"],
    showFinancial ? ["退款售后", refunding.length, refunding.length ? "warn" : "ok"] : ["现场确认", manualConfirmations, manualConfirmations ? "warn" : "ok"],
    ["运营留痕", reviewed, reviewed ? "ok" : "neutral"],
  ];
  return (
    <div className="flow-grid">
      {stages.map(([label, value, tone]) => (
        <div className={`flow-card ${tone}`} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function PointDetail({ state, point }: { state: AppState; point?: Point }) {
  if (!point) return <EmptyState>当前筛选范围暂无点位</EmptyState>;
  const devices = pointDevices(state, point.name);
  const products = state.productVariants.filter((variant) => variant.points.includes(point.name));
  const readiness = pointReadiness(state, point);
  const requests = pointRequests(state, point.name);
  return (
    <aside className="detail-panel">
      <h3 className="band-title">点位概览</h3>
      <p className="band-meta">{point.name} / {point.city}</p>
      <div className="detail-stack">
        <DefinitionList
          rows={[
            ["营业状态", <Badge value={point.status} />],
            ["上线准入", <Badge value={readiness.status} />],
            ["负责人", point.owner],
            ["绑定设备", devices.map((device) => <Badge key={device.id} value={device.name} tone="neutral" />)],
            ["可售范围", products.length ? products.map((product) => <Badge key={product.sku} value={product.product} tone="neutral" />) : "-"],
            ["今日请求", requests.length],
            ["待处理异常", pointIncidents(state, point.name).length],
          ]}
        />
        <div className="note-box">{readiness.blockers.length ? `待处理：${readiness.blockers.join("、")}` : "该点位已满足当前开业准入条件。"}</div>
        <DataTable headers={["检查项", "状态"]} rows={readiness.checks.map((check) => [check.item, <Badge value={check.status} />])} />
      </div>
    </aside>
  );
}

export function DeviceCommandActions({ state, device, dispatch }: { state: AppState; device: Device; dispatch: Dispatch<AppAction> }) {
  const [pendingCommand, setPendingCommand] = useState<DeviceCommandAction | null>(null);
  const commands: Array<[DeviceCommandAction, ReactNode]> = [
    ["sync-status", <RefreshCcw className="lucide-icon" />],
    ["sync-config", <UploadCloud className="lucide-icon" />],
    ["restart", <Power className="lucide-icon" />],
  ];
  return (
    <>
      <div className="actions header-actions">
        {commands.map(([command, icon]) => {
          const policy = deviceCommandPolicy(state, device.id, command);
          return (
            <IconButton key={command} title={policy.allowed ? policy.label : policy.message} disabled={!policy.allowed} onClick={() => setPendingCommand(command)}>
              {icon}
            </IconButton>
          );
        })}
      </div>
      {pendingCommand ? <DeviceCommandDrawer state={state} device={device} dispatch={dispatch} command={pendingCommand} onClose={() => setPendingCommand(null)} /> : null}
    </>
  );
}

function DeviceCommandDrawer({ state, device, dispatch, command, onClose }: { state: AppState; device: Device; dispatch: Dispatch<AppAction>; command: DeviceCommandAction; onClose: () => void }) {
  const copy = deviceCommandText[command];
  const policy = deviceCommandPolicy(state, device.id, command);
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && reason.trim().length > 0;
  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer" role="dialog" aria-modal="true" aria-labelledby="device-command-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{device.sn}</p>
            <h3 id="device-command-title">{copy.title}</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={policy.risk} />
          <span>{policy.message}</span>
        </div>
        {policy.requiresApproval ? (
          <div className="note-box">审批人：{policy.approver || "设备运维负责人"}。规则：{policy.rule || "二次确认并写入高风险动作记录"}。</div>
        ) : null}
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "device-command", payload: { deviceId: device.id, command, reason } });
            onClose();
          }}
        >
          <label className="field">
            <span>{copy.note}</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="写清楚设备现状、影响范围和执行依据" rows={4} />
          </label>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}>{copy.submit}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function DeviceDetail({ state, device, dispatch }: { state: AppState; device?: Device; dispatch: Dispatch<AppAction> }) {
  if (!device) return <EmptyState>当前筛选范围暂无设备</EmptyState>;
  const events = state.deviceEvents.filter((event) => event.device === device.id);
  const commands = state.commandRecords.filter((record) => record.device === device.id);
  return (
    <aside className="detail-panel">
      <div className="band-header">
        <div>
          <h3 className="band-title">设备概览</h3>
          <p className="band-meta">{device.sn} / {device.point}</p>
        </div>
        <DeviceCommandActions state={state} device={device} dispatch={dispatch} />
      </div>
      <div className="detail-stack">
        <DefinitionList rows={[["类型", device.type], ["版本", device.version], ["状态", <Badge value={device.status} />], ["能力", device.capability.map((item) => <Badge key={item} value={item} tone="neutral" />)]]} />
        <div>
          <h4 className="subhead">事件日志</h4>
          <DataTable headers={["时间", "事件", "关联对象"]} rows={events.map((event) => [event.time, <NameCell primary={event.event} secondary={event.id} />, event.related])} />
        </div>
        <div>
          <h4 className="subhead">命令记录</h4>
          {commands.length ? <DataTable headers={["命令", "风险", "操作人", "结果"]} rows={commands.map((record) => [<NameCell primary={record.command} secondary={record.time} />, <Badge value={record.risk} />, record.operator, <Badge value={record.result} />])} /> : <EmptyState>暂无命令记录</EmptyState>}
        </div>
      </div>
    </aside>
  );
}

export function RequestDetail({ state, request }: { state: AppState; request?: BusinessRequest }) {
  if (!request) return <EmptyState>当前筛选范围暂无订单/服务请求</EmptyState>;
  const events = state.executionEvents.filter((event) => event.request === request.id);
  const incidents = state.incidents.filter((incident) => incident.order === request.id);
  const refunds = state.refunds.filter((refund) => refund.request === request.id);
  return (
    <aside className="detail-panel">
      <h3 className="band-title">请求概览</h3>
      <p className="band-meta">{request.id} / {request.label}</p>
      <div className="detail-stack">
        <DefinitionList
          rows={[
            ["当前状态", <Badge value={request.statusLabel} />],
            ["支付/确认", <Badge value={request.paid} />],
            ["执行设备", request.device],
            ["负责人", request.owner],
            ["关联异常", incidents.length ? incidents.map((incident) => <Badge key={incident.id} value={incident.id} tone="neutral" />) : "-"],
            ["退款记录", refunds.length ? refunds.map((refund) => <Badge key={refund.id} value={refund.status} />) : "-"],
          ]}
        />
        <div>
          <h4 className="subhead">执行事件</h4>
          {events.length ? <DataTable headers={["时间", "来源", "事件", "结果"]} rows={events.map((event) => [event.time, event.source, event.event, <Badge value={event.result} />])} /> : <EmptyState>暂无执行事件</EmptyState>}
        </div>
      </div>
    </aside>
  );
}

export function IncidentDetail({ state, incident }: { state: AppState; incident?: Incident }) {
  if (!incident) return <EmptyState>当前筛选范围暂无异常</EmptyState>;
  const records = state.processingRecords.filter((record) => record.target === incident.id);
  const task = state.tasks.find((item) => item.sourceIncident === incident.id);
  const refund = state.refunds.find((item) => item.incident === incident.id);
  return (
    <aside className="detail-panel">
      <h3 className="band-title">异常概览</h3>
      <p className="band-meta">{incident.id} / {incident.point}</p>
      <div className="detail-stack">
        <DefinitionList rows={[["等级", <Badge value={incident.level} />], ["来源", incident.source], ["负责人", incident.owner], ["状态", <Badge value={incident.statusLabel} />], ["关联请求", incident.order], ["任务", task ? <Badge value={task.id} tone="neutral" /> : "-"], ["退款", refund ? <Badge value={refund.id} tone="neutral" /> : "-"]]} />
        <div className="note-box">{incident.sop}</div>
        <div>
          <h4 className="subhead">处理记录</h4>
          <RecordList records={records} />
        </div>
      </div>
    </aside>
  );
}

export function TaskDetail({ state, task }: { state: AppState; task?: Task }) {
  if (!task) return <EmptyState>当前筛选范围暂无任务</EmptyState>;
  const records = state.processingRecords.filter((record) => record.target === task.id);
  return (
    <aside className="detail-panel">
      <h3 className="band-title">任务概览</h3>
      <p className="band-meta">{task.id} / {task.point}</p>
      <div className="detail-stack">
        <DefinitionList rows={[["类型", task.type], ["负责人", task.owner], ["状态", <Badge value={task.status} />], ["来源异常", task.sourceIncident ? <Badge value={task.sourceIncident} tone="neutral" /> : "-"]]} />
        <RecordList records={records} />
      </div>
    </aside>
  );
}

export function ReleaseDetail({ state, release, dispatch }: { state: AppState; release: ReleaseRecord; dispatch: Dispatch<AppAction> }) {
  const diffs = state.releaseDiffs.filter((diff) => diff.release === release.id);
  const scope = release.scopeRef || resolveScopeSelection(state, release.scope);
  const rollbackRelease = state.releases.find((item) => item.rollbackOf === release.id && item.status !== "已驳回");
  return (
    <aside className="detail-panel">
      <h3 className="band-title">发布概览</h3>
      <p className="band-meta">{release.id} / {release.scope}</p>
      <div className="detail-stack">
        <DefinitionList rows={[
          ["状态", <Badge value={release.status} />],
          ["发布人", release.by],
          ["时间", release.time],
          ["范围层级", scope ? scopeTypeLabel(scope.type) : "未结构化"],
          ["范围对象", scope ? scope.label : release.scope],
          ["写入范围", scope?.value || release.scope],
          ["回退记录", rollbackRelease ? <DetailLink to={`/releases/${rollbackRelease.id}`} title={`打开${rollbackRelease.id}详情`} /> : release.rollbackOf ? <DetailLink to={`/releases/${release.rollbackOf}`} title={`打开${release.rollbackOf}详情`} /> : "-"],
        ]} />
        <ReleaseRollbackActions state={state} release={release} dispatch={dispatch} />
        <div>
          <h4 className="subhead">差异查看</h4>
          <DataTable headers={["对象", "发布前", "发布后", "影响范围"]} rows={diffs.map((diff) => [diff.object, diff.before, diff.after, diff.impact])} />
        </div>
      </div>
    </aside>
  );
}

export function ReleaseRollbackActions({ state, release, dispatch }: { state: AppState; release: ReleaseRecord; dispatch: Dispatch<AppAction> }) {
  const [rollingBack, setRollingBack] = useState(false);
  const policy = releaseRollbackActionPolicy(state, release.id);
  return (
    <>
      <div className="inline-actions">
        <button className="text-button" type="button" disabled={!policy.allowed} title={policy.message} onClick={() => setRollingBack(true)}>
          <Undo2 className="lucide-icon" />
          申请回退
        </button>
      </div>
      {rollingBack ? <ReleaseRollbackDrawer state={state} release={release} policy={policy} dispatch={dispatch} onClose={() => setRollingBack(false)} /> : null}
    </>
  );
}

function ReleaseRollbackDrawer({ state, release, policy, dispatch, onClose }: { state: AppState; release: ReleaseRecord; policy: ReturnType<typeof releaseRollbackActionPolicy>; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const diffs = state.releaseDiffs.filter((diff) => diff.release === release.id);
  const canSubmit = policy.allowed && reason.trim().length >= 6;
  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="release-rollback-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{release.id}</p>
            <h3 id="release-rollback-title">申请配置回退</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={policy.risk} />
          <span>{policy.message}</span>
        </div>
        <DataTable
          headers={["对象", "当前配置", "回退后", "影响范围"]}
          rows={diffs.map((diff) => [diff.object, diff.after, diff.before, diff.impact])}
        />
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "submit-release-rollback", payload: { releaseId: release.id, reason } });
            onClose();
          }}
        >
          <label className="field">
            <span>回退原因</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明为什么回退、影响哪些点位或设备、回退后如何验证" rows={4} />
          </label>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button danger-action" type="submit" disabled={!canSubmit}><Undo2 className="lucide-icon" /> 提交回退审批</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function ApprovalActions({ state, approval, dispatch }: { state: AppState; approval: ApprovalRequest; dispatch: Dispatch<AppAction> }) {
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const policy = approvalActionPolicy(state, approval);
  if (approval.status !== "待审批") return <span className="secondary">已处理</span>;
  if (!policy.allowed) return <span className="secondary">{policy.message}</span>;
  return (
    <>
      <div className="actions">
        <IconButton title="审批通过" onClick={() => setDecision("approve")}>
          <Check className="lucide-icon" />
        </IconButton>
        <IconButton title="审批驳回" onClick={() => setDecision("reject")}>
          <X className="lucide-icon" />
        </IconButton>
      </div>
      {decision ? <ApprovalReviewDrawer approval={approval} decision={decision} dispatch={dispatch} onClose={() => setDecision(null)} /> : null}
    </>
  );
}

function ApprovalReviewDrawer({ approval, decision, dispatch, onClose }: { approval: ApprovalRequest; decision: "approve" | "reject"; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const [note, setNote] = useState("");
  const canSubmit = note.trim().length > 0;
  const approved = decision === "approve";
  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer" role="dialog" aria-modal="true" aria-labelledby="approval-review-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{approval.id}</p>
            <h3 id="approval-review-title">{approved ? "审批通过" : "审批驳回"}</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={approval.risk} />
          <span>{approval.action} / {approval.target}。规则：{approval.rule}。</span>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "review-approval", approvalId: approval.id, decision, note });
            onClose();
          }}
        >
          <label className="field">
            <span>审批意见</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={approved ? "说明通过依据、影响范围和后续要求" : "说明驳回原因和需要修正的内容"} rows={4} />
          </label>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className={`text-button ${approved ? "primary-action" : "danger-action"}`} type="submit" disabled={!canSubmit}>{approved ? "确认通过" : "确认驳回"}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function RefundTable({ state }: { state: AppState }) {
  if (!state.refunds.length) return <EmptyState>当前暂无退款/售后记录</EmptyState>;
  return (
    <DataTable
      headers={["退款", "请求", "来源异常", "金额", "状态", "负责人"]}
      rows={state.refunds.map((refund) => [
        <NameCell primary={refund.id} secondary={refund.reason} />,
        refund.request,
        refund.incident,
        refund.amount,
        <Badge value={refund.status} />,
        refund.owner,
      ])}
    />
  );
}

export function IncidentReasonBars({ state }: { state: AppState }) {
  return <MetricBars rows={incidentReasonBars(state)} />;
}

export function TeamRecommendationTable({ state }: { state: AppState }) {
  return <DataTable headers={["职责", "承担方式", "数据范围", "配置重点"]} rows={teamRecommendation(state)} />;
}

export function TaskActions({ state, task, dispatch }: { state: AppState; task: Task; dispatch: Dispatch<AppAction> }) {
  const [pendingAction, setPendingAction] = useState<TaskWorkflowAction | null>(null);
  const startPolicy = taskActionPolicy(state, task, "start");
  const resolvePolicy = taskActionPolicy(state, task, "resolve");
  return (
    <>
      <div className="actions">
        <IconButton title={startPolicy.allowed ? startPolicy.label : startPolicy.message} disabled={!startPolicy.allowed} onClick={() => setPendingAction("start")}>
          <Play className="lucide-icon" />
        </IconButton>
        <IconButton title={resolvePolicy.allowed ? resolvePolicy.label : resolvePolicy.message} disabled={!resolvePolicy.allowed} onClick={() => setPendingAction("resolve")}>
          <Check className="lucide-icon" />
        </IconButton>
      </div>
      {pendingAction ? <TaskActionDrawer state={state} task={task} dispatch={dispatch} action={pendingAction} onClose={() => setPendingAction(null)} /> : null}
    </>
  );
}

function TaskActionDrawer({ state, task, dispatch, action, onClose }: { state: AppState; task: Task; dispatch: Dispatch<AppAction>; action: TaskWorkflowAction; onClose: () => void }) {
  const copy = taskActionText[action];
  const policy = taskActionPolicy(state, task, action);
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");
  const canSubmit = policy.allowed && note.trim().length > 0 && (action !== "resolve" || result.trim().length > 0);
  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer" role="dialog" aria-modal="true" aria-labelledby="task-action-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{task.id}</p>
            <h3 id="task-action-title">{copy.title}</h3>
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
            dispatch({ type: "task", taskId: task.id, action, payload: { note, result } });
            onClose();
          }}
        >
          <label className="field">
            <span>{copy.note}</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="写清楚处理动作、当前判断和下一步" rows={4} />
          </label>
          {action === "resolve" ? (
            <label className="field">
              <span>处理结果</span>
              <textarea value={result} onChange={(event) => setResult(event.target.value)} placeholder="说明现场结果、是否恢复、是否仍需跟进" rows={3} />
            </label>
          ) : null}
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}>{copy.submit}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function ReadonlyGrid({ fields }: { fields: Array<[string, ReactNode]> }) {
  return (
    <div className="form-grid">
      {fields.map(([label, value]) => <ReadonlyField key={label} label={label} value={value} />)}
    </div>
  );
}
