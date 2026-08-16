import { Boxes, ClipboardPlus, FilePlus2, PackagePlus, Printer, ShieldAlert, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Badge, DataTable, DefinitionList, EmptyState, KpiTile, NameCell, RecordList, Section } from "../../components/ui";
import type { AppState } from "../../types/core";
import { scopeFromAppState } from "./adapter";
import { catalogResourcesReducer, deriveBatchStatus } from "./domain";
import type { CatalogResourcesAction, CatalogResourcesAuditEvent, CatalogResourcesScope, FormulaScope, StorageType } from "./types";
import { catalogResourcesStorageKey, scopeCatalogResourcesState, useCatalogResources } from "./useCatalogResources";

type Tab = "规格与配方" | "资源与单位" | "料仓库存" | "效期方案" | "现场作业" | "操作日志";
const tabs: Tab[] = ["规格与配方", "资源与单位", "料仓库存", "效期方案", "现场作业", "操作日志"];
const storageTypes: StorageType[] = ["常温", "冷藏", "冷冻", "热保存", "其他", "保温桶冷藏"];
const pad = (value: number) => String(value).padStart(2, "0");
const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmt = (value?: string) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";

export function CatalogResourcesPage({ state: appState, scope, onAudit }: { state?: AppState; scope?: CatalogResourcesScope; onAudit?: (event: CatalogResourcesAuditEvent) => void }) {
  const resolved = scope || (appState ? scopeFromAppState(appState) : { tenantId: "TENANT-DEMO", userId: "demo-admin", actor: "演示管理员", roles: ["商品/配置管理员"], permissions: ["read", "manage", "field"] });
  return <CatalogResourcesContent key={catalogResourcesStorageKey(resolved)} scope={resolved} onAudit={onAudit} />;
}

function CatalogResourcesContent({ scope, onAudit }: { scope: CatalogResourcesScope; onAudit?: (event: CatalogResourcesAuditEvent) => void }) {
  const { state: fullState, dispatch: rawDispatch } = useCatalogResources(scope);
  const state = useMemo(() => scopeCatalogResourcesState(fullState, scope), [fullState, scope]);
  const dispatch: PageDispatch = (action) => {
    const prepared = { ...action, meta: action.meta || { actor: scope.actor, permissions: scope.permissions, pointIds: scope.pointIds } } as CatalogResourcesAction;
    const preview = catalogResourcesReducer(fullState, prepared);
    rawDispatch(prepared);
    if (action.type !== "clear-feedback") onAudit?.({ action: action.type, object: actionObject(action), risk: action.type === "run-auto-waste" ? "L1" : ["adjust-bin", "add-batch", "waste-batch", "print-batch"].includes(action.type) ? "L2" : "L3", result: preview.lastError ? "拒绝" : "成功", detail: preview.lastError || preview.lastNotice || "状态已更新" });
  };
  useEffect(() => {
    const now = new Date();
    if (now.getHours() < 6) return;
    const action: CatalogResourcesAction = { type: "run-auto-waste", payload: { now: now.toISOString() }, meta: { actor: "效期自动任务", permissions: ["system"], pointIds: scope.pointIds } };
    const preview = catalogResourcesReducer(fullState, action);
    rawDispatch(action);
    if (preview.batches.some((batch, index) => batch.status !== fullState.batches[index]?.status)) onAudit?.({ action: action.type, object: scope.tenantId, risk: "L1", result: preview.lastError ? "拒绝" : "成功", detail: preview.lastError || preview.lastNotice || "自动报损检查完成" });
    // The scoped page is keyed by its storage partition, so this job runs once when that partition opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<Tab>("规格与配方");
  const [drawer, setDrawer] = useState<"template" | "formula" | "material" | null>(null);
  const canManage = scope.permissions.includes("manage");
  const canField = canManage || scope.permissions.includes("field");
  const expiring = state.batches.filter((batch) => ["临期", "已过期"].includes(deriveBatchStatus(batch))).length;
  const lowBins = state.bins.filter((bin) => bin.remaining <= bin.warningThreshold).length;
  return (
    <>
      <div className="grid kpi">
        <KpiTile title="启用执行配方" value={state.formulas.filter((item) => item.status === "启用").length} foot="区域冲突自动停旧版" />
        <KpiTile title="在管资源" value={state.materials.filter((item) => item.status === "启用").length} foot={`${state.units.length} 种计量单位`} />
        <KpiTile title="低余量料仓" value={lowBins} foot="按料仓阈值实时判断" />
        <KpiTile title="临期 / 过期批次" value={expiring} foot="过期与报损不计可用量" />
      </div>
      <nav className="section-tabs" aria-label="商品与资源模块">
        {tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} type="button" onClick={() => setTab(item)}>{item}</button>)}
      </nav>
      <div className="policy-strip"><Badge value={canManage ? "配置管理员" : canField ? "现场作业" : "只读"} /><span>{scope.tenantId} · {scope.actor} · {scope.pointIds?.length ? `${scope.pointIds.length} 个授权点位` : "全部授权点位"}</span></div>
      {state.lastError || state.lastNotice ? (
        <div className="policy-strip" role={state.lastError ? "alert" : "status"}>
          {state.lastError ? <ShieldAlert className="lucide-icon" /> : <Badge value="已完成" />}
          <span>{state.lastError || state.lastNotice}</span>
          <button className="icon-button" type="button" aria-label="关闭提示" onClick={() => dispatch({ type: "clear-feedback" })}><X className="lucide-icon" /></button>
        </div>
      ) : null}
      {tab === "规格与配方" ? <FormulaTab state={state} open={setDrawer} dispatch={dispatch} canManage={canManage} /> : null}
      {tab === "资源与单位" ? <MaterialsTab state={state} open={() => setDrawer("material")} dispatch={dispatch} canManage={canManage} /> : null}
      {tab === "料仓库存" ? <BinsTab state={state} dispatch={dispatch} canField={canField} /> : null}
      {tab === "效期方案" ? <ValidityTab state={state} dispatch={dispatch} canManage={canManage} /> : null}
      {tab === "现场作业" ? <FieldTab state={state} dispatch={dispatch} canField={canField} /> : null}
      {tab === "操作日志" ? <LogsTab state={state} /> : null}
      {drawer === "template" ? <TemplateDrawer state={state} close={() => setDrawer(null)} dispatch={dispatch} /> : null}
      {drawer === "formula" ? <FormulaDrawer state={state} close={() => setDrawer(null)} dispatch={dispatch} /> : null}
      {drawer === "material" ? <MaterialDrawer state={state} close={() => setDrawer(null)} dispatch={dispatch} /> : null}
    </>
  );
}

