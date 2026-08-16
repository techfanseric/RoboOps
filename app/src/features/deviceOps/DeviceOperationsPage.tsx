import { AlertTriangle, Boxes, CircleGauge, Download, Plus, RefreshCw, Send, ShieldCheck, Trash2, Wrench } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { Badge, DataTable, DefinitionList, EmptyState, KpiTile, NameCell, Section } from "../../components/ui";
import type { AppState } from "../../types/core";
import { capabilityForAction, dangerousDeviceOpsAction, defaultDeviceOpsScope, deviceOpsStorageKey, isAuditOnly, scopeCan, scopeDeviceOpsState, scopeFromAppState } from "./access";
import { deviceOpsReducer, safeParseDeviceOpsState, validateDeviceOpsAction } from "./domain";
import { deviceOpsSeed } from "./seed";
import type { ConfigTemplate, DeviceOpsAction, DeviceOpsScope, DeviceOpsState, MaintenancePlan, MaintenanceRecord, ManagedDevice, OfflinePolicy, SoftwarePackage, SoftwareType, UpgradePolicy, UpgradeScope } from "./types";

type TabId = "devices" | "configuration" | "offline" | "maintenance" | "software" | "records";
type Editor = "device" | "template" | "storage" | "calibration" | "offline" | "maintenance" | "maintenanceRecord" | "software" | "upgrade" | null;

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "devices", label: "设备与型号" },
  { id: "configuration", label: "配置与料仓" },
  { id: "offline", label: "离线策略" },
  { id: "maintenance", label: "维护清洗" },
  { id: "software", label: "软件升级" },
  { id: "records", label: "发布记录" },
];

function initialState({ storageKey, scope }: { storageKey: string; scope: DeviceOpsScope }) {
  const seed = structuredClone(deviceOpsSeed);
  seed.tenantId = scope.tenantId;
  const scopedPoints = scope.points !== undefined ? scope.points : scope.pointIds.map((id, index) => ({ id, name: seed.points[index]?.name || id }));
  seed.points = scopedPoints.map((point) => ({ ...point, tenantId: scope.tenantId }));
  seed.devices = seed.devices.map((device, index) => ({ ...device, tenantId: device.tenantId ? scope.tenantId : null, pointId: device.pointId ? seed.points[index % Math.max(seed.points.length, 1)]?.id || null : null }));
  seed.suppliers = seed.suppliers.map((supplier) => supplier.id === "supplier-robo" ? { ...supplier, authorizedTenantIds: Array.from(new Set([...supplier.authorizedTenantIds, scope.tenantId])) } : supplier);
  return safeParseDeviceOpsState(window.localStorage.getItem(storageKey), seed);
}

export type DeviceOpsAuditEvent = { action: string; object: string; risk: "L2" | "L4"; result: "成功" | "拒绝"; detail: string };
export type DeviceOperationsPageProps = { appState?: AppState; scope?: DeviceOpsScope; onAudit?: (event: DeviceOpsAuditEvent) => void };

