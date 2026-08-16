import type { Dispatch } from "react";
import { RefreshCcw, Send, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ApiOperation, AppState } from "../types/core";
import type { AppAction } from "../services/operations";
import { apiOperationActionPolicy, apiOperationSyncSummary, apiOperationVisibleForCurrentUser, auditLogVisibleForCurrentUser, businessSnapshot } from "../services/operations";
import { Badge, DataTable, EmptyState, IconButton, NameCell, Section } from "../components/ui";
import { IncidentReasonBars, PointBars, ReadonlyGrid, RefundTable } from "./sharedViews";

export function Reports({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const snapshot = businessSnapshot(state);
  const completed = snapshot.requests.filter((request) => request.status === "delivered").length;
  const exceptionCount = snapshot.requests.filter((request) => request.status === "exception" || request.status === "refund_pending").length;
  const revenue = snapshot.requests.reduce((sum, request) => sum + (request.paid === "已支付" || request.paid === "已确认" ? request.amount : 0), 0);
  const exportLogs = state.auditLogs.filter((log) => auditLogVisibleForCurrentUser(state, log) && (log.action.includes("导出") || log.risk === "L4")).slice(0, 4);
  const apiOperations = state.apiOperations.filter((operation) => apiOperationVisibleForCurrentUser(state, operation)).slice(0, 8);
  const apiSummary = apiOperationSyncSummary(apiOperations);
  return (
    <>
      <div className="section-tabs" aria-label="报表视图">
        <Link className="tab-link active" to="/reports">运营概览</Link>
        <Link className="tab-link" to="/reports/advanced">细分报表与导出</Link>
      </div>
      <Section title="报表筛选" meta="品牌、场景、点位和时间范围">
        <ReadonlyGrid fields={[["时间范围", "今日 / 近 7 天 / 近 30 天"], ["维度", "品牌、场景、点位、设备、异常类型"], ["导出权限", "报表查看与报表导出分开授权"], ["导出留痕", "导出人、范围、时间和文件记录进入审计日志"]]} />
      </Section>
      <div className="grid two">
        <Section title="点位效率" meta="订单/请求完成率">
          <PointBars state={state} />
        </Section>
        <Section title="异常原因" meta="按当前筛选范围">
          <IncidentReasonBars state={state} />
        </Section>
      </div>
      <Section title="日报指标" meta="订单、点位、设备和财务">
        <DataTable headers={["维度", "指标"]} rows={[["订单/请求", `总量 ${snapshot.requests.length}，完成 ${completed}，异常/退款中 ${exceptionCount}`], ["点位", `可营业 ${snapshot.readyPoints.length}/${snapshot.points.length}，待处理异常 ${snapshot.incidents.length}`], ["设备", `在线 ${snapshot.devices.filter((device) => device.status === "在线" || device.status === "忙碌").length}/${snapshot.devices.length}，事件 ${state.deviceEvents.length}`], ["财务", `收入 ¥${revenue}，退款处理中 ${snapshot.refunding.length}`]]} />
      </Section>
      <Section title="退款/售后" meta="退款记录、来源异常和负责人">
        <RefundTable state={state} />
      </Section>
      <Section title="系统同步状态" meta="经营动作、服务端确认和失败处理">
        <ReadonlyGrid
          fields={[
            ["当前范围", `${apiSummary.total} 条请求记录`],
            ["待发送", <Badge value={`${apiSummary.pending} 条`} tone={apiSummary.pending ? "warn" : "neutral"} />],
            ["同步中", <Badge value={`${apiSummary.syncing} 条`} tone={apiSummary.syncing ? "warn" : "neutral"} />],
            ["失败", <Badge value={`${apiSummary.failed} 条`} tone={apiSummary.failed ? "bad" : "neutral"} />],
            ["待补偿", <Badge value={`${apiSummary.rollbackRequired} 条`} tone={apiSummary.rollbackRequired ? "bad" : "neutral"} />],
            ["显示范围", "按服务端时间倒序显示最近 8 条"],
          ]}
        />
      </Section>
      <Section title="同步请求记录" meta="关键经营动作对应的服务端同步记录">
        {apiOperations.length ? (
          <DataTable
            headers={["时间", "接口", "动作", "对象", "风险", "业务状态", "同步", "操作"]}
            rows={apiOperations.map((operation) => [
              operation.time,
              <NameCell primary={`${operation.method} ${operation.path}`} secondary={operation.idempotencyKey} />,
              operation.action,
              operation.object,
              <Badge value={operation.risk} />,
              <Badge value={operation.status} />,
              <NameCell
                primary={<Badge value={operation.syncStatus || "待同步"} />}
                secondary={apiOperationSyncDetail(operation)}
              />,
              <ApiOperationActions state={state} operation={operation} dispatch={dispatch} />,
            ])}
          />
        ) : (
          <EmptyState>当前筛选范围暂无同步请求记录</EmptyState>
        )}
      </Section>
      <Section title="导出记录" meta="敏感数据导出受权限控制">
        <DataTable headers={["时间", "操作人", "对象", "风险", "结果"]} rows={exportLogs.map((log) => [log.time, log.operator, log.object, <Badge value={log.risk} />, <Badge value={log.result} />])} />
      </Section>
    </>
  );
}

function apiOperationSyncDetail(operation: ApiOperation): string {
  if (operation.syncStatus === "同步成功") return operation.syncedAt ? `同步时间 ${operation.syncedAt}` : "服务端已确认";
  if (operation.syncStatus === "同步中") return `${operation.serverRequestId || "等待服务端请求号"} / 已发送 ${operation.attempts} 次`;
  if (operation.syncStatus === "同步失败") return `${operation.lastError || "同步失败"}${operation.nextRetryAt ? ` / ${operation.nextRetryAt} 重试` : ""}`;
  if (operation.syncStatus === "需要补偿") return operation.rollbackPlan || operation.lastError || "需要补偿处理";
  if (operation.syncStatus === "已补偿") return operation.rolledBackAt ? `补偿时间 ${operation.rolledBackAt}` : "补偿处理已完成";
  return "等待提交同步";
}

function ApiOperationActions({ state, operation, dispatch }: { state: AppState; operation: ApiOperation; dispatch: Dispatch<AppAction> }) {
  if (operation.syncStatus === "同步成功" || operation.syncStatus === "已补偿") return <span className="secondary">已完成</span>;
  if (operation.syncStatus === "同步中") {
    return <span className="secondary">等待确认</span>;
  }
  if (operation.syncStatus === "需要补偿") {
    const policy = apiOperationActionPolicy(state, operation.id, "compensate");
    return (
      <IconButton title={policy.message} disabled={!policy.allowed} onClick={() => dispatch({ type: "rollback-api-operation", operationId: operation.id })}>
        <Undo2 className="lucide-icon" />
      </IconButton>
    );
  }
  const policy = apiOperationActionPolicy(state, operation.id, "sync");
  return (
    <IconButton title={policy.allowed ? (operation.syncStatus === "同步失败" ? "重试同步" : "提交同步") : policy.message} disabled={!policy.allowed} onClick={() => dispatch({ type: "sync-api-operation", operationId: operation.id })}>
      {operation.syncStatus === "同步失败" ? <RefreshCcw className="lucide-icon" /> : <Send className="lucide-icon" />}
    </IconButton>
  );
}