function actionObject(action: CatalogResourcesAction) {
  if (!("payload" in action)) return "catalog-resources";
  const payload = action.payload as Record<string, unknown>;
  return String(payload.formulaId || payload.planId || payload.batchId || payload.binId || payload.pointId || (payload.id as string | undefined) || "catalog-resources");
}

type PageState = ReturnType<typeof useCatalogResources>["state"];
type PageDispatch = (action: CatalogResourcesAction) => void;
const deniedTitle = "当前角色只有查看权限，配置管理动作不可用";

function FormulaTab({ state, open, dispatch, canManage }: { state: PageState; open: (value: "template" | "formula") => void; dispatch: PageDispatch; canManage: boolean }) {
  const [selectedId, setSelectedId] = useState(state.formulas[0]?.id || "");
  const selected = state.formulas.find((item) => item.id === selectedId) || state.formulas[0];
  return (
    <>
      <div className="grid two">
        <Section title="规格模板" meta="规格组、规格项、别名、排序与启停" action={<button className="text-button" type="button" disabled={!canManage} title={!canManage ? deniedTitle : ""} onClick={() => open("template")}><FilePlus2 className="lucide-icon" /> 新建模板</button>}>
          <DataTable headers={["模板", "编码", "规格组", "状态"]} rows={state.specTemplates.map((item) => [<NameCell primary={item.name} secondary={item.id} />, item.code, item.groupIds.map((id) => state.specGroups.find((group) => group.id === id)?.name).filter(Boolean).join("、"), <Badge value={item.status} />])} />
        </Section>
        <Section title="规格组与规格项" meta="启用项才可参与配方组合">
          <DataTable headers={["规格组", "编码", "规格项", "排序"]} rows={state.specGroups.map((group) => [group.name, group.code, group.options.map((option) => <Badge key={option.id} value={`${option.name}${option.alias ? `（${option.alias}）` : ""}`} tone={option.enabled ? "neutral" : undefined} />), group.sort])} />
        </Section>
      </div>
      <div className="split-detail">
        <Section title="执行流程 / 配方版本" meta="同商品、同规格组合、重叠范围仅保留一份启用配方" action={<button className="text-button primary-action" type="button" disabled={!canManage} title={!canManage ? deniedTitle : ""} onClick={() => open("formula")}><ClipboardPlus className="lucide-icon" /> 新增版本</button>}>
          <DataTable headers={["组合", "版本", "范围", "状态", "下发"]} rows={state.formulas.map((formula) => ({ key: formula.id, selected: selected?.id === formula.id, onClick: () => setSelectedId(formula.id), cells: [<NameCell primary={formula.productName} secondary={formula.combinationCode} />, `v${formula.version}`, formula.scope === "全国" ? "全国" : `${formula.scope}：${formula.targets.join("、")}`, <Badge value={formula.status} />, <Badge value={formula.deliveryStatus} />] }))} />
        </Section>
        <aside className="detail-panel">
          <div className="band-header"><div><h3 className="band-title">配方详情</h3><p className="band-meta">{selected?.id || "未选择"}</p></div></div>
          {selected ? <div className="detail-stack">
            <DefinitionList rows={[["组合编码", selected.combinationCode], ["版本", `v${selected.version}`], ["适用范围", selected.scope === "全国" ? "全国" : selected.targets.join("、")], ["绑定工艺", state.processPlans.find((item) => item.id === selected.processId)?.name || "未绑定"], ["更新时间", fmt(selected.updatedAt)]]} />
            {selected.steps.length ? <DataTable headers={["顺序", "物料", "用量"]} rows={selected.steps.map((step) => [step.order, state.materials.find((item) => item.id === step.materialId)?.name || step.materialId, `${step.amount} ${step.unit}`])} /> : <EmptyState>旧版本已因范围冲突停用，物料步骤已按旧业务规则清除</EmptyState>}
            <button className="text-button primary-action" type="button" disabled={!canManage || selected.status !== "启用"} title={!canManage ? deniedTitle : ""} onClick={() => dispatch({ type: "publish-formula", payload: { formulaId: selected.id, pointIds: state.points.map((point) => point.id) } })}>下发到当前范围</button>
            {selected.deliveryResults.length ? <DataTable headers={["点位", "状态", "原因", "动作"]} rows={selected.deliveryResults.map((result) => [state.points.find((point) => point.id === result.pointId)?.name || result.pointId, <Badge value={result.status} />, result.reason, result.status === "失败" ? <button className="text-button" type="button" disabled={!canManage} onClick={() => dispatch({ type: "retry-formula-delivery", payload: { formulaId: selected.id, pointId: result.pointId } })}>重试</button> : "-"])} /> : null}
          </div> : <EmptyState>暂无配方</EmptyState>}
        </aside>
      </div>
      <Section title="工艺 / 摇杯方案" meta="仅启用工艺参与订单下发，并按配方组合绑定">
        <DataTable headers={["工艺", "状态", "绑定组合", "工艺步骤"]} rows={state.processPlans.map((plan) => [<NameCell primary={plan.name} secondary={plan.code} />, <Badge value={plan.status} />, plan.formulaCombinationCodes.join("、"), plan.steps.map((step) => `${step.order}. ${step.direction} ${step.speed}rpm / ${step.seconds}s`).join("；")])} />
      </Section>
      <CatalogQuickEditors state={state} dispatch={dispatch} canManage={canManage} />
    </>
  );
}