export function DeviceOperationsPage({ appState, scope: scopedProps, onAudit }: DeviceOperationsPageProps = {}) {
  const scope = useMemo(() => scopedProps || (appState ? scopeFromAppState(appState) : defaultDeviceOpsScope(deviceOpsSeed)), [appState, scopedProps]);
  const storageKey = deviceOpsStorageKey(scope);
  const [state, dispatch] = useReducer(deviceOpsReducer, { storageKey, scope }, initialState);
  const [tab, setTab] = useState<TabId>("devices");
  const [editor, setEditor] = useState<Editor>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  useEffect(() => window.localStorage.setItem(storageKey, JSON.stringify(state)), [state, storageKey]);
  const visibleState = useMemo(() => scopeDeviceOpsState(state, scope), [scope, state]);

  const run = (action: DeviceOpsAction, success: string) => {
    const capability = capabilityForAction(action);
    const risky = dangerousDeviceOpsAction(action);
    const auditObject = action.type === "record-denied-action" ? action.payload.object : Object.values(action.payload)[0]?.toString() || "deviceOps";
    if (!scopeCan(scope, capability)) {
      const message = `当前角色 ${scope.roles.join("、") || "未授权"} 不能执行此动作。`;
      dispatch({ type: "record-denied-action", payload: { action: action.type, object: "deviceOps", detail: message } });
      onAudit?.({ action: action.type, object: auditObject, risk: risky ? "L4" : "L2", result: "拒绝", detail: message });
      setFeedback({ tone: "danger", message });
      return false;
    }
    const result = validateDeviceOpsAction(state, action);
    if (!result.ok) {
      onAudit?.({ action: action.type, object: auditObject, risk: risky ? "L4" : "L2", result: "拒绝", detail: result.message.trim() });
      setFeedback({ tone: "danger", message: result.message.trim() });
      return false;
    }
    if (risky && !window.confirm("该动作会影响设备运行或发布状态。确认继续并写入审计日志吗？")) {
      dispatch({ type: "record-denied-action", payload: { action: action.type, object: "deviceOps", detail: `${scope.userName} 取消二次确认` } });
      onAudit?.({ action: action.type, object: auditObject, risk: "L4", result: "拒绝", detail: `${scope.userName} 取消二次确认` });
      setFeedback({ tone: "danger", message: "动作已取消，并写入审计日志。" });
      return false;
    }
    dispatch(action);
    onAudit?.({ action: action.type, object: auditObject, risk: risky ? "L4" : "L2", result: "成功", detail: success.trim() });
    setFeedback({ tone: "success", message: success });
    return true;
  };

  const open = (next: Exclude<Editor, null>, id?: string) => { setTargetId(id || null); setEditor(next); setFeedback(null); };
  const close = () => { setEditor(null); setTargetId(null); };
  const failedPublishes = visibleState.publishRecords.filter((item) => ["失败", "超时"].includes(item.status)).length;
  const lowStorages = visibleState.storages.filter((item) => item.remaining <= item.warningThreshold).length;

  return (
    <>
      <div className="grid four">
        <KpiTile title="纳管设备" value={visibleState.devices.length} foot={`${visibleState.devices.filter((item) => item.status === "在线").length} 台在线`} />
        <KpiTile title="硬件型号" value={visibleState.models.length} foot={`${visibleState.suppliers.filter((item) => item.authorizedTenantIds.includes(scope.tenantId)).length} 家供应商已授权`} />
        <KpiTile title="料仓预警" value={lowStorages} foot="容量、余量、阈值联动校验" />
        <KpiTile title="下发待处理" value={failedPublishes} foot="保留批次和逐设备失败原因" />
      </div>

      <div className="policy-strip"><Badge value={isAuditOnly(scope) ? "审计只读" : scope.roles.join("、") || "未授权"} /><span>当前数据范围：企业 {scope.tenantId}，{scope.pointIds.length ? `${scope.pointIds.length} 个点位` : "企业内全部点位"}；用户 {scope.userName}</span></div>

      {feedback ? <div className="policy-strip" role="status"><Badge value={feedback.tone === "success" ? "操作成功" : "校验未通过"} tone={feedback.tone} /><span>{feedback.message}</span></div> : null}

      <nav className="section-tabs" aria-label="设备运营模块">
        {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </nav>

      {tab === "devices" ? <DevicesTab state={visibleState} open={open} run={run} scope={scope} /> : null}
      {tab === "configuration" ? <ConfigurationTab state={visibleState} open={open} run={run} scope={scope} /> : null}
      {tab === "offline" ? <OfflineTab state={visibleState} open={open} run={run} scope={scope} /> : null}
      {tab === "maintenance" ? <MaintenanceTab state={visibleState} open={open} run={run} scope={scope} /> : null}
      {tab === "software" ? <SoftwareTab state={visibleState} open={open} run={run} scope={scope} /> : null}
      {tab === "records" ? <RecordsTab state={visibleState} run={run} scope={scope} /> : null}

      {editor === "device" ? <DeviceEditor state={state} run={run} close={close} /> : null}
      {editor === "template" ? <TemplateEditor state={state} run={run} close={close} /> : null}
      {editor === "storage" && targetId ? <StorageEditor state={state} storageId={targetId} run={run} close={close} /> : null}
      {editor === "calibration" && targetId ? <CalibrationEditor state={state} storageId={targetId} run={run} close={close} /> : null}
      {editor === "offline" ? <OfflineEditor state={state} run={run} close={close} /> : null}
      {editor === "maintenance" ? <MaintenanceEditor state={state} run={run} close={close} /> : null}
      {editor === "maintenanceRecord" ? <MaintenanceRecordEditor state={visibleState} scope={scope} run={run} close={close} /> : null}
      {editor === "software" ? <SoftwareEditor state={state} run={run} close={close} /> : null}
      {editor === "upgrade" ? <UpgradeEditor state={state} run={run} close={close} /> : null}
    </>
  );
}

function DevicesTab({ state, open, run, scope }: PageSectionProps) {
  const canManage = scopeCan(scope, "manage-device");
  const [selectedModel, setSelectedModel] = useState(state.models[0]?.id || "");
  const [bindingDeviceId, setBindingDeviceId] = useState(state.devices.find((item) => !item.tenantId)?.id || state.devices[0]?.id || "");
  const [pointId, setPointId] = useState(state.points[0]?.id || "");
  const model = state.models.find((item) => item.id === selectedModel) || state.models[0];
  return (
    <>
      <Section title="设备台账" meta="SN、企业/点位绑定、产品型号与激活继承" action={<button className="text-button primary-action" type="button" disabled={!canManage} onClick={() => open("device")}><Plus className="lucide-icon" /> 登记设备</button>}>
        <DataTable headers={["设备", "SN", "供应商 / 型号", "企业 / 点位", "状态", "版本", "动作"]} rows={state.devices.map((device) => {
          const supplier = state.suppliers.find((item) => item.id === device.supplierId);
          const hardware = state.models.find((item) => item.id === device.modelId);
          return [<NameCell primary={device.name} secondary={device.id} />, device.sn, <NameCell primary={supplier?.name || "-"} secondary={hardware?.name || "-"} />, <NameCell primary={device.tenantId || "未关联"} secondary={device.pointId || "未绑定点位"} />, <Badge value={device.status} />, <span>App {device.appVersion}<br /><span className="secondary">固件 {device.firmwareVersion} / Web {device.webVersion}</span></span>, <span className="inline-actions">{device.status === "待激活" ? <button className="text-button" disabled={!canManage} type="button" onClick={() => run({ type: "activate-device", payload: { deviceId: device.id } }, "设备已激活并继承默认策略。")}>激活</button> : null}<select disabled={!canManage} aria-label={`修改 ${device.sn} 型号`} value={device.modelId} onChange={(event) => run({ type: "change-device-model", payload: { deviceId: device.id, modelId: event.target.value } }, "设备型号已更新。")}>{state.models.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select></span>];
        })} />
      </Section>
      <Section title="企业与点位绑定" meta="供应商须先获企业授权；已关联其他企业或点位的设备不能直接改绑" action={<button className="text-button primary-action" disabled={!canManage} type="button" onClick={() => run({ type: "bind-device", payload: { deviceId: bindingDeviceId, tenantId: state.tenantId, pointId } }, "设备已完成企业与点位绑定。 ")}><ShieldCheck className="lucide-icon" /> 校验并绑定</button>}>
        <div className="filters">
          <label className="field"><span>设备 SN</span><select value={bindingDeviceId} onChange={(event) => setBindingDeviceId(event.target.value)}>{state.devices.map((item) => <option key={item.id} value={item.id}>{item.sn} · {item.tenantId || "未关联企业"}</option>)}</select></label>
          <label className="field"><span>目标点位</span><select value={pointId} onChange={(event) => setPointId(event.target.value)}>{state.points.map((point) => <option key={point.id} value={point.id}>{point.name} · {point.id}</option>)}</select></label>
        </div>
      </Section>
      <div className="split-detail">
        <Section title="型号与硬件能力" meta="型号归属供应商，设备不可跨供应商切换">
          <DataTable headers={["型号", "类别", "供应商", "料仓 / 传感器", "状态"]} rows={state.models.map((item) => [<button type="button" className="text-button" onClick={() => setSelectedModel(item.id)}><NameCell primary={item.name} secondary={`${item.code} · ${item.alias}`} /></button>, item.category, state.suppliers.find((supplier) => supplier.id === item.supplierId)?.name, `${item.capabilities.storageMotors} / ${item.capabilities.weightSensors + item.capabilities.flowmeters + item.capabilities.liquidSensors}`, <Badge value={item.status} />])} />
        </Section>
        {model ? <Section title={model.name} meta="硬件能力快照">
          <DefinitionList rows={[["主板 / 通信", `${model.capabilities.mainboard} · ${model.capabilities.communication}`], ["执行机构", `阀门 ${model.capabilities.valves.join("、")}；搅拌 ${model.capabilities.mixers}；蒸汽 ${model.capabilities.steamers}`], ["传感器", `称重 ${model.capabilities.weightSensors}；流量 ${model.capabilities.flowmeters}；液位 ${model.capabilities.liquidSensors}`], ["扩展能力", `回抽 ${model.capabilities.supportsPumpback ? "支持" : "不支持"}；糖桶清洗 ${model.capabilities.supportsSugarWash ? "支持" : "不支持"}`], ["授权状态", <Badge value={state.suppliers.find((item) => item.id === model.supplierId)?.authorizedTenantIds.includes(state.tenantId) ? "企业已授权" : "企业未授权"} />]]} />
        </Section> : null}
      </div>
    </>
  );
}

function ConfigurationTab({ state, open, run, scope }: PageSectionProps) {
  const canConfigure = scopeCan(scope, "manage-configuration");
  const canField = scopeCan(scope, "field-operation");
  const [selectedTemplate, setSelectedTemplate] = useState(state.templates[0]?.id || "");
  const template = state.templates.find((item) => item.id === selectedTemplate) || state.templates[0];
  const compatible = template ? state.devices.filter((item) => item.modelId === template.modelId).map((item) => item.id) : [];
  return <>
    <Section title="配置模板" meta="模板参数、适用型号、设备绑定与 desired/applied 下发结果" action={<button className="text-button primary-action" disabled={!canConfigure} type="button" onClick={() => open("template")}><Plus className="lucide-icon" /> 新建模板</button>}>
      <DataTable headers={["模板", "适用型号", "参数", "绑定设备", "状态", "动作"]} rows={state.templates.map((item) => [<button className="text-button" type="button" onClick={() => setSelectedTemplate(item.id)}><NameCell primary={item.name} secondary={item.code} /></button>, state.models.find((model) => model.id === item.modelId)?.name, `${item.parameters.length} 组料仓参数`, `${item.boundDeviceIds.length} 台`, <Badge value={item.status} />, <button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "publish-template", payload: { templateId: item.id, deviceIds: state.devices.filter((device) => device.modelId === item.modelId).map((device) => device.id) } }, "配置模板已生成下发批次。 ")}><Send className="lucide-icon" /> 下发</button>])} />
    </Section>
    {template ? <Section title={`${template.name} · 参数快照`} meta={template.description} action={<Badge value={`${compatible.length} 台兼容设备`} tone="neutral" />}>
      <DataTable headers={["仓号", "名称 / 资源", "容量", "阈值", "满管 / 排除值", "电机转速"]} rows={template.parameters.map((item) => [item.storageNo, <NameCell primary={item.storageName} secondary={item.materialCode} />, item.capacity, item.warningThreshold, `${item.fullValue} / ${item.dischargeValue}`, item.motorSpeed])} />
    </Section> : null}
    <Section title="设备模板状态" meta="desired 表示已请求配置；仅成功回执才更新 applied，失败设备保留原应用版本">
      <DataTable headers={["设备", "Desired", "Applied", "一致性"]} rows={state.devices.map((device) => { const desired = device.desiredConfigTemplateId ?? device.configTemplateId; const applied = device.appliedConfigTemplateId ?? device.configTemplateId; return [<NameCell primary={device.name} secondary={device.sn} />, desired || "未设置", applied || "未应用", <Badge value={desired === applied ? "已一致" : "待回执/失败"} />]; })} />
    </Section>
    <Section title="设备料仓与标定" meta="补料、出料、容量调整与称重标定均写入操作日志">
      <DataTable headers={["设备 / 料仓", "资源", "余量 / 容量", "预警阈值", "标定系数", "状态", "动作"]} rows={state.storages.map((item) => [<NameCell primary={state.devices.find((device) => device.id === item.deviceId)?.name || item.deviceId} secondary={`${item.storageNo} · ${item.name}`} />, item.materialCode, `${item.remaining} / ${item.capacity}`, item.warningThreshold, <NameCell primary={item.calibrationFactor} secondary={item.calibratedAt || "未标定"} />, <Badge value={item.remaining <= item.warningThreshold ? "余量预警" : "正常"} />, <span className="inline-actions"><button className="text-button" disabled={!canField} type="button" onClick={() => open("storage", item.id)}>调整</button><button className="text-button" disabled={!canField} type="button" onClick={() => open("calibration", item.id)}><CircleGauge className="lucide-icon" /> 标定</button></span>])} />
    </Section>
  </>;
}

