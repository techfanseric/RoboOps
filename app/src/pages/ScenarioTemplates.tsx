import { CircleAlert, FilePenLine, Send } from "lucide-react";
import type { Dispatch } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { staticData } from "../data/mockData";
import { configReleaseActionPolicy, releaseVisibleForCurrentUser, templateVisibleForCurrentUser, type AppAction } from "../services/operations";
import type { AppState, ScenarioTemplate } from "../types/core";
import { Badge, DataTable, DefinitionList, DetailLink, EmptyState, NameCell, Section } from "../components/ui";

export function ScenarioTemplates({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [editing, setEditing] = useState<ScenarioTemplate | null>(null);
  const releasePolicy = configReleaseActionPolicy(state);
  const templates = state.templates.filter((template) => templateVisibleForCurrentUser(state, template.id));
  const visibleChanges = state.templateChanges.filter((change) => templates.some((template) => template.id === change.templateId) && releaseVisibleForCurrentUser(state, change.release));

  return (
    <>
      <div className="note-box template-status-link">
        <div><strong>状态与异常已集中配置</strong><span>场景模板继续描述业务对象；结构化状态、异常触发、SLA、发布与逐设备结果统一进入状态与异常中心。</span></div>
        <Link className="text-button" to="/incidents"><CircleAlert className="lucide-icon" /> 打开状态与异常中心</Link>
      </div>
      <div className="grid two">
        {templates.map((template) => (
          <Section
            title={template.name}
            meta={template.objectName}
            key={template.id}
            action={
              <button className="text-button primary-action" type="button" disabled={!releasePolicy.allowed} title={releasePolicy.message} aria-label={`申请${template.name}模板变更`} onClick={() => setEditing(template)}>
                <FilePenLine className="lucide-icon" /> 申请变更
              </button>
            }
          >
            <DefinitionList
              rows={[
                ["字段", template.fields.map((item) => <Badge key={item} value={item} tone="neutral" />)],
                ["状态", template.states.map((item) => <Badge key={item} value={item} tone="info" />)],
                ["异常", template.exceptions.map((item) => <Badge key={item} value={item} tone={item.includes("失败") || item.includes("中断") ? "bad" : "warn"} />)],
                ["责任角色", template.roles.map((item) => <Badge key={item} value={item} tone="neutral" />)],
              ]}
            />
          </Section>
        ))}
        {!templates.length ? <EmptyState>当前账号的数据范围内暂无场景模板</EmptyState> : null}
      </div>

      <Section title="待发布模板变更" meta="字段、状态、异常和责任角色通过配置发布生效">
        {visibleChanges.length ? (
          <DataTable
            headers={["发布", "模板", "状态", "原因", "详情"]}
            rows={visibleChanges.map((change) => [
              <NameCell primary={change.release} secondary={change.afterTemplate.objectName} />,
              change.afterTemplate.name,
              <Badge value={change.status} />,
              change.reason,
              <DetailLink to={`/releases/${change.release}`} title={`打开${change.release}详情`} />,
            ])}
          />
        ) : (
          <EmptyState>当前范围暂无待发布模板变更</EmptyState>
        )}
      </Section>

      <div className="grid two">
        <Section title="模板状态摘要" meta="不同场景的履约对象、状态和处理角色">
          <DataTable headers={["模板", "业务对象", "状态", "异常", "责任角色"]} rows={templates.map((template) => [<NameCell primary={template.name} secondary={template.id} />, template.objectName, template.states.join("、"), template.exceptions.join("、"), template.roles.join("、")])} />
        </Section>
        <Section title="异常分派规则" meta="异常类型、处理角色和 SLA">
          <DataTable headers={["异常类型", "处理角色", "升级对象", "SLA"]} rows={staticData.incidentRoutingRules.map((rule) => [rule.type, rule.owner, rule.escalation, rule.sla])} />
        </Section>
      </div>

      {editing ? <TemplateChangeDrawer state={state} template={editing} dispatch={dispatch} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function splitList(value: string) {
  return value.split(/\n|、|,/).map((item) => item.trim()).filter(Boolean);
}

function TemplateChangeDrawer({ state, template, dispatch, onClose }: { state: AppState; template: ScenarioTemplate; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const policy = configReleaseActionPolicy(state);
  const [objectName, setObjectName] = useState(template.objectName);
  const [fields, setFields] = useState(template.fields.join("\n"));
  const [states, setStates] = useState(template.states.join("\n"));
  const [exceptions, setExceptions] = useState(template.exceptions.join("\n"));
  const [roles, setRoles] = useState(template.roles.join("\n"));
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && [objectName, fields, states, exceptions, roles, reason].every((value) => value.trim().length > 0);

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="template-change-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{template.id}</p>
            <h3 id="template-change-title">申请场景模板变更</h3>
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
              type: "submit-template-change",
              payload: {
                templateId: template.id,
                objectName,
                fields: splitList(fields),
                states: splitList(states),
                exceptions: splitList(exceptions),
                roles: splitList(roles),
                reason,
              },
            });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>业务对象</span>
              <input value={objectName} onChange={(event) => setObjectName(event.target.value)} />
            </label>
            <label className="field">
              <span>模板名称</span>
              <input value={template.name} disabled />
            </label>
            <label className="field full">
              <span>字段</span>
              <textarea value={fields} onChange={(event) => setFields(event.target.value)} rows={4} />
            </label>
            <label className="field full">
              <span>履约状态</span>
              <textarea value={states} onChange={(event) => setStates(event.target.value)} rows={4} />
            </label>
            <label className="field full">
              <span>异常类型</span>
              <textarea value={exceptions} onChange={(event) => setExceptions(event.target.value)} rows={4} />
            </label>
            <label className="field full">
              <span>责任角色</span>
              <textarea value={roles} onChange={(event) => setRoles(event.target.value)} rows={3} />
            </label>
            <label className="field full">
              <span>变更原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明为什么调整模板、影响哪些点位或请求、审批人需要核对什么" rows={4} />
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
