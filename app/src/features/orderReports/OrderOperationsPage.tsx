import { FilePlus2, Printer, RotateCw, Send, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, DataTable, EmptyState, NameCell, Section } from "../../components/ui";
import type { AppState } from "../../types/core";
import { orderReportsAccess } from "./access";
import { snapshotFromAppState } from "./adapters";
import { createManualOrder, dispatchOrder, dispatchRefund, legacyOrderCounts, printOrder, savePoint, validatePointUniqueness } from "./domain";
import type { BusinessOrder, OrderReportsAuditEvent, OrderReportsSnapshot, PointDraft } from "./types";
import { useOrderReports } from "./useOrderReports";

type ViewId = "points" | "orders" | "execution" | "logs" | "printing";

const views: Array<{ id: ViewId; label: string }> = [
  { id: "points", label: "点位资料" },
  { id: "orders", label: "订单下发" },
  { id: "execution", label: "执行记录" },
  { id: "logs", label: "数据日志" },
  { id: "printing", label: "打印记录" },
];

const stateLabels = ["待制作", "异常", "制作完成", "已取餐", "已退单", "制作完成且退单"];

export interface OrderOperationsPageProps {
  appState?: AppState;
  tenantId?: string;
  snapshot?: OrderReportsSnapshot;
  visiblePointIds?: string[];
  onAudit?: (event: OrderReportsAuditEvent) => void;
}

