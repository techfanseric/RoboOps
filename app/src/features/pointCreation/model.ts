import { getPointFieldTemplate, standardPointKeys, validateFieldValue, type PointFieldValue } from './config';
import type { AppState, Point } from "../../types/core";
import { configReleaseActionPolicy, currentUser, currentUserHasBusinessAccess, filteredBrands, filteredOrganizations, pointVisibleForCurrentUser } from "../../services/operations";

export interface PointCreatePayload {
  name: string; code: string; brand: string; scenario: string; organization_id: string;
  province: string; city: string; area: string; address: string; owner: string; status: string;
  lat: number | null; lng: number | null; channel: string; customFields?: Record<string, PointFieldValue>;
}

/** Compatibility defaults; business field settings are edited through point field templates. */
export const pointCreationConfig = {
  statuses: ["待上线", "筹备中"],
  checks: ["负责人完整", "设备在线", "商品可售", "异常规则", "营业确认"],
  textFields: [
    { key: "name", label: "点位名称", required: true, max: 60, placeholder: "前城中心16楼咖啡" },
    { key: "code", label: "点位编码", required: true, max: 32, placeholder: "M03" },
    { key: "province", label: "省份", required: true, max: 30, placeholder: "广东省" },
    { key: "city", label: "城市", required: true, max: 30, placeholder: "深圳市" },
    { key: "area", label: "区 / 县", required: true, max: 30, placeholder: "南山区" },
    { key: "address", label: "详细地址", required: true, max: 150, placeholder: "前城中心16楼" },
    { key: "owner", label: "点位负责人", required: true, max: 40, placeholder: "点位负责人" },
    { key: "channel", label: "渠道", required: false, max: 60, placeholder: "可选，如小程序、企业园区" },
  ] as const,
};

export function pointCreationAllowed(state: AppState) {
  return currentUserHasBusinessAccess(state) && configReleaseActionPolicy(state).allowed;
}
export function pointOrganizations(state: AppState, brandName: string) {
  const brand = filteredBrands(state).find((item) => item.name === brandName);
  return filteredOrganizations(state).filter((item) => item.tenant === brand?.tenant);
}
export function pointScenarios(state: AppState) {
  return Array.from(new Set(state.templates.map((item) => item.name)));
}
export function blankPointDraft(state: AppState): PointCreatePayload {
  const brand = filteredBrands(state)[0];
  return applyPointDefaults(state, { name: "", code: "", brand: brand?.name || "", scenario: brand?.scenario || pointScenarios(state)[0] || "", organization_id: pointOrganizations(state, brand?.name || "")[0]?.id || "", province: "", city: "", area: "", address: "", owner: "", status: "", lat: null, lng: null, channel: "", customFields: {} });
}

export function validatePointCreation(state: AppState, payload: PointCreatePayload): string[] {
  const errors: string[] = [];
  if (!pointCreationAllowed(state)) errors.push("当前账号没有新增点位权限。");
  const template = getPointFieldTemplate(state, payload.brand, payload.scenario);
  for (const field of template.fields.filter(f=>f.enabled)) {
    const value = standardPointKeys.includes(field.key) ? payload[field.key as keyof PointCreatePayload] : payload.customFields?.[field.key];
    errors.push(...validateFieldValue(field, value as PointFieldValue));
  }
  for (const key of Object.keys(payload.customFields || {})) if (!template.fields.some(f=>f.key===key && !standardPointKeys.includes(key))) errors.push(`未知扩展字段 ${key}。`);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(payload.code.trim())) errors.push("点位编码仅支持字母、数字、下划线及短横线，以字母或数字开头。");
  const duplicate = state.points.some((item) => item.name.trim().toLocaleLowerCase() === payload.name.trim().toLocaleLowerCase() || item.code?.toLocaleLowerCase() === payload.code.trim().toLocaleLowerCase());
  if (duplicate) errors.push("点位名称或编码已存在，请使用唯一值。");
  if (!filteredBrands(state).some((item) => item.name === payload.brand)) errors.push("请选择权限范围内的品牌。");
  if (!pointOrganizations(state, payload.brand).some((item) => item.id === payload.organization_id)) errors.push("所属组织必须与品牌属于同一企业且在权限范围内。");
  if (!pointScenarios(state).includes(payload.scenario)) errors.push("请选择已配置的场景模板。");
  if (!pointCreationConfig.statuses.includes(payload.status)) errors.push("新增点位必须处于待上线或筹备状态，上线需完成检查及审批。");
  const candidate: Point = { id: "new-point", ...payload };
  if (!pointVisibleForCurrentUser(state, candidate) && !pointVisibleForCurrentUser(state, { ...candidate, city: payload.city.replace(/市$/, "") })) errors.push("新点位超出当前账号的品牌或城市数据范围。");
  if ((payload.lat === null) !== (payload.lng === null)) errors.push("纬度和经度需同时填写或同时留空。");
  if (payload.lat !== null && (!Number.isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90)) errors.push("纬度必须在 -90 至 90 之间。");
  if (payload.lng !== null && (!Number.isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180)) errors.push("经度必须在 -180 至 180 之间。");
  return errors;
}