function OfflineTab({ state, open, run, scope }: PageSectionProps) {
  const canManage = scopeCan(scope, "manage-device");
  const [deviceId, setDeviceId] = useState(state.devices[0]?.id || "");
  const [policyId, setPolicyId] = useState(state.offlinePolicies[0]?.id || "");
  return <>
    <Section title="离线策略" meta="设备激活时自动继承默认策略；单个 SN 同时只保留一条绑定" action={<button className="text-button primary-action" disabled={!canManage} type="button" onClick={() => open("offline")}><Plus className="lucide-icon" /> 新建策略</button>}>
      <DataTable headers={["策略", "截止时间", "检查 / 容忍", "绑定设备", "默认", "状态"]} rows={state.offlinePolicies.map((item) => [<NameCell primary={item.name} secondary={item.id} />, item.cutoffTime, `${item.checkIntervalMinutes} / ${item.maxOfflineMinutes} 分钟`, item.boundDeviceIds.length, <Badge value={item.isDefault ? "默认" : "普通"} />, <Badge value={item.enabled ? "启用" : "停用"} />])} />
    </Section>
    <Section title="单 SN 绑定" meta="重新绑定会从原策略自动移除，不产生双绑定" action={<button className="text-button primary-action" disabled={!canManage} type="button" onClick={() => run({ type: "bind-offline-policy", payload: { policyId, deviceId } }, "离线策略已绑定并生成单 SN 快照。 ")}><Send className="lucide-icon" /> 绑定并下发</button>}>
      <div className="filters">
        <label className="field"><span>设备 SN</span><select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{state.devices.map((item) => <option key={item.id} value={item.id}>{item.sn} · {item.name}</option>)}</select></label>
        <label className="field"><span>离线策略</span><select value={policyId} onChange={(event) => setPolicyId(event.target.value)}>{state.offlinePolicies.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
    </Section>
  </>;
}

function MaintenanceTab({ state, open, run, scope }: PageSectionProps) {
  const canConfigure = scopeCan(scope, "manage-configuration");
  const canField = scopeCan(scope, "field-operation");
  return <>
    <Section title="维护与清洗方案" meta="名称/类型/型号冲突检查，同设备同类型唯一" action={<span className="inline-actions"><button className="text-button" disabled={!canField} type="button" onClick={() => open("maintenanceRecord")}><Wrench className="lucide-icon" /> 记录现场维护</button><button className="text-button primary-action" disabled={!canConfigure} type="button" onClick={() => open("maintenance")}><Plus className="lucide-icon" /> 新建方案</button></span>}>
      <DataTable headers={["方案", "类型 / 型号", "步骤", "绑定设备", "状态", "动作"]} rows={state.maintenancePlans.map((item) => [<NameCell primary={item.name} secondary={item.id} />, <NameCell primary={item.type} secondary={state.models.find((model) => model.id === item.modelId)?.name || item.modelId} />, item.steps.length, item.boundDeviceIds.length, <Badge value={item.status} />, item.status === "已删除" ? <span className="secondary">历史保留</span> : <span className="inline-actions"><button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "publish-maintenance-plan", payload: { planId: item.id } }, "维护方案已生成发布中批次。 ")}><Send className="lucide-icon" /> 发布</button><button className="icon-button" disabled={!canConfigure} type="button" aria-label={`删除${item.name}`} onClick={() => run({ type: "delete-maintenance-plan", payload: { planId: item.id } }, "方案已解绑，发布历史已保留。 ")}><Trash2 className="lucide-icon" /></button></span>])} />
    </Section>
    <Section title="发布批次" meta="批次状态、逐设备结果与失败原因">
      {state.maintenanceBatches.length ? <DataTable headers={["批次", "方案", "生效时间", "状态", "设备结果", "动作"]} rows={state.maintenanceBatches.map((item) => [<NameCell primary={item.id} secondary={item.createdAt} />, item.planName, item.effectiveAt, <Badge value={item.status} />, <span>{item.deviceResults.map((result) => <Badge key={result.deviceId} value={`${state.devices.find((device) => device.id === result.deviceId)?.sn || result.deviceId} ${result.status}`} />)}</span>, item.status === "发布中" ? <button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "settle-maintenance-batch", payload: { batchId: item.id } }, "维护发布回执已归集。")}>归集回执</button> : "-"])} /> : <EmptyState>尚未发布维护方案</EmptyState>}
    </Section>
    <Section title="实际维护记录" meta="现场执行记录与方案发布记录分开保存">
      <DataTable headers={["设备", "方案 / 类型", "结果", "现场记录", "执行人", "时间"]} rows={state.maintenanceRecords.map((item) => [state.devices.find((device) => device.id === item.deviceId)?.sn || item.deviceId, <NameCell primary={state.maintenancePlans.find((plan) => plan.id === item.planId)?.name || item.planId} secondary={item.type} />, <Badge value={item.result} />, item.note, item.operator, item.performedAt])} />
    </Section>
  </>;
}