export function OrderOperationsPage({ appState, tenantId, snapshot, visiblePointIds, onAudit }: OrderOperationsPageProps = {}) {
  const access = orderReportsAccess(appState, tenantId);
  const sourceSnapshot = snapshot || (appState ? snapshotFromAppState(appState, access.tenantId) : undefined);
  const scopedPointIds = visiblePointIds || (sourceSnapshot && appState ? sourceSnapshot.points.filter((point) => access.visiblePointNames.includes(point.name)).map((point) => point.id) : undefined);
  const { state, mutate } = useOrderReports({ tenantId: access.tenantId, userId: access.userId, visiblePointIds: scopedPointIds, snapshot: sourceSnapshot });
  const [view, setView] = useState<ViewId>("orders");
  const [selectedId, setSelectedId] = useState(state.orders[0]?.id || "");
  const [notice, setNotice] = useState("");
  const selected = state.orders.find((order) => order.id === selectedId) || state.orders[0];
  const counts = legacyOrderCounts(state.orders);

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
      <div className="section-tabs" role="tablist" aria-label="订单运营分组">
        {views.map((item) => <button className={view === item.id ? "active" : ""} type="button" role="tab" aria-selected={view === item.id} key={item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
      </div>
      <div className="policy-strip"><Badge value={access.canOperateOrders ? "可操作" : "只读"} /><span>{access.orderReason}</span></div>
      {notice ? <div className="policy-strip"><Badge value={notice.includes("失败") || notice.includes("不可") || notice.includes("不存在") || notice.includes("未") ? "需处理" : "已完成"} /><span>{notice}</span></div> : null}
      {!access.canViewOrders ? <Section title="订单访问受限"><EmptyState>{access.orderReason}</EmptyState></Section> : null}
      {access.canViewOrders && view === "points" ? <PointProfiles state={state} canOperate={access.canOperateOrders} onSave={(draft) => run(() => mutate((current) => savePoint(current, draft)), "点位资料已保存" )} /> : null}
      {access.canViewOrders && view === "orders" ? (
        <>
          <div className="grid four">
            <Section title="全部订单"><strong>{counts.total}</strong></Section>
            <Section title="待制作 / 异常"><strong>{counts.waiting} / {counts.exception}</strong></Section>
            <Section title="已制作"><strong>{counts.completed}</strong></Section>
            <Section title="已退单"><strong>{counts.refunded}</strong></Section>
          </div>
          <ManualOrderForm state={state} canOperate={access.canOperateOrders} operator={access.operator} onCreate={(payload) => run(() => mutate((current) => createManualOrder(current, payload).state), "手工订单已创建，初始状态为未下发", { action: "创建手工订单", object: payload.pointId, risk: "L2", detail: `${payload.productName} / ${payload.specification}` } )} />
          <Section title="订单与设备下发" meta="首次下发与显式重发分开；下发前重新校验点位、设备、配方和物料步骤">
            <DataTable
              headers={["订单", "点位", "商品规格", "取餐 / item code", "旧状态", "下发", "设备", "操作"]}
              rows={state.orders.map((order) => ({
                key: order.id,
                selected: selected?.id === order.id,
                onClick: () => setSelectedId(order.id),
                label: `查看${order.orderNo}`,
                cells: [
                  <NameCell primary={order.orderNo} secondary={`${order.createdBy} / ${formatTime(order.createdAt)}`} />,
                  pointName(state, order.pointId),
                  <NameCell primary={order.productName} secondary={`${order.productCode} / ${order.specification}`} />,
                  <NameCell primary={`#${order.pickupNo} / 序号 ${order.productSequence}`} secondary={order.itemCode} />,
                  <Badge value={stateLabels[order.legacyState]} />,
                  <NameCell primary={<Badge value={order.dispatchState} />} secondary={`retry ${order.retryCount}`} />,
                  state.devices.find((item) => item.id === order.deviceId)?.sn || "待选择",
                  <span className="actions">
                    <button className="text-button" type="button" disabled={!access.canOperateOrders || order.dispatchState !== "未下发"} onClick={(event) => { event.stopPropagation(); const audit = { action: "下发订单", object: order.orderNo, risk: "L3" as const, detail: "首次下发 / retry=false" }; if (confirmAction(`确认向设备下发订单 ${order.orderNo}？`, audit)) run(() => mutate((current) => dispatchOrder(current, order.id, false, undefined, access.operator)), "订单下发记录已生成", audit); }}><Send className="lucide-icon" />下发</button>
                    <button className="text-button" type="button" disabled={!access.canOperateOrders || order.dispatchState === "未下发"} onClick={(event) => { event.stopPropagation(); const audit = { action: "重发订单", object: order.orderNo, risk: "L3" as const, detail: "显式重发 / retry=true" }; if (confirmAction(`确认显式重发订单 ${order.orderNo}？该动作会记录 retry=true。`, audit)) run(() => mutate((current) => dispatchOrder(current, order.id, true, undefined, access.operator)), "显式重发记录已生成", audit); }}><RotateCw className="lucide-icon" />重发</button>
                    <button className="text-button danger-action" type="button" disabled={!access.canOperateOrders || order.refundState === "退单下发成功"} onClick={(event) => { event.stopPropagation(); const audit = { action: "下发退单", object: order.orderNo, risk: "L3" as const, detail: "设备退单指令" }; if (confirmAction(`确认向设备下发退单 ${order.orderNo}？成功后不可重复。`, audit)) run(() => mutate((current) => dispatchRefund(current, order.id, undefined, access.operator)), "退单已通过独立事件下发", audit); }}><Undo2 className="lucide-icon" />退单</button>
                  </span>,
                ],
              }))}
            />
          </Section>
        </>
      ) : null}
      {access.canViewOrders && view === "execution" ? <ExecutionRecords state={state} selected={selected} onSelect={setSelectedId} /> : null}
      {access.canViewOrders && view === "logs" ? <DataLogs state={state} /> : null}
      {access.canViewOrders && view === "printing" ? <PrintRecords state={state} canOperate={access.canOperateOrders} onPrint={(orderId) => run(() => mutate((current) => printOrder(current, orderId, access.operator)), "打印结果已记录；已有成功记录时自动记为补打" )} /> : null}
    </>
  );
}

function PointProfiles({ state, canOperate, onSave }: { state: ReturnType<typeof useOrderReports>["state"]; canOperate: boolean; onSave: (draft: PointDraft) => void }) {
  const initial: PointDraft = { groupId: state.points[0]?.groupId || "TENANT-DEMO", name: "", code: "", thirdPartyCode: "", province: "", city: "", district: "", address: "", longitude: 0, latitude: 0, status: "试运行" };
  const [draft, setDraft] = useState<PointDraft>(initial);
  const errors = useMemo(() => validatePointUniqueness(state.points, draft), [draft, state.points]);
  const change = (field: keyof PointDraft, value: string | number) => setDraft((current) => ({ ...current, [field]: value }));
  return (
    <>
      <Section title="点位资料" meta="名称、编码和第三方编码在企业内分别唯一；保留省市区、地址和经纬度">
        <DataTable headers={["点位", "点位编码", "第三方编码", "区域", "地址", "坐标", "状态"]} rows={state.points.map((point) => [<NameCell primary={point.name} secondary={point.id} />, point.code, point.thirdPartyCode, `${point.province} / ${point.city} / ${point.district}`, point.address, `${point.longitude}, ${point.latitude}`, <Badge value={point.status} />])} />
      </Section>
      <Section title="新增点位" meta={errors.length ? errors.join("；") : "唯一性校验通过"}>
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!errors.length) { onSave(draft); setDraft(initial); } }}>
          <label className="field"><span>点位名称</span><input value={draft.name} onChange={(event) => change("name", event.target.value)} /></label>
          <label className="field"><span>点位编码</span><input value={draft.code} onChange={(event) => change("code", event.target.value)} /></label>
          <label className="field"><span>第三方点位编码</span><input value={draft.thirdPartyCode} onChange={(event) => change("thirdPartyCode", event.target.value)} /></label>
          <label className="field"><span>营业状态</span><select value={draft.status} onChange={(event) => change("status", event.target.value)}>{["试运行", "营业中", "维护中", "暂停营业"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="field"><span>省</span><input value={draft.province} onChange={(event) => change("province", event.target.value)} /></label>
          <label className="field"><span>市</span><input value={draft.city} onChange={(event) => change("city", event.target.value)} /></label>
          <label className="field"><span>区</span><input value={draft.district} onChange={(event) => change("district", event.target.value)} /></label>
          <label className="field"><span>经度</span><input type="number" step="any" value={draft.longitude} onChange={(event) => change("longitude", Number(event.target.value))} /></label>
          <label className="field"><span>纬度</span><input type="number" step="any" value={draft.latitude} onChange={(event) => change("latitude", Number(event.target.value))} /></label>
          <label className="field full"><span>详细地址</span><input value={draft.address} onChange={(event) => change("address", event.target.value)} /></label>
          <div className="actions"><button className="text-button primary-action" type="submit" disabled={!canOperate || errors.length > 0}><FilePlus2 className="lucide-icon" />保存点位</button></div>
        </form>
      </Section>
    </>
  );
}

function ManualOrderForm({ state, canOperate, operator, onCreate }: { state: ReturnType<typeof useOrderReports>["state"]; canOperate: boolean; operator: string; onCreate: (input: Parameters<typeof createManualOrder>[1]) => void }) {
  const [pointId, setPointId] = useState(state.points[0]?.id || "");
  const productOptions = state.formulas.filter((formula) => formula.enabled && (!formula.pointIds.length || formula.pointIds.includes(pointId))).map((formula) => ({ key: `${formula.productCode}|${formula.productName || formula.productCode}|${formula.specification}`, label: `${formula.productName || formula.productCode} / ${formula.specification}`, version: formula.version })).filter((option, index, all) => all.findIndex((item) => item.key === option.key) === index);
  const [productKey, setProductKey] = useState(productOptions[0]?.key || "");
  const selectedProductKey = productOptions.some((option) => option.key === productKey) ? productKey : productOptions[0]?.key || "";
  const [quantity, setQuantity] = useState(1);
  return (
    <Section title="手工创建订单" meta="企业、用户、点位和 ISO 创建时刻组合防重；生成订单号、取餐号、商品序号和 item code">
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const [productCode, productName, specification] = selectedProductKey.split("|"); onCreate({ groupId: state.points.find((point) => point.id === pointId)?.groupId || "", createdBy: operator, pointId, productCode, productName, specification, quantity }); }}>
        <label className="field"><span>企业</span><input value={state.points.find((point) => point.id === pointId)?.groupId || "-"} disabled /></label>
        <label className="field"><span>点位</span><select value={pointId} onChange={(event) => setPointId(event.target.value)}>{state.points.map((point) => <option value={point.id} key={point.id}>{point.name}</option>)}</select></label>
        <label className="field"><span>商品 / 规格</span><select value={selectedProductKey} disabled={!productOptions.length} onChange={(event) => setProductKey(event.target.value)}>{productOptions.map((option) => <option value={option.key} key={option.key}>{option.label} / v{option.version}</option>)}</select></label>
        <label className="field"><span>数量</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        <div className="actions"><button className="text-button primary-action" type="submit" disabled={!canOperate || !pointId || !selectedProductKey} title={!selectedProductKey ? "当前点位没有已启用且可用的配方" : ""}><FilePlus2 className="lucide-icon" />创建订单</button></div>
      </form>
    </Section>
  );
}

