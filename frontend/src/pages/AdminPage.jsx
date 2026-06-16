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
    <div>
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Admin</h1>
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {['users', 'audit', 'models'].map(t => (
          <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t ? 'border-slate-900 text-slate-900 font-medium' : 'border-transparent text-slate-400'}`}>
            {t === 'users' ? 'Users' : t === 'audit' ? 'Audit Log' : 'Model Status'}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="space-y-4">
          <form onSubmit={createUser} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-5 gap-2">
            <input placeholder="Username" required value={form.username}
                   onChange={(e) => setForm({ ...form, username: e.target.value })}
                   className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
            <input placeholder="Password" type="password" required value={form.password}
                   onChange={(e) => setForm({ ...form, password: e.target.value })}
                   className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
            <input placeholder="Full Name" required value={form.full_name}
                   onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                   className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
            <input placeholder="Badge No." required value={form.badge_number}
                   onChange={(e) => setForm({ ...form, badge_number: e.target.value })}
                   className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="border border-slate-300 rounded px-2 py-1.5 text-sm">
              {['IO','SUPERVISOR','ADMIN'].map(r => <option key={r}>{r}</option>)}
            </select>
            <button type="submit" className="col-span-5 bg-slate-900 text-white text-sm rounded py-1.5">Create User</button>
          </form>

          <div className="bg-white border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400 text-xs">
                <tr><th className="px-4 py-2">Username</th><th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Badge</th><th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Active</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-900">{u.username}</td>
                    <td className="px-4 py-2 text-slate-500">{u.full_name}</td>
                    <td className="px-4 py-2 text-slate-500">{u.badge_number}</td>
                    <td className="px-4 py-2 text-slate-500">{u.role}</td>
                    <td className="px-4 py-2">{u.is_active ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && auditLog && (
        <div>
          <div className={`text-sm rounded-lg p-3 mb-4 ${auditLog.chain_status.chain_intact ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            Hash chain: {auditLog.chain_status.chain_intact ? 'Intact' : `BROKEN at ${auditLog.chain_status.broken_rows.length} row(s)`}
            {' '}— {auditLog.chain_status.total_rows} total entries
          </div>
          <div className="bg-white border border-slate-200 rounded-lg max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400 text-xs sticky top-0 bg-white">
                <tr><th className="px-4 py-2">Time</th><th className="px-4 py-2">Action</th>
                    <th className="px-4 py-2">Resource</th></tr>
              </thead>
              <tbody>
                {auditLog.entries.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-400">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-700">{e.action}</td>
                    <td className="px-4 py-2 text-slate-500">{e.resource_type} {e.resource_id?.slice(0,8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'models' && modelStatus && (
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(modelStatus).map(([key, status]) => (
            <div key={key} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="font-medium text-slate-900">{key}</div>
              <div className="text-xs text-slate-500 mt-1">
                {status.exists ? (status.hash_match ? '✓ Verified' : '⚠ Hash mismatch') : '✗ Not found'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
