import { useEffect, useMemo, useReducer, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { createInitialState, staticData } from "./data/mockData";
import { AppShell, navItems } from "./components/AppShell";
import { appReducer, currentUser, menuAccessPolicy } from "./services/operations";
import type { AppState, ViewId } from "./types/core";
import { Badge, DataTable, EmptyState, NameCell, Section } from "./components/ui";
import { Workbench } from "./pages/Workbench";
import { Brands } from "./pages/Brands";
import { ScenarioTemplates } from "./pages/ScenarioTemplates";
import { Points } from "./pages/Points";
import { Devices } from "./pages/Devices";
import { Catalog } from "./pages/Catalog";
import { BusinessRequests } from "./pages/BusinessRequests";
import { Incidents } from "./pages/Incidents";
import { Tasks } from "./pages/Tasks";
import { ConfigReleases } from "./pages/ConfigReleases";
import { Reports } from "./pages/Reports";
import { Roles } from "./pages/Roles";
import { LoginPage } from "./pages/Login";
import { SystemGuidePage } from "./pages/SystemGuide";
import { InvitationAcceptPage } from "./pages/InvitationAccept";
import {
  DeviceDetailRoute,
  IncidentDetailRoute,
  PointDetailRoute,
  ReleaseDetailRoute,
  RequestDetailRoute,
  TaskDetailRoute,
} from "./pages/DetailPages";

const STORAGE_KEY = "roboops-state-v15";

function loadInitialState(): AppState {
  const initial = createInitialState();
  if (typeof window === "undefined") return initial;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return initial;
  try {
    const saved = JSON.parse(raw) as Partial<AppState>;
    const auth = { ...initial.auth, ...(saved.auth || {}) };
    if (auth.authenticated && (!auth.expiresAtEpoch || auth.expiresAtEpoch <= Date.now())) {
      auth.authenticated = false;
      delete auth.sessionId;
      delete auth.expiresAt;
      delete auth.expiresAtEpoch;
    }
    if (!auth.authenticated) {
      delete auth.lastError;
      delete auth.lastFailureAt;
      delete auth.failedAttempts;
    }
    return {
      ...initial,
      ...saved,
      auth,
      tenants: saved.tenants || initial.tenants,
      users: saved.users || initial.users,
      filters: { ...initial.filters, ...(saved.filters || {}) },
      team: { ...initial.team, ...(saved.team || {}) },
      userInvitations: saved.userInvitations || initial.userInvitations,
      teamAssignments: saved.teamAssignments || initial.teamAssignments,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return initial;
  }
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadInitialState);
  const location = useLocation();
  const activeId = useMemo(() => {
    const pathname = location.pathname;
    const nested = navItems.find((item) => item.path !== "/" && pathname.startsWith(`${item.path}/`));
    return nested?.id || navItems.find((item) => item.path === pathname)?.id || "workbench";
  }, [location.pathname]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateForStorage(state)));
  }, [state]);

  useEffect(() => {
    if (!state.auth.authenticated || !state.auth.expiresAtEpoch) return undefined;
    const delay = state.auth.expiresAtEpoch - Date.now();
    if (delay <= 0) {
      dispatch({ type: "expire-session" });
      return undefined;
    }
    const timer = window.setTimeout(() => dispatch({ type: "expire-session" }), delay);
    return () => window.clearTimeout(timer);
  }, [state.auth.authenticated, state.auth.expiresAtEpoch]);

  if (location.pathname === "/guide") {
    return (
      <Routes>
        <Route path="/guide" element={<SystemGuidePage state={state} dispatch={dispatch} />} />
        <Route path="*" element={<Navigate to="/guide" replace />} />
      </Routes>
    );
  }

  if (location.pathname.startsWith("/invitations/")) {
    return (
      <Routes>
        <Route path="/invitations/:invitationId/accept" element={<InvitationAcceptPage state={state} dispatch={dispatch} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!state.auth.authenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage state={state} dispatch={dispatch} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (location.pathname === "/login") return <Navigate to="/" replace />;

  return (
    <AppShell
      state={state}
      activeId={activeId}
      onFilterChange={(key, value) => dispatch({ type: "set-filter", key, value })}
      onLogout={() => dispatch({ type: "logout" })}
    >
      <Routes>
        <Route path="/" element={<Workbench state={state} dispatch={dispatch} />} />
        <Route path="/brands" element={<MenuGuard state={state} viewId="brands"><Brands state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/templates" element={<MenuGuard state={state} viewId="templates"><ScenarioTemplates state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/points" element={<MenuGuard state={state} viewId="points"><Points state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/points/:pointId" element={<MenuGuard state={state} viewId="points"><PointDetailRoute state={state} /></MenuGuard>} />
        <Route path="/devices" element={<MenuGuard state={state} viewId="devices"><Devices state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/devices/:deviceId" element={<MenuGuard state={state} viewId="devices"><DeviceDetailRoute state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/catalog" element={<MenuGuard state={state} viewId="catalog"><Catalog state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/orders" element={<MenuGuard state={state} viewId="orders"><BusinessRequests state={state} /></MenuGuard>} />
        <Route path="/orders/:requestId" element={<MenuGuard state={state} viewId="orders"><RequestDetailRoute state={state} /></MenuGuard>} />
        <Route path="/incidents" element={<MenuGuard state={state} viewId="incidents"><Incidents state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/incidents/:incidentId" element={<MenuGuard state={state} viewId="incidents"><IncidentDetailRoute state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/tasks" element={<MenuGuard state={state} viewId="tasks"><Tasks state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/tasks/:taskId" element={<MenuGuard state={state} viewId="tasks"><TaskDetailRoute state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/releases" element={<MenuGuard state={state} viewId="releases"><ConfigReleases state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/releases/:releaseId" element={<MenuGuard state={state} viewId="releases"><ReleaseDetailRoute state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/reports" element={<MenuGuard state={state} viewId="reports"><Reports state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="/roles" element={<MenuGuard state={state} viewId="roles"><Roles state={state} dispatch={dispatch} /></MenuGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export const appStaticData = staticData;

function stateForStorage(state: AppState): AppState {
  if (state.auth.authenticated) return state;
  return {
    ...state,
    auth: { authenticated: false },
  };
}

function MenuGuard({ state, viewId, children }: { state: AppState; viewId: ViewId; children: ReactNode }) {
  const access = menuAccessPolicy(state, viewId);
  if (access.allowed) return <>{children}</>;
  const user = currentUser(state);
  return (
    <Section title="无菜单权限" meta="当前账号未被授予该模块入口">
      <div className="detail-stack">
        <DataTable
          headers={["账号", "请求菜单", "需要权限", "判定", "依据"]}
          rows={[[<NameCell primary={user.name} secondary={user.role} />, navItems.find((item) => item.id === viewId)?.label || viewId, access.permission, <Badge value="已拒绝" />, access.reason]]}
        />
        <EmptyState>可在角色权限中为该账号启用合适的角色实例、权限包和数据范围，审批通过后再访问该模块。</EmptyState>
      </div>
    </Section>
  );
}
