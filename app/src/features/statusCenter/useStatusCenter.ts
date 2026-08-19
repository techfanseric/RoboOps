import { useEffect, useReducer } from "react";
import { statusCenterReducer } from "./domain";
import { statusCenterSeed } from "./seed";
import type { StatusCenterState } from "./types";

export const STATUS_CENTER_STORAGE_KEY = "roboops.status-center.v1.shared";

function restore(): StatusCenterState {
  try {
    const raw = window.localStorage.getItem(STATUS_CENTER_STORAGE_KEY);
    if (!raw) return structuredClone(statusCenterSeed);
    const parsed = JSON.parse(raw) as Partial<StatusCenterState>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.statusDefinitions) || !Array.isArray(parsed.incidentRules)) return structuredClone(statusCenterSeed);
    return { ...structuredClone(statusCenterSeed), ...parsed, releases: parsed.releases || [], silences: parsed.silences || [], audits: parsed.audits || [] };
  } catch {
    return structuredClone(statusCenterSeed);
  }
}

export function useStatusCenter() {
  const [state, dispatch] = useReducer(statusCenterReducer, undefined, restore);
  useEffect(() => window.localStorage.setItem(STATUS_CENTER_STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => {
    dispatch({ type: "expire-silences", payload: { now: new Date().toISOString() } });
    const timer = window.setInterval(() => dispatch({ type: "expire-silences", payload: { now: new Date().toISOString() } }), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return { state, dispatch };
}
