import type { IncidentRule, StatusCenterState, StatusDefinition } from "./types";

const now = "2026-08-19 09:00";

const status = (definition: Omit<StatusDefinition, "id" | "tenant" | "scopeLevel" | "scopeTargets" | "version" | "updatedAt">): StatusDefinition => ({
  ...definition,
  id: `STATUS-${definition.code}`,
  tenant: "*",
  scopeLevel: "平台默认",
  scopeTargets: [],
  version: 1,
  updatedAt: now,
});

const rule = (definition: Omit<IncidentRule, "id" | "tenant" | "scopeLevel" | "scopeTargets" | "version" | "updatedAt">): IncidentRule => ({
  ...definition,
  id: `RULE-${definition.code}`,
  tenant: "*",
  scopeLevel: "平台默认",
  scopeTargets: [],
  version: 1,
  updatedAt: now,
});

export const statusCenterSeed: StatusCenterState = {
  schemaVersion: 1,
  statusDefinitions: [
    status({ code: "ONLINE", name: "在线", dimension: "连接状态", category: "正常", appliesTo: ["全部设备"], affectsOrder: false, affectsDispatch: false, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: false, triggerAfterMinutes: 0, description: "设备心跳和业务通道正常。", enabled: true }),
    status({ code: "OFFLINE", name: "离线", dimension: "连接状态", category: "不可用", appliesTo: ["全部设备"], affectsOrder: true, affectsDispatch: true, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: true, triggerAfterMinutes: 3, recoveryStatusCode: "ONLINE", description: "连续无心跳后进入离线，恢复心跳后自动解除。", enabled: true }),
    status({ code: "IDLE", name: "空闲", dimension: "运行状态", category: "正常", appliesTo: ["机器人", "自动化设备"], affectsOrder: false, affectsDispatch: false, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: false, triggerAfterMinutes: 0, description: "设备在线且当前无执行任务。", enabled: true }),
    status({ code: "BUSY", name: "执行中", dimension: "运行状态", category: "正常", appliesTo: ["机器人", "自动化设备"], affectsOrder: false, affectsDispatch: false, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: false, triggerAfterMinutes: 0, description: "设备正在执行订单或服务任务。", enabled: true }),
    status({ code: "MAINTENANCE", name: "待维护", dimension: "运行状态", category: "提醒", appliesTo: ["全部设备"], affectsOrder: true, affectsDispatch: true, affectsPointOperation: false, manualConfirm: true, autoCreateIncident: false, triggerAfterMinutes: 0, description: "设备需要维护确认，默认不再接受新任务。", enabled: true }),
    status({ code: "AVAILABLE", name: "可接单", dimension: "业务状态", category: "正常", appliesTo: ["全部设备"], affectsOrder: false, affectsDispatch: false, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: false, triggerAfterMinutes: 0, description: "设备满足当前场景的履约条件。", enabled: true }),
    status({ code: "MATERIAL_LOW", name: "关键物料不足", dimension: "业务状态", category: "警告", appliesTo: ["制饮设备"], affectsOrder: true, affectsDispatch: true, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: true, triggerAfterMinutes: 1, recoveryStatusCode: "AVAILABLE", description: "关键物料不足以完成下一单时暂停相关商品履约。", enabled: true }),
    status({ code: "SAFE", name: "安全正常", dimension: "安全状态", category: "正常", appliesTo: ["全部设备"], affectsOrder: false, affectsDispatch: false, affectsPointOperation: false, manualConfirm: false, autoCreateIncident: false, triggerAfterMinutes: 0, description: "安全回路、急停和防护装置状态正常。", enabled: true }),
    status({ code: "E_STOP", name: "急停触发", dimension: "安全状态", category: "故障", appliesTo: ["机器人", "自动化设备"], affectsOrder: true, affectsDispatch: true, affectsPointOperation: true, manualConfirm: true, autoCreateIncident: true, triggerAfterMinutes: 0, recoveryStatusCode: "SAFE", description: "急停触发后立即停止任务，必须人工确认恢复。", enabled: true }),
  ],
  incidentRules: [
    rule({ code: "DEVICE_OFFLINE", name: "设备离线", deviceTypes: ["全部设备"], source: "设备心跳", rawCodes: ["HEARTBEAT_TIMEOUT"], triggerCondition: "连续 3 分钟无心跳", consecutiveCount: 1, dedupeMinutes: 10, severity: "P1", owner: "机器人/设备运维", escalation: "运营负责人", slaMinutes: 20, sop: "检查网络、电源和设备进程；远程恢复失败时转现场任务。", notificationChannels: ["站内", "企业微信"], notifyPointOwner: true, autoCreateTask: false, affectsOrder: true, affectsPointOperation: false, autoRecover: true, recoveryCondition: "连续 2 次心跳恢复", enabled: true }),
    rule({ code: "ROBOT_ESTOP", name: "机器人急停", deviceTypes: ["人形机器人", "服务机器人"], source: "安全控制器", rawCodes: ["E_STOP_ACTIVE"], triggerCondition: "急停信号为开启", consecutiveCount: 1, dedupeMinutes: 1, severity: "P0", owner: "设备运维负责人", escalation: "业务负责人", slaMinutes: 5, sop: "立即停止任务，确认现场安全和急停原因后由授权人员复位。", notificationChannels: ["站内", "电话"], notifyPointOwner: true, autoCreateTask: true, affectsOrder: true, affectsPointOperation: true, autoRecover: false, recoveryCondition: "人工确认安全后关闭", enabled: true }),
    rule({ code: "LOW_BATTERY", name: "机器人低电量", deviceTypes: ["人形机器人", "服务机器人"], source: "电池管理系统", rawCodes: ["BATTERY_LOW"], triggerCondition: "电量低于 20%", consecutiveCount: 2, dedupeMinutes: 30, severity: "P2", owner: "点位负责人", escalation: "机器人/设备运维", slaMinutes: 30, sop: "停止派发长时任务并安排回充；核对自动回充是否成功。", notificationChannels: ["站内"], notifyPointOwner: true, autoCreateTask: false, affectsOrder: false, affectsPointOperation: false, autoRecover: true, recoveryCondition: "电量恢复至 35% 以上", enabled: true }),
    rule({ code: "ACTION_FAILED", name: "动作执行失败", deviceTypes: ["人形机器人", "服务机器人", "制饮设备"], source: "任务执行器", rawCodes: ["ACTION_FAILED", "MOTION_ERROR"], triggerCondition: "同一动作连续失败 2 次", consecutiveCount: 2, dedupeMinutes: 5, severity: "P1", owner: "机器人/设备运维", escalation: "运营负责人", slaMinutes: 20, sop: "查看动作步骤、负载和传感器事件；必要时中止订单并转现场检查。", notificationChannels: ["站内", "企业微信"], notifyPointOwner: true, autoCreateTask: false, affectsOrder: true, affectsPointOperation: false, autoRecover: false, recoveryCondition: "完成诊断并人工确认", enabled: true }),
    rule({ code: "MATERIAL_LOW", name: "关键物料不足", deviceTypes: ["制饮设备"], source: "料仓传感器", rawCodes: ["MATERIAL_LOW"], triggerCondition: "关键料仓低于下一单最低用量", consecutiveCount: 1, dedupeMinutes: 15, severity: "P1", owner: "现场维护员", escalation: "点位负责人", slaMinutes: 15, sop: "暂停受影响商品，核对批次效期并完成补料。", notificationChannels: ["站内"], notifyPointOwner: true, autoCreateTask: true, affectsOrder: true, affectsPointOperation: false, autoRecover: true, recoveryCondition: "补料后余量高于安全阈值", enabled: true }),
    rule({ code: "DOOR_OPEN", name: "柜门长时间未关闭", deviceTypes: ["交付设备"], source: "柜门传感器", rawCodes: ["DOOR_OPEN_TIMEOUT"], triggerCondition: "柜门连续 30 秒未关闭", consecutiveCount: 1, dedupeMinutes: 5, severity: "P1", owner: "现场维护员", escalation: "点位负责人", slaMinutes: 10, sop: "确认柜口是否被占用或卡住，必要时暂停该柜口并现场处理。", notificationChannels: ["站内"], notifyPointOwner: true, autoCreateTask: true, affectsOrder: true, affectsPointOperation: false, autoRecover: true, recoveryCondition: "柜门关闭并连续 10 秒状态正常", enabled: true }),
    rule({ code: "VERSION_MISMATCH", name: "设备版本不符合基线", deviceTypes: ["全部设备"], source: "版本巡检", rawCodes: ["VERSION_BELOW_BASELINE"], triggerCondition: "实际版本低于当前场景最低版本", consecutiveCount: 1, dedupeMinutes: 1440, severity: "P2", owner: "机器人/设备运维", escalation: "设备运维负责人", slaMinutes: 240, sop: "核对升级策略和设备兼容性，将设备纳入升级计划。", notificationChannels: ["站内"], notifyPointOwner: false, autoCreateTask: false, affectsOrder: false, affectsPointOperation: false, autoRecover: true, recoveryCondition: "设备上报版本达到基线", enabled: true }),
  ],
  releases: [],
  silences: [],
  audits: [],
};
