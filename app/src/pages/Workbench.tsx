import type { Dispatch, ReactNode } from "react";
import {
  activeIncidents,
  activeTasks,
  apiOperationVisibleForCurrentUser,
  approvalActionPolicy,
  approvalVisibleForCurrentUser,
  auditLogVisibleForCurrentUser,
  businessSnapshot,
  currentUser,
  currentUserHasBusinessAccess,
  currentUserPermissionPackages,
  currentUserRoles,
  filteredBusinessRequests,
  filteredDevices,
  filteredPoints,
  menuAccessPolicy,
  releaseVisibleForCurrentUser,
  userInvitationVisibleForCurrentUser,
} from "../services/operations";
import type { AppAction } from "../services/operations";
import type { AppState } from "../types/core";
import { Badge, DataTable, EmptyState, KpiTile, NameCell, Section } from "../components/ui";
import { IncidentTable, OperationalFlow, TodoTable } from "./sharedViews";

export function Workbench({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const user = currentUser(state);
  if (!currentUserHasBusinessAccess(state)) {
    return (
      <>
        <Section title="账号待授权" meta="登录账号已创建，业务权限等待审批">
          <div className="detail-stack">
            <div className="policy-strip">
              <Badge value="待授权" />
              <span>当前账号还没有启用的业务角色。管理员完成角色实例绑定并通过审批后，系统才会开放对应菜单和数据范围。</span>
            </div>
            <DataTable
              headers={["项目", "内容"]}
              rows={[
                ["账号", <NameCell primary={user.name} secondary={user.email || user.id} />],
                ["基础角色", user.role],
                ["申请范围", user.scope],
                ["下一步", "由租户管理员绑定角色实例、选择数据范围和权限包，并提交审批。"],
              ]}
            />
          </div>
        </Section>
        <Section title="权限开通流程" meta="账号、角色实例、审批和生效边界">
          <DataTable
            headers={["步骤", "状态", "说明"]}
            rows={[
              ["接受邀请", <Badge value="已完成" />, "账号可登录，但不直接获得业务菜单。"],
              ["绑定角色实例", <Badge value="待处理" />, "管理员选择实际岗位、权限包和结构化数据范围。"],
              ["权限审批", <Badge value="待审批" />, "审批通过后才会进入有效角色，并参与菜单和动作授权。"],
            ]}
          />
        </Section>
      </>
    );
  }
  const snapshot = businessSnapshot(state);
  const onlineDevices = snapshot.devices.filter((device) => device.status === "在线" || device.status === "忙碌").length;
  const revenue = snapshot.requests.filter((request) => request.paid === "已支付" || request.paid === "已确认").reduce((sum, request) => sum + request.amount, 0);
  const roleWorkspace = buildRoleWorkspace(state);
  const canViewReports = menuAccessPolicy(state, "reports").allowed;
  const canViewFinancial = canViewReports || roleWorkspace.packages.some((pkg) => ["退款审批包", "报表查看包", "报表导出包"].includes(pkg));
  const completedRequests = snapshot.requests.filter((request) => request.status === "delivered").length;
  const openWork = snapshot.incidents.length + snapshot.tasks.length;
  return (
    <>
      <Section title="我的优先事项" meta={`${user.name} / ${roleWorkspace.primaryRole} / ${user.scope}`}>
        <div className="workbench-focus">
          <div className="focus-card">
            <div className="role-strip">
              {roleWorkspace.roles.map((role) => <Badge key={role} value={role} tone="neutral" />)}
              {roleWorkspace.packages.slice(0, 3).map((pkg) => <Badge key={pkg} value={pkg} tone="neutral" />)}
            </div>
            <p className="mini-label">今天先处理</p>
            <strong>{roleWorkspace.rhythm}</strong>
            <span>{roleWorkspace.boundary}</span>
          </div>
          {roleWorkspace.queueRows.length ? (
            <DataTable headers={["队列", "对象", "状态", "处理口径"]} rows={roleWorkspace.queueRows} />
          ) : (
            <EmptyState>当前账号暂无需要优先处理的事项</EmptyState>
          )}
        </div>
      </Section>
      <Section title="运行概览" meta="当前范围内的经营信号">
        <div className="workbench-overview">
          <div className="grid kpi">
            <KpiTile title="待处理事项" value={openWork} foot={`异常 ${snapshot.incidents.length} / 任务 ${snapshot.tasks.length}`} />
            <KpiTile title="可营业点位" value={`${snapshot.readyPoints.length}/${snapshot.points.length}`} foot={`营业中 ${snapshot.points.filter((point) => point.status === "营业中").length}`} />
            <KpiTile title="设备在线" value={`${onlineDevices}/${snapshot.devices.length}`} foot="机器人和自动化设备" />
            {canViewFinancial ? <KpiTile title="交易额" value={`¥${revenue}`} foot={`退款处理中 ${snapshot.refunding.length}`} /> : <KpiTile title="交付完成" value={completedRequests} foot={`请求 ${snapshot.requests.length}`} />}
          </div>
          <OperationalFlow state={state} showFinancial={canViewFinancial} />
        </div>
      </Section>
      <div className="grid two">
        <Section title="风险队列" meta="按等级、SLA 和负责人排序">
          <IncidentTable state={state} dispatch={dispatch} incidents={activeIncidents(state).slice(0, 4)} />
        </Section>
        <Section title="我的待办" meta="异常、任务、配置审批和人工确认">
          <TodoTable state={state} />
        </Section>
      </div>
    </>
  );
}

function buildRoleWorkspace(state: AppState) {
  const user = currentUser(state);
  const roles = currentUserRoles(state).filter((role) => role !== "待授权用户");
  const packages = currentUserPermissionPackages(state);
  const primaryRole = pickPrimaryRole(roles, user.role);
  const copy = roleWorkspaceCopy(primaryRole);
  return {
    primaryRole,
    roles: roles.length ? roles : [user.role],
    packages,
    ...copy,
    queueRows: roleQueueRows(state, primaryRole),
  };
}

function pickPrimaryRole(roles: string[], fallback: string) {
  const order = [
    "平台支持",
    "租户管理员",
    "业务负责人",
    "运营负责人",
    "点位负责人",
    "客服/售后",
    "退款审批人",
    "机器人/设备运维",
    "设备运维负责人",
    "现场维护员",
    "商品/配置管理员",
    "场景模板管理员",
    "配置发布人",
    "配置审批人",
    "财务/结算",
    "数据查看员",
    "审计员",
    "试运行操作员",
  ];
  return order.find((role) => roles.includes(role)) || roles[0] || fallback;
}

function roleWorkspaceCopy(role: string) {
  const copy: Record<string, { focus: string; rhythm: string; boundary: string }> = {
    平台支持: {
      focus: "客户开通、跨租户排障、接口同步和权限治理。",
      rhythm: "先看失败同步和高风险审批，再处理客户初始化与支持请求。",
      boundary: "跨客户访问必须能解释原因并留下审计，不替客户完成退款审批。",
    },
    租户管理员: {
      focus: "组织、账号、邀请、角色实例和数据范围。",
      rhythm: "优先补齐未接受邀请、待绑定角色和即将复核的权限实例。",
      boundary: "负责授权发起和组织配置，不默认审批退款或设备高风险命令。",
    },
    业务负责人: {
      focus: "经营结果、关键审批、扩点判断和 P1 风险。",
      rhythm: "先处理待审批事项，再看 P1 异常、退款和点位健康。",
      boundary: "审批关键动作，不直接执行设备命令，也不发起角色实例管理动作。",
    },
    运营负责人: {
      focus: "点位运营、请求履约、异常分派、任务推进和配置协同。",
      rhythm: "按异常等级、SLA、现场任务和配置发布影响面推进闭环。",
      boundary: "可以调度日常闭环，用户权限管理和高风险设备命令需单独授权。",
    },
    点位负责人: {
      focus: "本点位营业状态、上线准入、异常、任务和请求。",
      rhythm: "先看阻塞上线项，再处理本点位异常和今日任务。",
      boundary: "只处理授权点位，不查看跨区域财务和全局配置。",
    },
    "客服/售后": {
      focus: "顾客沟通、未交付请求、退款发起和售后异常。",
      rhythm: "优先处理顾客相关异常、待取杯、退款原因和沟通留痕。",
      boundary: "可以发起退款和记录沟通，但不能审批自己发起的退款。",
    },
    退款审批人: {
      focus: "退款原因、订单上下文、审批意见和财务风险。",
      rhythm: "先复核待审批退款，再检查异常和请求链路是否完整。",
      boundary: "只复核退款，不操作商品配置、设备命令和异常处理动作。",
    },
    "机器人/设备运维": {
      focus: "设备状态、设备事件、设备异常和受控命令。",
      rhythm: "先看离线/待维护设备，再处理设备来源异常和命令审批结果。",
      boundary: "设备高风险命令需要审批和二次确认。",
    },
    设备运维负责人: {
      focus: "设备高风险命令、运维复核和设备侧审计。",
      rhythm: "优先处理设备命令审批，再看设备异常和维护记录。",
      boundary: "审批设备高风险动作必须保留原因、对象和结果。",
    },
    现场维护员: {
      focus: "现场任务、巡检、补给、维修和人工确认。",
      rhythm: "先处理到期任务，再看点位阻塞项和现场设备状态。",
      boundary: "只访问授权点位、设备和工单，不查看全局财务。",
    },
    "商品/配置管理员": {
      focus: "商品/服务、SKU、可售范围和配置变更。",
      rhythm: "先看待审批发布和配置影响，再提交必要的变更申请。",
      boundary: "配置编辑和配置审批应分离。",
    },
    场景模板管理员: {
      focus: "场景字段、履约状态、异常字典和责任角色。",
      rhythm: "先检查模板变更影响，再通过配置发布提交调整。",
      boundary: "模板变更必须进入发布和审批链路。",
    },
    配置发布人: {
      focus: "发布申请、发布影响范围、回退依据和版本状态。",
      rhythm: "优先跟踪待审批和失败发布，再处理回退或重提。",
      boundary: "不能审批自己提交的配置发布。",
    },
    配置审批人: {
      focus: "配置差异、影响范围、回退依据和发布审批。",
      rhythm: "先处理可审批发布，再看发布失败与回退申请。",
      boundary: "不审批自己提交的配置变更。",
    },
    "财务/结算": {
      focus: "收入、退款、导出、对账和财务口径。",
      rhythm: "先看退款和收入异常，再做报表复核与导出留痕。",
      boundary: "不操作设备配置和异常关闭。",
    },
    数据查看员: {
      focus: "经营指标、点位健康、趋势和报表口径。",
      rhythm: "只读查看当前范围内经营结果和风险信号。",
      boundary: "只读，不编辑、不审批、不导出敏感明细。",
    },
    审计员: {
      focus: "权限变更、审批记录、高风险动作和接口同步。",
      rhythm: "优先看 L4 记录、失败同步和异常审批链路。",
      boundary: "只读检查，不替业务处理经营动作。",
    },
    试运行操作员: {
      focus: "限定点位的试运行请求、异常和现场确认。",
      rhythm: "先处理试运行点位的请求和任务，记录客户沟通结果。",
      boundary: "不触碰真实高风险设备命令和跨点位数据。",
    },
  };
  return copy[role] || {
    focus: "查看当前账号数据范围内的经营状态和待办事项。",
    rhythm: "先处理待办，再检查异常、任务和发布状态。",
    boundary: "按当前有效角色、权限包和数据范围执行动作。",
  };
}

function roleQueueRows(state: AppState, role: string) {
  const rows: Array<[string, ReactNode, ReactNode, string]> = [];
  const snapshot = businessSnapshot(state);
  const approvals = state.approvalRequests.filter((approval) => approvalVisibleForCurrentUser(state, approval));
  const actionableApprovals = approvals.filter((approval) => approvalActionPolicy(state, approval).allowed);
  const pendingApprovals = approvals.filter((approval) => approval.status === "待审批");
  const incidents = activeIncidents(state);
  const tasks = activeTasks(state);
  const devices = filteredDevices(state);
  const requests = filteredBusinessRequests(state);
  const releases = state.releases.filter((release) => releaseVisibleForCurrentUser(state, release.id));
  const invitations = state.userInvitations.filter((invitation) => userInvitationVisibleForCurrentUser(state, invitation));
  const apiIssues = state.apiOperations.filter((operation) => apiOperationVisibleForCurrentUser(state, operation) && ["同步失败", "需要补偿"].includes(operation.syncStatus));
  const auditLogs = state.auditLogs.filter((log) => auditLogVisibleForCurrentUser(state, log));
  const refunds = state.refunds.filter((refund) => requests.some((request) => request.id === refund.request) && refund.status !== "已完成" && refund.status !== "已取消");

  function push(queue: string, primary: string, secondary: string, status: string, action: string) {
    rows.push([queue, <NameCell primary={primary} secondary={secondary} />, <Badge value={status} />, action]);
  }

  if (["平台支持", "租户管理员"].includes(role)) {
    invitations.filter((item) => item.status === "待接受").slice(0, 2).forEach((item) => push("账号邀请", item.name, item.email, item.status, "跟进接受邀请，接受后再配置角色实例。"));
    state.teamAssignments.filter((item) => item.status !== "已启用").slice(0, 2).forEach((item) => push("角色实例", item.role, item.id, item.status, "绑定账号、范围和权限包后提交审批。"));
    apiIssues.slice(0, 1).forEach((item) => push("接口同步", item.action, item.id, item.syncStatus, "先确认服务端结果，再补偿或重试。"));
  } else if (role === "业务负责人") {
    actionableApprovals.slice(0, 2).forEach((item) => push("待审批", item.action, item.target, item.status, "复核影响范围和发起人，确认后再处理。"));
    incidents.filter((item) => item.level === "P1").slice(0, 2).forEach((item) => push("P1 异常", item.type, item.id, item.statusLabel, "确认是否影响营业和客户承诺。"));
    refunds.slice(0, 1).forEach((item) => push("退款风险", item.reason, item.id, item.status, "确认退款原因和审批链路。"));
  } else if (role === "运营负责人") {
    incidents.slice(0, 2).forEach((item) => push("异常闭环", item.type, item.id, item.statusLabel, "按等级、SLA 和负责人推进。"));
    tasks.slice(0, 2).forEach((item) => push("任务调度", item.name, item.id, item.status, "确认责任人和完成时限。"));
    snapshot.liveRequests.slice(0, 1).forEach((item) => push("履约请求", item.label, item.id, item.statusLabel, "检查是否需要人工介入。"));
  } else if (role === "点位负责人") {
    filteredPoints(state).slice(0, 2).forEach((point) => push("点位状态", point.name, point.city, point.status, "检查上线准入、设备和现场任务。"));
    incidents.slice(0, 2).forEach((item) => push("点位异常", item.type, item.id, item.statusLabel, "协调客服、设备或现场处理。"));
  } else if (role === "客服/售后") {
    incidents.filter((item) => item.owner.includes("客服") || item.type.includes("顾客")).slice(0, 2).forEach((item) => push("顾客异常", item.type, item.id, item.statusLabel, "补齐沟通记录，必要时发起退款。"));
    requests.filter((item) => item.status === "awaiting_delivery" || item.status === "exception").slice(0, 2).forEach((item) => push("请求跟进", item.label, item.id, item.statusLabel, "核对取货、支付和异常上下文。"));
  } else if (["退款审批人", "财务/结算"].includes(role)) {
    refunds.slice(0, 3).forEach((item) => push("退款复核", item.reason, item.id, item.status, "核对订单、异常和审批意见。"));
    pendingApprovals.filter((item) => item.action.includes("退款")).slice(0, 1).forEach((item) => push("退款审批", item.action, item.target, item.status, "确认发起人与审批人分离。"));
  } else if (["机器人/设备运维", "设备运维负责人"].includes(role)) {
    devices.filter((item) => !["在线", "忙碌"].includes(item.status)).slice(0, 3).forEach((item) => push("设备状态", item.name, item.sn, item.status, "检查事件、命令记录和现场任务。"));
    incidents.filter((item) => item.owner.includes("设备") || item.source.includes("设备")).slice(0, 2).forEach((item) => push("设备异常", item.type, item.id, item.statusLabel, "先确认设备日志，再决定远程或现场处理。"));
  } else if (role === "现场维护员") {
    tasks.slice(0, 3).forEach((item) => push("现场任务", item.name, item.id, item.status, "按到期时间处理并提交结果。"));
    devices.filter((item) => !["在线", "忙碌"].includes(item.status)).slice(0, 1).forEach((item) => push("现场设备", item.name, item.sn, item.status, "到场检查后写入维护记录。"));
  } else if (["商品/配置管理员", "场景模板管理员", "配置发布人", "配置审批人"].includes(role)) {
    releases.filter((item) => item.status !== "已发布").slice(0, 3).forEach((item) => push("配置发布", item.name, item.id, item.status, "检查差异、影响范围和审批结果。"));
    pendingApprovals.filter((item) => item.action.includes("配置")).slice(0, 1).forEach((item) => push("配置审批", item.action, item.target, item.status, "确认发起人、发布对象和回退依据。"));
  } else if (["数据查看员", "审计员"].includes(role)) {
    auditLogs.filter((item) => item.risk === "L4").slice(0, 3).forEach((item) => push("高风险日志", item.action, item.object, item.result, "核对审批、操作者和对象范围。"));
    apiIssues.slice(0, 2).forEach((item) => push("同步风险", item.action, item.id, item.syncStatus, "检查失败原因和补偿记录。"));
  } else if (role === "试运行操作员") {
    requests.slice(0, 2).forEach((item) => push("试运行请求", item.label, item.id, item.statusLabel, "记录客户沟通和人工确认结果。"));
    incidents.slice(0, 2).forEach((item) => push("试运行异常", item.type, item.id, item.statusLabel, "只处理限定点位内事项。"));
  }

  if (!rows.length) {
    tasks.slice(0, 2).forEach((item) => push("任务", item.name, item.id, item.status, "按权限范围处理。"));
    incidents.slice(0, 2).forEach((item) => push("异常", item.type, item.id, item.statusLabel, "按分派规则处理。"));
  }
  return rows.slice(0, 4);
}
