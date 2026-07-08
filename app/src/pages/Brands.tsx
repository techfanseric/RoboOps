import { BadgeCheck, Building2, FilePenLine, Network, Route, Send, UsersRound } from "lucide-react";
import type { Dispatch } from "react";
import { useState } from "react";
import { configReleaseActionPolicy, currentUser, customerOnboardingPolicy, filteredBrands, filteredOrganizations, filteredTenants, releaseVisibleForCurrentUser, type AppAction } from "../services/operations";
import type { AppState, Brand, Organization } from "../types/core";
import { Badge, DataTable, DetailLink, EmptyState, NameCell, Section } from "../components/ui";

export function Brands({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [openingCustomer, setOpeningCustomer] = useState(false);
  const brands = filteredBrands(state);
  const tenants = filteredTenants(state);
  const organizations = filteredOrganizations(state);
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) || brands[0];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) || organizations[0];
  const releasePolicy = configReleaseActionPolicy(state);
  const onboardingPolicy = customerOnboardingPolicy(state);
  const visibleBrandChanges = state.brandChanges.filter((change) => brands.some((brand) => brand.id === change.brandId) && releaseVisibleForCurrentUser(state, change.release));
  const visibleOrganizationChanges = state.organizationChanges.filter((change) => organizations.some((organization) => organization.id === change.organizationId) && releaseVisibleForCurrentUser(state, change.release));

  return (
    <>
      <Section
        title="租户/客户"
        meta="经营主体、开通状态和平台支持负责人"
        action={
          <button className="text-button primary-action" type="button" disabled={!onboardingPolicy.allowed} title={onboardingPolicy.message} onClick={() => setOpeningCustomer(true)}>
            <Building2 className="lucide-icon" /> 开通客户
          </button>
        }
      >
        {tenants.length ? (
          <DataTable
            headers={["租户/客户", "经营模式", "联系人", "状态", "平台支持", "品牌/组织"]}
            rows={tenants.map((tenant) => [
              <NameCell primary={tenant.name} secondary={tenant.id} />,
              tenant.mode,
              tenant.contact,
              <Badge value={tenant.status} />,
              tenant.supportOwner,
              `${state.brands.filter((brand) => brand.tenant === tenant.name).length} / ${state.organizations.filter((organization) => organization.tenant === tenant.name).length}`,
            ])}
          />
        ) : (
          <EmptyState>当前账号的数据范围内暂无租户/客户</EmptyState>
        )}
      </Section>

      <Section
        title="品牌资料"
        meta="租户归属、默认场景、负责人和启用状态"
        action={
          <button className="text-button primary-action" type="button" disabled={!selectedBrand || !releasePolicy.allowed} title={releasePolicy.message} onClick={() => selectedBrand && setEditingBrand(selectedBrand)}>
            <FilePenLine className="lucide-icon" /> 申请品牌变更
          </button>
        }
      >
        {brands.length ? (
          <DataTable
            headers={["品牌", "租户", "状态", "场景模板", "负责人", "点位"]}
            rows={brands.map((brand) => ({
              key: brand.id,
              selected: selectedBrand?.id === brand.id,
              onClick: () => setSelectedBrandId(brand.id),
              label: `查看${brand.name}`,
              cells: [<NameCell primary={brand.name} secondary={brand.id} />, brand.tenant, <Badge value={brand.status} />, brand.scenario, brand.owner, brand.points],
            }))}
          />
        ) : (
          <EmptyState>当前账号的数据范围内暂无品牌</EmptyState>
        )}
      </Section>

      <div className="grid two">
        <Section
          title="组织/区域"
          meta="总部、城市、区域和运维组"
          action={
            <button className="text-button" type="button" disabled={!selectedOrganization || !releasePolicy.allowed} title={releasePolicy.message} onClick={() => selectedOrganization && setEditingOrganization(selectedOrganization)}>
              <FilePenLine className="lucide-icon" /> 申请组织变更
            </button>
          }
        >
          {organizations.length ? (
            <DataTable
              headers={["组织", "类型", "上级", "负责人", "点位", "用户"]}
              rows={organizations.map((organization) => ({
                key: organization.id,
                selected: selectedOrganization?.id === organization.id,
                onClick: () => setSelectedOrganizationId(organization.id),
                label: `查看${organization.name}`,
                cells: [<NameCell primary={organization.name} secondary={organization.tenant} />, organization.type, organization.parent, organization.owner, organization.points, organization.users],
              }))}
            />
          ) : (
            <EmptyState>当前账号的数据范围内暂无组织</EmptyState>
          )}
        </Section>
        <Section title="上线检查" meta="启用品牌前完成以下配置">
          <ol className="guide-list">
            <li><BadgeCheck className="lucide-icon" />品牌档案与租户归属</li>
            <li><UsersRound className="lucide-icon" />业务、运营、客服、设备、现场和财务负责人</li>
            <li><Network className="lucide-icon" />经营模式与点位规模</li>
            <li><Route className="lucide-icon" />异常分派规则与审批策略</li>
          </ol>
        </Section>
      </div>

      <Section title="待发布品牌与组织配置" meta="品牌和组织变更必须经过配置发布与审批">
        {visibleBrandChanges.length || visibleOrganizationChanges.length ? (
          <DataTable
            headers={["发布", "对象", "类型", "状态", "原因", "详情"]}
            rows={[
              ...visibleBrandChanges.map((change) => [<NameCell primary={change.release} secondary={change.afterBrand.tenant} />, change.afterBrand.name, "品牌", <Badge value={change.status} />, change.reason, <DetailLink to={`/releases/${change.release}`} title={`打开${change.release}详情`} />]),
              ...visibleOrganizationChanges.map((change) => [<NameCell primary={change.release} secondary={change.afterOrganization.tenant} />, change.afterOrganization.name, "组织", <Badge value={change.status} />, change.reason, <DetailLink to={`/releases/${change.release}`} title={`打开${change.release}详情`} />]),
            ]}
          />
        ) : (
          <EmptyState>当前范围暂无待发布品牌或组织配置</EmptyState>
        )}
      </Section>

      {editingBrand ? <BrandChangeDrawer state={state} brand={editingBrand} dispatch={dispatch} onClose={() => setEditingBrand(null)} /> : null}
      {editingOrganization ? <OrganizationChangeDrawer state={state} organization={editingOrganization} dispatch={dispatch} onClose={() => setEditingOrganization(null)} /> : null}
      {openingCustomer ? <CustomerOnboardingDrawer state={state} dispatch={dispatch} onClose={() => setOpeningCustomer(false)} /> : null}
    </>
  );
}

