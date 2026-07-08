import { useState } from "react";
import type { AppState } from "../types/core";
import { filteredBusinessRequests } from "../services/operations";
import { Badge, DataTable, DetailLink, NameCell, Section } from "../components/ui";
import { RequestDetail } from "./sharedViews";

export function BusinessRequests({ state }: { state: AppState }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requests = filteredBusinessRequests(state);
  const defaultSelected = requests.find((request) => request.status === "exception" || request.status === "refund_pending") || requests[0];
  const selected = requests.find((request) => request.id === selectedId) || defaultSelected;
  return (
    <div className="split-detail">
      <Section title="订单/服务请求" meta="状态、支付确认、负责人和最近更新">
        <DataTable headers={["编号", "点位", "场景", "状态", "支付/确认", "金额", "负责人", "更新", "详情"]} rows={requests.map((request) => ({
          key: request.id,
          selected: selected?.id === request.id,
          onClick: () => setSelectedId(request.id),
          label: `查看${request.id}`,
          cells: [<NameCell primary={request.id} secondary={request.label} />, request.point, request.scenario, <Badge value={request.statusLabel} />, request.paid, request.amount ? `¥${request.amount}` : "-", request.owner, request.updated, <DetailLink to={`/orders/${request.id}`} title={`打开${request.id}详情`} />],
        }))} />
      </Section>
      <RequestDetail state={state} request={selected} />
    </div>
  );
}