function SoftwareTab({ state, open, run, scope }: PageSectionProps) {
  const canConfigure = scopeCan(scope, "manage-configuration");
  return <>
    <Section title="软件包" meta="App、固件、Web 三类；MD5 复用、依赖与审核状态" action={<button className="text-button primary-action" disabled={!canConfigure} type="button" onClick={() => open("software")}><Plus className="lucide-icon" /> 登记软件包</button>}>
      <DataTable headers={["软件包", "类型 / 版本", "适用型号", "MD5", "依赖", "状态", "动作"]} rows={state.softwarePackages.map((item) => [<NameCell primary={item.name} secondary={item.id} />, <NameCell primary={`${item.type} ${item.version}`} secondary={item.force ? "强制标记" : "非强制"} />, state.models.find((model) => model.id === item.modelId)?.code, <span title={item.md5}>{item.md5.slice(0, 8)}…</span>, item.dependencyIds.length, <Badge value={item.status} />, <span className="inline-actions">{item.status === "待审核" ? <button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "set-software-status", payload: { packageId: item.id, status: "审核通过/灰度" } }, "软件包已进入灰度状态。 ")}>审核通过</button> : item.status === "审核通过/灰度" ? <button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "set-software-status", payload: { packageId: item.id, status: "全量发布" } }, "软件包已转为全量发布。 ")}>全量发布</button> : null}<button className="icon-button" disabled={!canConfigure} type="button" aria-label={`删除${item.name}`} onClick={() => run({ type: "delete-software-package", payload: { packageId: item.id } }, "软件包已删除。 ")}><Trash2 className="lucide-icon" /></button></span>])} />
    </Section>
    <Section title={`升级策略 · ${state.upgradePolicies.length}/10`} meta="启用后锁定编辑；区域/点位在保存时展开为设备快照" action={<button className="text-button primary-action" type="button" onClick={() => open("upgrade")} disabled={!canConfigure || state.upgradePolicies.length >= 10}><Plus className="lucide-icon" /> 新建策略</button>}>
      <DataTable headers={["策略", "软件包", "方式 / 范围", "设备快照", "状态", "逐设备状态机", "动作"]} rows={state.upgradePolicies.map((item) => [<NameCell primary={item.name} secondary={item.id} />, <NameCell primary={state.softwarePackages.find((software) => software.id === item.packageId)?.name || item.packageId} secondary={`目标 ${item.targetVersion}`} />, <NameCell primary={item.method} secondary={`${item.scope.kind} · ${item.scope.label}`} />, `${item.scope.deviceIds.length} 台`, <Badge value={item.enabled ? "已启用" : "未启用"} />, item.deviceResults.length ? <div>{item.deviceResults.map((result) => <div className="inline-actions" key={result.deviceId}><Badge value={`${state.devices.find((device) => device.id === result.deviceId)?.sn || result.deviceId} ${result.status}`} />{result.reportedVersion ? <span className="secondary">上报 {result.reportedVersion}</span> : null}{result.status === "下发中" ? <><button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "settle-upgrade-device", payload: { policyId: item.id, deviceId: result.deviceId, status: "成功", reportedVersion: item.targetVersion, reason: "设备上报目标版本" } }, "升级完成回执已记录。")}>完成</button><button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "settle-upgrade-device", payload: { policyId: item.id, deviceId: result.deviceId, status: "失败", reason: "设备返回安装失败" } }, "升级失败回执已记录。")}>失败</button><button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "settle-upgrade-device", payload: { policyId: item.id, deviceId: result.deviceId, status: "超时", reason: "超过升级等待窗口" } }, "升级超时已记录。")}>超时</button></> : ["失败", "超时"].includes(result.status) ? <button className="text-button" disabled={!canConfigure} type="button" onClick={() => run({ type: "retry-upgrade-device", payload: { policyId: item.id, deviceId: result.deviceId } }, "设备升级已重新下发。 ")}><RefreshCw className="lucide-icon" /> 重试</button> : null}</div>)}</div> : "-", <button className="text-button" type="button" disabled={!canConfigure || item.enabled} title={item.enabled ? "启用中的策略不可编辑或重复启用" : ""} onClick={() => run({ type: "enable-upgrade-policy", payload: { policyId: item.id } }, "升级策略已启用并生成逐设备记录。 ")}><Download className="lucide-icon" /> {item.enabled ? "已锁定" : "启用"}</button>])} />
    </Section>
  </>;
}

