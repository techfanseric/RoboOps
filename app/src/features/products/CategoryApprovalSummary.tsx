import { DataTable, Section } from "../../components/ui";
import type { AppState } from "../../types/core";
import { categoryApprovalSummary } from "./categories";

export function CategoryApprovalSummary({ state, releaseId }: { state: AppState; releaseId: string }) {
  const summary = categoryApprovalSummary(state, releaseId);
  if (!summary) return null;
  return (
    <Section title="商品分类说明" meta="核对当前分类名称、启停状态与申请目标">
      <DataTable headers={["商品", "当前分类", "申请目标（当前名称）", "申请状态"]}
        rows={[[summary.itemName, summary.current, summary.target, summary.status]]} />
      <p className="note-box">{summary.note}</p>
    </Section>
  );
}
