import { readDeviceResources } from "./resourceBridge";
import { useEffect, useState } from "react";
import { Section } from "../../components/ui";
import type { AppState } from "../../types/core";
import type { DeviceOpsAction, DeviceOpsState, DeviceTelemetry } from "./types";

export function GatewayPanel({ state, appState, enabled, receive }: { state: DeviceOpsState; appState?: AppState; enabled: boolean; receive: (action: DeviceOpsAction) => void }) {
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:8787");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!connected || !enabled) return;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(`${endpoint}/api/admin/${encodeURIComponent(state.tenantId)}/status`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "读取状态失败");
        if (!controller.signal.aborted) for (const entry of result.devices as Array<{ sn: string; telemetry?: DeviceTelemetry }>) {
          if (entry.telemetry) receive({ type: "receive-telemetry", payload: { sn: entry.sn, report: entry.telemetry } });
        }
        if (!controller.signal.aborted) setFeedback(`状态已刷新 · ${new Date().toLocaleTimeString("zh-CN")}`);
      } catch (error) { if (!controller.signal.aborted) setFeedback(error instanceof Error ? error.message : "网关连接失败"); }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 10_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [connected, enabled, endpoint, token, state.tenantId, receive]);
  return <Section title="设备接口与 MQTT 网关" meta="可选本地联调服务：持久化启动配置，接收 HTTP / MQTT 状态，后台自动读取设备实际值">
    <div className="form-grid"><label className="field"><span>网关地址</span><input disabled={connected} value={endpoint} onChange={(event) => setEndpoint(event.target.value.replace(/\/$/, ""))} /></label><label className="field"><span>管理员令牌（仅当前页面内存保存）</span><input type="password" autoComplete="off" disabled={connected} value={token} onChange={(event) => setToken(event.target.value)} /></label></div>
    <div className="inline-actions"><button className="text-button" disabled={!enabled || !token || busy} onClick={async () => {
      setBusy(true);
      try {
        const resources = readDeviceResources(appState, state.tenantId);
        if (!resources || resources.tenantId !== state.tenantId) throw new Error("请先在品牌筛选中选择当前企业的品牌，再进入资源耗材模块保存物料与配方。");
        const devices = state.devices.filter((device) => device.tenantId === state.tenantId && device.pointId);
        const models = state.models.filter((model) => devices.some((device) => device.modelId === model.id));
        const response = await fetch(`${endpoint}/api/admin/${encodeURIComponent(state.tenantId)}/snapshot`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ state: { ...state, devices, models }, catalog: appState?.catalog.filter((item) => appState.brands.some((brand) => brand.name === item.brand && brand.tenant === appState.tenants.find((tenant) => tenant.id === state.tenantId)?.name)) || [], variants: appState?.productVariants || [], resources }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "保存失败");
        setFeedback("配置已持久化至网关；APP 可按 SN 获取。设备应用状态等待回报。"); setConnected(true);
      } catch (error) { setFeedback(error instanceof Error ? error.message : "连接失败"); }
      finally { setBusy(false); }
    }}>{busy ? "保存中…" : "保存当前配置到网关"}</button><button className="text-button" disabled={!enabled || !token} onClick={() => setConnected(!connected)}>{connected ? "断开自动刷新" : "连接并自动刷新状态"}</button></div>
    {!enabled ? <p>需要设备管理权限和当前企业全部点位范围，才能发布完整启动配置。</p> : null}<p role="status">{feedback || "未连接；填写令牌后连接本地网关。"}</p>
  </Section>;
}
