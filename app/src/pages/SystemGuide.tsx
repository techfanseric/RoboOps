import { ArrowLeft, BookOpenCheck, CheckCircle2, ClipboardList, LogIn, Route, ShieldCheck, UsersRound } from "lucide-react";
import type { Dispatch } from "react";
import { Link, useNavigate } from "react-router-dom";
import { demoPassword, roleGroupOrder, roleProfileFor, setupSteps, teamStages } from "../data/guideContent";
import type { AppAction } from "../services/operations";
import type { AppState } from "../types/core";

export function SystemGuidePage({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const navigate = useNavigate();
  const roleAccounts = state.users.filter((user) => user.status === "启用");
  const roleRows = roleAccounts.map((account) => ({ account, profile: roleProfileFor(account.role) }));
  const groupedRoles = roleGroupOrder
    .map((group) => ({ group, rows: roleRows.filter((row) => row.profile.group === group) }))
    .filter((section) => section.rows.length);
  const knownGroups = new Set(roleGroupOrder);
  const extraRoles = roleRows.filter((row) => !knownGroups.has(row.profile.group));
  const defaultRoleAccount = roleAccounts.find((account) => account.id === "usr-002") || roleAccounts[0];
  const backTarget = state.auth.authenticated ? "/" : "/login";
  const backLabel = state.auth.authenticated ? "进入工作台" : "返回登录";

  function loginWithAccount(accountId: string) {
    dispatch({ type: "login", identifier: accountId, password: demoPassword });
    navigate("/", { replace: true });
  }

  return (
    <main className="guide-shell">
      <header className="guide-header">
        <Link className="text-button" to={backTarget}>
          <ArrowLeft className="lucide-icon" /> {backLabel}
        </Link>
        {defaultRoleAccount ? (
          <button className="text-button primary-action" type="button" data-account-id={defaultRoleAccount.id} onClick={() => loginWithAccount(defaultRoleAccount.id)}>
            <LogIn className="lucide-icon" /> 以运营负责人进入
          </button>
        ) : null}
      </header>

      <section className="guide-intro" aria-labelledby="guide-title">
        <p className="page-kicker">RoboOps 使用指南</p>
        <h1 id="guide-title">从零建立机器人商业运营业务</h1>
        <p>
          RoboOps 面向机器人、自动化设备和现场商业服务，帮助客户把点位、设备、商品/服务、订单/请求、异常、任务、配置发布、权限和审计放进同一条运营闭环。客户从小团队起步时，可以按这里的流程和角色建议搭出最小运营组织，再在系统里配置自己的组织、角色和数据范围。
        </p>
        <div className="guide-summary">
          <div>
            <strong>{setupSteps.length}</strong>
            <span>开通步骤</span>
          </div>
          <div>
            <strong>{roleAccounts.length}</strong>
            <span>角色视角</span>
          </div>
          <div>
            <strong>{groupedRoles.length}</strong>
            <span>岗位分组</span>
          </div>
        </div>
      </section>

      <div className="guide-layout">
        <nav className="guide-toc" aria-label="指南目录">
          <a href="#setup"><BookOpenCheck className="lucide-icon" /> 开通流程</a>
          <a href="#team"><UsersRound className="lucide-icon" /> 团队阶段</a>
          <a href="#roles"><ShieldCheck className="lucide-icon" /> 角色职责</a>
          <a href="#accounts"><ClipboardList className="lucide-icon" /> 角色视角</a>
        </nav>

        <div className="guide-main">
          <section className="guide-section" id="setup" aria-labelledby="guide-setup-title">
            <div className="guide-section-head">
              <span><Route className="lucide-icon" /></span>
              <div>
                <h2 id="guide-setup-title">业务开通流程</h2>
                <p>先把业务对象、设备、团队和配置链路建立起来，再进入日常运营。每一步都对应系统里的真实模块和可交付结果。</p>
              </div>
            </div>
            <div className="guide-step-list">
              {setupSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article className="guide-step-row" key={step.title}>
                    <div className="guide-step-index">{String(index + 1).padStart(2, "0")}</div>
                    <Icon className="lucide-icon" aria-hidden="true" />
                    <div className="guide-step-content">
                      <h3>{step.title}</h3>
                      <p>{step.purpose}</p>
                      <dl>
                        <dt>负责人</dt>
                        <dd>{step.owner}</dd>
                        <dt>完成后应得到</dt>
                        <dd>{step.output}</dd>
                      </dl>
                    </div>
                    <div className="guide-pills" aria-label={`${step.title}相关模块`}>
                      {step.modules.map((module) => (
                        <span key={module}>{module}</span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="guide-section" id="team" aria-labelledby="guide-team-title">
            <div className="guide-section-head">
              <span><UsersRound className="lucide-icon" /></span>
              <div>
                <h2 id="guide-team-title">按业务规模搭团队</h2>
                <p>很多客户会从小团队起步，角色需要随着业务阶段组合和拆分。系统给出推荐分工，真实组织可以按规模、业务模式和数据范围调整角色。</p>
              </div>
            </div>
            <div className="guide-stage-list">
              {teamStages.map((stage) => (
                <article className="guide-stage" key={stage.title}>
                  <header>
                    <h3>{stage.title}</h3>
                    <span>{stage.scale}</span>
                  </header>
                  <p>{stage.focus}</p>
                  <div className="guide-pills">
                    {stage.roles.map((role) => (
                      <span key={role}>{role}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="guide-section" id="roles" aria-labelledby="guide-roles-title">
            <div className="guide-section-head">
              <span><ShieldCheck className="lucide-icon" /></span>
              <div>
                <h2 id="guide-roles-title">角色职责与权限边界</h2>
                <p>每个角色都对应一条真实业务链路。登录后看到的菜单、待办、审批队列和数据范围，应该由角色实例和权限包共同决定。</p>
              </div>
            </div>
            <div className="guide-role-groups">
              {[...groupedRoles, ...(extraRoles.length ? [{ group: "其他角色", rows: extraRoles }] : [])].map((section) => (
                <section className="guide-role-group" key={section.group} aria-labelledby={`guide-role-${section.group}`}>
                  <h3 id={`guide-role-${section.group}`}>{section.group}</h3>
                  <div className="guide-role-list">
                    {section.rows.map(({ account, profile }) => (
                      <article className="guide-role-row" key={account.id}>
                        <aside className="guide-role-meta">
                          <span>{account.id}</span>
                          <strong>{account.role}</strong>
                          <p>{account.name} / {account.scope}</p>
                          <button className="text-button" type="button" data-account-id={account.id} onClick={() => loginWithAccount(account.id)}>
                            以此账号进入
                          </button>
                        </aside>
                        <div className="guide-role-body">
                          <p className="guide-role-mission">{profile.mission}</p>
                          <div className="guide-role-detail-grid">
                            <div>
                              <h4>登录后先看</h4>
                              <p>{profile.firstStop}</p>
                            </div>
                            <div>
                              <h4>权限边界</h4>
                              <p>{profile.boundary}</p>
                            </div>
                          </div>
                          <div className="guide-role-columns">
                            <RoleList title="日常处理" items={profile.dailyWork} />
                            <RoleList title="需要判断" items={profile.decisions} />
                            <RoleList title="常见交接" items={profile.handoffs} />
                          </div>
                          <div className="guide-pills">
                            {profile.pages.map((page) => (
                              <span key={page}>{page}</span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section className="guide-section" id="accounts" aria-labelledby="guide-accounts-title">
            <div className="guide-section-head">
              <span><CheckCircle2 className="lucide-icon" /></span>
              <div>
                <h2 id="guide-accounts-title">角色视角</h2>
                <p>可用不同岗位账号检查菜单、待办、审批队列和数据范围是否符合授权边界。</p>
              </div>
            </div>
            <div className="guide-account-table" role="table" aria-label="角色视角账号">
              <div role="row">
                <span role="columnheader">账号</span>
                <span role="columnheader">姓名</span>
                <span role="columnheader">角色</span>
                <span role="columnheader">范围</span>
                <span role="columnheader">操作</span>
              </div>
              {roleAccounts.map((account) => (
                <div role="row" key={account.id}>
                  <span role="cell">{account.id}</span>
                  <span role="cell">{account.name}</span>
                  <span role="cell">{account.role}</span>
                  <span role="cell">{account.scope}</span>
                  <span role="cell">
                    <button type="button" data-account-id={account.id} onClick={() => loginWithAccount(account.id)}>进入系统</button>
                  </span>
                </div>
              ))}
            </div>
            <p className="guide-password">统一体验密码：<code>{demoPassword}</code></p>
          </section>
        </div>
      </div>
    </main>
  );
}

function RoleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
