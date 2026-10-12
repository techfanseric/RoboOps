import { useState, type Dispatch } from 'react';
import type { AppState } from '../../types/core';
import { configReleaseActionPolicy, filteredBrands, type AppAction } from '../../services/operations';
import { defaultProductTemplate, productTemplatesForBrand, validateGroups, validateRules } from './domain';
import { ProductRuleFields, SpecificationFields } from './SpecificationFields';
import type { ProductTemplate } from './types';
import './business-config.css';
export function ProductTemplateEditor({ state, dispatch, onClose }: { state: AppState; dispatch: Dispatch<AppAction>; onClose: (message?: string) => void }) {
 const brands = filteredBrands(state).filter(brand => state.filters.brand === 'all' || state.filters.brand === brand.name);
 const [brand, setBrand] = useState(brands[0]?.name || '');
 const [draft, setDraft] = useState<ProductTemplate>(() => ({ ...defaultProductTemplate(brands[0]?.name || ''), id: `template-${crypto.randomUUID()}`, name: '新饮品模板' }));
 const [reason, setReason] = useState(''); const [error, setError] = useState('');
 const policy = configReleaseActionPolicy(state);
 const templates = productTemplatesForBrand(state, brand);
 return <div className="drawer-scrim" onClick={() => onClose()}><aside className="action-drawer wide business-config-drawer" role="dialog" aria-modal="true" aria-label="商品规格与计价配置" onClick={event => event.stopPropagation()}><div className="drawer-head"><h3>商品规格与计价配置</h3><button className="text-button" onClick={() => onClose()}>关闭</button></div><form className="drawer-form" onSubmit={event => { event.preventDefault(); const errors = [...validateRules(draft.rules), ...validateGroups(draft.optionGroups)]; if (!draft.name.trim() || !reason.trim()) errors.push('请填写模板名称和变更原因'); if (!policy.allowed) errors.push(policy.message); if (errors.length) { setError(errors.join('；')); return; } dispatch({ type: 'product-template-save', payload: { template: draft, reason } }); onClose('商品规格模板已保存；已有商品保持原配置'); }}>
 <p className="product-help">模板按品牌保存，新商品使用启用的品牌默认模板；其他模板在商品编辑时明确应用。模板更新不会修改已有商品或价格。默认饮品模板可按品牌编辑保存，也可复制为独立模板。</p>
 {error && <div role="alert" className="product-errors">{error}</div>}
 <div className="form-grid"><label className="field"><span>模板所属品牌</span><select aria-label="模板所属品牌" value={brand} onChange={event => { setBrand(event.target.value); setDraft({ ...defaultProductTemplate(event.target.value), id: `template-${crypto.randomUUID()}`, name: '新规格模板' }); }}>{brands.map(row => <option key={row.id}>{row.name}</option>)}</select></label><label className="field"><span>已有模板</span><select aria-label="选择规格模板编辑" value={templates.some(template => template.id === draft.id) ? draft.id : ''} onChange={event => { const template = templates.find(row => row.id === event.target.value); if (template) setDraft(structuredClone(template)); }}><option value="">新模板 / 默认模板副本</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}{!template.enabled ? '（停用）' : ''}</option>)}</select></label><label className="field"><span>模板名称</span><input aria-label="模板名称" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label className="checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/>模板启用</label></div>
 <h4>规格和计价维度</h4><SpecificationFields groups={draft.optionGroups} onChange={optionGroups => setDraft({ ...draft, optionGroups })}/><h4>基础信息规则</h4><ProductRuleFields rules={draft.rules} onChange={rules => setDraft({ ...draft, rules })}/><label className="field"><span>变更原因</span><textarea aria-label="模板变更原因" value={reason} onChange={event => setReason(event.target.value)}/></label><div className="drawer-actions"><button type="button" className="text-button" onClick={() => setDraft({ ...structuredClone(draft), id: `template-${crypto.randomUUID()}`, name: `${draft.name}副本` })}>复制为新模板</button><button className="text-button primary-action" disabled={!policy.allowed}>保存规格模板</button></div>
 </form></aside></div>;
}
