import type { Dispatch } from "react";
import { useState } from "react";
import { filteredTasks, type AppAction } from "../services/operations";
import type { AppState } from "../types/core";
import { Badge, DataTable, DetailLink, NameCell, Section } from "../components/ui";
import { TaskActions, TaskDetail } from "./sharedViews";

export function Tasks({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tasks = filteredTasks(state);
  const selected = tasks.find((task) => task.id === selectedId) || tasks[0];
  return (
    <div className="split-detail">
      <Section title="任务/工单" meta="现场维护、客服确认和配置检查">
        <DataTable headers={["任务", "类型", "负责人", "点位", "状态", "截止", "动作", "详情"]} rows={tasks.map((task) => ({
          key: task.id,
          selected: selected?.id === task.id,
          onClick: () => setSelectedId(task.id),
          label: `查看${task.id}`,
          cells: [<NameCell primary={task.name} secondary={task.id} />, task.type, task.owner, task.point, <Badge value={task.status} />, task.due, <TaskActions state={state} task={task} dispatch={dispatch} />, <DetailLink to={`/tasks/${task.id}`} title={`打开${task.id}详情`} />],
        }))} />
      </Section>
      <TaskDetail state={state} task={selected} />
    </div>
  );
}