function CustomerOnboardingDrawer({ state, dispatch, onClose }: { state: AppState; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const policy = customerOnboardingPolicy(state);
  const user = currentUser(state);
  const [tenantName, setTenantName] = useState("");
  const [mode, setMode] = useState("客户自营");
  const [contact, setContact] = useState("");
  const [supportOwner, setSupportOwner] = useState(user.name);
  const [brandName, setBrandName] = useState("");
  const [scenario, setScenario] = useState(state.templates[0]?.name || "");
  const [organizationName, setOrganizationName] = useState("");
  const [city, setCity] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminRole, setAdminRole] = useState("租户管理员");
  const [reason, setReason] = useState("");
  const required = [tenantName, mode, contact, supportOwner, brandName, scenario, organizationName, city, adminName, adminEmail, adminRole, reason];
  const canSubmit = policy.allowed && required.every((value) => value.trim().length > 0) && adminEmail.includes("@") && reason.trim().length >= 6;

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="customer-onboarding-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">L4 / 客户开通</p>
            <h3 id="customer-onboarding-title">开通租户/客户</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={policy.risk} />
          <span>{policy.message}</span>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "submit-customer-onboarding", payload: { tenantName, mode, contact, supportOwner, brandName, scenario, organizationName, city, adminName, adminEmail, adminRole, reason } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>租户/客户名称</span>
              <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} />
            </label>
            <label className="field">
              <span>经营模式</span>
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                {["客户自营", "平台代运营", "联合运营", "区域代理"].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>客户联系人</span>
              <input value={contact} onChange={(event) => setContact(event.target.value)} />
            </label>
            <label className="field">
              <span>平台支持负责人</span>
              <input value={supportOwner} onChange={(event) => setSupportOwner(event.target.value)} />
            </label>
            <label className="field">
              <span>首个品牌</span>
              <input value={brandName} onChange={(event) => setBrandName(event.target.value)} />
            </label>
            <label className="field">
              <span>默认场景</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
                {state.templates.map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>首个组织</span>
              <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
            </label>
            <label className="field">
              <span>城市/区域</span>
              <input value={city} onChange={(event) => setCity(event.target.value)} />
            </label>
            <label className="field">
              <span>管理员姓名</span>
              <input value={adminName} onChange={(event) => setAdminName(event.target.value)} />
            </label>
            <label className="field">
              <span>管理员邮箱</span>
              <input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>管理员角色</span>
              <select value={adminRole} onChange={(event) => setAdminRole(event.target.value)}>
                {["租户管理员", "业务负责人", "运营负责人"].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field full">
              <span>开通说明</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明计划经营场景、首批配置范围和后续交付负责人" rows={4} />
            </label>
          </div>
          <DataTable
            headers={["写入对象", "状态", "说明"]}
            rows={[
              ["租户/客户", <Badge value="待开通" />, `${tenantName || "未填写"} / ${mode}`],
              ["品牌", <Badge value="草稿" />, brandName || "未填写"],
              ["组织", <Badge value="待配置" />, organizationName ? `${organizationName} / ${city}` : "未填写"],
              ["管理员邀请", <Badge value="待接受" />, adminEmail || "未填写"],
            ]}
          />
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}><Send className="lucide-icon" /> 提交开通</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function BrandChangeDrawer({ state, brand, dispatch, onClose }: { state: AppState; brand: Brand; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const policy = configReleaseActionPolicy(state);
  const [name, setName] = useState(brand.name);
  const [status, setStatus] = useState(brand.status);
  const [scenario, setScenario] = useState(brand.scenario);
  const [owner, setOwner] = useState(brand.owner);
  const [points, setPoints] = useState(String(brand.points));
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && [name, status, scenario, owner, reason].every((value) => value.trim().length > 0);

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="brand-change-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{brand.id}</p>
            <h3 id="brand-change-title">申请品牌配置变更</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={policy.risk} />
          <span>{policy.message}</span>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "submit-brand-change", payload: { brandId: brand.id, name, status, scenario, owner, points: Number(points), reason } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>品牌名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>状态</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {["试运行", "启用", "暂停", "停用"].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>默认场景</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
                {state.templates.map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>负责人</span>
              <input value={owner} onChange={(event) => setOwner(event.target.value)} />
            </label>
            <label className="field">
              <span>点位数</span>
              <input type="number" min="0" value={points} onChange={(event) => setPoints(event.target.value)} />
            </label>
            <label className="field full">
              <span>变更原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明品牌状态、负责人或默认场景变化，以及对点位、商品/服务和当前请求的影响" rows={4} />
            </label>
          </div>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}><Send className="lucide-icon" /> 提交审批</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function OrganizationChangeDrawer({ state, organization, dispatch, onClose }: { state: AppState; organization: Organization; dispatch: Dispatch<AppAction>; onClose: () => void }) {
  const policy = configReleaseActionPolicy(state);
  const [name, setName] = useState(organization.name);
  const [type, setType] = useState(organization.type);
  const [parent, setParent] = useState(organization.parent);
  const [owner, setOwner] = useState(organization.owner);
  const [points, setPoints] = useState(String(organization.points));
  const [users, setUsers] = useState(String(organization.users));
  const [reason, setReason] = useState("");
  const canSubmit = policy.allowed && [name, type, parent, owner, reason].every((value) => value.trim().length > 0);

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside className="action-drawer wide" role="dialog" aria-modal="true" aria-labelledby="organization-change-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="page-kicker">{organization.id}</p>
            <h3 id="organization-change-title">申请组织配置变更</h3>
          </div>
          <button className="text-button" type="button" onClick={onClose}>取消</button>
        </div>
        <div className="policy-strip">
          <Badge value={policy.risk} />
          <span>{policy.message}</span>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            dispatch({ type: "submit-organization-change", payload: { organizationId: organization.id, name, type, parent, owner, points: Number(points), users: Number(users), reason } });
            onClose();
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>组织名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>组织类型</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                {["总部", "城市运营", "区域运营", "运维组", "项目组", "外部供应商"].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>上级</span>
              <input value={parent} onChange={(event) => setParent(event.target.value)} />
            </label>
            <label className="field">
              <span>负责人</span>
              <input value={owner} onChange={(event) => setOwner(event.target.value)} />
            </label>
            <label className="field">
              <span>点位数</span>
              <input type="number" min="0" value={points} onChange={(event) => setPoints(event.target.value)} />
            </label>
            <label className="field">
              <span>用户数</span>
              <input type="number" min="0" value={users} onChange={(event) => setUsers(event.target.value)} />
            </label>
            <label className="field full">
              <span>变更原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明组织归属、负责人或规模变化，以及谁需要复核后续权限和异常责任" rows={4} />
            </label>
          </div>
          <div className="drawer-actions">
            <button className="text-button" type="button" onClick={onClose}>取消</button>
            <button className="text-button primary-action" type="submit" disabled={!canSubmit}><Send className="lucide-icon" /> 提交审批</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
