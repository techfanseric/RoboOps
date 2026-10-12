import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../data/mockData';
import { defaultPointFields, getPointFieldTemplate, savePointFieldTemplate, validateFieldValue, validatePointFieldTemplate } from './config';
import { applyPointDefaults, blankPointDraft, createPoint, switchPointDraftScope, validatePointCreation } from './model';
describe('新增点位字段模板',()=>{
  it('创建页采用配置的筹备中默认状态',()=>{
    const state=createInitialState(), template=getPointFieldTemplate(state,'RoboTea Lab','饮品亭');
    template.fields.find(f=>f.key==='status')!.defaultValue='筹备中';
    expect(blankPointDraft(savePointFieldTemplate(state,template)).status).toBe('筹备中');
  });
  it('切换范围更新自动默认值，保留明确填写的值并清除停用字段',()=>{
    let state=createInitialState();
    const a=getPointFieldTemplate(state,'RoboTea Lab','饮品亭');
    a.fields.find(f=>f.key==='channel')!.defaultValue='企业园区';
    state=savePointFieldTemplate(state,a);
    const b=getPointFieldTemplate(state,'RoboTea Lab','机器人服务站');
    b.fields.find(f=>f.key==='channel')!.defaultValue='展厅';
    b.fields.find(f=>f.key==='status')!.defaultValue='筹备中';
    state=savePointFieldTemplate(state,b);
    const draft={...blankPointDraft(state),name:'实际输入名称'};
    const switched=switchPointDraftScope(state,draft,draft.brand,b.scenario,['name']);
    expect(switched).toMatchObject({name:'实际输入名称',channel:'展厅',status:'筹备中'});
    expect(switchPointDraftScope(state,{...draft,channel:'手工渠道'},draft.brand,b.scenario,['name','channel']).channel).toBe('手工渠道');
    b.fields.find(f=>f.key==='channel')!.enabled=false;
    state=savePointFieldTemplate(state,b);
    expect(switchPointDraftScope(state,draft,draft.brand,b.scenario,['channel']).channel).toBe('');
    const payload={...switched,name:'隐藏字段测试',code:'HIDDEN',province:'广东省',city:'深圳市',area:'南山区',address:'地址',owner:'负责人',channel:'隐藏旧渠道'};
    expect(createPoint(state,payload).points.find(p=>p.name===payload.name)?.channel).toBe('');
  });
  it('界面文本长度配置用于标准和自定义字段校验，编码及资源上限仍保护',()=>{
    const state=createInitialState(),template=getPointFieldTemplate(state,'RoboTea Lab','饮品亭');
    template.fields.find(f=>f.key==='channel')!.max=3;
    template.fields.push({key:'custom_note',label:'备注',type:'text',required:false,enabled:true,defaultValue:'',max:5});
    const next=savePointFieldTemplate(state,template);
    const draft={...blankPointDraft(next),channel:'超过三个字',customFields:{custom_note:'123456'}};
    const errors=validatePointCreation(next,draft).join('；');
    expect(errors).toContain('最多3个字');expect(errors).toContain('最多5个字');
    template.fields.find(f=>f.key==='channel')!.max=1001;
    expect(validatePointFieldTemplate(state,template).join('；')).toContain('1至1000');
    template.fields.find(f=>f.key==='code')!.max=64;
    expect(validatePointFieldTemplate(state,template).join('；')).toContain('32字符');
  });
  it('默认模板与旧数据兼容，品牌场景隔离',()=>{
    const state=createInitialState();
    expect(getPointFieldTemplate(state,'RoboTea Lab','饮品亭').fields).toEqual(defaultPointFields());
    const template=getPointFieldTemplate(state,'RoboTea Lab','饮品亭');
    template.fields.find(f=>f.key==='channel')!.defaultValue='小程序';
    const next=savePointFieldTemplate(state,template);
    expect(next.auditLogs[0].result).toBe('成功');
    expect(applyPointDefaults(next,{...blankPointDraft(next),scenario:'饮品亭'}).channel).toBe('小程序');
    expect(getPointFieldTemplate(next,'RoboTea Lab','冰淇淋亭').fields.find(f=>f.key==='channel')!.defaultValue).toBe('');
    expect(next.points).toEqual(state.points);
  });
  it('支持false、零、日期且拒绝非法日期与数字',()=>{
    const field={key:'custom',label:'测试',enabled:true,required:true,defaultValue:null,type:'boolean' as const};
    expect(validateFieldValue(field,false)).toEqual([]);
    expect(validateFieldValue({...field,type:'number'},0)).toEqual([]);
    expect(validateFieldValue({...field,type:'date'},'2026-02-30')).not.toEqual([]);
    expect(validateFieldValue({...field,type:'date'},'invalid')).not.toEqual([]);
    expect(validateFieldValue({...field,type:'number'},NaN)).not.toEqual([]);
  });
  it('配置不可删除编码、取消城市必填、关闭坐标或使用保留编码',()=>{
    const state=createInitialState(),template=getPointFieldTemplate(state,'RoboTea Lab','饮品亭');
    for(const key of ['code','city','lat']){
      const altered=structuredClone(template);altered.fields.find(f=>f.key===key)!.enabled=false;
      expect(validatePointFieldTemplate(state,altered).length).toBeGreaterThan(0);
    }
    template.fields.push({key:'constructor',label:'保留key',type:'text',required:false,enabled:true,defaultValue:''});
    expect(validatePointFieldTemplate(state,template).length).toBeGreaterThan(0);
  });
  it('可停用负责人字段，新点位负责人上线检查保持待处理',()=>{
    const state=createInitialState(),template=getPointFieldTemplate(state,'RoboTea Lab','饮品亭');
    template.fields.find(f=>f.key==='owner')!.enabled=false;
    const next=savePointFieldTemplate(state,template);
    const payload={...blankPointDraft(next),scenario:'饮品亭',name:'无负责人点位',code:'NOOWNER',province:'广东省',city:'深圳市',area:'南山区',address:'前城中心'};
    const created=createPoint(next,payload);
    expect(created.auditLogs[0].result).toBe('成功');
    expect(created.pointChecks.find(c=>c.point===payload.name&&c.item==='负责人完整')?.status).toBe('待处理');
  });
});
