import { BookOpenCheck, LockKeyhole, LogIn } from "lucide-react";
import type { Dispatch, FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { demoPassword } from "../data/guideContent";
import type { AppAction } from "../services/operations";
import type { AppState } from "../types/core";

export function LoginPage({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const demoAccounts = state.users.filter((user) => user.status === "启用");
  const accountFromQuery = searchParams.get("account");

  useEffect(() => {
    if (state.auth.authenticated) navigate("/", { replace: true });
  }, [navigate, state.auth.authenticated]);

  useEffect(() => {
    if (!accountFromQuery) return;
    const account = demoAccounts.find((user) => user.id === accountFromQuery);
    if (!account) return;
    setIdentifier(account.id);
    setPassword(demoPassword);
  }, [accountFromQuery, demoAccounts]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "login", identifier, password });
  }

  return (
    <main className="login-shell">
      <section className="login-panel auth-panel" aria-labelledby="login-title">
        <div className="login-hero">
          <div className="login-brand">
            <div className="login-mark">
              <LockKeyhole className="lucide-icon" />
            </div>
            <div>
              <p className="page-kicker">RoboOps</p>
              <h1 id="login-title">登录机器人商业运营平台</h1>
            </div>
          </div>
        </div>

        <div className="login-layout">
          <div className="login-primary">
            <form className="login-form" onSubmit={submit}>
              <label className="field">
                <span>账号</span>
                <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" placeholder="请输入账号或企业邮箱" />
              </label>
              <label className="field">
                <span>密码</span>
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="请输入密码" />
              </label>
              {state.auth.lastError ? <p className="login-error">{state.auth.lastError}</p> : null}
              <button className="text-button primary-action login-submit" type="submit" disabled={!identifier.trim() || !password.trim()}>
                <LogIn className="lucide-icon" /> 登录
              </button>
              <p className="login-help">无法登录时，请联系租户管理员或平台支持重置账号。</p>
            </form>

            <section className="login-guide-entry" aria-label="系统使用指南">
              <div>
                <BookOpenCheck className="lucide-icon" aria-hidden="true" />
                <div>
                  <h2>第一次使用 RoboOps？</h2>
                  <p>查看完整指南，了解系统开通流程和角色分工。</p>
                </div>
              </div>
              <Link className="text-button" to="/guide">查看系统使用指南</Link>
            </section>
          </div>

        </div>
      </section>
    </main>
  );
}