/** Pure helper for the shared app reducer; validates again to prevent UI bypass. */
function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createPoint(state: AppState, rawPayload: PointCreatePayload): AppState {
  const payload = { ...rawPayload };
  for (const key of Object.keys(payload) as (keyof PointCreatePayload)[]) {
    const value = payload[key];
    if (typeof value === "string") Object.assign(payload, { [key]: value.trim() });
  }
  const next = structuredClone(state);
  const errors = validatePointCreation(state, payload);
  const id = `pt-${newId()}`;
  next.auditLogs.unshift({ id: `audit-${newId()}`, time: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }), operator: currentUser(state).name, action: "新增点位", object: errors.length ? payload.code : id, risk: "L2", result: errors.length ? "已拒绝" : "成功", detail: errors.length ? errors.join("；") : `${payload.name} / ${payload.code}；${payload.status}，营业需完成检查并审批` });
  if (errors.length) return next;
  // Disabled fields retain values on historical points, but must not store hidden draft values on new points.
  const fields = getPointFieldTemplate(state, payload.brand, payload.scenario).fields;
  for (const field of fields.filter(field => !field.enabled && standardPointKeys.includes(field.key))) Object.assign(payload, { [field.key]: field.type === 'number' ? null : '' });
  payload.customFields = Object.fromEntries(Object.entries(payload.customFields || {}).filter(([key]) => fields.some(field => field.key === key && field.enabled)));
  next.points.unshift({ id, ...payload });
  next.pointChecks.push(...pointCreationConfig.checks.map((item) => ({ point: payload.name, item, status: item === "负责人完整" && payload.owner.trim() ? "已完成" : "待处理" })));
  next.brands = next.brands.map((item) => item.name === payload.brand ? { ...item, points: item.points + 1 } : item);
  next.organizations = next.organizations.map((item) => item.id === payload.organization_id ? { ...item, points: item.points + 1 } : item);
  // Make the created point visible even when a previous global filter was selected.
  next.filters = { brand: "all", scenario: "all", point: "all" };
  return next;
}

/** Defaults only populate empty draft values; no existing point is migrated. */
export function applyPointDefaults(state: AppState, draft: PointCreatePayload): PointCreatePayload {
  const result = { ...draft, customFields: { ...draft.customFields } };
  for (const f of getPointFieldTemplate(state, draft.brand, draft.scenario).fields.filter(f=>f.enabled)) {
    if (standardPointKeys.includes(f.key)) {
      const value = result[f.key as keyof PointCreatePayload];
      if ((value === '' || value === null) && f.defaultValue !== '' && f.defaultValue !== null) Object.assign(result, { [f.key]: f.defaultValue });
    } else if (result.customFields[f.key] === undefined) result.customFields[f.key] = f.defaultValue;
  }
  return result;
}

/** Refresh automatic defaults on scope change while retaining explicitly entered, visible standard values. */
export function switchPointDraftScope(state: AppState, draft: PointCreatePayload, brand: string, scenario: string, editedKeys: readonly string[]): PointCreatePayload {
  const fields = getPointFieldTemplate(state, brand, scenario).fields;
  const result = { ...draft, brand, scenario, organization_id: brand === draft.brand ? draft.organization_id : pointOrganizations(state, brand)[0]?.id || '', customFields: {} };
  for (const field of fields.filter(field => standardPointKeys.includes(field.key) && !['brand', 'scenario', 'organization_id'].includes(field.key))) {
    if (!field.enabled || !editedKeys.includes(field.key)) Object.assign(result, { [field.key]: field.type === 'number' ? null : '' });
  }
  return applyPointDefaults(state, result);
}
