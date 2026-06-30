import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function AdminPage() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [auditLog, setAuditLog] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', badge_number: '', role: 'IO' });

  useEffect(() => {
    if (tab === 'users')  apiClient.get('/admin/users').then(r => setUsers(r.data));
    if (tab === 'audit')  apiClient.get('/admin/audit-log').then(r => setAuditLog(r.data));
    if (tab === 'models') apiClient.get('/admin/model-status').then(r => setModelStatus(r.data));
  }, [tab]);

  const createUser = async (e) => {
    e.preventDefault();
    await apiClient.post('/admin/users', form);
    setForm({ username: '', password: '', full_name: '', badge_number: '', role: 'IO' });
    apiClient.get('/admin/users').then(r => setUsers(r.data));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-border-hairline">
        <h1 className="text-xl font-bold text-ink-primary">Admin Control Center</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Configure officer credentials, audit blockchain cryptographic hash logs, and verify models.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {[
          { key: 'users', label: 'User Provisioning' },
          { key: 'audit', label: 'Audit Chain Log' },
          { key: 'models', label: 'Forensic Models Verification' }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-accent text-ink-primary font-bold'
                : 'border-transparent text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* User Provisioning Tab */}
      {tab === 'users' && (
        <div className="space-y-6">
          <form
            onSubmit={createUser}
            className="bg-surface-raised border border-border-hairline rounded-xl p-5 grid grid-cols-1 md:grid-cols-5 gap-3 shadow-card"
          >
            <div className="col-span-5 text-xs font-bold text-ink-primary uppercase tracking-wide border-b border-border-hairline pb-2 mb-1">
              Provision New Officer Credentials
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Username</label>
              <input
                placeholder="e.g. jdoe"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Password</label>
              <input
                placeholder="••••••••"
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Full Name</label>
              <input
                placeholder="e.g. John Doe"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Badge ID</label>
              <input
                placeholder="e.g. IO-456"
                required
                value={form.badge_number}
                onChange={(e) => setForm({ ...form, badge_number: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-ink-muted block mb-1">Designated Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              >
                {['IO','SUPERVISOR','ADMIN'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="col-span-1 md:col-span-5 bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold py-2.5 rounded-lg transition-colors shadow-sm mt-2"
            >
              Create User Account
            </button>
          </form>

          {/* Users Table */}
          <div className="bg-surface-raised border border-border-hairline rounded-xl overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-ink-muted bg-surface-sunken/40 border-b border-border-hairline uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Username</th>
                    <th className="px-5 py-3">Full Name</th>
                    <th className="px-5 py-3">Badge ID</th>
                    <th className="px-5 py-3">Designation</th>
                    <th className="px-5 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-sunken/20 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-ink-primary">{u.username}</td>
                      <td className="px-5 py-3.5 text-ink-secondary">{u.full_name}</td>
                      <td className="px-5 py-3.5 font-mono text-ink-secondary">{u.badge_number}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          u.role === 'ADMIN'
                            ? 'bg-risk-high-bg text-risk-high border-risk-high/15'
                            : u.role === 'SUPERVISOR'
                            ? 'bg-risk-medium-bg text-risk-medium border-risk-medium/15'
                            : 'bg-accent-subtle text-accent border border-accent/20'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-base text-accent">
                        {u.is_active ? '✓' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Chain Log Tab */}
      {tab === 'audit' && auditLog && (
        <div className="space-y-6">
          <div className={`text-xs font-semibold rounded-xl border p-4 shadow-sm flex items-center gap-3 ${
            auditLog.chain_status.chain_intact
              ? 'bg-accent-subtle text-accent border-accent/20'
              : 'bg-risk-high-bg text-risk-high border-risk-high/15'
          }`}>
            <span className="text-xl">
              {auditLog.chain_status.chain_intact ? '🛡️' : '🚨'}
            </span>
            <div>
              <div className="font-bold">Cryptographic Chain Verification</div>
              <div className="mt-0.5">
                Hash Chain: {auditLog.chain_status.chain_intact ? 'Secure & Intact' : `BROKEN at row(s): [${auditLog.chain_status.broken_rows.join(', ')}]`}
                {' '}— {auditLog.chain_status.total_rows} total forensic entries verified.
              </div>
            </div>
          </div>

          <div className="bg-surface-raised border border-border-hairline rounded-xl overflow-hidden shadow-card">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-ink-muted bg-surface-sunken/40 border-b border-border-hairline uppercase font-bold tracking-wider sticky top-0 bg-surface-raised z-10">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Action performed</th>
                    <th className="px-5 py-3">Target Resource Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline">
                  {auditLog.entries.map((e) => (
                    <tr key={e.id} className="hover:bg-surface-sunken/20 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-ink-muted">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-ink-primary">
                        {e.action}
                      </td>
                      <td className="px-5 py-3.5 text-ink-secondary">
                        <span className="font-mono bg-surface-sunken px-1.5 py-0.5 rounded border border-border-hairline">
                          {e.resource_type}
                        </span>
                        <span className="ml-2 font-mono text-ink-muted text-[11px]">
                          {e.resource_id?.slice(0, 16)}...
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Model Status Verification Tab */}
      {tab === 'models' && modelStatus && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(modelStatus).map(([key, status]) => {
            const isValid = status.exists && status.hash_match;
            return (
              <div
                key={key}
                className={`bg-surface-raised border rounded-xl p-5 shadow-card flex items-start gap-4 transition-all duration-200 hover:shadow-card-hover ${
                  isValid ? 'border-border-hairline' : 'border-risk-high/30 bg-risk-high-bg/10'
                }`}
              >
                <div className="text-2xl mt-0.5">
                  {isValid ? '🧠' : '⚠️'}
                </div>
                <div className="space-y-1.5 flex-1">
                  <h4 className="font-bold text-ink-primary text-sm capitalize">
                    {key.replace(/_/g, ' ')}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      isValid
                        ? 'bg-accent-subtle text-accent border border-accent/20'
                        : 'bg-risk-high-bg text-risk-high border border-risk-high/15'
                    }`}>
                      {status.exists ? (status.hash_match ? 'Verified Stable' : 'Hash Mismatch') : 'Missing Model'}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    SHA256 signature verification guarantees model weight protection.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
