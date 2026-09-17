// panels/AccountsPanel.tsx — 账户（admin 专）
import { useEffect, useState, useCallback } from 'react';
import { api, type User } from '@betting/core';
import { SkeletonTable } from '../components/Skeleton.js';
import { toast } from '../store.js';

export function AccountsPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [selId, setSelId] = useState<number | ''>('');
  const [user, setUser] = useState<User | null>(null);
  const [deposit, setDeposit] = useState('1000');
  const [loading, setLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshUsers(); }, [refreshUsers]);

  const loadUser = async (id: number) => {
    try {
      const res = await api.getUser(id);
      setUser(res.user);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const createUser = async () => {
    if (!name.trim()) { toast.warn('请输入用户名'); return; }
    try {
      const res = await api.createUser(name.trim());
      toast.ok(`创建成功：#${res.user.id} ${res.user.name}`);
      setName('');
      await refreshUsers();
      setSelId(res.user.id);
      setUser(res.user);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const doDeposit = async () => {
    if (selId === '') { toast.warn('先选择用户'); return; }
    const amt = Number(deposit);
    if (!(amt > 0)) { toast.warn('金额必须大于 0'); return; }
    try {
      const res = await api.deposit(Number(selId), amt);
      toast.ok(`充值成功：余额 → ¥${res.account.balance}`);
      await loadUser(Number(selId));
      await refreshUsers();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="card fade-in">
      <h2>👤 账户</h2>
      <div className="row">
        <input className="wide" placeholder="新用户名" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={createUser}>创建</button>
      </div>
      <div className="row">
        <select
          value={selId}
          onChange={(e) => {
            const v = e.target.value;
            setSelId(v === '' ? '' : Number(v));
            if (v !== '') void loadUser(Number(v));
          }}
        >
          <option value="">选择用户</option>
          {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}</option>)}
        </select>
        <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} min="1" />
        <button onClick={doDeposit} className="ghost">充值</button>
      </div>
      {user && (
        <div className="row">
          <span className="muted">#{user.id} {user.name}</span>
          <span className="balance-inline">¥{user.balance}</span>
        </div>
      )}
      <h3>用户列表</h3>
      {loading ? <SkeletonTable rows={4} cols={3} /> : (
        <table>
          <thead><tr><th>#</th><th>名称</th><th>余额</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td><td>{u.name}</td><td>¥{u.balance}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={3} className="muted">暂无用户</td></tr>}
          </tbody>
        </table>
      )}
    </section>
  );
}
