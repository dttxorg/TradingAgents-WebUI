import type { ReactElement } from 'react';

export interface UsersPanelProps {
  state: any;
  handlers: any;
  helpers: any;
}

export function UsersPanel({ state, handlers, helpers }: UsersPanelProps): ReactElement {
  const Panel = helpers.Panel;
  const formatMoney = helpers.formatMoney;
  const Users = helpers.Users;
  const UserPlus = helpers.UserPlus;
  const Wallet = helpers.Wallet;

  const t = state.t;
  const publicPricing = state.publicPricing;
  const secretStatus = state.secretStatus;
  const newUserDraft = state.newUserDraft;
  const rechargeDraft = state.rechargeDraft;
  const adminUsers = state.adminUsers;
  const isSaving = state.isSaving;

  const setNewUserDraft = handlers.setNewUserDraft;
  const createAdminManagedUser = handlers.createAdminManagedUser;
  const setRechargeDraft = handlers.setRechargeDraft;
  const rechargeUser = handlers.rechargeUser;

  return (
    <Panel title={t.adminUsers} icon={<Users size={17} />}>
      <div className="new-user-grid">
        <input placeholder={t.username} value={newUserDraft.username} onChange={(event) => setNewUserDraft((current: any) => ({ ...current, username: event.target.value }))} />
        <input placeholder={t.password} type="password" value={newUserDraft.password} onChange={(event) => setNewUserDraft((current: any) => ({ ...current, password: event.target.value }))} />
        <input placeholder={t.initialBalance} value={newUserDraft.initialBalance} onChange={(event) => setNewUserDraft((current: any) => ({ ...current, initialBalance: event.target.value }))} />
        <select value={newUserDraft.role} onChange={(event) => setNewUserDraft((current: any) => ({ ...current, role: event.target.value as 'admin' | 'user' }))}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button className="secondary" onClick={createAdminManagedUser} disabled={isSaving}>
          <UserPlus size={16} />
          {t.newUser}
        </button>
      </div>
      <div className="user-list">
        {adminUsers.map((user: any) => (
          <section key={user.id} className="user-row">
            <div>
              <strong>{user.username}</strong>
              <small>{user.role} · {formatMoney(user.balance, publicPricing?.currency)} · {t.frozen} {formatMoney(user.frozenBalance, publicPricing?.currency)}</small>
            </div>
            <div className="recharge-row">
              <input placeholder={t.recharge} value={rechargeDraft[user.id] ?? ''} onChange={(event) => setRechargeDraft((current: any) => ({ ...current, [user.id]: event.target.value }))} inputMode="decimal" />
              <button className="secondary" onClick={() => rechargeUser(user.id)} disabled={isSaving}>
                <Wallet size={15} />
                {t.recharge}
              </button>
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
