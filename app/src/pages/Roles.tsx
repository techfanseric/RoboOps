import { Ban, Clock3, ListPlus, MailPlus, ShieldCheck, UserPlus } from "lucide-react";
import type { Dispatch } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { staticData } from "../data/mockData";
import { navItems } from "../components/AppShell";
import { ScopeSelector, firstScopeSelection, resolveScopeSelection, scopeTypeLabel } from "../components/ScopeSelector";
import {
  actionPermissionMatrix,
  approvalVisibleForCurrentUser,
  auditLogVisibleForCurrentUser,
  currentUser,
  currentUserPermissionPackages,
  currentUserRoles,
  currentUserScopes,
  currentUserTeamAssignments,
  filteredTenants,
  menuAccessPolicy,
  roleAssignmentActionPolicy,
  teamActivationSummary,
  userInvitationPolicy,
  userInvitationVisibleForCurrentUser,
  type AppAction,
} from "../services/operations";
import type { AppState, ScopeSelection, TeamAssignment, TeamSettings } from "../types/core";
import { Badge, DataTable, EmptyState, NameCell, Section } from "../components/ui";
import { ApprovalActions, TeamRecommendationTable } from "./sharedViews";

type RoleViewId = "current" | "users" | "team" | "policies" | "audit";

const roleViews: Array<{ id: RoleViewId; label: string }> = [
  { id: "current", label: "当前权限" },
  { id: "users", label: "账号" },
  { id: "team", label: "团队" },
  { id: "policies", label: "策略" },
  { id: "audit", label: "审批与日志" },
];

