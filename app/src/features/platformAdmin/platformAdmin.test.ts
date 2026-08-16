import { describe, expect, it } from "vitest";
import { platformAdminRules } from "./PlatformAdminPage";

describe("platformAdminRules", () => {
  it("处理中任务不可标记已读或清理", () => {
    expect(platformAdminRules.canMutateTask({ status: "处理中" })).toBe(false);
    expect(platformAdminRules.canMutateTask({ status: "成功" })).toBe(true);
    expect(platformAdminRules.canMutateTask({ status: "失败" })).toBe(true);
    expect(platformAdminRules.canMutateTask({ status: "等待处理" })).toBe(true);
  });

  it("处理中任务超过五分钟判定失败", () => {
    expect(platformAdminRules.expiresAfterFiveMinutes({ status: "处理中", updatedAt: 10_000 }, 310_001)).toBe(true);
    expect(platformAdminRules.expiresAfterFiveMinutes({ status: "处理中", updatedAt: 10_000 }, 310_000)).toBe(false);
    expect(platformAdminRules.expiresAfterFiveMinutes({ status: "成功", updatedAt: 10_000 }, 999_999)).toBe(false);
  });
});