function MaterialsTab({ state, open, dispatch, canManage }: { state: PageState; open: () => void; dispatch: PageDispatch; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [unitId, setUnitId] = useState("");
  const [unitCode, setUnitCode] = useState(""); const [unitName, setUnitName] = useState(""); const [precision, setPrecision] = useState("0");
  const materials = state.materials.filter((item) => `${item.name}${item.code}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <Section title="资源 / 耗材" meta="编码与名称分别唯一；饮品特有属性作为场景扩展保留" action={<button className="text-button primary-action" type="button" disabled={!canManage} title={!canManage ? deniedTitle : ""} onClick={open}><PackagePlus className="lucide-icon" /> 新增资源</button>}>
      <div className="filters"><label className="field"><span>搜索资源</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称 / 编码" /></label></div>
      {materials.length ? <DataTable headers={["资源", "单位", "存储类型", "默认效期", "预警", "硬件", "状态"]} rows={materials.map((item) => [<NameCell primary={item.name} secondary={item.code} />, state.units.find((unit) => unit.id === item.unitId)?.name || "-", <Badge value={item.storageType} tone="neutral" />, item.defaultValidMinutes === -1 ? "当日 23:59:59" : `${item.defaultValidMinutes} 分钟`, `${item.defaultWarningMinutes} 分钟`, item.compatibleHardware.join("、") || "通用", <Badge value={item.status} />])} /> : <EmptyState>没有匹配的资源</EmptyState>}
    </Section>
    <Section title="计量单位" meta="单位精度用于表单校验和设备标定">
      <DataTable headers={["单位", "编码", "小数精度"]} rows={state.units.map((unit) => [unit.name, unit.code, unit.precision])} />
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "save-unit", payload: { id: unitId || `UNIT-${Date.now()}`, code: unitCode.trim().toUpperCase(), name: unitName.trim(), precision: Number(precision) } }); }}>
        <label className="field"><span>编辑对象</span><select value={unitId} onChange={(event) => { const id = event.target.value; setUnitId(id); const unit = state.units.find((item) => item.id === id); setUnitCode(unit?.code || ""); setUnitName(unit?.name || ""); setPrecision(String(unit?.precision ?? 0)); }}><option value="">新建单位</option>{state.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="field"><span>单位编码</span><input value={unitCode} onChange={(event) => setUnitCode(event.target.value)} /></label>
        <label className="field"><span>单位名称</span><input value={unitName} onChange={(event) => setUnitName(event.target.value)} /></label>
        <label className="field"><span>小数精度</span><input type="number" min="0" step="1" value={precision} onChange={(event) => setPrecision(event.target.value)} /></label>
        <div className="drawer-actions"><button className="text-button" type="submit" disabled={!canManage} title={!canManage ? deniedTitle : ""}>保存单位</button></div>
      </form>
    </Section>
  </>;
}

function BinsTab({ state, dispatch, canField }: { state: PageState; dispatch: PageDispatch; canField: boolean }) {
  const [binId, setBinId] = useState(state.bins[0]?.id || "");
  const [mode, setMode] = useState<"补料" | "出料" | "调整容量">("补料");
  const [amount, setAmount] = useState("500");
  const submit = (event: FormEvent) => { event.preventDefault(); dispatch({ type: "adjust-bin", payload: { binId, mode, amount: Number(amount) } }); };
  return <>
    <Section title="设备料仓" meta="补出料、容量和阈值只接受有效整数">
      <DataTable headers={["设备 / 料仓", "绑定资源", "容量", "余量", "阈值", "状态", "到期"]} rows={state.bins.map((bin) => [<NameCell primary={`${bin.deviceSn} / ${bin.number}`} secondary={bin.id} />, state.materials.find((item) => item.id === bin.materialId)?.name || "-", bin.capacity, bin.remaining, bin.warningThreshold, <Badge value={bin.remaining <= bin.warningThreshold ? "低余量" : bin.status} />, fmt(bin.expiresAt)])} />
    </Section>
    <Section title="料仓作业" meta="补料刷新补料和到期时间；出料不可超过余量；新容量不可小于余量">
      <form className="form-grid" onSubmit={submit}>
        <label className="field"><span>料仓</span><select value={binId} onChange={(event) => setBinId(event.target.value)}>{state.bins.map((bin) => <option key={bin.id} value={bin.id}>{bin.deviceSn} / {bin.number}</option>)}</select></label>
        <label className="field"><span>操作</span><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option>补料</option><option>出料</option><option>调整容量</option></select></label>
        <label className="field"><span>{mode === "调整容量" ? "新容量" : "数量"}</span><input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <div className="drawer-actions"><button className="text-button primary-action" type="submit" disabled={!canField} title={!canField ? "当前角色只有查看权限，现场作业不可用" : ""}><Boxes className="lucide-icon" /> 校验并记录</button></div>
      </form>
    </Section>
  </>;
}

function ValidityTab({ state, dispatch, canManage }: { state: PageState; dispatch: PageDispatch; canManage: boolean }) {
  const [planId, setPlanId] = useState(state.validityPlans[0]?.id || "");
  const [pointId, setPointId] = useState(state.points[0]?.id || "");
  const [planName, setPlanName] = useState(""); const [planCode, setPlanCode] = useState(""); const [planMaterialId, setPlanMaterialId] = useState(state.materials[0]?.id || ""); const [planValid, setPlanValid] = useState("480"); const [planWarning, setPlanWarning] = useState("60"); const [autoWaste, setAutoWaste] = useState(true);
  const [editPlanId, setEditPlanId] = useState("");
  return <>
    <Section title="效期方案" meta="方案参数是物料基础参数的点位策略快照">
      <DataTable headers={["方案", "物料规则", "绑定点位", "自动报损", "下发"]} rows={state.validityPlans.map((plan) => [<NameCell primary={plan.name} secondary={plan.code} />, plan.rules.map((rule) => `${state.materials.find((item) => item.id === rule.materialId)?.name} ${rule.validMinutes === -1 ? "当日有效" : `${rule.validMinutes}m`} / 提前${rule.warningMinutes}m`).join("；"), plan.pointIds.map((id) => state.points.find((point) => point.id === id)?.name).filter(Boolean).join("、") || "未绑定", <Badge value={plan.autoWaste ? "已开启" : "未开启"} />, <Badge value={plan.deliveryStatus} />])} />
    </Section>
    <Section title="点位绑定" meta="一个点位同一时刻只绑定一个方案；切换会自动解绑原方案">
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "bind-validity-plan", payload: { planId, pointId } }); }}>
        <label className="field"><span>效期方案</span><select value={planId} onChange={(event) => setPlanId(event.target.value)}>{state.validityPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label className="field"><span>点位</span><select value={pointId} onChange={(event) => setPointId(event.target.value)}>{state.points.map((point) => <option key={point.id} value={point.id}>{point.name}{point.validityEnabled ? "" : "（未启用效期）"}</option>)}</select></label>
        <div className="drawer-actions"><button className="text-button primary-action" type="submit" disabled={!canManage} title={!canManage ? deniedTitle : ""}>绑定并生成待下发记录</button></div>
      </form>
    </Section>
    <Section title="新增效期方案" meta="物料参数保存为点位策略快照；已绑定点位的方案删除前必须先解绑">
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const previous = state.validityPlans.find((plan) => plan.id === editPlanId); const id = editPlanId || `VP-${Date.now()}`; dispatch({ type: "save-validity-plan", payload: { id, code: planCode, name: planName, status: "启用", autoWaste, pointIds: previous?.pointIds || [], deliveryStatus: "待下发", rules: [{ materialId: planMaterialId, validMinutes: Number(planValid), warningMinutes: Number(planWarning) }] } }); }}>
        <label className="field"><span>编辑对象</span><select value={editPlanId} onChange={(event) => { const id = event.target.value; setEditPlanId(id); const plan = state.validityPlans.find((item) => item.id === id); const rule = plan?.rules[0]; setPlanName(plan?.name || ""); setPlanCode(plan?.code || ""); setAutoWaste(plan?.autoWaste ?? true); setPlanMaterialId(rule?.materialId || state.materials[0]?.id || ""); setPlanValid(String(rule?.validMinutes ?? 480)); setPlanWarning(String(rule?.warningMinutes ?? 60)); }}><option value="">新建方案</option>{state.validityPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label className="field"><span>方案名称</span><input value={planName} onChange={(event) => setPlanName(event.target.value)} /></label><label className="field"><span>方案编码</span><input value={planCode} onChange={(event) => setPlanCode(event.target.value)} /></label>
        <label className="field"><span>物料</span><select value={planMaterialId} onChange={(event) => setPlanMaterialId(event.target.value)}>{state.materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
        <label className="field"><span>有效分钟（-1 当日）</span><input type="number" min="-1" step="1" value={planValid} onChange={(event) => setPlanValid(event.target.value)} /></label><label className="field"><span>预警分钟</span><input type="number" min="0" step="1" value={planWarning} onChange={(event) => setPlanWarning(event.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={autoWaste} onChange={(event) => setAutoWaste(event.target.checked)} /><span>06:00 后自动报损</span></label>
        <div className="drawer-actions"><button className="text-button primary-action" type="submit" disabled={!canManage} title={!canManage ? deniedTitle : ""}>保存方案</button></div>
      </form>
      <div className="inline-actions">{state.validityPlans.map((plan) => <button className="text-button danger-action" key={plan.id} type="button" disabled={!canManage || plan.pointIds.length > 0} title={plan.pointIds.length ? "已绑定点位，不能删除" : !canManage ? deniedTitle : ""} onClick={() => dispatch({ type: "delete-validity-plan", payload: { planId: plan.id } })}>删除 {plan.name}</button>)}</div>
    </Section>
  </>;
}

function FieldTab({ state, dispatch, canField }: { state: PageState; dispatch: PageDispatch; canField: boolean }) {
  const [pointId, setPointId] = useState(state.points.find((point) => point.validityEnabled)?.id || "");
  const plan = state.validityPlans.find((item) => item.pointIds.includes(pointId) && item.status === "启用");
  const allowedMaterials = plan?.rules.map((rule) => state.materials.find((item) => item.id === rule.materialId)).filter(Boolean) || [];
  const [materialId, setMaterialId] = useState(allowedMaterials[0]?.id || state.materials[0]?.id || "");
  const [activatedAt, setActivatedAt] = useState(localNow);
  const [amount, setAmount] = useState("1000");
  const [selectedBatchId, setSelectedBatchId] = useState(state.batches[0]?.id || "");
  const [actionAmount, setActionAmount] = useState("100");
  const [reason, setReason] = useState("现场盘点报损");
  const batches = state.batches.filter((batch) => batch.pointId === pointId);
  const selected = state.batches.find((batch) => batch.id === selectedBatchId) || batches[0];
  const create = (event: FormEvent) => { event.preventDefault(); dispatch({ type: "add-batch", payload: { pointId, materialId, activatedAt, amount: Number(amount) } }); };
  return <>
    <div className="grid two">
      <Section title="现场批次录入" meta="移动端可完成当日批次录入；相同物料与启用时刻防重">
        <form className="drawer-form" onSubmit={create}>
          <label className="field"><span>作业点位</span><select value={pointId} onChange={(event) => { setPointId(event.target.value); const nextPlan = state.validityPlans.find((item) => item.pointIds.includes(event.target.value)); setMaterialId(nextPlan?.rules[0]?.materialId || ""); }}>{state.points.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select></label>
          <label className="field"><span>资源</span><select value={materialId} onChange={(event) => setMaterialId(event.target.value)}>{allowedMaterials.map((material) => material ? <option key={material.id} value={material.id}>{material.name}</option> : null)}</select></label>
          <label className="field"><span>今日启用时间</span><input type="datetime-local" value={activatedAt} onChange={(event) => setActivatedAt(event.target.value)} /></label>
          <label className="field"><span>启用数量</span><input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <button className="text-button primary-action" type="submit" disabled={!canField} title={!canField ? "当前角色只有查看权限，现场作业不可用" : ""}><ClipboardPlus className="lucide-icon" /> 录入批次</button>
        </form>
      </Section>
      <Section title="现场快捷操作" meta="首次打印与补打分别留痕；已报损或过期批次不可打印">
        {selected ? <div className="detail-stack">
          <DefinitionList rows={[["批次", selected.code], ["资源", state.materials.find((item) => item.id === selected.materialId)?.name || "-"], ["可用量", selected.availableAmount], ["状态", <Badge value={deriveBatchStatus(selected)} />], ["打印次数", selected.printCount]]} />
          <label className="field"><span>操作数量</span><input type="number" min="1" step="1" value={actionAmount} onChange={(event) => setActionAmount(event.target.value)} /></label>
          <label className="field"><span>报损原因</span><input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="inline-actions">
            <button className="text-button primary-action" type="button" disabled={!canField} onClick={() => dispatch({ type: "print-batch", payload: { batchId: selected.id, amount: Number(actionAmount) } })}><Printer className="lucide-icon" /> {selected.printCount ? "补打" : "首次打印"}</button>
            <button className="text-button danger-action" type="button" disabled={!canField} onClick={() => dispatch({ type: "waste-batch", payload: { batchId: selected.id, amount: Number(actionAmount), reason } })}><Trash2 className="lucide-icon" /> 报损</button>
          </div>
        </div> : <EmptyState>该点位暂无批次</EmptyState>}
      </Section>
    </div>
    <Section title="今日批次" meta="过期或全量报损批次不计入可用量">
      {batches.length ? <DataTable headers={["批次", "资源", "启用", "预警", "到期", "可用 / 报损", "状态"]} rows={batches.map((batch) => ({ key: batch.id, selected: selected?.id === batch.id, onClick: () => setSelectedBatchId(batch.id), cells: [batch.code, state.materials.find((item) => item.id === batch.materialId)?.name || "-", fmt(batch.activatedAt), fmt(batch.warningAt), fmt(batch.expiresAt), `${batch.availableAmount} / ${batch.wastedAmount}`, <Badge value={deriveBatchStatus(batch)} />] }))} /> : <EmptyState>当前点位今天还没有批次</EmptyState>}
    </Section>
    <Section title="自动报损任务" meta="仅对启用效期、方案开启自动报损的点位，在 06:00 后处理已过期批次"><div className="note-box">当前租户分区打开时自动执行一次检查；系统任务使用独立权限并写入操作日志，现场账号不能伪造执行。</div></Section>
  </>;
}

function LogsTab({ state }: { state: PageState }) {
  const [kind, setKind] = useState<"操作日志" | "打印记录">("操作日志");
  return <>
    <div className="section-tabs"><button className={kind === "操作日志" ? "active" : ""} type="button" onClick={() => setKind("操作日志")}>操作日志</button><button className={kind === "打印记录" ? "active" : ""} type="button" onClick={() => setKind("打印记录")}>打印记录</button></div>
    {kind === "操作日志" ? <Section title="资源操作日志" meta="新增、绑定、补出料、报损和打印统一留痕"><RecordList records={state.logs.map((log) => ({ id: log.id, action: `${log.action} · ${log.objectType}`, time: fmt(log.time), note: `${log.objectId} · ${log.note}`, operator: log.operator }))} /></Section> : <Section title="批次打印记录" meta="首次打印与补打分开记录用户、时间和重量"><DataTable headers={["批次", "类型", "数量", "操作人", "时间"]} rows={state.printLogs.map((log) => [state.batches.find((batch) => batch.id === log.batchId)?.code || log.batchId, <Badge value={log.kind} />, log.amount, log.operator, fmt(log.time)])} /></Section>}
  </>;
}

function CatalogQuickEditors({ state, dispatch, canManage }: { state: PageState; dispatch: PageDispatch; canManage: boolean }) {
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState(""); const [groupCode, setGroupCode] = useState(""); const [optionName, setOptionName] = useState(""); const [optionCode, setOptionCode] = useState("");
  const [processId, setProcessId] = useState("");
  const [processName, setProcessName] = useState(""); const [processCode, setProcessCode] = useState(""); const [speed, setSpeed] = useState("100"); const [seconds, setSeconds] = useState("8");
  return <div className="grid two">
    <Section title="维护规格组" meta="规格项编码唯一，启用项才可进入配方">
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const previous = state.specGroups.find((group) => group.id === groupId); const id = groupId || `SG-${Date.now()}`; dispatch({ type: "save-spec-group", payload: { id, name: groupName, code: groupCode.trim().toUpperCase(), sort: previous?.sort || state.specGroups.length + 1, options: [{ id: previous?.options[0]?.id || `SO-${Date.now()}`, name: optionName, code: optionCode.trim().toUpperCase(), sort: 1, enabled: true }, ...(previous?.options.slice(1) || [])] } }); }}>
        <label className="field"><span>编辑对象</span><select value={groupId} onChange={(event) => { const id = event.target.value; setGroupId(id); const group = state.specGroups.find((item) => item.id === id); setGroupName(group?.name || ""); setGroupCode(group?.code || ""); setOptionName(group?.options[0]?.name || ""); setOptionCode(group?.options[0]?.code || ""); }}><option value="">新建规格组</option>{state.specGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className="field"><span>规格组名称</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><label className="field"><span>组编码</span><input value={groupCode} onChange={(event) => setGroupCode(event.target.value)} /></label>
        <label className="field"><span>首个规格项</span><input value={optionName} onChange={(event) => setOptionName(event.target.value)} /></label><label className="field"><span>规格项编码</span><input value={optionCode} onChange={(event) => setOptionCode(event.target.value)} /></label>
        <div className="drawer-actions"><button className="text-button" type="submit" disabled={!canManage} title={!canManage ? deniedTitle : ""}>保存规格组</button></div>
      </form>
    </Section>
    <Section title="维护工艺方案" meta="步骤由数组实时计算；仅启用工艺可绑定配方">
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const previous = state.processPlans.find((plan) => plan.id === processId); dispatch({ type: "save-process-plan", payload: { id: processId || `PP-${Date.now()}`, name: processName, code: processCode.trim().toUpperCase(), status: previous?.status || "启用", formulaCombinationCodes: previous?.formulaCombinationCodes || [], steps: [{ order: 1, speed: Number(speed), direction: "正转", seconds: Number(seconds) }, ...(previous?.steps.slice(1) || [])] } }); }}>
        <label className="field"><span>编辑对象</span><select value={processId} onChange={(event) => { const id = event.target.value; setProcessId(id); const plan = state.processPlans.find((item) => item.id === id); setProcessName(plan?.name || ""); setProcessCode(plan?.code || ""); setSpeed(String(plan?.steps[0]?.speed ?? 100)); setSeconds(String(plan?.steps[0]?.seconds ?? 8)); }}><option value="">新建工艺</option>{state.processPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label className="field"><span>工艺名称</span><input value={processName} onChange={(event) => setProcessName(event.target.value)} /></label><label className="field"><span>工艺编码</span><input value={processCode} onChange={(event) => setProcessCode(event.target.value)} /></label>
        <label className="field"><span>转速 rpm</span><input type="number" min="1" value={speed} onChange={(event) => setSpeed(event.target.value)} /></label><label className="field"><span>时长秒</span><input type="number" min="1" value={seconds} onChange={(event) => setSeconds(event.target.value)} /></label>
        <div className="drawer-actions"><button className="text-button" type="submit" disabled={!canManage} title={!canManage ? deniedTitle : ""}>保存工艺</button></div>
      </form>
    </Section>
  </div>;
}

function Drawer({ title, kicker, close, children }: { title: string; kicker: string; close: () => void; children: ReactNode }) {
  return <div className="drawer-scrim" role="presentation" onClick={close}><aside className="action-drawer wide" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="page-kicker">{kicker}</p><h3>{title}</h3></div><button className="text-button" type="button" onClick={close}>取消</button></div>{children}</aside></div>;
}

function TemplateDrawer({ state, dispatch, close }: { state: PageState; dispatch: PageDispatch; close: () => void }) {
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [groupIds, setGroupIds] = useState<string[]>([]);
  return <Drawer title="新建规格模板" kicker="规格与属性" close={close}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "add-spec-template", payload: { name, code, groupIds } }); close(); }}><div className="form-grid"><label className="field"><span>模板名称</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>模板编码</span><input value={code} onChange={(event) => setCode(event.target.value)} required /></label><div className="field full"><span>规格组</span><div className="checkbox-grid">{state.specGroups.map((group) => <label className="checkbox-row" key={group.id}><input type="checkbox" checked={groupIds.includes(group.id)} onChange={(event) => setGroupIds((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} /><span>{group.name}（{group.options.filter((item) => item.enabled).length} 项）</span></label>)}</div></div></div><div className="drawer-actions"><button className="text-button" type="button" onClick={close}>取消</button><button className="text-button primary-action" type="submit">创建模板</button></div></form></Drawer>;
}

function FormulaDrawer({ state, dispatch, close }: { state: PageState; dispatch: PageDispatch; close: () => void }) {
  const [productCode, setProductCode] = useState("TEA-LATTE"); const [productName, setProductName] = useState("招牌茶拿铁"); const [specs, setSpecs] = useState("COLD,NORMAL"); const [scope, setScope] = useState<FormulaScope>("点位"); const [targets, setTargets] = useState(state.points[0]?.id || ""); const [processId, setProcessId] = useState(state.processPlans.find((item) => item.status === "启用")?.id || ""); const [stepText, setStepText] = useState("MAT-TEA,220,ml\nMAT-MILK,80,ml");
  const steps = useMemo(() => stepText.split("\n").map((line) => { const [materialId, amount, unit] = line.split(",").map((item) => item.trim()); return { materialId, amount: Number(amount), unit }; }), [stepText]);
  return <Drawer title="新增配方版本" kicker="执行流程 / 配方" close={close}><div className="policy-strip"><Badge value="冲突检查" /><span>保存时自动计算组合与版本；重叠范围的旧启用配方会停用并清除旧步骤。</span></div><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); const rawTargets = targets.split(/,|，/).map((item) => item.trim()).filter(Boolean); const resolvedTargets = scope === "点位" ? rawTargets.map((target) => state.points.find((point) => point.id === target || point.name === target)?.id || target) : rawTargets; dispatch({ type: "add-formula", payload: { productCode, productName, specCodes: specs.split(","), scope, targets: scope === "全国" ? [] : resolvedTargets, steps, processId: processId || undefined } }); close(); }}><div className="form-grid"><label className="field"><span>商品编码</span><input value={productCode} onChange={(event) => setProductCode(event.target.value)} required /></label><label className="field"><span>商品名称</span><input value={productName} onChange={(event) => setProductName(event.target.value)} required /></label><label className="field full"><span>规格编码（逗号分隔，最多 10 维）</span><input value={specs} onChange={(event) => setSpecs(event.target.value)} required /></label><label className="field"><span>范围类型</span><select value={scope} onChange={(event) => { const next = event.target.value as FormulaScope; setScope(next); setTargets(next === "点位" ? state.points[0]?.id || "" : next === "区域" ? state.points[0]?.region || "" : ""); }}><option>全国</option><option>区域</option><option>点位</option></select></label><label className="field"><span>适用目标（点位 ID / 区域，逗号分隔）</span><input value={targets} disabled={scope === "全国"} onChange={(event) => setTargets(event.target.value)} /></label><label className="field full"><span>启用工艺</span><select value={processId} onChange={(event) => setProcessId(event.target.value)}><option value="">不绑定</option>{state.processPlans.filter((item) => item.status === "启用").map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label className="field full"><span>物料步骤（每行：物料ID,用量,单位）</span><textarea rows={5} value={stepText} onChange={(event) => setStepText(event.target.value)} /></label></div><div className="drawer-actions"><button className="text-button" type="button" onClick={close}>取消</button><button className="text-button primary-action" type="submit">校验并创建版本</button></div></form></Drawer>;
}

function MaterialDrawer({ state, dispatch, close }: { state: PageState; dispatch: PageDispatch; close: () => void }) {
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [unitId, setUnitId] = useState(state.units[0]?.id || ""); const [storageType, setStorageType] = useState<StorageType>("常温"); const [valid, setValid] = useState("480"); const [warning, setWarning] = useState("60"); const [hardware, setHardware] = useState("");
  return <Drawer title="新增资源 / 耗材" kicker="资源主数据" close={close}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "add-material", payload: { code, name, unitId, storageType, compatibleHardware: hardware.split(/,|，/).map((item) => item.trim()).filter(Boolean), defaultValidMinutes: Number(valid), defaultWarningMinutes: Number(warning), calibrationPrecision: 1 } }); close(); }}><div className="form-grid"><label className="field"><span>资源编码</span><input value={code} onChange={(event) => setCode(event.target.value)} required /></label><label className="field"><span>资源名称</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>单位</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{state.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className="field"><span>存储类型</span><select value={storageType} onChange={(event) => setStorageType(event.target.value as StorageType)}>{storageTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field"><span>默认有效分钟（-1 当日）</span><input type="number" min="-1" step="1" value={valid} onChange={(event) => setValid(event.target.value)} /></label><label className="field"><span>提前预警分钟</span><input type="number" min="0" step="1" value={warning} onChange={(event) => setWarning(event.target.value)} /></label><label className="field full"><span>适用硬件（逗号分隔）</span><input value={hardware} onChange={(event) => setHardware(event.target.value)} /></label></div><div className="drawer-actions"><button className="text-button" type="button" onClick={close}>取消</button><button className="text-button primary-action" type="submit">创建资源</button></div></form></Drawer>;
}

export default CatalogResourcesPage;
