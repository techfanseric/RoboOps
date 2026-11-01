import { useState, type Dispatch } from 'react';
import { MapPin, Plus } from 'lucide-react';
import type { AppState } from '../../types/core';
import { filteredBrands, type AppAction } from '../../services/operations';
import { blankPointDraft, pointCreationConfig, pointOrganizations, pointScenarios, switchPointDraftScope, validatePointCreation, type PointCreatePayload } from './model';
import { getPointFieldTemplate, standardPointKeys, type PointFieldValue } from './config';
import './pointCreation.css';
export function PointCreateDrawer({ state, dispatch, onClose, onCreated }: {state:AppState;dispatch:Dispatch<AppAction>;onClose:()=>void;onCreated:()=>void}) {
  const [draft,setDraft] = useState(()=>blankPointDraft(state));
  const [attempted,setAttempted] = useState(false);
  const [editedKeys,setEditedKeys] = useState<string[]>([]);
  const fields = getPointFieldTemplate(state,draft.brand,draft.scenario).fields.filter(f=>f.enabled);
  const errors = validatePointCreation(state,draft);
  function change(key:string,value:PointFieldValue) {
    if (key === 'brand') {
      const brand = filteredBrands(state).find(b=>b.name===value);
      setDraft(switchPointDraftScope(state,draft,String(value),brand?.scenario || pointScenarios(state)[0] || '',editedKeys));
    } else if (key==='scenario') setDraft(switchPointDraftScope(state,draft,draft.brand,String(value),editedKeys));
    else if (standardPointKeys.includes(key)) {setEditedKeys(keys=>keys.includes(key)?keys:[...keys,key]);setDraft({...draft,[key]:value});}
    else setDraft({...draft,customFields:{...draft.customFields,[key]:value}});
  }
  return <div className="drawer-scrim" onClick={onClose}><aside className="action-drawer wide point-create-drawer" role="dialog" aria-modal="true" aria-labelledby="point-create-title" onClick={e=>e.stopPropagation()}>
    <div className="drawer-head"><div><p className="page-kicker">点位管理 / 新增点位</p><h3 id="point-create-title"><MapPin size={24}/>新增点位</h3></div><button className="text-button" onClick={onClose}>取消</button></div>
    <div className="policy-strip">字段按当前品牌与场景配置。新点位以待上线 / 筹备状态保存，上线沿用检查及审批。</div>
    <form className="drawer-form" noValidate onSubmit={e=>{e.preventDefault();setAttempted(true);if(errors.length)return;dispatch({type:'create-point',payload:draft});onCreated();onClose();}}><div className="form-grid">
      {fields.map(f=>{
        const value = standardPointKeys.includes(f.key) ? draft[f.key as keyof PointCreatePayload] as PointFieldValue : draft.customFields?.[f.key];
        let options = f.options?.filter(o=>o.enabled) || [];
        if(f.key==='brand') options=filteredBrands(state).map(b=>({value:b.name,label:b.name,enabled:true}));
        if(f.key==='scenario') options=pointScenarios(state).map(s=>({value:s,label:s,enabled:true}));
        if(f.key==='organization_id') options=pointOrganizations(state,draft.brand).map(o=>({value:o.id,label:o.name,enabled:true}));
        if(f.key==='status') options=pointCreationConfig.statuses.map(s=>({value:s,label:s,enabled:true}));
        return <label className={`field ${f.key==='address'?'full':''}`} key={f.key}><span>{f.label}{f.required?' *':''}</span>
          {f.type==='select'?<select value={String(value??'')} onChange={e=>change(f.key,e.target.value)}><option value="">请选择</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:
           f.type==='boolean'?<select value={value===true?'true':value===false?'false':''} onChange={e=>change(f.key,e.target.value===''?null:e.target.value==='true')}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>:
           <input type={f.type==='date'?'date':f.type==='number'?'number':'text'} onWheel={e=>{if(f.type==='number')e.currentTarget.blur();}} step={f.type==='number'?'any':undefined} autoFocus={f.key==='name'} value={String(value??'')} maxLength={f.max || 200} onChange={e=>change(f.key,f.type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value)}/>}
          {f.key==='organization_id'?<small>该品牌所属企业内的可用组织</small>:null}{f.key==='lat'?<small>-90 至 90；与经度同时填写</small>:null}{f.key==='lng'?<small>-180 至 180；与纬度同时填写</small>:null}
        </label>;
      })}
    </div>{attempted&&errors.length?<div className="point-create-errors" role="alert"><strong>请检查以下信息</strong><ul>{errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>:null}<div className="drawer-actions"><button type="button" className="text-button" onClick={onClose}>取消</button><button className="text-button primary-action"><Plus className="lucide-icon"/>保存点位</button></div></form>
  </aside></div>;
}