function RecordsTab({ state, run }: Pick<PageSectionProps, "state" | "run" | "scope">) {
  return <>
    <Section title="逐设备发布记录" meta="模板、离线策略、维护方案和升级策略共用可追溯下发契约">
      <DataTable headers={["批次 / 类别", "目标", "设备", "状态", "原因", "时间", "动作"]} rows={state.publishRecords.map((item) => [<NameCell primary={item.batchId} secondary={item.category} />, item.targetId, state.devices.find((device) => device.id === item.deviceId)?.sn || item.deviceId, <Badge value={item.status} />, item.reason, item.createdAt, item.status === "失败" ? <button className="text-button" type="button" onClick={() => run({ type: "retry-device-publish", payload: { recordId: item.id } }, "失败记录已重新进入下发队列。 ")}><RefreshCw className="lucide-icon" /> 重试</button> : "-"])} />
    </Section>
    <Section title="操作日志" meta="新增、编辑、删除、绑定、下发和重试均保留审计信息">
      <DataTable headers={["动作", "对象", "结果", "详情", "时间"]} rows={state.operationLogs.map((item) => [item.action, item.object, <Badge value={item.result} />, item.detail, item.createdAt])} />
    </Section>
  </>;
}

type PageSectionProps = { state: DeviceOpsState; scope: DeviceOpsScope; open: (editor: Exclude<Editor, null>, id?: string) => void; run: (action: DeviceOpsAction, success: string) => boolean };

