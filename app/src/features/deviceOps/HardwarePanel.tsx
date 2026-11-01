import { readDeviceResources } from "./resourceBridge";
import { useEffect, useState } from "react";
import { DataTable, Section, Badge } from "../../components/ui";
import type { AppState } from "../../types/core";
import { buildDeviceBootstrap, telemetryStatus } from "./hardware";
import type { DeviceModel, DeviceOpsAction, DeviceOpsState, DeviceTelemetry } from "./types";

type Props = { mode: "models" | "actual"; state: DeviceOpsState; appState?: AppState; canManage: boolean; run: (action: DeviceOpsAction, message: string) => boolean };
export function HardwarePanel({ mode, state, appState, canManage, run }: Props) {
  const [editing, setEditing] = useState<DeviceModel | null>(null);
  const [selected, setSelected] = useState(state.devices[0]?.id || "");
  const [clock, setClock] = useState(Date.now());
  const [report, setReport] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 10_000); return () => clearInterval(timer); }, []);
  const device = state.devices.find((item) => item.id === selected);
  const model = state.models.find((item) => item.id === device?.modelId);
  const bootstrap = () => {
    if (!device) return;
    try {
      const resources = readDeviceResources(appState, state.tenantId);
      setPreview(JSON.stringify(buildDeviceBootstrap(state, device.sn, appState?.catalog || [], resources?.tenantId === state.tenantId ? resources : undefined, appState?.productVariants), null, 2)); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法构建配置"); }
  };
  return <>
    {mode === "models" ? <Section title="硬件型号配置" meta="维护通道、传感器与泵阀 IO；保存后生成新版本，设备实际版本以回报为准">
      <DataTable headers={["型号", "通道", "配置版本", "关联设备", "操作"]} rows={state.models.map((item) => [<details><summary>{item.name}</summary><p>{item.code} · {state.suppliers.find((supplier) => supplier.id === item.supplierId)?.name}</p><p>主板 {item.capabilities.mainboard} / 通信 {item.capabilities.communication}</p><p>称重 {item.capabilities.weightSensors} · 流量 {item.capabilities.flowmeters} · 液位 {item.capabilities.liquidSensors}</p><p>回抽 {item.capabilities.supportsPumpback ? "支持" : "不支持"} · 糖桶清洗 {item.capabilities.supportsSugarWash ? "支持" : "不支持"}</p><p>{item.ioMapping?.map((io) => `通道 ${io.channel}：泵 ${io.pumpIo} / 阀 ${io.valveIo} / 传感器 ${io.sensorIo || "无"}`).join("；") || "尚未配置 IO"}</p></details>, item.channelCount ?? item.capabilities.storageMotors, item.revision || 1, state.devices.filter((entry) => entry.modelId === item.id).map((entry) => entry.sn).join("、") || "无", <button className="text-button" disabled={!canManage} onClick={() => { const count = item.channelCount ?? item.capabilities.storageMotors; setEditing(structuredClone({ ...item, channelCount: count, ioMapping: item.ioMapping || Array.from({ length: count }, (_, index) => ({ channel: index + 1, pumpIo: "", valveIo: "", sensorIo: "" })) })); }}>编辑硬件参数</button>])} />
    </Section> : null}
    {mode === "actual" ? <Section title="设备实际配置与状态" meta="每 10 秒刷新时效；超过 2 分钟未上报提示数据过期。实际值不由型号保存动作覆盖。">
      <label className="field"><span>设备 SN</span><select value={selected} onChange={(event) => { setSelected(event.target.value); setPreview(""); setReport(""); }}>{state.devices.map((item) => <option value={item.id} key={item.id}>{item.sn} · {item.name}</option>)}</select></label>
      {device ? <><p><Badge value={telemetryStatus(device, clock)} /> 最近上报：{device.telemetry?.reportedAt || "暂无"} · 期望版本 {model?.revision || 1} / 实际版本 {device.telemetry?.modelRevision || "未上报"}</p>
      <DataTable headers={["通道", "泵 IO", "阀 IO", "传感器 IO", "传感器实际值", "物料绑定", "实际上报余量"]} rows={Array.from({ length: model?.channelCount ?? model?.capabilities.storageMotors ?? 0 }, (_, index) => { const number = index + 1; const io = model?.ioMapping?.find((item) => item.channel === number); const actual = device.telemetry?.channels.find((item) => item.channel === number); return [number, io?.pumpIo || "未配置", io?.valveIo || "未配置", io?.sensorIo || "未配置", actual?.sensorValue ?? "未上报", actual?.materialCode || "未上报", actual?.remaining ?? "未上报"]; })} />
      <details><summary>设备接入联调（本地契约预览）</summary><p>启动配置应先初始化硬件，再同步商品、物料、配方与清洗计划。此处导出当前数据；尚未连接真实设备服务。</p><button className="text-button" onClick={bootstrap}>查看 APP 启动配置</button>{preview ? <pre className="device-json">{preview}</pre> : null}<label className="field"><span>MQTT 状态消息 JSON（sequence、reportedAt、modelRevision、channels）</span><textarea rows={5} value={report} placeholder={'{"sequence":1,"reportedAt":"ISO 时间","modelRevision":1,"channels":[]}'} onChange={(event) => setReport(event.target.value)} /></label><button className="text-button" disabled={!canManage || !report} onClick={() => { try { const parsed = JSON.parse(report) as DeviceTelemetry; if (run({ type: "receive-telemetry", payload: { sn: device.sn, report: parsed } }, "本地接入校验通过，已保存设备上报。")) setError(""); } catch { setError("消息格式无效，请检查 JSON 和字段。"); } }}>校验并接收测试上报</button></details></> : <p>当前范围暂无设备</p>}
      {error ? <p role="alert">{error}</p> : null}
    </Section> : null}
    {editing ? <div className="drawer-scrim" onClick={() => setEditing(null)}><aside className="action-drawer wide" role="dialog" aria-modal="true" aria-label="编辑硬件型号" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><h3>编辑 {editing.name}</h3><button className="text-button" onClick={() => setEditing(null)}>取消</button></div><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); if (run({ type: "save-model", payload: editing }, "硬件配置已保存，等待设备获取新版本。")) setEditing(null); }}><div className="form-grid">
      <label className="field"><span>型号名称</span><input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><label className="field"><span>通道数量</span><input type="number" min={1} max={128} required value={editing.channelCount} onChange={(event) => { const count = Math.max(0, Math.min(128, Number(event.target.value))); setEditing({ ...editing, channelCount: count, ioMapping: Array.from({ length: count }, (_, index) => editing.ioMapping?.[index] || { channel: index + 1, pumpIo: "", valveIo: "", sensorIo: "" }) }); }} /></label>
      {([['storageMotors', '料仓电机'], ['weightSensors', '称重传感器'], ['flowmeters', '流量计'], ['liquidSensors', '液位传感器'], ['mixers', '搅拌器'], ['steamers', '蒸汽'], ['fans', '风扇'], ['thermostats', '温控'], ['shakers', '摇匀器'], ['drinkingWaterLines', '饮用水路']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type="number" min={0} step={1} required value={editing.capabilities[key]} onChange={(event) => setEditing({ ...editing, capabilities: { ...editing.capabilities, [key]: Number(event.target.value) } })} /></label>)}
      {(['supportsPumpback', 'supportsSugarWash'] as const).map((key) => <label className="checkbox-row" key={key}><input type="checkbox" checked={editing.capabilities[key]} onChange={(event) => setEditing({ ...editing, capabilities: { ...editing.capabilities, [key]: event.target.checked } })} />{key === 'supportsPumpback' ? '支持回抽' : '支持糖桶清洗'}</label>)}
      </div><DataTable headers={["通道", "泵 IO", "阀 IO", "传感器 IO"]} rows={(editing.ioMapping || []).map((io, index) => [io.channel, ...(['pumpIo', 'valveIo', 'sensorIo'] as const).map((key) => <input className="control-input" aria-label={`通道 ${io.channel} ${key}`} required={key !== 'sensorIo'} value={io[key]} onChange={(event) => setEditing({ ...editing, ioMapping: editing.ioMapping!.map((entry, i) => i === index ? { ...entry, [key]: event.target.value } : entry) })} />)])} /><div className="drawer-actions"><button type="button" className="text-button" onClick={() => setEditing(null)}>取消</button><button className="text-button primary-action" type="submit">保存型号</button></div></form></aside></div> : null}
  </>;
}
