import { CheckCircle2, Download, Eye, RefreshCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, DataTable, EmptyState, NameCell, Section } from "../../components/ui";
import type { AppState } from "../../types/core";
import { orderReportsAccess } from "./access";
import { snapshotFromAppState } from "./adapters";
import { clearExportTask, completeExportTask, expireExportTasks, filterReportRows, markExportTaskRead, startExport } from "./domain";
import type { OrderReportsAuditEvent, OrderReportsSnapshot, ReportType } from "./types";
import { useOrderReports } from "./useOrderReports";

const reportTypes: ReportType[] = ["商品销售", "点位销售", "生产明细", "物料用量", "料仓用量", "标定记录", "损耗记录"];

export interface AdvancedReportsPageProps {
  appState?: AppState;
  tenantId?: string;
  snapshot?: OrderReportsSnapshot;
  visiblePointIds?: string[];
  onAudit?: (event: OrderReportsAuditEvent) => void;
}

export function AdvancedReportsPage({ appState, tenantId, snapshot, visiblePointIds, onAudit }: AdvancedReportsPageProps = {}) {
  const access = orderReportsAccess(appState, tenantId);
  const sourceSnapshot = snapshot || (appState ? snapshotFromAppState(appState, access.tenantId) : undefined);
  const scopedPointIds = visiblePointIds || (sourceSnapshot && appState ? sourceSnapshot.points.filter((point) => access.visiblePointNames.includes(point.name)).map((point) => point.id) : undefined);
  const { state, mutate } = useOrderReports({ tenantId: access.tenantId, userId: access.userId, visiblePointIds: scopedPointIds, snapshot: sourceSnapshot });
  const [reportType, setReportType] = useState<ReportType>("商品销售");
  const [pointFilter, setPointFilter] = useState("全部点位");
  const [range, setRange] = useState<"今日" | "近 7 天" | "近 30 天">("今日");
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => filterReportRows(state.reportRows, range).filter((row) => row.type === reportType && (pointFilter === "全部点位" || row.point === pointFilter)), [pointFilter, range, reportType, state.reportRows]);
  const processing = state.exportTasks.filter((task) => task.status === "待执行" || task.status === "执行中").length;
  const failed = state.exportTasks.filter((task) => task.status === "失败").length;
  const successful = state.exportTasks.filter((task) => task.status === "成功").length;

  const run = (work: () => void, success: string, audit?: Omit<OrderReportsAuditEvent, "result" | "operator">) => {
    try {
      work();
      setNotice(success);
      if (audit) onAudit?.({ ...audit, operator: access.operator, result: "成功" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
      if (audit) onAudit?.({ ...audit, operator: access.operator, result: "失败", detail: error instanceof Error ? error.message : audit.detail });
    }
  };
  const confirmAction = (message: string, audit: Omit<OrderReportsAuditEvent, "result" | "operator">) => {
    if (confirmRisk(message)) return true;
    onAudit?.({ ...audit, operator: access.operator, result: "已拒绝", detail: `用户取消确认：${audit.detail}` });
    return false;
  };

  return (
    <>
      <div className="section-tabs" role="tablist" aria-label="细分报表类型">
        {reportTypes.map((type) => <button className={reportType === type ? "active" : ""} type="button" role="tab" aria-selected={reportType === type} key={type} onClick={() => setReportType(type)}>{type}</button>)}
      </div>
      <div className="policy-strip"><Badge value={access.canViewReports ? (access.canExportReports ? "查看与导出" : "仅查看") : "不可查看"} /><span>{access.canExportReports ? access.exportReason : access.reportReason}</span></div>
      {notice ? <div className="policy-strip"><Badge value={notice.includes("不可") || notice.includes("失败") ? "需处理" : "已完成"} /><span>{notice}</span></div> : null}
      {!access.canViewReports ? <Section title="报表访问受限"><EmptyState>{access.reportReason}</EmptyState></Section> : null}
      {access.canViewReports ? <>
      <Section
        title={`${reportType}报表`}
        meta="按点位与时间范围筛选；导出生成异步任务，不直接暴露经营数据文件"
        action={<button className="text-button primary-action" type="button" disabled={!access.canExportReports} title={access.exportReason} onClick={() => { const audit = { action: "导出报表", object: reportType, risk: "L3" as const, detail: `${range} / ${pointFilter}` }; if (confirmAction(`确认导出${reportType}（${range} / ${pointFilter}）？该动作将写入 L3 审计。`, audit)) run(() => mutate((current) => startExport(current, reportType, `${range} / ${pointFilter}`, access.operator)), "异步导出任务已创建", audit); }}><Download className="lucide-icon" />导出</button>}
      >
        <div className="filters">
          <label className="field"><span>时间范围</span><select value={range} onChange={(event) => setRange(event.target.value as typeof range)}><option>今日</option><option>近 7 天</option><option>近 30 天</option></select></label>
          <label className="field"><span>点位</span><select value={pointFilter} onChange={(event) => setPointFilter(event.target.value)}><option>全部点位</option>{state.points.map((point) => <option key={point.id}>{point.name}</option>)}</select></label>
        </div>
        {rows.length ? (
          <DataTable headers={["维度", "点位", "值", "时间", "明细"]} rows={rows.map((row) => [<NameCell primary={row.dimension} secondary={row.id} />, row.point, <strong>{row.value} {row.unit}</strong>, row.occurredAt, row.detail])} />
        ) : <EmptyState>当前筛选范围暂无{reportType}数据</EmptyState>}
      </Section>

      <div className="grid three">
        <Section title="处理中"><strong>{processing}</strong></Section>
        <Section title="导出成功"><strong>{successful}</strong></Section>
        <Section title="失败 / 超时"><strong>{failed}</strong></Section>
      </div>

      <Section
        title="异步导出任务"
        meta={`按创建时间倒序仅保留最近 50 条；待执行/执行中不可清理；超过 5 分钟未更新自动失败（当前 ${state.exportTasks.length}/50）`}
        action={<button className="text-button" type="button" onClick={() => run(() => mutate((current) => expireExportTasks(current)), "超时任务检查完成", { action: "检查导出超时", object: "异步导出任务", risk: "L0", detail: "超过 5 分钟未更新转失败" })}><RefreshCcw className="lucide-icon" />检查超时</button>}
      >
        {state.exportTasks.length ? (
          <DataTable
            headers={["任务", "报表 / 筛选", "状态", "创建人", "创建 / 更新", "文件或失败原因", "操作"]}
            rows={state.exportTasks.slice(0, 50).map((task) => {
              const processingTask = task.status === "待执行" || task.status === "执行中";
              return [
                <NameCell primary={task.id} secondary={task.isRead ? "已读" : "未读"} />,
                <NameCell primary={task.reportType} secondary={task.filters} />,
                <Badge value={task.status} />,
                task.createdBy,
                <NameCell primary={formatTime(task.createdAt)} secondary={`更新 ${formatTime(task.updatedAt)}`} />,
                task.fileName || task.failureReason || "生成中",
                <span className="actions">
                  {processingTask && access.canExportReports ? <button className="text-button" type="button" onClick={() => run(() => mutate((current) => completeExportTask(current, task.id)), "导出任务已完成", { action: "完成导出任务", object: task.id, risk: "L1", detail: task.reportType })}><CheckCircle2 className="lucide-icon" />完成</button> : null}
                  <button className="text-button" type="button" disabled={processingTask || task.isRead} title={processingTask ? "处理中任务不可标记已读" : task.isRead ? "任务已读" : "标记已读"} onClick={() => run(() => mutate((current) => markExportTaskRead(current, task.id, access.operator)), "导出任务已标记已读", { action: "标记导出任务已读", object: task.id, risk: "L0", detail: task.reportType })}><Eye className="lucide-icon" />已读</button>
                  <button className="text-button danger-action" type="button" disabled={processingTask || !access.canExportReports} title={processingTask ? "处理中任务不可清理" : !access.canExportReports ? access.exportReason : "清理任务记录"} onClick={() => run(() => mutate((current) => clearExportTask(current, task.id, access.operator)), "导出任务已清理", { action: "清理导出任务", object: task.id, risk: "L1", detail: task.reportType })}><Trash2 className="lucide-icon" />清理</button>
                </span>,
              ];
            })}
          />
        ) : <EmptyState>暂无导出任务</EmptyState>}
      </Section>
      </> : null}
    </>
  );
}

function confirmRisk(message: string) {
  return typeof window === "undefined" || window.confirm(message);
}

function formatTime(value: string) {
  return value.replace("T", " ").replace(/([+-]\d{2}:\d{2}|Z)$/, "").slice(0, 19);
}

export default AdvancedReportsPage;