function Drawer({ title, kicker, close, children }: { title: string; kicker: string; close: () => void; children: ReactNode }) {
  return <div className="drawer-scrim" role="presentation" onClick={close}><aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="device-ops-editor-title" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="page-kicker">{kicker}</p><h3 id="device-ops-editor-title">{title}</h3></div><button className="text-button" type="button" onClick={close}>取消</button></div>{children}</aside></div>;
}

function Actions({ close }: { close: () => void }) { return <div className="drawer-actions"><button className="text-button" type="button" onClick={close}>取消</button><button className="text-button primary-action" type="submit"><ShieldCheck className="lucide-icon" /> 校验并保存</button></div>; }

function DeviceEditor({ state, run, close }: EditorProps) {
  const [name, setName] = useState(""); const [sn, setSn] = useState(""); const [modelId, setModelId] = useState(state.models[0]?.id || "");
  const model = state.models.find((item) => item.id === modelId);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!model) return; const device: ManagedDevice = { id: `dev-${Date.now()}`, name, sn, tenantId: state.tenantId, pointId: state.points[0]?.id || null, supplierId: model.supplierId, modelId, status: "待激活", configTemplateId: null, desiredConfigTemplateId: null, appliedConfigTemplateId: null, activatedAt: null, appVersion: "-", firmwareVersion: "-", webVersion: "-" }; if (run({ type: "register-device", payload: device }, "设备已登记，当前为待激活状态。")) close(); };
  return <Drawer title="登记设备" kicker="SN 与供应商边界" close={close}><div className="policy-strip"><AlertTriangle className="lucide-icon" /><span>SN 仅允许字母和数字且全局唯一；型号供应商会写入设备归属，后续禁止跨供应商修改。</span></div><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>设备名称</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>SN</span><input required pattern="[A-Za-z0-9]+" value={sn} onChange={(e) => setSn(e.target.value)} /></label><label className="field full"><span>产品型号</span><select value={modelId} onChange={(e) => setModelId(e.target.value)}>{state.models.map((item) => <option key={item.id} value={item.id}>{item.name} · {state.suppliers.find((supplier) => supplier.id === item.supplierId)?.name}</option>)}</select></label></div><Actions close={close} /></form></Drawer>;
}