function ExecutionRecords({ state, selected, onSelect }: { state: ReturnType<typeof useOrderReports>["state"]; selected?: BusinessOrder; onSelect: (id: string) => void }) {
  return (
    <div className="split-detail">
      <Section title="制作订单" meta="旧状态口径和执行耗时">
        <DataTable headers={["订单", "状态", "总资源用量", "执行耗时"]} rows={state.orders.map((order) => ({ key: order.id, selected: selected?.id === order.id, onClick: () => onSelect(order.id), cells: [<NameCell primary={order.orderNo} secondary={order.itemCode} />, <Badge value={stateLabels[order.legacyState]} />, order.totalResourceUsage, totalDuration(order)] }))} />
      </Section>
      <Section title="执行步骤" meta={selected ? `${selected.orderNo} / 应出与实出、异常原因和耗时；仅装载启用的绑定工艺` : "请选择订单"}>
        {selected ? <><DataTable headers={["顺序", "物料", "应出", "实出", "状态", "异常原因", "耗时"]} rows={selected.steps.map((step) => [step.order, <NameCell primary={step.materialName} secondary={step.materialCode} />, `${step.expected}${step.unit}`, `${step.actual}${step.unit}`, <Badge value={step.status} />, step.exceptionReason || "-", `${step.durationSeconds}s`])} />{selected.processSteps.length ? <div className="record-list">{selected.processSteps.map((step) => <div className="record-item" key={`${selected.id}-process-${step.order}`}><strong>工艺 {step.order} · {step.name}</strong><p>{step.seconds}s / {step.rpm || "-"} rpm / {step.direction || "无方向"}</p></div>)}</div> : null}</> : <EmptyState>暂无订单</EmptyState>}
      </Section>
    </div>
  );
}

