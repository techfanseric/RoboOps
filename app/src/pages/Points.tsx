import { FilePenLine, Send } from "lucide-react";
import type { Dispatch } from "react";
import { useState } from "react";
import type { AppState, Point, PointCheck } from "../types/core";
import { configReleaseActionPolicy, filteredPoints, pointDevices, pointIncidents, pointReadiness, pointRequests, releaseVisibleForCurrentUser, type AppAction } from "../services/operations";
import { Badge, DataTable, DetailLink, EmptyState, NameCell, Section } from "../components/ui";
import { PointDetail } from "./sharedViews";

const defaultPointChecks = ["负责人完整", "设备在线", "商品可售", "异常规则", "营业确认"];
const checkStatuses = ["已完成", "处理中", "待处理"];

export function Points({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Point | null>(null);
  const points = filteredPoints(state);
  const selected = points.find((point) => point.id === selectedId) || points[0];
  const releasePolicy = configReleaseActionPolicy(state);
  const visibleChanges = state.pointChanges.filter((change) => points.some((point) => point.id === change.pointId) && releaseVisibleForCurrentUser(state, change.release));
  return (
    <>
      <div className="split-detail">
        <Section
          title="点位列表"
          meta="营业状态、上线准入、设备和日常指标"
          action={
            <button className="text-button primary-action" type="button" disabled={!selected || !releasePolicy.allowed} title={releasePolicy.message} onClick={() => selected && setEditing(selected)}>
              <FilePenLine className="lucide-icon" /> 申请变更
            </button>
          }
        >
          {points.length ? (
            <DataTable
              headers={["点位", "品牌", "场景", "营业状态", "上线准入", "在线设备", "订单/请求", "待处理异常", "负责人", "详情"]}
              rows={points.map((point) => {
                const devices = pointDevices(state, point.name);
                const online = devices.filter((device) => device.status === "在线" || device.status === "忙碌").length;
                return {
                  key: point.id,
                  selected: selected?.id === point.id,
                  onClick: () => setSelectedId(point.id),
                  label: `查看${point.name}`,
                  cells: [<NameCell primary={point.name} secondary={point.city} />, point.brand, point.scenario, <Badge value={point.status} />, <Badge value={pointReadiness(state, point).status} />, `${online}/${devices.length}`, pointRequests(state, point.name).length, pointIncidents(state, point.name).length, point.owner, <DetailLink to={`/points/${point.id}`} title={`打开${point.name}详情`} />],
                };
              })}
            />
          ) : (
            <EmptyState>当前账号的数据范围内暂无点位</EmptyState>
          )}
        </Section>
        <PointDetail state={state} point={selected} />
      </div>

      <Section title="待发布点位配置" meta="负责人、营业状态和上线检查通过配置发布生效">
        {visibleChanges.length ? (
          <DataTable
            headers={["发布", "点位", "状态", "原因", "详情"]}
            rows={visibleChanges.map((change) => [
              <NameCell primary={change.release} secondary={change.afterPoint.brand} />,
              change.afterPoint.name,
              <Badge value={change.status} />,
              change.reason,
              <DetailLink to={`/releases/${change.release}`} title={`打开${change.release}详情`} />,
            ])}
          />
        ) : (
          <EmptyState>当前范围暂无待发布点位配置</EmptyState>
        )}
      </Section>

      {editing ? <PointChangeDrawer state={state} point={editing} dispatch={dispatch} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function pointCheckDraft(pointName: string, pointChecks: PointCheck[]) {
  const existing = pointChecks.filter((check) => check.point === pointName);
  const byName = new Map(existing.map((check) => [check.item, check.status]));
  const names = existing.length ? existing.map((check) => check.item) : defaultPointChecks;
  return names.map((item) => ({ item, status: byName.get(item) || "待处理" }));
}

function PointChangeDrawer({ state, point, dispatch, onClose }: { state: AppState; point: Point; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const policy = configReleaseActionPolicy(state);
  const [status, setStatus] = useState(point.status);
  const [owner, setOwner] = useState(point.owner);
  const [checks, setChecks] = useState(() => pointCheckDraft(point.name, state.pointChecks));
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && owner.trim().length > 0 && status.trim().length > 0 && checks.length > 0 && reason.trim().length > 0;

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="point-change-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{point.id}</p>
            <h3 id="point-change-title">申请点位配置变更</h3>
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
            dispatch({ type: "submit-point-change", payload: { pointId: point.id, status, owner, checks, reason } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>营业状态</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {["营业中", "维护中", "暂停营业", "试运行"].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>负责人</span>
              <input value={owner} onChange={(event) => setOwner(event.target.value)} />
            </label>
            <div className="field full">
              <span>上线检查</span>
              <div className="check-editor">
                {checks.map((check, index) => (
                  <div className="check-editor-row" key={check.item}>
                    <span>{check.item}</span>
                    <select
                      value={check.status}
                      onChange={(event) => {
                        const next = [...checks];
                        next[index] = { ...check, status: event.target.value };
                        setChecks(next);
                      }}
                    >
                      {checkStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <label className="field full">
              <span>变更原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明为什么调整点位状态、负责人或上线检查，以及对当前请求、异常和现场团队的影响" rows={4} />
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
