import { FilePenLine, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Dispatch } from "react";
import type { AppState, Device } from "../types/core";
import { configReleaseActionPolicy, filteredDevices, filteredPoints, releaseVisibleForCurrentUser, type AppAction } from "../services/operations";
import { Badge, DataTable, DetailLink, EmptyState, NameCell, Section } from "../components/ui";
import { DeviceDetail } from "./sharedViews";

export function Devices({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Device | null>(null);
  const devices = filteredDevices(state);
  const selected = devices.find((device) => device.id === selectedId) || devices[0];
  const releasePolicy = configReleaseActionPolicy(state);
  const visibleChanges = state.deviceChanges.filter((change) => devices.some((device) => device.id === change.deviceId) && releaseVisibleForCurrentUser(state, change.release));
  return (
    <>
      <div className="section-tabs" aria-label="设备管理视图">
        <Link className="tab-link active" to="/devices">设备台账</Link>
        <Link className="tab-link" to="/devices/operations">设备配置与升级</Link>
      </div>
      <div className="split-detail">
        <Section
          title="机器人/设备台账"
          meta="在线状态、版本、能力和配置发布"
          action={
            <button className="text-button primary-action" type="button" disabled={!selected || !releasePolicy.allowed} title={releasePolicy.message} onClick={() => selected && setEditing(selected)}>
              <FilePenLine className="lucide-icon" /> 申请配置变更
            </button>
          }
        >
          {devices.length ? (
            <DataTable headers={["设备", "SN", "类型", "点位", "状态", "版本", "能力", "详情"]} rows={devices.map((device) => ({
              key: device.id,
              selected: selected?.id === device.id,
              onClick: () => setSelectedId(device.id),
              label: `查看${device.name}`,
              cells: [<NameCell primary={device.name} secondary={device.id} />, device.sn, device.type, device.point, <Badge value={device.status} />, device.version, device.capability.map((item) => <Badge key={item} value={item} tone="neutral" />), <DetailLink to={`/devices/${device.id}`} title={`打开${device.name}详情`} />],
            }))} />
          ) : (
            <EmptyState>当前账号的数据范围内暂无设备</EmptyState>
          )}
        </Section>
        <DeviceDetail state={state} device={selected} dispatch={dispatch} />
      </div>

      <Section title="待发布设备配置" meta="点位归属、版本、状态和能力变更通过配置发布生效">
        {visibleChanges.length ? (
          <DataTable
            headers={["发布", "设备", "状态", "原因", "详情"]}
            rows={visibleChanges.map((change) => [
              <NameCell primary={change.release} secondary={change.afterDevice.point} />,
              change.afterDevice.name,
              <Badge value={change.status} />,
              change.reason,
              <DetailLink to={`/releases/${change.release}`} title={`打开${change.release}详情`} />,
            ])}
          />
        ) : (
          <EmptyState>当前范围暂无待发布设备配置</EmptyState>
        )}
      </Section>

      {editing ? <DeviceChangeDrawer state={state} device={editing} dispatch={dispatch} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function DeviceChangeDrawer({ state, device, dispatch, onClose }: { state: AppState; device: Device; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const policy = configReleaseActionPolicy(state);
  const points = filteredPoints(state);
  const [name, setName] = useState(device.name);
  const [point, setPoint] = useState(device.point);
  const [type, setType] = useState(device.type);
  const [status, setStatus] = useState(device.status);
  const [version, setVersion] = useState(device.version);
  const [capability, setCapability] = useState(device.capability.join("\n"));
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && [name, point, type, status, version, reason].every((value) => value.trim().length > 0);

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="device-change-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{device.id} / {device.sn}</p>
            <h3 id="device-change-title">申请设备配置变更</h3>
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
            dispatch({
              type: "submit-device-change",
              payload: {
                deviceId: device.id,
                name,
                point,
                type,
                status,
                version,
                capability: capability.split(/\n|、|,/).map((item) => item.trim()).filter(Boolean),
                reason,
              },
            });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>设备名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>归属点位</span>
              <select value={point} onChange={(event) => setPoint(event.target.value)}>
                {points.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>设备类型</span>
              <input value={type} onChange={(event) => setType(event.target.value)} />
            </label>
            <label className="field">
              <span>运行状态</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {["在线", "忙碌", "待维护", "维护中", "暂停营业", "离线"].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>版本</span>
              <input value={version} onChange={(event) => setVersion(event.target.value)} />
            </label>
            <label className="field full">
              <span>能力标签</span>
              <textarea value={capability} onChange={(event) => setCapability(event.target.value)} rows={3} />
            </label>
            <label className="field full">
              <span>变更原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明设备归属、版本、状态或能力变化，以及对当前点位经营和异常处理的影响" rows={4} />
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