export function Roles({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [activating, setActivating] = useState<TeamAssignment | null>(null);
  const [lifecycle, setLifecycle] = useState<{ assignment: TeamAssignment; action: "review" | "revoke" } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [activeView, setActiveView] = useState<RoleViewId>("current");
  const visibleApprovals = state.approvalRequests
    .filter((approval) => approvalVisibleForCurrentUser(state, approval))
    .sort((left, right) => Number(right.status === "待审批") - Number(left.status === "待审批"));
  const visibleAuditLogs = state.auditLogs.filter((log) => auditLogVisibleForCurrentUser(state, log)).slice(0, 8);
  const summary = teamActivationSummary(state);
  const user = currentUser(state);
  const currentAssignments = currentUserTeamAssignments(state);
  const effectiveRoles = currentUserRoles(state);
  const effectivePackages = currentUserPermissionPackages(state);
  const invitationPolicy = userInvitationPolicy(state);
  const visibleAccounts = state.users.filter((account) => accountVisibleForCurrentUser(state, account.id, invitationPolicy.allowed));
  const visibleInvitations = state.userInvitations.filter((invitation) => userInvitationVisibleForCurrentUser(state, invitation));
  const actionRows = actionPermissionMatrix(state).map((row) => [
    row.module,
    row.action,
    <Badge value={row.risk} />,
    <Badge value={row.status} />,
    row.source,
    row.reason,
  ]);
  const menuRows = navItems.map((item) => {
    const access = menuAccessPolicy(state, item.id);
    return [<NameCell primary={item.label} secondary={access.permission} />, <Badge value={access.allowed ? "可访问" : "已拒绝"} />, access.source, access.reason];
  });
  const accountRows = visibleAccounts.map((account) => {
    const accountState = { ...state, currentUserId: account.id, filters: { brand: "all", scenario: "all", point: "all" } };
    const effectiveProfile = accountEffectiveProfile(accountState, account.id);
    const visibleMenus = navItems.filter((item) => menuAccessPolicy(accountState, item.id).allowed);
    return [
      <NameCell primary={account.name} secondary={`${account.id} / ${account.status}`} />,
      effectiveProfile.role,
      effectiveProfile.scope,
      roleLoginScenario(effectiveProfile.primaryRole),
      <span className="badge-row">{visibleMenus.map((item) => <Badge key={item.id} value={item.label} tone="neutral" />)}</span>,
      account.id === state.currentUserId ? <Badge value="当前登录" /> : <Badge value={account.status} />,
    ];
  });
  return (
    <>
      <div className="section-tabs" role="tablist" aria-label="角色权限分组">
        {roleViews.map((view) => (
          <button
            className={activeView === view.id ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={activeView === view.id}
            key={view.id}
            onClick={() => setActiveView(view.id)}
          >
            {view.label}
          </button>
        ))}
        {effectiveRoles.includes("平台支持") ? <Link className="tab-link" to="/roles/platform">平台管理</Link> : null}
      </div>

      {activeView === "current" ? (
        <>
          <Section title="当前账号权限来源" meta={`${user.name} / ${user.role} / ${user.scope}`}>
            <DataTable
              headers={["来源", "角色", "数据范围", "权限包", "状态"]}
              rows={[
                [<NameCell primary={user.name} secondary="账号基础角色" />, user.role, user.scope, effectivePackages.map((pkg) => <Badge key={pkg} value={pkg} tone="neutral" />), <Badge value="启用" />],
                ...currentAssignments.map((assignment) => [<NameCell primary={assignment.assigneeName || "-"} secondary={assignment.id} />, assignment.role, assignment.scope, assignment.packageSummary, <Badge value={assignment.status} />]),
              ]}
            />
          </Section>
          <Section title="当前账号菜单授权" meta={`有效角色：${effectiveRoles.join("、")}`}>
            <DataTable headers={["菜单", "状态", "授权来源", "判定说明"]} rows={menuRows} />
          </Section>
          <Section title="当前账号动作权限" meta="查看、编辑、审批、导出和危险动作分开判定">
            <DataTable headers={["模块", "动作", "风险", "状态", "来源", "判定说明"]} rows={actionRows} />
          </Section>
        </>
      ) : null}

      {activeView === "users" ? (
        <>
          <Section title="登录账号与职责" meta={invitationPolicy.allowed ? "管理员按数据范围查看账号职责和菜单授权" : "当前账号仅显示自己的登录态、职责和菜单授权"}>
            <DataTable headers={["账号", "角色", "数据范围", "工作重点", "可见菜单", "状态"]} rows={accountRows} />
          </Section>
          <Section
            title="用户管理"
            meta={invitationPolicy.allowed ? "账号状态、角色绑定和数据范围" : "当前账号没有用户邀请和授权管理权限"}
            action={
              <button className="text-button primary-action" type="button" disabled={!invitationPolicy.allowed} title={invitationPolicy.message} onClick={() => setInviting(true)}>
                <MailPlus className="lucide-icon" /> 邀请用户
              </button>
            }
          >
            <DataTable
              headers={["用户", "角色", "数据范围", "状态", "最近登录"]}
              rows={visibleAccounts.map((account) => {
                const effectiveProfile = accountEffectiveProfile({ ...state, currentUserId: account.id, filters: { brand: "all", scenario: "all", point: "all" } }, account.id);
                return [<NameCell primary={account.name} secondary={account.id} />, effectiveProfile.role, effectiveProfile.scope, <Badge value={account.status} />, account.login];
              })}
            />
          </Section>
          <Section title="用户邀请" meta="接受后再进入角色实例绑定和审批">
            {visibleInvitations.length ? (
              <DataTable
                headers={["邀请", "租户/客户", "角色", "数据范围", "状态", "有效期", "发起人"]}
                rows={visibleInvitations.map((invitation) => [
                  <NameCell primary={invitation.name} secondary={invitation.email} />,
                  invitation.tenant,
                  invitation.role,
                  invitation.scope,
                  <Badge value={invitation.status} />,
                  invitation.expiresAt,
                  invitation.invitedBy,
                ])}
              />
            ) : (
              <EmptyState>当前范围暂无待接受邀请</EmptyState>
            )}
          </Section>
        </>
      ) : null}

      {activeView === "team" ? (
        <>
          <div className="grid two">
            <Section
              title="团队搭建"
              meta="经营模式、点位规模和人员能力"
              action={<button className="text-button primary-action" type="button" onClick={() => dispatch({ type: "apply-team-template" })}><ListPlus className="lucide-icon" /> 生成角色草案</button>}
            >
              <div className="form-grid">
                <SelectField label="经营模式" value={state.team.mode} options={["客户自营", "平台代运营", "联合运营", "区域代理"]} onChange={(value) => dispatch({ type: "set-team", key: "mode", value })} />
                <SelectField label="点位规模" value={state.team.scale} options={["1-3 点位", "3-20 点位", "20-50 点位", "50+ 点位"]} onChange={(value) => dispatch({ type: "set-team", key: "scale", value })} />
                <SelectField label="区域范围" value={state.team.coverage} options={["单城市", "多城市", "跨区域"]} onChange={(value) => dispatch({ type: "set-team", key: "coverage", value })} />
                <SelectField label="人员能力" value={state.team.service} options={["客服和设备自有，现场外包", "客服自有，设备外包", "平台代管客服和运维", "客户自有完整团队"]} onChange={(value) => dispatch({ type: "set-team", key: "service", value })} />
              </div>
            </Section>
            <Section title="推荐配置" meta="角色、数据范围和待补齐职责">
              <TeamRecommendationTable state={state} />
            </Section>
          </div>
          <Section
            title="角色实例"
            meta={state.teamAppliedAt ? `已启用 ${summary.active}/${summary.total}，由团队搭建向导生成于 ${state.teamAppliedAt}` : "生成后用于绑定账号、数据范围和权限包"}
            action={<Badge value={summary.status} />}
          >
            {state.teamAssignments.length ? (
              <DataTable
                headers={["角色实例", "账号", "数据范围", "权限包", "有效期", "复核", "状态", "动作"]}
                rows={state.teamAssignments.map((item) => [
                  <NameCell primary={item.role} secondary={item.id} />,
                  item.assigneeName ? <NameCell primary={item.assigneeName} secondary={item.assigneeId || item.owner} /> : <NameCell primary="待绑定账号" secondary={`建议承担方：${item.owner}`} />,
                  item.scopeRef ? <NameCell primary={item.scopeRef.value} secondary={scopeTypeLabel(item.scopeRef.type)} /> : <NameCell primary="待选择范围" secondary={`建议范围：${item.scope}`} />,
                  item.permissionPackages?.map((pkg) => <Badge key={pkg} value={pkg} tone="neutral" />) || item.packageSummary,
                  item.expiresAt || "-",
                  item.reviewAt ? <NameCell primary={item.reviewAt} secondary={item.lastReviewedAt ? `上次 ${item.lastReviewedAt}` : "等待首次复核"} /> : "-",
                  <Badge value={assignmentLifecycleStatus(item)} />,
                  <TeamAssignmentRowActions state={state} assignment={item} onConfigure={setActivating} onLifecycle={setLifecycle} />,
                ])}
              />
            ) : (
              <EmptyState>尚未生成角色实例</EmptyState>
            )}
          </Section>
        </>
      ) : null}

      {activeView === "policies" ? (
        <>
          <Section title="角色模板" meta="权限包、数据范围和审批策略">
            <DataTable headers={["角色", "数据范围", "权限包", "风险控制"]} rows={staticData.roles.map((role) => [<NameCell primary={role.name} secondary="模板" />, role.scope, role.packages.map((item) => <Badge key={item} value={item} tone="neutral" />), role.risk])} />
          </Section>
          <div className="grid two">
            <Section title="权限包" meta="动作范围、风险等级和授权边界">
              <DataTable headers={["权限包", "风险", "动作"]} rows={staticData.permissionPackages.map((pkg) => [pkg.name, <Badge value={pkg.risk} />, pkg.actions])} />
            </Section>
            <Section title="审批策略" meta="退款、配置发布和设备命令">
              <DataTable headers={["动作", "审批人", "规则"]} rows={staticData.approvalPolicies.map((policy) => [policy.action, policy.approver, policy.rule])} />
            </Section>
          </div>
          <Section title="权限风险" meta="需要复核的授权组合">
            <div className="risk-list">
              <div className="risk-item">客服/售后可发起退款，退款审批由独立审批人完成。</div>
              <div className="risk-item">设备高风险命令需要二次确认和操作日志。</div>
              <div className="risk-item">外部供应商只能访问对应点位、设备或工单。</div>
              <div className="risk-item">每类异常必须配置默认负责人和升级对象。</div>
            </div>
          </Section>
        </>
      ) : null}

      {activeView === "audit" ? (
        <>
          <Section title="审批队列" meta="退款、配置发布和高风险关闭动作">
            <DataTable headers={["时间", "动作", "对象", "发起人", "审批人", "状态", "处理"]} rows={visibleApprovals.map((approval) => [approval.time, approval.action, approval.target, approval.requester, approval.approver, <Badge value={approval.status} />, <ApprovalActions state={state} approval={approval} dispatch={dispatch} />])} />
          </Section>
          <Section title="操作日志" meta="关键动作、权限变更和高风险记录">
            <DataTable headers={["时间", "操作人", "动作", "对象", "风险", "结果", "说明"]} rows={visibleAuditLogs.map((log) => [log.time, log.operator, log.action, log.object, <Badge value={log.risk} />, <Badge value={log.result} />, log.detail || "-"])} />
          </Section>
        </>
      ) : null}

      {activating ? <TeamAssignmentDrawer state={state} assignment={activating} dispatch={dispatch} onClose={() => setActivating(null)} /> : null}
      {lifecycle ? <TeamAssignmentLifecycleDrawer state={state} assignment={lifecycle.assignment} action={lifecycle.action} dispatch={dispatch} onClose={() => setLifecycle(null)} /> : null}
      {inviting ? <UserInvitationDrawer state={state} dispatch={dispatch} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

function TeamAssignmentRowActions({
  state,
  assignment,
  onConfigure,
  onLifecycle,
}: {
  state: AppState;
  assignment: TeamAssignment;
  onConfigure: (assignment: TeamAssignment) => void;
  onLifecycle: (value: { assignment: TeamAssignment; action: "review" | "revoke" }) => void;
}) {
  const configurePolicy = roleAssignmentActionPolicy(state, assignment.id, "configure");
  const reviewPolicy = roleAssignmentActionPolicy(state, assignment.id, "review");
  const revokePolicy = roleAssignmentActionPolicy(state, assignment.id, "revoke");
  return (
    <span className="inline-actions">
      <button className="text-button" type="button" disabled={!configurePolicy.allowed} title={configurePolicy.message} onClick={() => onConfigure(assignment)}><UserPlus className="lucide-icon" /> 配置</button>
      <button className="text-button" type="button" disabled={!reviewPolicy.allowed} title={reviewPolicy.message} onClick={() => onLifecycle({ assignment, action: "review" })}><Clock3 className="lucide-icon" /> 复核</button>
      <button className="text-button danger-action" type="button" disabled={!revokePolicy.allowed} title={revokePolicy.message} onClick={() => onLifecycle({ assignment, action: "revoke" })}><Ban className="lucide-icon" /> 回收</button>
    </span>
  );
}

function roleLoginScenario(role: string): string {
  const scenarios: Record<string, string> = {
    平台支持: "客户开通、代运营排障、跨租户审计留痕",
    租户管理员: "初始化组织、用户、角色和品牌/点位数据范围",
    业务负责人: "查看经营结果、审批关键动作、判断是否扩点",
    运营负责人: "每天处理点位、请求、异常、任务和配置发布协同",
    点位负责人: "查看本点位营业状态、异常、任务和订单请求",
    "商品/配置管理员": "维护商品/服务、SKU、场景字段和异常字典",
    场景模板管理员: "维护履约状态、字段、异常类型和责任角色",
    配置发布人: "提交配置发布、跟踪版本状态和发布影响范围",
    配置审批人: "复核配置差异、审批发布、检查发布影响",
    "客服/售后": "处理未交付、顾客沟通、异常记录和退款发起",
    退款审批人: "复核退款原因、订单上下文和审批留痕",
    "机器人/设备运维": "排查设备状态、事件日志、异常和受控命令",
    设备运维负责人: "复核设备高风险命令和维护审计记录",
    现场维护员: "处理点位任务、现场确认、维修和巡检记录",
    "财务/结算": "查看收入、退款、导出和对账口径",
    数据查看员: "只读查看经营看板和报表",
    审计员: "只读检查权限变更、审批和高风险动作",
    试运行操作员: "使用限定试运行点位验证客户沟通流程",
  };
  return scenarios[role] || "按角色模板查看对应菜单和数据范围";
}

function assignmentLifecycleStatus(assignment: TeamAssignment): string {
  if (assignment.pendingLifecycleAction === "review") return "待复核审批";
  if (assignment.pendingLifecycleAction === "revoke") return "待回收审批";
  return assignment.status;
}

function accountEffectiveProfile(state: AppState, accountId: string) {
  const account = state.users.find((item) => item.id === accountId);
  const roles = currentUserRoles(state).filter((role) => role !== "待授权用户");
  const assignments = currentUserTeamAssignments(state);
  const scopes = Array.from(new Set(assignments.map((assignment) => assignment.scope)));
  return {
    primaryRole: roles[0] || account?.role || "-",
    role: roles.length ? roles.join("、") : account?.role || "-",
    scope: scopes.length ? scopes.join("、") : account?.scope || "-",
  };
}

function accountVisibleForCurrentUser(state: AppState, accountId: string, canManageUsers: boolean): boolean {
  const viewer = currentUser(state);
  if (accountId === viewer.id) return true;
  if (!canManageUsers) return false;
  const account = state.users.find((item) => item.id === accountId);
  if (!account) return false;
  const roles = currentUserRoles(state);
  if (roles.includes("平台支持")) return true;
  const scopes = currentUserScopes(state);
  if (scopes.some((scope) => scope.includes("全部租户") || scope.includes(account.scope) || account.scope.includes(scope))) return true;
  return state.brands.some((brand) => scopes.some((scope) => scope.includes(brand.tenant)) && account.scope.includes(brand.name));
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value as TeamSettings[keyof TeamSettings])}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function UserInvitationDrawer({ state, dispatch, onClose }: { state: AppState; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const policy = userInvitationPolicy(state);
  const tenants = filteredTenants(state);
  const allowedTypes = ["tenant", "brand", "organization", "city", "point", "device"] as const;
  const firstTenant = tenants[0] || state.tenants[0];
  const [tenantName, setTenantName] = useState(firstTenant?.name || "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("运营负责人");
  const [scopeSelection, setScopeSelection] = useState<ScopeSelection>(() => firstTenant ? tenantScopeSelection(firstTenant.name, state) : firstScopeSelection(state, "tenant", [...allowedTypes]));
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && tenantName.trim().length > 0 && name.trim().length > 0 && email.includes("@") && role.trim().length > 0 && reason.trim().length >= 6;

  function chooseTenant(nextTenantName: string) {
    setTenantName(nextTenantName);
    setScopeSelection(tenantScopeSelection(nextTenantName, state));
  }

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="user-invitation-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">L4 / 用户邀请</p>
            <h3 id="user-invitation-title">邀请用户</h3>
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
            dispatch({ type: "invite-user", payload: { tenant: tenantName, email, name, role, scope: scopeSelection.value, scopeRef: scopeSelection, reason } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>租户/客户</span>
              <select value={tenantName} onChange={(event) => chooseTenant(event.target.value)}>
                {tenants.map((tenant) => <option key={tenant.id} value={tenant.name}>{tenant.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>姓名</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>邮箱</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>拟绑定角色</span>
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                {staticData.roles.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}
              </select>
            </label>
            <ScopeSelector state={state} value={scopeSelection} onChange={setScopeSelection} allowedTypes={[...allowedTypes]} />
            <label className="field full">
              <span>邀请依据</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明该用户承担的职责、覆盖范围和接受邀请后的权限审批安排" rows={4} />
            </label>
          </div>
          <DataTable
            headers={["写入对象", "状态", "说明"]}
            rows={[
              ["邀请", <Badge value="待接受" />, email || "未填写"],
              ["拟绑定角色", <Badge value="待审批" />, role],
              ["数据范围", <Badge value={scopeTypeLabel(scopeSelection.type)} tone="neutral" />, scopeSelection.value],
            ]}
          />
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}><MailPlus className="lucide-icon" /> 发送邀请</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function tenantScopeSelection(tenantName: string, state: AppState): ScopeSelection {
  const tenant = state.tenants.find((item) => item.name === tenantName) || state.tenants[0];
  if (!tenant) return firstScopeSelection(state, "tenant", ["tenant"]);
  return {
    type: "tenant",
    id: tenant.id,
    label: tenant.name,
    value: `${tenant.name} / 全部品牌`,
    parent: tenant.mode,
  };
}

function TeamAssignmentDrawer({ state, assignment, dispatch, onClose }: { state: AppState; assignment: TeamAssignment; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const matchingRole = staticData.roles.find((role) => role.name === assignment.role);
  const defaultPackages = assignment.permissionPackages || matchingRole?.packages || [assignment.packageSummary];
  const scopeTypes = ["tenant", "brand", "organization", "city", "point", "device"] as const;
  const actionPolicy = roleAssignmentActionPolicy(state, assignment.id, "configure");
  const [userId, setUserId] = useState(assignment.assigneeId || state.users[1]?.id || state.users[0]?.id || "");
  const [scopeSelection, setScopeSelection] = useState(() => assignment.scopeRef || resolveScopeSelection(state, assignment.scope, [...scopeTypes]) || firstScopeSelection(state, "brand", [...scopeTypes]));
  const [packages, setPackages] = useState<string[]>(defaultPackages);
  const [note, setNote] = useState(assignment.note || "");
  const dataScope = scopeSelection.value;
  const canSubmit = actionPolicy.allowed && userId.trim().length > 0 && dataScope.trim().length > 0 && packages.length > 0 && note.trim().length > 0;
  const packageOptions = staticData.permissionPackages.map((pkg) => pkg.name);

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="team-assignment-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{assignment.id}</p>
            <h3 id="team-assignment-title">配置角色实例</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={actionPolicy.risk} />
          <span>{actionPolicy.message}</span>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "submit-team-assignment-activation", payload: { assignmentId: assignment.id, userId, dataScope, scopeRef: scopeSelection, permissionPackages: packages, note } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>角色</span>
              <input value={assignment.role} readOnly />
            </label>
            <label className="field">
              <span>绑定账号</span>
              <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                {state.users.map((user) => <option key={user.id} value={user.id}>{user.name} / {user.role}</option>)}
              </select>
            </label>
            <ScopeSelector state={state} value={scopeSelection} onChange={setScopeSelection} allowedTypes={[...scopeTypes]} />
            <div className="field full">
              <span>权限包</span>
              <div className="checkbox-grid">
                {packageOptions.map((pkg) => (
                  <label className="checkbox-row" key={pkg}>
                    <input
                      type="checkbox"
                      checked={packages.includes(pkg)}
                      onChange={(event) => setPackages((current) => (event.target.checked ? [...current, pkg] : current.filter((item) => item !== pkg)))}
                    />
                    <span>{pkg}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="field full">
              <span>配置依据</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="说明该账号为什么承担这个角色、覆盖哪些点位，以及后续谁复核" rows={4} />
            </label>
          </div>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}><ShieldCheck className="lucide-icon" /> 提交审批</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function TeamAssignmentLifecycleDrawer({ state, assignment, action, dispatch, onClose }: { state: AppState; assignment: TeamAssignment; action: "review" | "revoke"; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const reviewing = action === "review";
  const actionPolicy = roleAssignmentActionPolicy(state, assignment.id, action);
  const canSubmit = actionPolicy.allowed && reason.trim().length >= 6;
  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer" role="dialog" aria-modal="true" aria-labelledby="team-lifecycle-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{assignment.id}</p>
            <h3 id="team-lifecycle-title">{reviewing ? "复核角色实例" : "回收角色实例"}</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={actionPolicy.risk} />
          <span>{actionPolicy.message}</span>
        </div>
        <DataTable
          headers={["角色", "账号", "数据范围", "当前状态"]}
          rows={[[assignment.role, assignment.assigneeName || "待绑定账号", assignment.scopeRef?.value || assignment.scope, <Badge value={assignmentLifecycleStatus(assignment)} />]]}
        />
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: reviewing ? "review-team-assignment" : "revoke-team-assignment", payload: { assignmentId: assignment.id, reason } });
            onClose();
          }}
        >
          <label className="field">
            <span>{reviewing ? "复核依据" : "回收原因"}</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={reviewing ? "说明该账号仍需保留该角色、覆盖范围和下次复核关注点" : "说明为何回收该权限、是否需要交接和谁负责后续事项"} rows={4} />
          </label>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className={`text-button ${reviewing ? "primary-action" : "danger-action"}`} type="submit" disabled={!canSubmit}>
              {reviewing ? <Clock3 className="lucide-icon" /> : <Ban className="lucide-icon" />}
              {reviewing ? "提交复核审批" : "提交回收审批"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