function DataLogs({ state }: { state: ReturnType<typeof useOrderReports>["state"] }) {
  const labels = { ORDER_PUSH: "订单下发", ORDER_RETRY: "订单重发", REFUND_PUSH: "退单下发" };
  return <><Section title="订单与退单数据日志" meta="不同事件类型独立记录；每次重发明确保留 retry=true"><DataTable headers={["时间", "订单", "事件", "retry", "设备", "结果", "原因"]} rows={state.dataLogs.map((log) => [formatTime(log.time), state.orders.find((order) => order.id === log.orderId)?.orderNo || log.orderId, labels[log.event], <Badge value={String(log.retry)} />, log.deviceSn, <Badge value={log.result} />, log.reason])} /></Section><Section title="订单动作审计" meta="创建、下发、重发、退单和打印均保留风险等级与操作者"><DataTable headers={["时间", "操作人", "动作", "对象", "风险", "结果", "说明"]} rows={state.auditLogs.map((log) => [formatTime(log.time), log.operator, log.action, log.object, <Badge value={log.risk} />, <Badge value={log.result} />, log.detail])} /></Section></>;
}

function PrintRecords({ state, canOperate, onPrint }: { state: ReturnType<typeof useOrderReports>["state"]; canOperate: boolean; onPrint: (orderId: string) => void }) {
  const [orderId, setOrderId] = useState(state.orders[0]?.id || "");
  return (
    <>
      <Section title="打印订单" meta="订单存在性校验；首次打印与补打分开记录操作人和时间" action={<button className="text-button primary-action" type="button" disabled={!canOperate || !orderId} onClick={() => onPrint(orderId)}><Printer className="lucide-icon" />打印 / 补打</button>}>
        <label className="field"><span>选择订单</span><select value={orderId} onChange={(event) => setOrderId(event.target.value)}>{state.orders.map((order) => <option value={order.id} key={order.id}>{order.orderNo} / #{order.pickupNo}</option>)}</select></label>
      </Section>
      <Section title="打印记录"><DataTable headers={["时间", "订单", "类型", "操作人", "结果", "说明"]} rows={state.printLogs.map((log) => [formatTime(log.time), state.orders.find((order) => order.id === log.orderId)?.orderNo || log.orderId, <Badge value={log.printType} />, log.operator, <Badge value={log.result} />, log.reason])} /></Section>
    </>
  );
}

function pointName(state: ReturnType<typeof useOrderReports>["state"], pointId: string) {
  return state.points.find((point) => point.id === pointId)?.name || pointId;
}

function totalDuration(order: BusinessOrder) {
  if (order.executionStartedAt && order.executionFinishedAt) return `${Math.max(0, Math.round((Date.parse(order.executionFinishedAt) - Date.parse(order.executionStartedAt)) / 1000))}s`;
  return `${order.steps.reduce((sum, step) => sum + step.durationSeconds, 0)}s`;
}

function formatTime(value: string) {
  return value.replace("T", " ").replace(/([+-]\d{2}:\d{2}|Z)$/, "").slice(0, 19);
}

function confirmRisk(message: string) {
  return typeof window === "undefined" || window.confirm(message);
}

export default OrderOperationsPage;
