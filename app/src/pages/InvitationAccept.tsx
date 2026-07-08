import { CheckCircle2, KeyRound, LogIn, ShieldCheck } from "lucide-react";
import type { Dispatch, FormEvent } from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { currentUser, invitationExpired, type AppAction } from "../services/operations";
import type { AppState } from "../types/core";
import { Badge, DataTable, NameCell } from "../components/ui";

export function InvitationAcceptPage({ state, dispatch }: { state: AppState; dispatch: Dispatch<AppAction> }) {
  const { invitationId = "" } = useParams();
  const invitation = state.userInvitations.find((item) => item.id === invitationId);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordReady = password.trim().length >= 8 && password === confirmPassword;
  const accepted = invitation?.status === "已接受";
  const expired = invitation ? invitation.status === "已过期" || (invitation.status === "待接受" && invitationExpired(invitation.expiresAt)) : false;
  const canAccept = Boolean(invitation && invitation.status === "待接受" && !expired);
  const existingAccount = invitation?.accountId ? state.users.find((user) => user.id === invitation.accountId) : undefined;
  const loggedInUser = state.auth.authenticated ? currentUser(state) : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation || !passwordReady || !canAccept || state.auth.authenticated) return;
    dispatch({ type: "accept-invitation", payload: { invitationId: invitation.id, password } });
  }

  return (
    <main className="login-shell">
      <section className="login-panel invite-panel" aria-labelledby="invitation-title">
        <div className="login-brand">
          <div className="login-mark">
            {accepted ? <CheckCircle2 className="lucide-icon" /> : <KeyRound className="lucide-icon" />}
          </div>
          <div>
            <p className="page-kicker">RoboOps 邀请</p>
            <h1 id="invitation-title">{accepted ? "邀请已接受" : "接受账号邀请"}</h1>
          </div>
        </div>

        {!invitation ? (
          <div className="detail-stack">
            <p className="login-error">邀请不存在或链接已失效。</p>
            <Link className="text-button" to="/login"><LogIn className="lucide-icon" /> 返回登录</Link>
          </div>
        ) : (
          <div className="detail-stack">
            <DataTable
              headers={["邀请", "内容"]}
              rows={[
                ["姓名", invitation.name],
                ["邮箱", invitation.email],
                ["租户/客户", invitation.tenant],
                ["拟绑定角色", invitation.role],
                ["数据范围", invitation.scope],
                ["状态", <Badge value={expired ? "已过期" : invitation.status} />],
              ]}
            />

            {accepted ? (
              <div className="detail-stack">
                <div className="policy-strip">
                  <Badge value="已接受" />
                  <span>账号已创建，当前基础角色为待授权用户。业务权限仍需由管理员配置角色实例并完成审批。</span>
                </div>
                {existingAccount ? (
                  <DataTable
                    headers={["账号", "状态", "权限"]}
                    rows={[[<NameCell primary={existingAccount.name} secondary={existingAccount.email || existingAccount.id} />, <Badge value={existingAccount.status} />, existingAccount.role]]}
                  />
                ) : null}
                <Link className="text-button primary-action login-submit" to="/login"><LogIn className="lucide-icon" /> 前往登录</Link>
              </div>
            ) : expired ? (
              <div className="detail-stack">
                <div className="policy-strip">
                  <Badge value="已过期" />
                  <span>该邀请链接已超过有效期。请联系租户管理员重新发起邀请。</span>
                </div>
                <Link className="text-button" to="/login"><LogIn className="lucide-icon" /> 返回登录</Link>
              </div>
            ) : loggedInUser ? (
              <div className="detail-stack">
                <div className="policy-strip">
                  <Badge value="当前已登录" />
                  <span>当前浏览器会话属于 {loggedInUser.name}。请先退出当前账号，再用受邀邮箱接受邀请。</span>
                </div>
                <button className="text-button" type="button" onClick={() => dispatch({ type: "logout" })}>退出当前账号</button>
              </div>
            ) : (
              <form className="login-form" onSubmit={submit}>
                <div className="policy-strip">
                  <ShieldCheck className="lucide-icon" />
                  <span>接受邀请只创建登录账号，不直接授予拟绑定角色；角色权限会在后台通过角色实例审批后生效。</span>
                </div>
                <label className="field">
                  <span>设置密码</span>
                  <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="至少 8 位" />
                </label>
                <label className="field">
                  <span>确认密码</span>
                  <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="再次输入密码" />
                </label>
                {password && password.trim().length < 8 ? <p className="login-error">密码至少需要 8 位。</p> : null}
                {confirmPassword && password !== confirmPassword ? <p className="login-error">两次输入的密码不一致。</p> : null}
                <button className="text-button primary-action login-submit" type="submit" disabled={!passwordReady || !canAccept}>
                  <CheckCircle2 className="lucide-icon" /> 接受邀请
                </button>
              </form>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
