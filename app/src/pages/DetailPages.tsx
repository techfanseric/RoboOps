import { ArrowLeft } from "lucide-react";
import type { Dispatch, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { staticData } from "../data/mockData";
import {
  approvalVisibleForCurrentUser,
  deviceVisibleForCurrentUser,
  incidentVisibleForCurrentUser,
  pointDevices,
  pointIncidents,
  pointReadiness,
  pointRequests,
  pointTasks,
  pointVisibleForCurrentUser,
  releaseVisibleForCurrentUser,
  requestVisibleForCurrentUser,
  taskVisibleForCurrentUser,
  type AppAction,
} from "../services/operations";
import type { AppState, BusinessRequest, Incident, Point } from "../types/core";
import { Badge, DataTable, DefinitionList, DetailLink, EmptyState, NameCell, RecordList, Section } from "../components/ui";
import { ApprovalActions, DeviceCommandActions, IncidentActions, ReleaseRollbackActions, TaskActions } from "./sharedViews";
import { resolveScopeSelection, scopeTypeLabel } from "../components/ScopeSelector";

function DetailHeader({
  backTo,
  backLabel,
  kicker,
  title,
  meta,
  status,
}: {
  backTo: string;
  backLabel: string;
  kicker: string;
  title: string;
  meta?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="detail-route-header">
      <Link className="back-link" to={backTo}>
        <ArrowLeft className="lucide-icon" />
        {backLabel}
      </Link>
      <div className="detail-route-title">
        <p className="page-kicker">{kicker}</p>
        <h3>{title}</h3>
        {meta ? <p>{meta}</p> : null}
      </div>
      {status ? <div className="detail-route-status">{status}</div> : null}
    </div>
  );
}

function MissingDetail({ title, backTo }: { title: string; backTo: string }) {
  return (
    <>
      <DetailHeader backTo={backTo} backLabel="返回列表" kicker="未找到记录" title={title} />
      <EmptyState>当前记录不存在，可能已被筛选、归档或更换编号。</EmptyState>
    </>
  );
}

function AccessDeniedDetail({ title, backTo }: { title: string; backTo: string }) {
  return (
    <>
      <DetailHeader backTo={backTo} backLabel="返回列表" kicker="无访问权限" title={title} />
      <EmptyState>当前账号的数据范围不包含这条记录。请使用具备权限的账号登录，或从列表中选择可访问对象。</EmptyState>
    </>
  );
}

function requestRows(requests: BusinessRequest[]) {
  return requests.map((request) => [
    <NameCell primary={request.id} secondary={request.label} />,
    request.point,
    request.scenario,
    <Badge value={request.statusLabel} />,
    request.owner,
    <DetailLink to={`/orders/${request.id}`} title={`打开${request.id}详情`} />,
  ]);
}

function incidentRows(incidents: Incident[]) {
  return incidents.map((incident) => [
    <NameCell primary={incident.type} secondary={incident.id} />,
    <Badge value={incident.level} />,
    incident.owner,
    <Badge value={incident.statusLabel} />,
    incident.sla,
    <DetailLink to={`/incidents/${incident.id}`} title={`打开${incident.id}详情`} />,
  ]);
}

export function PointDetailRoute({ state }: { state: AppState }) {
  const { pointId } = useParams();
  const point = state.points.find((item) => item.id === pointId);
  if (!point) return <MissingDetail title="点位详情" backTo="/points" />;
  if (!pointVisibleForCurrentUser(state, point)) return <AccessDeniedDetail title="点位详情" backTo="/points" />;

  const readiness = pointReadiness(state, point);
  const devices = pointDevices(state, point.name);
  const requests = pointRequests(state, point.name);
  const incidents = pointIncidents(state, point.name);
  const tasks = pointTasks(state, point.name);

  return (
    <>
      <DetailHeader backTo="/points" backLabel="返回点位" kicker="点位详情" title={point.name} meta={`${point.brand} / ${point.scenario} / ${point.city}`} status={<Badge value={readiness.status} />} />
      <div className="grid two">
        <Section title="经营状态" meta="营业、负责人和上线准入">
          <DefinitionList rows={[["营业状态", <Badge value={point.status} />], ["负责人", point.owner], ["在线设备", `${devices.filter((device) => device.status === "在线" || device.status === "忙碌").length}/${devices.length}`], ["今日请求", requests.length], ["待处理异常", incidents.length], ["待处理任务", tasks.length]]} />
        </Section>
        <Section title="上线检查" meta="开业前必须满足的条件">
          <DataTable headers={["检查项", "状态"]} rows={readiness.checks.map((check) => [check.item, <Badge value={check.status} />])} />
        </Section>
      </div>
      <Section title="绑定设备" meta="机器人、自动化设备和交付设备">
        <DataTable headers={["设备", "SN", "类型", "状态", "版本", "详情"]} rows={devices.map((device) => [<NameCell primary={device.name} secondary={device.id} />, device.sn, device.type, <Badge value={device.status} />, device.version, <DetailLink to={`/devices/${device.id}`} title={`打开${device.name}详情`} />])} />
      </Section>
      <div className="grid two">
        <Section title="订单/服务请求" meta="该点位最近履约对象">
          <DataTable headers={["请求", "点位", "场景", "状态", "负责人", "详情"]} rows={requestRows(requests)} />
        </Section>
        <Section title="异常与任务" meta="仍需运营人员处理的事项">
          <DataTable headers={["异常", "等级", "负责人", "状态", "SLA", "详情"]} rows={incidentRows(incidents)} />
        </Section>
      </div>
    </>
  );
}

export function DeviceDetailRoute({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const { deviceId } = useParams();
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device) return <MissingDetail title="设备详情" backTo="/devices" />;
  if (!deviceVisibleForCurrentUser(state, device.id)) return <AccessDeniedDetail title="设备详情" backTo="/devices" />;

  const point = state.points.find((item) => item.name === device.point);
  const events = state.deviceEvents.filter((event) => event.device === device.id);
  const requests = state.businessRequests.filter((request) => request.device === device.name || request.point === device.point);
  const incidents = state.incidents.filter((incident) => incident.point === device.point && incident.source.includes("设备"));

  return (
    <>
      <DetailHeader backTo="/devices" backLabel="返回设备" kicker="设备详情" title={device.name} meta={`${device.sn} / ${device.point}`} status={<Badge value={device.status} />} />
      <div className="grid two">
        <Section title="设备档案" meta="版本、能力和所属点位" action={<DeviceCommandActions state={state} device={device} dispatch={dispatch} />}>
          <DefinitionList rows={[["SN", device.sn], ["类型", device.type], ["软件版本", device.version], ["所属点位", point ? <DetailLink to={`/points/${point.id}`} title={`打开${point.name}详情`} /> : device.point], ["能力标签", device.capability.map((item) => <Badge key={item} value={item} tone="neutral" />)]]} />
        </Section>
        <Section title="命令记录" meta="设备命令、审批状态和执行结果">
          <DataTable headers={["命令", "风险", "操作人", "结果"]} rows={state.commandRecords.filter((record) => record.device === device.id).map((record) => [<NameCell primary={record.command} secondary={record.time} />, <Badge value={record.risk} />, record.operator, <Badge value={record.result} />])} />
        </Section>
      </div>
      <Section title="设备事件" meta="设备上报、执行结果和关联对象">
        <DataTable headers={["时间", "事件", "等级", "关联对象"]} rows={events.map((event) => [event.time, <NameCell primary={event.event} secondary={event.id} />, <Badge value={event.level} />, event.related])} />
      </Section>
      <div className="grid two">
        <Section title="关联请求" meta="由该设备或所在点位承接的履约对象">
          <DataTable headers={["请求", "点位", "场景", "状态", "负责人", "详情"]} rows={requestRows(requests)} />
        </Section>
        <Section title="设备相关异常" meta="需要设备或现场人员处理">
          <DataTable headers={["异常", "等级", "负责人", "状态", "SLA", "详情"]} rows={incidentRows(incidents)} />
        </Section>
      </div>
    </>
  );
}

export function RequestDetailRoute({ state }: { state: AppState }) {
  const { requestId } = useParams();
  const request = state.businessRequests.find((item) => item.id === requestId);
  if (!request) return <MissingDetail title="请求详情" backTo="/orders" />;
  if (!requestVisibleForCurrentUser(state, request.id)) return <AccessDeniedDetail title="请求详情" backTo="/orders" />;

  const point = state.points.find((item) => item.name === request.point);
  const device = state.devices.find((item) => item.name === request.device);
  const events = state.executionEvents.filter((event) => event.request === request.id);
  const incidents = state.incidents.filter((incident) => incident.order === request.id);
  const refunds = state.refunds.filter((refund) => refund.request === request.id);
  const records = state.processingRecords.filter((record) => incidents.some((incident) => incident.id === record.target));

  return (
    <>
      <DetailHeader backTo="/orders" backLabel="返回请求" kicker="订单/服务请求详情" title={request.id} meta={request.label} status={<Badge value={request.statusLabel} />} />
      <div className="grid two">
        <Section title="请求概况" meta="支付、履约和责任人">
          <DefinitionList rows={[["品牌", request.brand], ["点位", point ? <DetailLink to={`/points/${point.id}`} title={`打开${point.name}详情`} /> : request.point], ["场景", request.scenario], ["支付/确认", <Badge value={request.paid} />], ["金额", request.amount ? `¥${request.amount}` : "-"], ["负责人", request.owner]]} />
        </Section>
        <Section title="执行对象" meta="设备、异常和退款状态">
          <DefinitionList rows={[["执行设备", device ? <DetailLink to={`/devices/${device.id}`} title={`打开${device.name}详情`} /> : request.device], ["关联异常", incidents.length ? incidents.map((incident) => <DetailLink key={incident.id} to={`/incidents/${incident.id}`} title={`打开${incident.id}详情`} />) : "-"], ["退款记录", refunds.length ? refunds.map((refund) => <Badge key={refund.id} value={`${refund.id} ${refund.status}`} />) : "-"]]} />
        </Section>
      </div>
      <Section title="执行事件" meta="支付、调度、设备和人工动作">
        <DataTable headers={["时间", "来源", "事件", "结果"]} rows={events.map((event) => [event.time, event.source, event.event, <Badge value={event.result} />])} />
      </Section>
      <div className="grid two">
        <Section title="关联异常" meta="由该请求产生或影响该请求的异常">
          <DataTable headers={["异常", "等级", "负责人", "状态", "SLA", "详情"]} rows={incidentRows(incidents)} />
        </Section>
        <Section title="处理记录" meta="异常、退款和人工确认过程">
          <RecordList records={records} />
        </Section>
      </div>
    </>
  );
}

export function IncidentDetailRoute({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const { incidentId } = useParams();
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident) return <MissingDetail title="异常详情" backTo="/incidents" />;
  if (!incidentVisibleForCurrentUser(state, incident.id)) return <AccessDeniedDetail title="异常详情" backTo="/incidents" />;

  const request = state.businessRequests.find((item) => item.id === incident.order);
  const point = state.points.find((item) => item.name === incident.point);
  const task = state.tasks.find((item) => item.sourceIncident === incident.id);
  const refund = state.refunds.find((item) => item.incident === incident.id);
  const records = state.processingRecords.filter((record) => record.target === incident.id);

  return (
    <>
      <DetailHeader backTo="/incidents" backLabel="返回异常" kicker="异常详情" title={incident.type} meta={`${incident.id} / ${incident.point}`} status={<Badge value={incident.statusLabel} />} />
      <div className="grid two">
        <Section title="异常信息" meta="等级、来源、负责人和 SLA" action={<IncidentActions state={state} dispatch={dispatch} incident={incident} />}>
          <DefinitionList rows={[["等级", <Badge value={incident.level} />], ["来源", incident.source], ["负责人", incident.owner], ["SLA", incident.sla], ["关联点位", point ? <DetailLink to={`/points/${point.id}`} title={`打开${point.name}详情`} /> : incident.point], ["关联请求", request ? <DetailLink to={`/orders/${request.id}`} title={`打开${request.id}详情`} /> : incident.order]]} />
        </Section>
        <Section title="处理去向" meta="任务、退款和 SOP">
          <DefinitionList rows={[["任务", task ? <DetailLink to={`/tasks/${task.id}`} title={`打开${task.id}详情`} /> : "-"], ["退款", refund ? <Badge value={`${refund.id} ${refund.status}`} /> : "-"], ["SOP", incident.sop]]} />
        </Section>
      </div>
      <Section title="处理记录" meta="所有动作必须留下时间、人员和结论">
        <RecordList records={records} />
      </Section>
      {request ? (
        <Section title="关联请求执行事件" meta="判断异常对履约状态的影响">
          <DataTable headers={["时间", "来源", "事件", "结果"]} rows={state.executionEvents.filter((event) => event.request === request.id).map((event) => [event.time, event.source, event.event, <Badge value={event.result} />])} />
        </Section>
      ) : null}
    </>
  );
}

export function TaskDetailRoute({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const { taskId } = useParams();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return <MissingDetail title="任务详情" backTo="/tasks" />;
  if (!taskVisibleForCurrentUser(state, task.id)) return <AccessDeniedDetail title="任务详情" backTo="/tasks" />;

  const incident = task.sourceIncident ? state.incidents.find((item) => item.id === task.sourceIncident) : null;
  const point = state.points.find((item) => item.name === task.point);
  const records = state.processingRecords.filter((record) => record.target === task.id);

  return (
    <>
      <DetailHeader backTo="/tasks" backLabel="返回任务" kicker="任务详情" title={task.name} meta={`${task.id} / ${task.point}`} status={<Badge value={task.status} />} />
      <div className="grid two">
        <Section title="任务信息" meta="负责人、状态和来源" action={<TaskActions state={state} task={task} dispatch={dispatch} />}>
          <DefinitionList rows={[["类型", task.type], ["负责人", task.owner], ["截止时间", task.due], ["所属点位", point ? <DetailLink to={`/points/${point.id}`} title={`打开${point.name}详情`} /> : task.point], ["来源异常", incident ? <DetailLink to={`/incidents/${incident.id}`} title={`打开${incident.id}详情`} /> : "-"]]} />
        </Section>
        <Section title="处理要求" meta="任务完成后需要回写异常和请求">
          <DefinitionList rows={[["回写异常", incident ? incident.statusLabel : "-"], ["影响请求", incident?.order || "-"], ["记录要求", "提交处理结果、影响结论和后续建议"]]} />
        </Section>
      </div>
      <Section title="处理记录" meta="现场、客服或设备运维的执行过程">
        <RecordList records={records} />
      </Section>
    </>
  );
}

export function ReleaseDetailRoute({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const { releaseId } = useParams();
  const release = state.releases.find((item) => item.id === releaseId);
  if (!release) return <MissingDetail title="发布详情" backTo="/releases" />;
  if (!releaseVisibleForCurrentUser(state, release.id)) return <AccessDeniedDetail title="发布详情" backTo="/releases" />;

  const diffs = state.releaseDiffs.filter((diff) => diff.release === release.id);
  const approvals = state.approvalRequests.filter((approval) => approval.target === release.id && approvalVisibleForCurrentUser(state, approval));
  const scope = release.scopeRef || resolveScopeSelection(state, release.scope);
  const rollbackRelease = state.releases.find((item) => item.rollbackOf === release.id && item.status !== "已驳回");

  return (
    <>
      <DetailHeader backTo="/releases" backLabel="返回发布" kicker="配置发布详情" title={release.name} meta={`${release.id} / ${release.scope}`} status={<Badge value={release.status} />} />
      <div className="grid two">
        <Section title="发布信息" meta="发布范围、版本状态和责任人" action={<ReleaseRollbackActions state={state} release={release} dispatch={dispatch} />}>
          <DefinitionList rows={[
            ["范围层级", scope ? scopeTypeLabel(scope.type) : "未结构化"],
            ["范围对象", scope ? scope.label : release.scope],
            ["写入范围", scope?.value || release.scope],
            ["状态", <Badge value={release.status} />],
            ["发布人", release.by],
            ["时间", release.time],
            ["回退关系", rollbackRelease ? <DetailLink to={`/releases/${rollbackRelease.id}`} title={`打开${rollbackRelease.id}详情`} /> : release.rollbackOf ? <DetailLink to={`/releases/${release.rollbackOf}`} title={`打开${release.rollbackOf}详情`} /> : "-"],
          ]} />
        </Section>
        <Section title="审批策略" meta="影响多点位或高风险配置时必须审批">
          <DataTable headers={["动作", "审批人", "规则"]} rows={staticData.approvalPolicies.filter((policy) => policy.action.includes("配置")).map((policy) => [policy.action, policy.approver, policy.rule])} />
        </Section>
      </div>
      <Section title="配置差异" meta="发布前后变化和影响范围">
        <DataTable headers={["对象", "发布前", "发布后", "影响范围"]} rows={diffs.map((diff) => [diff.object, diff.before, diff.after, diff.impact])} />
      </Section>
      <Section title="审批记录" meta="配置发布的审批状态和处理意见">
        <DataTable headers={["时间", "动作", "发起人", "审批人", "状态", "处理"]} rows={approvals.map((approval) => [approval.time, approval.action, approval.requester, approval.approver, <Badge value={approval.status} />, <ApprovalActions state={state} approval={approval} dispatch={dispatch} />])} />
      </Section>
    </>
  );
}