function TemplateEditor({ state, run, close }: EditorProps) {
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [modelId, setModelId] = useState(state.models[0]?.id || ""); const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState(5000); const [threshold, setThreshold] = useState(800); const [materialCode, setMaterialCode] = useState("MAT-");
  const submit = (event: FormEvent) => { event.preventDefault(); const template: ConfigTemplate = { id: `tpl-${Date.now()}`, code, name, modelId, status: "启用", description, boundDeviceIds: [], updatedAt: new Date().toLocaleString("zh-CN"), parameters: [{ storageNo: 1, storageName: "一号料仓", materialCode, capacity, warningThreshold: threshold, fullValue: Math.max(0, capacity - 200), dischargeValue: 100, motorSpeed: 200 }] }; if (run({ type: "save-template", payload: template }, "配置模板已保存。")) close(); };
  return <Drawer title="新建配置模板" kicker="设备参数契约" close={close}><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>模板名称</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>模板编码</span><input required value={code} onChange={(e) => setCode(e.target.value)} /></label><label className="field"><span>适用型号</span><select value={modelId} onChange={(e) => setModelId(e.target.value)}>{state.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>资源编码</span><input required value={materialCode} onChange={(e) => setMaterialCode(e.target.value)} /></label><label className="field"><span>容量（整数）</span><input type="number" min="0" step="1" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></label><label className="field"><span>预警阈值（整数）</span><input type="number" min="0" step="1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label><label className="field full"><span>说明</span><textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label></div><Actions close={close} /></form></Drawer>;
}

function StorageEditor({ state, storageId, run, close }: EditorProps & { storageId: string }) {
  const storage = state.storages.find((item) => item.id === storageId)!; const [action, setAction] = useState<"补料" | "出料" | "容量调整">("补料"); const [quantity, setQuantity] = useState(0);
  const submit = (event: FormEvent) => { event.preventDefault(); if (run({ type: "adjust-storage", payload: { storageId, action, quantity } }, `${action}已完成并写入日志。`)) close(); };
  return <Drawer title="调整设备料仓" kicker={`${storage.name} · 余量 ${storage.remaining}/${storage.capacity}`} close={close}><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>动作</span><select value={action} onChange={(e) => setAction(e.target.value as typeof action)}><option>补料</option><option>出料</option><option>容量调整</option></select></label><label className="field"><span>{action === "容量调整" ? "新容量" : "数量"}</span><input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label></div><Actions close={close} /></form></Drawer>;
}

function CalibrationEditor({ state, storageId, run, close }: EditorProps & { storageId: string }) {
  const storage = state.storages.find((item) => item.id === storageId)!; const [factor, setFactor] = useState(storage.calibrationFactor);
  return <Drawer title="料仓称重标定" kicker={`${storage.name} · 当前系数 ${storage.calibrationFactor}`} close={close}><form className="drawer-form" onSubmit={(e) => { e.preventDefault(); if (run({ type: "calibrate-storage", payload: { storageId, calibrationFactor: factor } }, "标定系数已更新并保留历史。")) close(); }}><div className="form-grid"><label className="field full"><span>新标定系数</span><input type="number" min="0.001" step="0.001" value={factor} onChange={(e) => setFactor(Number(e.target.value))} /></label></div><Actions close={close} /></form></Drawer>;
}

function OfflineEditor({ state, run, close }: EditorProps) {
  const [name, setName] = useState(""); const [cutoff, setCutoff] = useState("22:00"); const [check, setCheck] = useState(5); const [max, setMax] = useState(30); const [isDefault, setDefault] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); const policy: OfflinePolicy = { id: `offline-${Date.now()}`, name, cutoffTime: cutoff, checkIntervalMinutes: check, maxOfflineMinutes: max, isDefault, enabled: true, boundDeviceIds: [] }; if (run({ type: "save-offline-policy", payload: policy }, "离线策略已保存。")) close(); };
  return <Drawer title="新建离线策略" kicker="默认继承与单 SN 绑定" close={close}><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>策略名称</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>营业截止时间</span><input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></label><label className="field"><span>检查间隔（分钟）</span><input type="number" min="1" step="1" value={check} onChange={(e) => setCheck(Number(e.target.value))} /></label><label className="field"><span>最大离线时长（分钟）</span><input type="number" min="1" step="1" value={max} onChange={(e) => setMax(Number(e.target.value))} /></label><label className="checkbox-row full"><input type="checkbox" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} /><span>设为默认策略（当前已有默认策略时会拒绝）</span></label></div><Actions close={close} /></form></Drawer>;
}

