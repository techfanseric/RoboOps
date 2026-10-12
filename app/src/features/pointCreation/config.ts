import type { AppState } from '../../types/core';
import { currentUser, filteredBrands } from '../../services/operations';
import { pointCreationAllowed, pointCreationConfig, pointScenarios } from './model';
export type PointFieldValue = string | number | boolean | null;
export type PointFieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';
export interface PointFieldDefinition { key: string; label: string; type: PointFieldType; required: boolean; enabled: boolean; defaultValue: PointFieldValue; options?: { value: string; label: string; enabled: boolean }[]; max?: number; }
export interface PointFieldTemplate { id: string; brandId: string; scenario: string; fields: PointFieldDefinition[]; }
export const protectedPointFields = ['name', 'code', 'brand', 'scenario', 'organization_id', 'city', 'status', 'lat', 'lng'];
export const standardPointKeys = ['name','code','province','city','area','address','owner','channel','brand','scenario','organization_id','status','lat','lng'];
export const POINT_TEXT_RESOURCE_MAX = 1000;
export function defaultPointFields(): PointFieldDefinition[] {
  const text = pointCreationConfig.textFields.map(f => ({ key: f.key, label: f.label, type: 'text' as const, required: f.required, enabled: true, defaultValue: '', max: f.max }));
  return [...text.slice(0,2), ...['brand','scenario','organization_id','status'].map((key,index) => ({key,label:['品牌','场景模板','所属组织','初始状态'][index],type:'select' as const,required:true,enabled:true,defaultValue:key === 'status' ? '待上线' : ''})), ...text.slice(2), ...['lat','lng'].map((key,index)=>({key,label:index === 0 ? '纬度' : '经度',type:'number' as const,required:false,enabled:true,defaultValue:null}))];
}
export function getPointFieldTemplate(state: AppState, brand: string, scenario: string): PointFieldTemplate {
  const brandId = filteredBrands(state).find(b=>b.name===brand)?.id || '';
  return structuredClone(state.pointFieldTemplates?.find(t=>t.brandId===brandId && t.scenario===scenario) || {id:`${brandId}:${scenario}`,brandId,scenario,fields:defaultPointFields()});
}
export function validateFieldValue(field: PointFieldDefinition, value: PointFieldValue | undefined): string[] {
  const empty = value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim());
  if (empty) return field.required ? [`请填写${field.label}。`] : [];
  if (field.type === 'text' && (typeof value !== 'string' || Array.from(value).length > (field.max || 200))) return [`${field.label}须为文本且最多${field.max || 200}个字。`];
  if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return [`${field.label}须为有效数字。`];
  if (field.type === 'boolean' && typeof value !== 'boolean') return [`${field.label}须选择是或否。`];
  if (field.type === 'date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || (typeof value === 'string' && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value))) return [`${field.label}须为有效日期。`];
  if (field.type === 'select' && field.options && !field.options.some(o=>o.enabled && o.value===value)) return [`请选择${field.label}的启用选项。`];
  return [];
}
export function validatePointFieldTemplate(state: AppState, template: PointFieldTemplate): string[] {
  const errors: string[] = [];
  if (!pointCreationAllowed(state) || !filteredBrands(state).some(b=>b.id===template.brandId)) errors.push('没有该品牌的字段配置权限。');
  if (!pointScenarios(state).includes(template.scenario)) errors.push('请选择已有场景模板。');
  if (!Array.isArray(template.fields) || template.fields.length > 60) return [...errors, '字段数量须不超过60个。'];
  const keys = new Set<string>();
  const baseline = defaultPointFields();
  for (const f of template.fields) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(f.key) || keys.has(f.key) || ['__proto__','constructor','prototype'].includes(f.key)) errors.push('字段编码须唯一且使用字母、数字、下划线。');
    keys.add(f.key);
    if (!f.label.trim() || f.label.length > 40) errors.push('字段展示名须为1至40个字。');
    if (!['text','number','select','date','boolean'].includes(f.type)) errors.push('字段类型无效。');
    const base = baseline.find(b=>b.key===f.key);
    if (base && f.type !== base.type) errors.push(`${base.label}的基础类型不可变更。`);
    if (protectedPointFields.includes(f.key) && (!f.enabled || f.required !== base?.required)) errors.push(`${base?.label}的必填及显示约束不可修改。`);
    if (f.type === 'text' && f.max !== undefined && (!Number.isInteger(f.max) || f.max < 1 || f.max > POINT_TEXT_RESOURCE_MAX)) errors.push(`${f.label}的文本长度须为1至${POINT_TEXT_RESOURCE_MAX}个字。`);
    if (f.key === 'code' && f.max !== 32) errors.push('点位编码的32字符格式约束不可修改。');
    if (f.options) {
      const values = f.options.map(o=>o.value);
      if (values.some(v=>!v || v.length>64) || new Set(values).size!==values.length || f.options.some(o=>!o.label.trim())) errors.push(`${f.label}的选项编码须唯一，名称不能为空。`);
    }
    if (!base && f.enabled && f.type === 'select' && !f.options?.some(o=>o.enabled)) errors.push(`${f.label}至少需要一个启用选项。`);
    if (f.defaultValue !== '' && f.defaultValue !== null) errors.push(...validateFieldValue({...f,required:false},f.defaultValue));
    if (['name','code','brand','scenario','organization_id','lat','lng'].includes(f.key) && f.defaultValue !== '' && f.defaultValue !== null) errors.push(`${f.label}不能设置默认值。`);
    if (f.key==='status' && !pointCreationConfig.statuses.includes(String(f.defaultValue))) errors.push('初始状态默认值须为待上线或筹备中。');
  }
  for (const key of standardPointKeys) if (!keys.has(key)) errors.push(`基础字段 ${key} 不可移除，请使用显示开关。`);
  const existing = state.pointFieldTemplates?.find(t=>t.brandId===template.brandId && t.scenario===template.scenario);
  for (const field of existing?.fields || []) {
    const updated = template.fields.find(f=>f.key===field.key);
    if (!updated) errors.push(`${field.label}不可删除，请停用以保留历史值。`);
    else if (updated.type!==field.type) errors.push(`${field.label}类型不可改变；请新增字段并停用旧字段。`);
    else if (field.options?.some(o=>!updated.options?.some(n=>n.value===o.value))) errors.push(`${field.label}的选项编码不可删除，请停用选项。`);
  }
  return errors;
}
export function savePointFieldTemplate(state: AppState, template: PointFieldTemplate): AppState {
  const next = structuredClone(state), errors = validatePointFieldTemplate(state,template);
  next.auditLogs.unshift({id:`audit-${crypto.randomUUID()}`,time:new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}),operator:currentUser(state).name,action:'配置新增点位字段',object:template.brandId,risk:'L2',result:errors.length?'已拒绝':'成功',detail:errors.length?errors.join('；'):`品牌 ${template.brandId} / ${template.scenario}；仅影响后续新建，历史点位值保留`});
  if (!errors.length) next.pointFieldTemplates = [...(next.pointFieldTemplates || []).filter(t=>t.brandId!==template.brandId || t.scenario!==template.scenario),structuredClone({...template,id:`${template.brandId}:${template.scenario}`})];
  return next;
}
