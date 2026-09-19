import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Badge,
  DataTable,
  DefinitionList,
  EmptyState,
  NameCell,
  Section,
} from "../../components/ui";
import type { AppState } from "../../types/core";
import { actorFor, loadState, seedState, STORAGE_KEY } from "./store";
import {
  resetDemo,
  available,
  cancelReason,
  changePolicy,
  decision,
  money,
  policyFor,
  refunded,
  refundLabel,
  reviewRefund,
  settle,
  simulateFailure,
  submitBatch,
  visible,
  type Order,
  type Policy,
  type RefundState,
  type Rule,
} from "./domain";
import { RefundDialog } from "./RefundDialog";
import "./refunds.css";
const time = (s: string) =>
  new Date(s).toLocaleString("zh-CN", { hour12: false });
const tone = (s: string) =>
  /失败|驳回/.test(s)
    ? "bad"
    : /成功|全额/.test(s)
      ? "ok"
      : /处理中|待|部分/.test(s)
        ? "warn"
        : "neutral";
export function RefundManagementPage({
  appState,
  onAudit,
}: {
  appState: AppState;
  onAudit: (e: {
    action: string;
    object: string;
    risk: string;
    result: string;
    detail: string;
  }) => void;
}) {
  const actor = actorFor(appState);
  const [state, setState] = useState(() => loadState(appState));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("order") || "");
  const [view, setView] = useState("订单处理");
  const [quick, setQuick] = useState("全部");
  const [fulfillment, setFulfillment] = useState("全部");
  const [refundFilter, setRefundFilter] = useState("全部");
  const [point, setPoint] = useState("全部");
  const [source, setSource] = useState("全部");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cancelFilter, setCancelFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState("后台子单");
  const [detailId, setDetailId] = useState("");
  const [action, setAction] = useState<"退款" | "退单" | null>(null);
  const [reason, setReason] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [batchId, setBatchId] = useState("");
  const [review, setReview] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [settings, setSettings] = useState(false);
  const [tenant, setTenant] = useState("");
  const [draftPolicy, setDraftPolicy] = useState<Policy | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const scopeKey = `${actor.id}:${actor.pointIds.join(",")}`;
  const orders = state.orders.filter((o) => visible(o, actor));
  const orderIds = new Set(orders.map((o) => o.id));
  const records = state.refunds.filter((r) => orderIds.has(r.orderId));
  const detail = orders.find((o) => o.id === detailId);
  const tenants = [...new Set(orders.map((o) => o.tenantId))];
  const tenantName = (id: string) =>
    appState.tenants.find((t) => t.id === id)?.name || id;
  function save(next: RefundState) {
    stateRef.current = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
  }
  function run(
    work: (s: RefundState) => RefundState,
    actionName: string,
    object: string,
    message: string,
  ) {
    setError("");
    try {
      save(work(stateRef.current));
      setNotice(message);
      onAudit({
        action: actionName,
        object,
        risk: "L2",
        result: "成功",
        detail: message,
      });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "操作失败";
      setNotice(message);
      setError(message);
      return false;
    }
  }
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    setSelection([]);
    setAction(null);
    setDetailId("");
    setBatchId("");
    setReview("");
    setSettings(false);
    setPage(1);
  }, [scopeKey]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = loadState(appState);
        stateRef.current = next;
        setState(next);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [appState]);
  const hasProcessing =
    orders.some((o) => o.cancelStatus === "退单处理中") ||
    records.some((r) => r.status === "退款处理中");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setTimeout(() => save(settle(stateRef.current, actor)), 1800);
    return () => clearTimeout(timer);
  }, [state, hasProcessing, scopeKey]);
  useEffect(() => {
    setSelection([]);
    setPage(1);
  }, [
    query,
    quick,
    fulfillment,
    refundFilter,
    point,
    source,
    dateFrom,
    dateTo,
    cancelFilter,
    selectionMode,
  ]);
  const filtered = orders.filter((o) => {
    const label = refundLabel(state, o);
    return (
      (!query ||
        `${o.id} ${o.parentId} ${o.device}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (point === "全部" || o.pointId === point) &&
      (fulfillment === "全部" || o.fulfillment === fulfillment) &&
      (refundFilter === "全部" || label === refundFilter) &&
      (source === "全部" || o.source === source) &&
      (cancelFilter === "全部" || o.cancelStatus === cancelFilter) &&
      (!dateFrom || o.createdAt.slice(0, 10) >= dateFrom) &&
      (!dateTo || o.createdAt.slice(0, 10) <= dateTo) &&
      (quick === "全部" ||
        (quick === "失败待退款" &&
          o.fulfillment === "失败" &&
          decision(state, o, actor).allowed) ||
        (quick === "待审核" && label === "待审核") ||
        (quick === "退款处理中" &&
          ["待退单", "退款处理中", "结果待确认"].includes(label)) ||
        (quick === "退款失败" && label === "退款失败"))
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const selected = orders.filter((o) => selection.includes(o.id));
  const selectedParents = new Set(
    selected.map((o) => `${o.tenantId}:${o.parentId || o.id}`),
  ).size;
  function expand(o: Order) {
    return selectionMode === "小程序整单" && o.parentId
      ? orders
          .filter((x) => x.tenantId === o.tenantId && x.parentId === o.parentId)
          .map((x) => x.id)
      : [o.id];
  }
  function toggle(o: Order, checked: boolean) {
    const ids = expand(o);
    setSelection((s) =>
      checked
        ? [...new Set([...s, ...ids])]
        : s.filter((id) => !ids.includes(id)),
    );
  }
  function begin(kind: "退款" | "退单", ids = selection) {
    setSelection(ids);
    setError("");
    setAction(kind);
    setReason("");
    setAmounts({});
    setToken(`BATCH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  }
  const decisions = selected.map((o) => ({
    o,
    d: decision(state, o, actor),
    cancel: cancelReason(o, actor),
  }));
  const eligible = decisions.filter((x) =>
    action === "退单" ? !x.cancel : x.d.allowed,
  );
  const total = eligible.reduce(
    (n, { o, d }) => n + (amounts[o.id] ?? d.available),
    0,
  );
  const invalidAmount =
    action === "退款" &&
    eligible.some(
      ({ o, d }) =>
        !Number.isInteger(amounts[o.id] ?? d.available) ||
        (amounts[o.id] ?? d.available) <= 0 ||
        (amounts[o.id] ?? d.available) > d.available,
    );
  const needReason =
    action === "退款" && eligible.some((x) => x.o.fulfillment !== "失败");
  const selectedBatch = state.batches.find((b) => b.id === batchId);
  const shownRecords = records.filter((r) =>
    filtered.some((o) => o.id === r.orderId),
  );
  function resetFilters() {
    setQuery("");
    setQuick("全部");
    setFulfillment("全部");
    setRefundFilter("全部");
    setPoint("全部");
    setSource("全部");
    setDateFrom("");
    setDateTo("");
    setCancelFilter("全部");
    setParams({});
  }
  return (
    <div className="refund-page">
      <div className="section-tabs">
        <Link className="tab-link" to="/orders">
          订单概览
        </Link>
        <Link className="tab-link" to="/orders/operations">
          点位订单与执行
        </Link>
        <Link className="tab-link active" to="/orders/refunds">
          退款 / 退单管理
        </Link>
      </div>
      <div className="refund-heading">
        <div>
          <p className="page-kicker">订单售后</p>
          <h2>退款 / 退单管理</h2>
          <p>按后台订单处理，关联整笔支付。退款与设备退单分别追踪。</p>
        </div>
        <button
          className="text-button"
          onClick={() => {
            const t = tenants[0];
            setTenant(t);
            setDraftPolicy(policyFor(state, orders[0]));
            setResetConfirm(false);
            setError("");
            setSettings(true);
          }}
          disabled={!orders.length}
        >
          处理规则
        </button>
      </div>
      <div className="refund-context">
        <span>演示环境 · 模拟支付与设备回执</span>
        <span>
          {actor.name} · {actor.canRefund ? "可发起退款" : "退款只读"}
          {actor.canApprove ? " · 可审核" : ""}
        </span>
      </div>
      {notice && (
        <div className="policy-strip" role="status">
          <span>{notice}</span>
          <button className="text-button" onClick={() => setNotice("")}>
            收起
          </button>
        </div>
      )}
      <div className="section-tabs" aria-label="售后视图">
        {["订单处理", "退款记录", "批次记录"].map((v) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            onClick={() => {
              setView(v);
              setSelection([]);
            }}
          >
            {v}
            {v === "退款记录" ? ` · ${records.length}` : ""}
          </button>
        ))}
      </div>
      {view !== "批次记录" && (
        <>
          <div className="refund-quick">
            {["全部", "失败待退款", "待审核", "退款处理中", "退款失败"].map(
              (q) => (
                <button
                  key={q}
                  aria-pressed={quick === q}
                  className={quick === q ? "active" : ""}
                  onClick={() => setQuick(q)}
                >
                  {q}
                  {q === "失败待退款"
                    ? ` ${orders.filter((o) => o.fulfillment === "失败" && decision(state, o, actor).allowed).length}`
                    : ""}
                </button>
              ),
            )}
          </div>
          <div className="refund-filters">
            <label className="field">
              <span>订单 / 设备</span>
              <input
                aria-label="搜索订单"
                placeholder="后台单号、小程序单号、设备号"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="field">
              <span>点位</span>
              <select value={point} onChange={(e) => setPoint(e.target.value)}>
                <option>全部</option>
                {appState.points
                  .filter((p) => actor.pointIds.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>订单状态</span>
              <select
                value={fulfillment}
                onChange={(e) => setFulfillment(e.target.value)}
              >
                {[
                  "全部",
                  "待制作",
                  "制茶中",
                  "已完成",
                  "已取餐",
                  "失败",
                  "已取消",
                  "异常待确认",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>退款状态</span>
              <select
                value={refundFilter}
                onChange={(e) => setRefundFilter(e.target.value)}
              >
                {[
                  "全部",
                  "未退款",
                  "待审核",
                  "待退单",
                  "退款处理中",
                  "结果待确认",
                  "退款失败",
                  "已驳回",
                  "部分已退款",
                  "已全额退款",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <button className="text-button" onClick={resetFilters}>
              重置筛选
            </button>
          </div>
          <details className="refund-more">
            <summary>更多筛选 · 来源、日期、退单状态</summary>
            <div className="refund-filters">
              <label className="field">
                <span>订单来源</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  {["全部", "小程序", "设备扫码", "后台手工", "历史订单"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>开始日期</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="field">
                <span>结束日期</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              <label className="field">
                <span>退单状态</span>
                <select
                  value={cancelFilter}
                  onChange={(e) => setCancelFilter(e.target.value)}
                >
                  {["全部", "未退单", "退单处理中", "退单成功", "退单失败"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </details>
        </>
      )}
      {view === "订单处理" && (
        <>
          <div className="refund-table-top">
            <span>共 {filtered.length} 条后台订单</span>
            <label>
              选择单位{" "}
              <select
                aria-label="选择单位"
                value={selectionMode}
                onChange={(e) => setSelectionMode(e.target.value)}
              >
                <option>后台子单</option>
                <option>小程序整单</option>
              </select>
            </label>
          </div>
          {selectionMode === "小程序整单" && (
            <p className="refund-help">
              勾选任一子单会关联选择当前权限内同一小程序订单的全部子单，可能包含其他页或筛选外订单；仍逐单校验退款资格。
            </p>
          )}
          <div className="table-wrap refund-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="选择本页订单"
                      checked={
                        pageOrders.length > 0 &&
                        pageOrders.every((o) => selection.includes(o.id))
                      }
                      onChange={(e) => {
                        const ids = pageOrders.flatMap(expand);
                        setSelection((s) =>
                          e.target.checked
                            ? [...new Set([...s, ...ids])]
                            : s.filter((id) => !ids.includes(id)),
                        );
                      }}
                    />
                  </th>
                  {[
                    "订单 / 关联支付订单",
                    "商品 / 点位",
                    "订单状态",
                    "实付 / 剩余可退",
                    "退款状态",
                    "退单状态",
                    "操作",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((o) => {
                  const d = decision(state, o, actor);
                  return (
                    <tr
                      key={o.id}
                      className={selection.includes(o.id) ? "selected" : ""}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`选择 ${o.id}`}
                          checked={selection.includes(o.id)}
                          onChange={(e) => toggle(o, e.target.checked)}
                        />
                      </td>
                      <td>
                        <button
                          className="refund-order-link"
                          onClick={() => setDetailId(o.id)}
                        >
                          {o.id}
                        </button>
                        <small>
                          {o.parentId || "无小程序订单"} · {o.source}
                        </small>
                        <small>{time(o.createdAt)}</small>
                      </td>
                      <td>
                        <NameCell
                          primary={`${o.product} ×${o.quantity}`}
                          secondary={`${o.specification} · ${o.point}`}
                        />
                      </td>
                      <td>
                        <Badge
                          value={o.fulfillment}
                          tone={tone(o.fulfillment)}
                        />
                        {o.fulfillment === "失败" && <small>免审核退款</small>}
                      </td>
                      <td className="refund-money">
                        <strong>{money(o.paidCents)}</strong>
                        <small>可退 {money(available(state, o))}</small>
                      </td>
                      <td>
                        <Badge
                          value={refundLabel(state, o)}
                          tone={tone(refundLabel(state, o))}
                        />
                      </td>
                      <td>
                        <Badge
                          value={o.cancelStatus}
                          tone={tone(o.cancelStatus)}
                        />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="text-button"
                            disabled={!d.allowed}
                            title={d.reason}
                            onClick={() => begin("退款", [o.id])}
                          >
                            退款
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setDetailId(o.id)}
                          >
                            详情
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!pageOrders.length && (
            <EmptyState>
              没有匹配的订单。请调整筛选条件或切换顶部点位范围。
              <button className="text-button" onClick={resetFilters}>
                清除筛选
              </button>
            </EmptyState>
          )}
          <div className="refund-pagination">
            <span>
              第 {currentPage} / {pageCount} 页 · 每页 10 条
            </span>
            <button
              className="text-button"
              disabled={currentPage <= 1}
              onClick={() => {
                setPage(currentPage - 1);
                setSelection([]);
              }}
            >
              上一页
            </button>
            <button
              className="text-button"
              disabled={currentPage >= pageCount}
              onClick={() => {
                setPage(currentPage + 1);
                setSelection([]);
              }}
            >
              下一页
            </button>
          </div>
          <div className="refund-selection">
            <div>
              <strong>已选 {selected.length} 条后台订单</strong>
              <span>
                涉及 {selectedParents} 笔订单 · 预计可退{" "}
                {money(
                  selected
                    .filter((o) => decision(state, o, actor).allowed)
                    .reduce((n, o) => n + available(state, o), 0),
                )}
              </span>
            </div>
            <div className="actions">
              <button
                className="text-button"
                disabled={!selection.length}
                onClick={() => setSelection([])}
              >
                取消选择
              </button>
              <button
                className="text-button"
                disabled={!selection.length || !actor.canCancel}
                onClick={() => begin("退单")}
              >
                批量退单
              </button>
              <button
                className="text-button primary-action"
                disabled={!selection.length || !actor.canRefund}
                onClick={() => begin("退款")}
              >
                批量退款
              </button>
            </div>
          </div>
        </>
      )}
      {view === "退款记录" && (
        <Section
          title="退款记录"
          meta="退款成功以支付回执为准；结果待确认时查询原退款，不重复发起。"
        >
          <DataTable
            headers={[
              "退款单 / 后台订单",
              "金额",
              "状态",
              "原因 / 结果",
              "发起人",
              "操作",
            ]}
            rows={shownRecords.map((r) => [
              <NameCell primary={r.id} secondary={r.orderId} />,
              money(r.amountCents),
              <Badge value={r.status} tone={tone(r.status)} />,
              <NameCell primary={r.reason} secondary={r.detail} />,
              <NameCell primary={r.applicant} secondary={time(r.createdAt)} />,
              <div className="actions">
                <button
                  className="text-button"
                  onClick={() => setDetailId(r.orderId)}
                >
                  详情
                </button>
                {r.status === "待审核" && (
                  <button
                    className="text-button"
                    disabled={!actor.canApprove || actor.id === r.applicantId}
                    title={
                      actor.id === r.applicantId
                        ? "发起人不能审核自己的退款"
                        : "需要退款审核权限"
                    }
                    onClick={() => {
                      setReview(r.id);
                      setReviewNote("");
                    }}
                  >
                    审核
                  </button>
                )}
                {r.status === "结果待确认" && (
                  <button
                    className="text-button"
                    onClick={() =>
                      run(
                        (s) => settle(s, actor, r.id),
                        "查询退款",
                        r.id,
                        "已查询原退款结果，未重复发起",
                      )
                    }
                  >
                    查询结果
                  </button>
                )}
                {r.status === "退款失败" && (
                  <button
                    className="text-button"
                    disabled={
                      !decision(
                        state,
                        orders.find((o) => o.id === r.orderId)!,
                        actor,
                      ).allowed
                    }
                    onClick={() => begin("退款", [r.orderId])}
                  >
                    重新退款
                  </button>
                )}
              </div>,
            ])}
          />
          {!shownRecords.length && (
            <EmptyState>当前筛选下暂无退款记录。</EmptyState>
          )}
        </Section>
      )}
      {view === "批次记录" && (
        <Section
          title="批次记录"
          meta="按逐单结果追踪，部分订单失败不影响其他订单的处理。"
        >
          <DataTable
            headers={["批次号", "操作", "订单数量", "发起人 / 时间", "详情"]}
            rows={state.batches
              .filter((b) => b.entries.some((e) => orderIds.has(e.orderId)))
              .map((b) => [
                b.id,
                b.action,
                b.entries.filter((e) => orderIds.has(e.orderId)).length,
                <NameCell primary={b.operator} secondary={time(b.createdAt)} />,
                <button
                  className="text-button"
                  onClick={() => setBatchId(b.id)}
                >
                  查看结果
                </button>,
              ])}
          />
          {!state.batches.some((b) =>
            b.entries.some((e) => orderIds.has(e.orderId)),
          ) && (
            <EmptyState>
              提交单笔或批量操作后，将在这里保留处理结果。
            </EmptyState>
          )}
        </Section>
      )}
      {action && (
        <RefundDialog
          error={error}
          title={`${action === "退款" ? "确认退款" : "确认退单"} · ${selected.length} 条订单`}
          onClose={() => setAction(null)}
          wide
        >
          <div className="refund-confirm-summary">
            <strong>
              {action === "退款" ? money(total) : `${eligible.length} 条`}
            </strong>
            <span>
              {action === "退款"
                ? `本次申请金额 · ${eligible.filter((x) => !x.d.approval).length} 条免审核，${eligible.filter((x) => x.d.approval).length} 条需审核`
                : "仅取消设备履约，不退回支付金额"}
            </span>
          </div>
          <p className="refund-help">
            涉及 {selectedParents} 笔关联订单；可处理 {eligible.length} 条，跳过{" "}
            {selected.length - eligible.length}{" "}
            条。提交时再次校验订单状态和可退金额。
          </p>
          <DataTable
            headers={["后台订单", "本次金额", "处理方式 / 原因"]}
            rows={decisions.map(({ o, d, cancel }) => [
              o.id,
              action === "退款" && d.allowed ? (
                <input
                  className="refund-amount-input"
                  aria-label={`${o.id}退款金额`}
                  type="number"
                  min="0.01"
                  max={d.available / 100}
                  step="0.01"
                  value={(amounts[o.id] ?? d.available) / 100}
                  onChange={(e) =>
                    setAmounts((a) => ({
                      ...a,
                      [o.id]: Math.round(Number(e.target.value) * 100),
                    }))
                  }
                />
              ) : (
                "—"
              ),
              action === "退单" ? cancel || "提交设备退单" : d.reason,
            ])}
          />
          {action === "退款" && (
            <label className="field">
              <span>
                退款原因
                {needReason ? "（必填）" : "（可选，默认使用订单失败原因）"}
              </span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="如：顾客取消、制作失败、售后补偿"
              />
            </label>
          )}
          {invalidAmount && (
            <p role="alert">请输入大于 0 且不超过可退余额的金额。</p>
          )}
          <div className="drawer-actions">
            <button className="text-button" onClick={() => setAction(null)}>
              取消
            </button>
            <button
              className="text-button primary-action"
              disabled={
                !eligible.length ||
                invalidAmount ||
                (needReason && !reason.trim())
              }
              onClick={() => {
                if (
                  run(
                    (s) =>
                      submitBatch(
                        s,
                        selection,
                        action,
                        actor,
                        reason,
                        amounts,
                        token,
                      ),
                    `批量${action}`,
                    token,
                    "已受理，请查看逐单处理结果",
                  )
                ) {
                  setBatchId(token);
                  setAction(null);
                  setSelection([]);
                }
              }}
            >
              {action === "退款"
                ? `确认申请 ${money(total)}`
                : `确认退单 ${eligible.length} 条`}
            </button>
          </div>
        </RefundDialog>
      )}
      {selectedBatch && !action && (
        <RefundDialog
          error={error}
          title={`处理结果 · ${selectedBatch.id}`}
          onClose={() => setBatchId("")}
          wide
        >
          <div className="refund-result-counts">
            {[
              "退款成功",
              "退款失败",
              "结果待确认",
              "待审核",
              "待退单",
              "退款处理中",
              "退单成功",
              "退单失败",
              "退单处理中",
              "已跳过",
            ].map((label) => {
              const count = selectedBatch.entries
                .filter((e) => orderIds.has(e.orderId))
                .filter(
                  (e) =>
                    (e.skipped
                      ? "已跳过"
                      : state.refunds.find((r) => r.id === e.refundId)
                          ?.status || e.cancelStatus) === label,
                ).length;
              return count ? (
                <Badge
                  key={label}
                  value={`${label} ${count}`}
                  tone={tone(label)}
                />
              ) : null;
            })}
          </div>
          <p className="refund-help">
            {selectedBatch.operator} · {time(selectedBatch.createdAt)} ·{" "}
            {selectedBatch.action}。处理中状态会自动接收模拟回执。
          </p>
          <DataTable
            headers={["后台订单", "金额", "当前结果", "说明"]}
            rows={selectedBatch.entries
              .filter((e) => orderIds.has(e.orderId))
              .map((e) => {
                const r = state.refunds.find((r) => r.id === e.refundId),
                  o = orders.find((o) => o.id === e.orderId)!;
                return [
                  e.orderId,
                  r ? money(r.amountCents) : "—",
                  <Badge
                    value={
                      e.skipped
                        ? "已跳过"
                        : r?.status || e.cancelStatus || o.cancelStatus
                    }
                    tone={tone(
                      e.skipped
                        ? "已跳过"
                        : r?.status || e.cancelStatus || o.cancelStatus,
                    )}
                  />,
                  e.skipped ||
                    r?.detail ||
                    (o.cancelStatus === "退单失败"
                      ? "设备暂时离线，可在订单详情重试"
                      : "仅处理设备履约"),
                ];
              })}
          />
          <div className="drawer-actions">
            <button
              className="text-button"
              onClick={() => {
                setBatchId("");
                setView("退款记录");
                resetFilters();
              }}
            >
              查看退款记录
            </button>
            <button
              className="text-button primary-action"
              onClick={() => setBatchId("")}
            >
              完成
            </button>
          </div>
        </RefundDialog>
      )}
      {detail && !action && !batchId && !review && (
        <RefundDialog
          error={error}
          title={`订单详情 · ${detail.id}`}
          onClose={() => setDetailId("")}
          wide
        >
          <DefinitionList
            rows={[
              [
                "商品",
                `${detail.product} ×${detail.quantity} · ${detail.specification}`,
              ],
              ["点位 / 设备", `${detail.point} / ${detail.device}`],
              ["订单状态", <Badge value={detail.fulfillment} />],
              ["退款状态", <Badge value={refundLabel(state, detail)} />],
              ["退单状态", <Badge value={detail.cancelStatus} />],
              [
                "子单实付 / 已退 / 可退",
                `${money(detail.paidCents)} / ${money(refunded(state, detail.id))} / ${money(available(state, detail))}`,
              ],
              ["支付关联", detail.paymentId || "待补齐，暂不可支付退款"],
              ["失败原因", detail.failureReason || "—"],
            ]}
          />
          <Section
            title="同一支付订单"
            meta={detail.parentId || "该订单暂无小程序父订单关联"}
          >
            <DataTable
              headers={["子订单", "商品", "履约", "退款"]}
              rows={orders
                .filter((o) =>
                  detail.paymentId
                    ? o.tenantId === detail.tenantId &&
                      o.paymentId === detail.paymentId
                    : o.id === detail.id,
                )
                .map((o) => [
                  <button
                    className="text-button"
                    onClick={() => setDetailId(o.id)}
                  >
                    {o.id}
                  </button>,
                  o.product,
                  <Badge value={o.fulfillment} />,
                  refundLabel(state, o),
                ])}
            />
          </Section>
          <div className="policy-strip">
            {decision(state, detail, actor).reason}
            。退单仅取消履约，支付退款单独处理。
          </div>
          <div className="actions">
            <button
              className="text-button primary-action"
              disabled={!decision(state, detail, actor).allowed}
              onClick={() => begin("退款", [detail.id])}
            >
              发起退款
            </button>
            <button
              className="text-button"
              disabled={!!cancelReason(detail, actor)}
              title={cancelReason(detail, actor)}
              onClick={() => begin("退单", [detail.id])}
            >
              {detail.cancelStatus === "退单失败" ? "重试退单" : "发起退单"}
            </button>
          </div>
          <Section title="退款明细">
            <DataTable
              headers={["退款单", "金额", "状态", "处理"]}
              rows={records
                .filter((r) => r.orderId === detail.id)
                .map((r) => [
                  r.id,
                  money(r.amountCents),
                  <Badge value={r.status} tone={tone(r.status)} />,
                  <div>
                    {r.detail}
                    {r.status === "待审核" && (
                      <button
                        className="text-button"
                        disabled={
                          !actor.canApprove || r.applicantId === actor.id
                        }
                        onClick={() => {
                          setReview(r.id);
                          setReviewNote("");
                        }}
                      >
                        审核
                      </button>
                    )}
                    {r.status === "结果待确认" && (
                      <button
                        className="text-button"
                        onClick={() =>
                          run(
                            (s) => settle(s, actor, r.id),
                            "查询退款",
                            r.id,
                            "已查询原退款结果",
                          )
                        }
                      >
                        查询结果
                      </button>
                    )}
                  </div>,
                ])}
            />
          </Section>
          <Section title="操作时间线">
            {state.logs
              .filter((l) => l.orderId === detail.id)
              .map((l) => (
                <div className="refund-log" key={l.id}>
                  <strong>{l.action}</strong>
                  <span>{l.detail}</span>
                  <small>
                    {l.operator} · {time(l.time)}
                  </small>
                </div>
              ))}
            {!state.logs.some((l) => l.orderId === detail.id) && (
              <EmptyState>暂无新的处理记录。</EmptyState>
            )}
          </Section>
          {actor.canConfigure &&
            ["待制作", "制茶中", "异常待确认"].includes(detail.fulfillment) && (
              <details className="refund-more">
                <summary>演示事件</summary>
                <p>
                  模拟新的设备失败回执；当前失败订单策略：
                  {policyFor(state, detail).failed}。
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    run(
                      (s) => simulateFailure(s, detail.id, actor),
                      "模拟失败回执",
                      detail.id,
                      "已收到失败回执，并按当前策略处理",
                    )
                  }
                >
                  模拟失败回执
                </button>
              </details>
            )}
        </RefundDialog>
      )}
      {review && (
        <RefundDialog
          error={error}
          title="退款审核"
          onClose={() => setReview("")}
        >
          <p>
            {records.find((r) => r.id === review)?.orderId} ·{" "}
            {money(records.find((r) => r.id === review)?.amountCents || 0)}
          </p>
          <p>通过后按订单当前状态执行。审批通过不代表退款到账。</p>
          <label className="field">
            <span>审核意见（必填）</span>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
            />
          </label>
          <div className="drawer-actions">
            <button
              className="text-button danger-action"
              disabled={!reviewNote.trim()}
              onClick={() => {
                if (
                  run(
                    (s) => reviewRefund(s, review, false, actor, reviewNote),
                    "驳回退款",
                    review,
                    "退款已驳回，保留审核记录",
                  )
                )
                  setReview("");
              }}
            >
              驳回
            </button>
            <button
              className="text-button primary-action"
              disabled={!reviewNote.trim()}
              onClick={() => {
                if (
                  run(
                    (s) => reviewRefund(s, review, true, actor, reviewNote),
                    "通过退款审核",
                    review,
                    "已通过审核，等待执行结果",
                  )
                )
                  setReview("");
              }}
            >
              通过审核
            </button>
          </div>
        </RefundDialog>
      )}
      {settings && draftPolicy && (
        <RefundDialog
          error={error}
          title="退款处理规则"
          onClose={() => setSettings(false)}
        >
          <p className="refund-help">
            以下为演示业务策略，可按未来对接约定调整。失败订单始终免审核；自动模式仅对新收到的失败事件生效。
          </p>
          <label className="field">
            <span>所属企业</span>
            <select
              value={tenant}
              onChange={(e) => {
                setTenant(e.target.value);
                setDraftPolicy(
                  state.policies[e.target.value] || { ...draftPolicy },
                );
              }}
            >
              {tenants.map((t) => (
                <option value={t} key={t}>
                  {tenantName(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>失败订单</span>
            <select
              disabled={!actor.canConfigure}
              value={draftPolicy.failed}
              onChange={(e) =>
                setDraftPolicy({
                  ...draftPolicy,
                  failed: e.target.value as Policy["failed"],
                })
              }
            >
              <option>人工发起</option>
              <option>自动退款</option>
            </select>
          </label>
          {(
            [
              ["waiting", "待制作"],
              ["making", "制茶中"],
              ["completed", "已完成 / 已取餐"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <select
                disabled={!actor.canConfigure}
                value={draftPolicy[key]}
                onChange={(e) =>
                  setDraftPolicy({
                    ...draftPolicy,
                    [key]: e.target.value as Rule,
                  })
                }
              >
                {["直接退款", "审核后退款", "不可退款"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="refund-check">
            <input
              type="checkbox"
              disabled={!actor.canConfigure}
              checked={draftPolicy.stopBeforeRefund}
              onChange={(e) =>
                setDraftPolicy({
                  ...draftPolicy,
                  stopBeforeRefund: e.target.checked,
                })
              }
            />
            待制作 / 制茶中订单先退单，成功后退款
          </label>
          {!draftPolicy.stopBeforeRefund && (
            <p className="refund-help">
              当前允许退款独立执行，设备可能继续制作。退款成功不会修改履约状态。
            </p>
          )}
          <details className="refund-more">
            <summary>演示数据管理</summary>
            <p>
              恢复当前权限范围的演示订单、清除对应操作记录，保留历史订单与处理规则。
            </p>
            {resetConfirm ? (
              <div className="actions">
                <button
                  className="text-button danger-action"
                  onClick={() => {
                    if (
                      run(
                        (s) => resetDemo(s, seedState(appState), actor),
                        "重置演示数据",
                        tenant,
                        "演示订单已恢复，可重新验收",
                      )
                    ) {
                      setResetConfirm(false);
                      setSettings(false);
                      resetFilters();
                    }
                  }}
                >
                  确认恢复演示订单
                </button>
                <button
                  className="text-button"
                  onClick={() => setResetConfirm(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="text-button"
                disabled={!actor.canConfigure}
                onClick={() => setResetConfirm(true)}
              >
                恢复演示订单
              </button>
            )}
          </details>
          <div className="drawer-actions">
            <button className="text-button" onClick={() => setSettings(false)}>
              关闭
            </button>
            <button
              className="text-button primary-action"
              disabled={!actor.canConfigure}
              onClick={() => {
                if (
                  run(
                    (s) => changePolicy(s, tenant, draftPolicy, actor),
                    "更新退款策略",
                    tenant,
                    "处理规则已保存；已提交退款保留原审核记录",
                  )
                )
                  setSettings(false);
              }}
            >
              保存规则
            </button>
          </div>
        </RefundDialog>
      )}
    </div>
  );
}
