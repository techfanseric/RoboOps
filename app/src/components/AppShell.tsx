import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Blocks,
  Bot,
  Building2,
  ChartColumn,
  CircleAlert,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MapPin,
  PackageOpen,
  Send,
  ShieldCheck,
} from "lucide-react";
import { staticData } from "../data/mockData";
import {
  businessSnapshot,
  currentUser,
  currentUserHasBusinessAccess,
  currentUserRoles,
  currentUserTeamAssignments,
  filterOptionsForCurrentUser,
  filteredBrands,
  menuAccessPolicy,
  releaseVisibleForCurrentUser,
} from "../services/operations";
import type { AppState, NavItem } from "../types/core";

export const navItems: NavItem[] = [
  { id: "workbench", icon: LayoutDashboard, label: "工作台", count: "12", path: "/" },
  { id: "brands", icon: Building2, label: "品牌或组织", count: "3", path: "/brands" },
  { id: "templates", icon: Blocks, label: "场景模板", count: "2", path: "/templates" },
  { id: "points", icon: MapPin, label: "点位", count: "8", path: "/points" },
  { id: "devices", icon: Bot, label: "机器人设备", count: "16", path: "/devices" },
  { id: "catalog", icon: PackageOpen, label: "商品服务", count: "14", path: "/catalog" },
  { id: "orders", icon: ClipboardList, label: "订单请求", count: "48", path: "/orders" },
  { id: "incidents", icon: CircleAlert, label: "异常中心", count: "7", path: "/incidents" },
  { id: "tasks", icon: ListChecks, label: "任务工单", count: "11", path: "/tasks" },
  { id: "releases", icon: Send, label: "配置发布", count: "5", path: "/releases" },
  { id: "reports", icon: ChartColumn, label: "报表", count: "9", path: "/reports" },
  { id: "roles", icon: ShieldCheck, label: "角色权限", count: "15", path: "/roles" },
];

const subtitles: Record<string, string> = {
  workbench: "运营状态、异常、点位与角色责任汇总",
  brands: "租户、品牌、组织与上线责任",
  templates: "场景字段、履约状态、异常字典和责任角色",
  points: "点位状态、营业设置、设备绑定和负责人",
  devices: "机器人、自动化设备、外围设备和事件",
  catalog: "商品/服务、属性、规格、上下架和履约模板",
  orders: "订单/服务请求生命周期和执行事件",
  incidents: "异常分派、处理指引、SLA 和处理记录",
  tasks: "补给、维护、人工确认和配置检查",
  releases: "配置版本、发布范围、审批和记录",
  reports: "经营、履约、异常、设备和点位复盘",
  roles: "角色模板、权限包、数据范围和风险检查",
};

export function AppShell({
  state,
  activeId,
  children,
  onFilterChange,
  onLogout,
}: {
  state: AppState;
  activeId: string;
  children: ReactNode;
  onFilterChange: (key: "brand" | "scenario" | "point", value: string) => void;
  onLogout: () => void;
}) {
  const user = currentUser(state);
  const activeAssignments = currentUserTeamAssignments(state);
  const effectiveRoles = currentUserRoles(state).filter((role) => role !== "待授权用户");
  const accountRoleLabel = effectiveRoles.length ? effectiveRoles.join("、") : user.role;
  const accountScopeLabel = activeAssignments.length ? Array.from(new Set(activeAssignments.map((assignment) => assignment.scope))).join("、") : user.scope;
  const accountContextLabel = `${accountRoleLabel} · ${accountScopeLabel}`;
  const sessionLabel = state.auth.expiresAt ? `在线，会话至 ${state.auth.expiresAt}` : "在线";
  const active = navItems.find((item) => item.id === activeId) || navItems[0];
  const hasBusinessAccess = currentUserHasBusinessAccess(state);
  const filterOptions = hasBusinessAccess ? filterOptionsForCurrentUser(state) : { brands: [], scenarios: [], points: [] };
  const snapshot = businessSnapshot(state);
  const visibleBrands = new Set(filterOptions.brands);
  const visibleNavItems = navItems.filter((item) => menuAccessPolicy(state, item.id).allowed);
  const navCounts: Partial<Record<NavItem["id"], string>> = {
    workbench: hasBusinessAccess ? String(snapshot.incidents.length + snapshot.tasks.length) : "0",
    brands: String(filteredBrands(state).length),
    templates: String(filterOptions.scenarios.length),
    points: String(snapshot.points.length),
    devices: String(snapshot.devices.length),
    catalog: String(state.catalog.filter((item) => visibleBrands.has(item.brand)).length),
    orders: String(snapshot.requests.length),
    incidents: String(snapshot.incidents.length),
    tasks: String(snapshot.tasks.length),
    releases: String(state.releases.filter((release) => releaseVisibleForCurrentUser(state, release.id)).length),
    reports: "5",
    roles: String(staticData.roles.length),
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-block">
          <h1 className="brand-name">RoboOps</h1>
          <p className="brand-subtitle">机器人商业运营平台</p>
        </div>
        <nav className="nav" aria-label="主导航">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const access = menuAccessPolicy(state, item.id);
            return (
              <NavLink className={({ isActive }) => `nav-button ${isActive ? "active" : ""}`} to={item.path} key={item.id} title={`${item.label} / ${access.source}`}>
                <span className="nav-icon">
                  <Icon className="lucide-icon" aria-hidden="true" />
                </span>
                <span>{item.label}</span>
                <span className="nav-count">{navCounts[item.id] || item.count}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer" aria-label="当前登录账号">
          <div className="account-card">
            <div className="account-avatar">{user.name.slice(0, 1)}</div>
            <div className="account-info">
              <span className="account-name-line">
                <strong>{user.name}</strong>
                <span className="account-status" title={sessionLabel} aria-label={sessionLabel} />
              </span>
              <span title={accountContextLabel}>{accountContextLabel}</span>
            </div>
            <button className="account-logout" type="button" title="退出登录" aria-label="退出登录" onClick={onLogout}>
              <LogOut className="lucide-icon" />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="page-kicker">{subtitles[active.id]}</p>
            <h2 className="page-title">{active.label}</h2>
          </div>
          <div className="filters">
            <SelectField label="品牌" value={state.filters.brand} options={["all", ...filterOptions.brands]} onChange={(value) => onFilterChange("brand", value)} />
            <SelectField label="场景" value={state.filters.scenario} options={["all", ...filterOptions.scenarios]} onChange={(value) => onFilterChange("scenario", value)} />
            <SelectField label="点位" value={state.filters.point} options={["all", ...filterOptions.points]} onChange={(value) => onFilterChange("point", value)} />
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option} key={option}>
            {option === "all" ? "全部" : option}
          </option>
        ))}
      </select>
    </div>
  );
}