function MaintenanceEditor({ state, run, close }: EditorProps) {
  const [name, setName] = useState(""); const [type, setType] = useState("管路清洗"); const [modelId, setModelId] = useState(state.models[0]?.id || ""); const [devices, setDevices] = useState<string[]>([]); const [steps, setSteps] = useState("排空管路|30|停止供料并排空\n清水冲洗|120|开启清水循环冲洗");
  const submit = (event: FormEvent) => { event.preventDefault(); const model = state.models.find((item) => item.id === modelId)!; const plan: MaintenancePlan = { id: `clean-${Date.now()}`, name, type, modelId, supplierId: model.supplierId, status: "启用", description: "设备维护方案", boundDeviceIds: devices, steps: steps.split("\n").filter(Boolean).map((line, index) => { const [stepName, duration, instruction] = line.split("|"); return { order: index + 1, name: stepName?.trim() || "", durationSeconds: Number(duration), instruction: instruction?.trim() || "" }; }) }; if (run({ type: "save-maintenance-plan", payload: plan }, "维护方案已保存。")) close(); };
  return <Drawer title="新建维护方案" kicker="步骤、绑定与发布" close={close}><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>方案名称</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>维护类型</span><input required value={type} onChange={(e) => setType(e.target.value)} /></label><label className="field full"><span>硬件型号</span><select value={modelId} onChange={(e) => { setModelId(e.target.value); setDevices([]); }}>{state.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="field full"><span>绑定设备（同设备同类型唯一）</span><div className="checkbox-grid">{state.devices.filter((item) => item.modelId === modelId).map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={devices.includes(item.id)} onChange={(e) => setDevices((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{item.sn} · {item.name}</span></label>)}</div></div><label className="field full"><span>步骤（每行：名称|秒数|指令）</span><textarea rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} /></label></div><Actions close={close} /></form></Drawer>;
}

function MaintenanceRecordEditor({ state, scope, run, close }: EditorProps & { scope: DeviceOpsScope }) {
  const activePlans = state.maintenancePlans.filter((item) => item.status === "启用" && item.boundDeviceIds.some((id) => state.devices.some((device) => device.id === id)));
  const [planId, setPlanId] = useState(activePlans[0]?.id || "");
  const plan = activePlans.find((item) => item.id === planId);
  const availableDevices = state.devices.filter((item) => plan?.boundDeviceIds.includes(item.id));
  const [deviceId, setDeviceId] = useState(availableDevices[0]?.id || "");
  const [result, setResult] = useState<MaintenanceRecord["result"]>("完成");
  const [note, setNote] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!plan) return;
    const record: MaintenanceRecord = { id: `maint-${Date.now()}`, planId, deviceId, type: plan.type, result, note, operator: scope.userName, performedAt: new Date().toLocaleString("zh-CN") };
    if (run({ type: "record-maintenance", payload: record }, "现场维护记录已保存。")) close();
  };
  return <Drawer title="记录现场维护" kicker="实际执行记录" close={close}><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>维护方案</span><select value={planId} onChange={(event) => { setPlanId(event.target.value); const nextPlan = activePlans.find((item) => item.id === event.target.value); setDeviceId(nextPlan?.boundDeviceIds.find((id) => state.devices.some((device) => device.id === id)) || ""); }}>{activePlans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>设备</span><select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{availableDevices.map((item) => <option key={item.id} value={item.id}>{item.sn} · {item.name}</option>)}</select></label><label className="field"><span>执行结果</span><select value={result} onChange={(event) => setResult(event.target.value as MaintenanceRecord["result"])}><option>完成</option><option>异常</option></select></label><label className="field full"><span>现场结果</span><textarea required rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录检查、清洗步骤、异常现象和后续处理。" /></label></div><Actions close={close} /></form></Drawer>;
}

function SoftwareEditor({ state, run, close }: EditorProps) {
  const [name, setName] = useState(""); const [version, setVersion] = useState(""); const [type, setType] = useState<SoftwareType>("App"); const [modelId, setModelId] = useState(state.models[0]?.id || ""); const [md5, setMd5] = useState(""); const [address, setAddress] = useState(""); const [dependencyIds, setDependencies] = useState<string[]>([]); const [force, setForce] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); const software: SoftwarePackage = { id: `pkg-${Date.now()}`, name, version, type, modelId, md5, address, dependencyIds, force, content: "运营登记软件包", status: "待审核", createdAt: new Date().toLocaleString("zh-CN") }; if (run({ type: "save-software-package", payload: software }, "软件包已登记并进入待审核状态。")) close(); };
  return <Drawer title="登记软件包" kicker="MD5、依赖与三类版本" close={close}><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>名称</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>版本</span><input required value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如 2.8.2" /></label><label className="field"><span>类型</span><select value={type} onChange={(e) => setType(e.target.value as SoftwareType)}><option>App</option><option>固件</option><option>Web</option></select></label><label className="field"><span>适用型号</span><select value={modelId} onChange={(e) => setModelId(e.target.value)}>{state.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field full"><span>MD5</span><input required minLength={32} maxLength={32} value={md5} onChange={(e) => setMd5(e.target.value)} /></label><label className="field full"><span>文件地址</span><input required value={address} onChange={(e) => setAddress(e.target.value)} /></label><div className="field full"><span>依赖软件包</span><div className="checkbox-grid">{state.softwarePackages.map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={dependencyIds.includes(item.id)} onChange={(e) => setDependencies((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{item.type} {item.version}</span></label>)}</div></div><label className="checkbox-row full"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /><span>标记为强制升级包</span></label></div><Actions close={close} /></form></Drawer>;
}

function UpgradeEditor({ state, run, close }: EditorProps) {
  const packages = state.softwarePackages.filter((item) => item.status !== "待审核"); const [name, setName] = useState(""); const [packageId, setPackageId] = useState(packages[0]?.id || ""); const [method, setMethod] = useState<"强制" | "可选">("可选"); const [kind, setKind] = useState<UpgradeScope["kind"]>("设备"); const software = packages.find((item) => item.id === packageId); const compatible = state.devices.filter((item) => item.modelId === software?.modelId); const [deviceIds, setDeviceIds] = useState<string[]>([]); const [label, setLabel] = useState("指定设备");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!software) return; const snapshotIds = kind === "区域/全国" ? compatible.map((item) => item.id) : deviceIds; const scope: UpgradeScope = kind === "点位" ? { kind, label, pointIds: Array.from(new Set(snapshotIds.map((id) => state.devices.find((item) => item.id === id)?.pointId).filter((id): id is string => Boolean(id)))), deviceIds: snapshotIds } : { kind, label, deviceIds: snapshotIds }; const policy: UpgradePolicy = { id: `upgrade-${Date.now()}`, name, description: "设备软件升级策略", method, packageId, enabled: false, scope, targetVersion: software.version, deviceResults: [], createdAt: new Date().toLocaleString("zh-CN") }; if (run({ type: "save-upgrade-policy", payload: policy }, "升级策略已保存，范围已展开为设备快照。")) close(); };
  return <Drawer title="新建升级策略" kicker={`${state.upgradePolicies.length}/10 · 启用后锁定`} close={close}><form className="drawer-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>策略名称</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>升级方式</span><select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option>强制</option><option>可选</option></select></label><label className="field full"><span>软件包</span><select value={packageId} onChange={(e) => { setPackageId(e.target.value); setDeviceIds([]); }}><option value="">请选择</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type} {item.version}</option>)}</select></label><label className="field"><span>范围类型</span><select value={kind} onChange={(e) => setKind(e.target.value as UpgradeScope["kind"])}><option>区域/全国</option><option>点位</option><option>设备</option></select></label><label className="field"><span>范围名称</span><input required value={label} onChange={(e) => setLabel(e.target.value)} /></label>{kind === "区域/全国" ? <div className="policy-strip full"><Boxes className="lucide-icon" /><span>保存时将当前全部 {compatible.length} 台兼容设备固化为范围快照。</span></div> : <div className="field full"><span>选择设备（点位范围同样固化为具体设备）</span><div className="checkbox-grid">{compatible.map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={deviceIds.includes(item.id)} onChange={(e) => setDeviceIds((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{item.sn} · {item.pointId || "未绑定点位"}</span></label>)}</div></div>}</div><Actions close={close} /></form></Drawer>;
}

type EditorProps = { state: DeviceOpsState; run: (action: DeviceOpsAction, success: string) => boolean; close: () => void };

export default DeviceOperationsPage;
