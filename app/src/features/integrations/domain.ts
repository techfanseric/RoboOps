import type { DataSyncJob, DeveloperApplication, EnterpriseAuthorization } from "./types";

export const integrationRules = {
  canApprove(application: Pick<DeveloperApplication, "status" | "scopes">) {
    return application.status === "待审批" && application.scopes.length > 0;
  },
  authorizationIsActive(authorization: Pick<EnterpriseAuthorization, "status" | "expiresAt">, now = new Date()) {
    return authorization.status === "已启用" && new Date(`${authorization.expiresAt}T23:59:59`).getTime() >= now.getTime();
  },
  canMutateSync(job: Pick<DataSyncJob, "status">) {
    return job.status === "成功" || job.status === "失败" || job.status === "待执行";
  },
  isStalled(job: Pick<DataSyncJob, "status" | "updatedAt">, now = Date.now()) {
    return job.status === "同步中" && now - job.updatedAt > 300_000;
  },
  withinQuota(used: number, quota: number) {
    return Number.isInteger(quota) && quota > 0 && used < quota;
  },
};

export function visibleSyncJobs(jobs: DataSyncJob[], enterprises: string[], isPlatform = false) {
  const allowed = new Set(enterprises);
  return jobs.filter((job) => isPlatform || allowed.has(job.enterprise));
}
