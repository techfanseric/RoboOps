import { useCallback, useEffect, useRef, useState } from "react";
import { expireExportTasks, ORDER_REPORTS_STORAGE_KEY } from "./domain";
import { orderReportsSeed } from "./seed";
import type { OrderReportsSnapshot, OrderReportsState } from "./types";

function cloneSeed(): OrderReportsState {
  return JSON.parse(JSON.stringify(orderReportsSeed)) as OrderReportsState;
}

function stateFromSnapshot(snapshot: OrderReportsSnapshot): OrderReportsState {
  return { ...cloneSeed(), ...snapshot, orders: [], dataLogs: [], printLogs: [], reportRows: snapshot.reportRows || [], exportTasks: [], auditLogs: [] };
}

export function mergePointProfiles(local: OrderReportsState["points"], upstream: OrderReportsSnapshot["points"]) {
  const upstreamIds = new Set(upstream.map((point) => point.id));
  return [
    ...upstream.map((point) => {
      const saved = local.find((item) => item.id === point.id);
      if (!saved) return point;
      return { ...saved, groupId: point.groupId, name: point.name, status: point.status, city: saved.city === "待补充" ? point.city : saved.city };
    }),
    ...local.filter((point) => !upstreamIds.has(point.id)),
  ];
}

export function scopedOrderReportsStorageKey(tenantId: string, userId: string) {
  return `${ORDER_REPORTS_STORAGE_KEY}.${encodeURIComponent(tenantId)}`;
}

function normalizeState(value: OrderReportsState): OrderReportsState {
  return {
    ...value,
    auditLogs: value.auditLogs || [],
    orders: value.orders.map((order) => ({ ...order, refundState: order.refundState || "未申请", refundAttempts: order.refundAttempts || 0, processSteps: order.processSteps || [] })),
  };
}

function loadState(storageKey: string, snapshot?: OrderReportsSnapshot): OrderReportsState {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return snapshot ? stateFromSnapshot(snapshot) : cloneSeed();
    const parsed = JSON.parse(value) as Partial<OrderReportsState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.orders) || !Array.isArray(parsed.exportTasks)) return cloneSeed();
    return expireExportTasks(normalizeState(parsed as OrderReportsState));
  } catch {
    return cloneSeed();
  }
}

export interface UseOrderReportsOptions {
  tenantId?: string;
  userId?: string;
  visiblePointIds?: string[];
  snapshot?: OrderReportsSnapshot;
}

export function useOrderReports(options: UseOrderReportsOptions = {}) {
  const storageKey = scopedOrderReportsStorageKey(options.tenantId || "TENANT-DEMO", options.userId || "demo-user");
  const [container, setContainer] = useState(() => ({ storageKey, data: loadState(storageKey, options.snapshot) }));
  const containerRef = useRef(container);
  containerRef.current = container;
  const state = container.storageKey === storageKey ? container.data : loadState(storageKey, options.snapshot);
  const snapshotFingerprint = options.snapshot ? JSON.stringify(options.snapshot) : "";
  useEffect(() => {
    setContainer((current) => current.storageKey === storageKey ? current : { storageKey, data: loadState(storageKey, options.snapshot) });
  }, [storageKey]);
  useEffect(() => {
    if (!options.snapshot) return;
    setContainer((current) => current.storageKey !== storageKey ? current : ({ ...current, data: { ...current.data, points: mergePointProfiles(current.data.points, options.snapshot!.points), devices: options.snapshot!.devices, formulas: options.snapshot!.formulas, reportRows: options.snapshot!.reportRows || current.data.reportRows } }));
  }, [snapshotFingerprint]);
  useEffect(() => {
    if (container.storageKey === storageKey) localStorage.setItem(storageKey, JSON.stringify(container.data));
  }, [container, storageKey]);
  const mutate = useCallback((updater: (current: OrderReportsState) => OrderReportsState) => {
    const current = containerRef.current.storageKey === storageKey ? containerRef.current.data : loadState(storageKey, options.snapshot);
    const next = { storageKey, data: updater(current) };
    containerRef.current = next;
    setContainer(next);
  }, [storageKey, snapshotFingerprint]);
  const reset = useCallback(() => setContainer({ storageKey, data: options.snapshot ? stateFromSnapshot(options.snapshot) : cloneSeed() }), [storageKey, snapshotFingerprint]);
  const visible = options.visiblePointIds ? new Set(options.visiblePointIds) : undefined;
  const scopedState = visible ? {
    ...state,
    points: state.points.filter((point) => visible.has(point.id)),
    devices: state.devices.filter((device) => visible.has(device.pointId)),
    formulas: state.formulas.filter((formula) => formula.pointIds.length === 0 || formula.pointIds.some((pointId) => visible.has(pointId))),
    orders: state.orders.filter((order) => visible.has(order.pointId)),
    dataLogs: state.dataLogs.filter((log) => state.orders.some((order) => order.id === log.orderId && visible.has(order.pointId))),
    printLogs: state.printLogs.filter((log) => state.orders.some((order) => order.id === log.orderId && visible.has(order.pointId))),
    reportRows: state.reportRows.filter((row) => row.pointIds ? row.pointIds.some((pointId) => visible.has(pointId)) : state.points.some((point) => point.name === row.point && visible.has(point.id))),
  } : state;
  return { state: scopedState, mutate, reset, storageKey };
}
