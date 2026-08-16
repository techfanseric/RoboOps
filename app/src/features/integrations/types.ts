export type IntegrationStatus = "待审批" | "已启用" | "已拒绝" | "已停用";
export type SyncStatus = "待执行" | "同步中" | "成功" | "失败";

export interface DeveloperApplication {
  id: string;
  developer: string;
  enterprise: string;
  owner?: string;
  purpose: string;
  scopes: string[];
  status: IntegrationStatus;
  submittedAt: string;
}

export interface EnterpriseAuthorization {
  id: string;
  enterprise: string;
  appName: string;
  scopes: string[];
  points: string[];
  expiresAt: string;
  status: IntegrationStatus;
}

export interface ApiCredential {
  id: string;
  name: string;
  enterprise: string;
  owner?: string;
  appId: string;
  maskedSecret: string;
  credentialVersion: number;
  previousVersion?: number;
  previousExpiresAt?: string;
  quotaPerMinute: number;
  currentMinuteCalls: number;
  usedToday: number;
  lastRotatedAt: string;
  status: "已启用" | "已停用";
}

export interface MqttCredential {
  id: string;
  clientId: string;
  enterprise: string;
  owner?: string;
  topicPrefix: string;
  pointScope: string;
  expiresAt: string;
  status: "已启用" | "已停用";
  credentialVersion: number;
  previousVersion?: number;
  previousExpiresAt?: string;
  lastRotatedAt: string;
}

export interface EventSubscription {
  id: string;
  name: string;
  enterprise: string;
  owner?: string;
  endpoint: string;
  events: string[];
  secretVersion: number;
  previousSecretVersion?: number;
  previousSecretExpiresAt?: string;
  failures: number;
  status: "已启用" | "已停用";
}

export interface DataSyncJob {
  id: string;
  enterprise: string;
  name: string;
  direction: "导入" | "导出";
  resource: string;
  progress: number;
  total: number;
  status: SyncStatus;
  updatedAt: number;
  result?: string;
}

export interface IntegrationAudit {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
  result: string;
  detail: string;
}

export interface IntegrationState {
  applications: DeveloperApplication[];
  authorizations: EnterpriseAuthorization[];
  apiCredentials: ApiCredential[];
  mqttCredentials: MqttCredential[];
  subscriptions: EventSubscription[];
  syncJobs: DataSyncJob[];
  audits: IntegrationAudit[];
}
