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
      
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-onSurface font-serif">System Administration</h1>
        <p className="text-xs text-onSurfaceVariant mt-1">Configure officer credentials, audit cryptographic database chains, and verify machine learning model integrity.</p>
      </div>

      {/* Sub tabs navigation */}
      <div className="bg-surfaceContainer border border-outlineVariant p-1.5 rounded-m3-m flex gap-1 w-fit">
        {['users', 'audit', 'models'].map((t) => {
          const isActive = tab === t;
          const label = t === 'users' ? 'User Directory' : t === 'audit' ? 'Audit log chain' : 'Model Integrities';
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-bold rounded-m3-s transition-all duration-200 m3-interactive
                ${isActive
                  ? 'bg-primaryContainer text-onPrimaryContainer'
                  : 'text-onSurfaceVariant hover:text-onSurface hover:bg-surfaceContainerHighest'
                }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab bodies */}
      <div className="animate-fade-in text-xs text-onSurface">
        
        {/* USERS TAB */}
        {tab === 'users' && (
          <div className="space-y-6">
            
            {/* Create user form */}
            <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l p-6">
              <h3 className="font-bold text-onSurface text-xs mb-4 uppercase tracking-wider">Register EOW Investigator Credentials</h3>
              
              <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">Username</label>
                  <input 
                    placeholder="e.g. j.doe" 
                    required 
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">Password</label>
                  <input 
                    placeholder="••••••••" 
                    type="password" 
                    required 
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">Officer Full Name</label>
                  <input 
                    placeholder="e.g. John Doe" 
                    required 
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">Badge Number</label>
                  <input 
                    placeholder="e.g. KA-9081" 
                    required 
                    value={form.badge_number}
                    onChange={(e) => setForm({ ...form, badge_number: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">System Role</label>
                  <select 
                    value={form.role} 
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans"
                  >
                    {['IO','SUPERVISOR','ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                
                <button 
                  type="submit" 
                  className="col-span-1 sm:col-span-2 lg:col-span-5 bg-primary text-onPrimary text-xs font-bold py-2.5 rounded-m3-s shadow-sm transition-all mt-2 m3-interactive"
                >
                  Register Investigator Credential
                </button>
              </form>
            </div>

            {/* Users directory table */}
            <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l overflow-hidden">
              <div className="p-5 border-b border-outlineVariant">
                <h3 className="font-bold text-onSurface text-sm">Authorized Investigators</h3>
                <p className="text-[11px] text-onSurfaceVariant mt-0.5">Directory of active forensic users.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surfaceContainer border-b border-outlineVariant text-onSurfaceVariant font-bold uppercase tracking-wider">
                      <th className="px-6 py-4">Username</th>
                      <th className="px-6 py-4">Full Name</th>
                      <th className="px-6 py-4">Badge ID</th>
                      <th className="px-6 py-4">System Role</th>
                      <th className="px-6 py-4 text-center">Active Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outlineVariant">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-surfaceContainerHighest transition-colors m3-interactive">
                        <td className="px-6 py-4 font-bold text-onSurface">{u.username}</td>
                        <td className="px-6 py-4 text-onSurface font-medium">{u.full_name}</td>
                        <td className="px-6 py-4 text-onSurfaceVariant font-semibold font-mono">{u.badge_number}</td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-m3-xs bg-primaryContainer text-onPrimaryContainer uppercase border border-primary/10 font-sans">
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold">
                          {u.is_active ? (
                            <span className="text-primary bg-primaryContainer/30 px-2.5 py-0.5 rounded-m3-full border border-primary/20 font-sans">Active</span>
                          ) : (
                            <span className="text-onSurfaceVariant">Suspended</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-onSurfaceVariant">No registered users.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* AUDIT LOG TAB */}
        {tab === 'audit' && auditLog && (
          <div className="space-y-6">
            
            {/* Hash status indicator card */}
            <div className={`flex items-center gap-3.5 border rounded-m3-l p-5
              ${auditLog.chain_status.chain_intact 
                ? 'bg-primaryContainer text-onPrimaryContainer border-primary/30' 
                : 'bg-errorContainer text-onErrorContainer border-error/30'
              }`}
            >
              <div className={`p-3 rounded-m3-m ${auditLog.chain_status.chain_intact ? 'bg-primaryContainer/40' : 'bg-errorContainer/40'}`}>
                {auditLog.chain_status.chain_intact ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <div>
                <h4 className="font-bold text-sm">
                  Database SHA-256 Audit Chain Status: {auditLog.chain_status.chain_intact ? 'SECURED' : 'BROKEN'}
                </h4>
                <p className="mt-1 text-[11px] font-medium">
                  {auditLog.chain_status.chain_intact 
                    ? `Integrity hash chain is verified. Total audited entries: ${auditLog.chain_status.total_rows}.`
                    : `Database intrusion detected! Chain broken at ${auditLog.chain_status.broken_rows.length} records.`
                  }
                </p>
              </div>
            </div>

            {/* Audit log Table list */}
            <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l overflow-hidden">
              <div className="p-5 border-b border-outlineVariant">
                <h3 className="font-bold text-onSurface text-sm">Security Audit Trail</h3>
                <p className="text-[11px] text-onSurfaceVariant mt-0.5">Chronological record of resource access events.</p>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <tbody className="divide-y divide-outlineVariant">
                    <tr className="bg-surfaceContainer text-onSurfaceVariant font-bold uppercase tracking-wider border-b border-outlineVariant">
                      <td className="px-6 py-4">Event Timestamp</td>
                      <td className="px-6 py-4">Action Type</td>
                      <td className="px-6 py-4">Resource Target</td>
                    </tr>
                    {auditLog.entries.map((e) => (
                      <tr key={e.id} className="hover:bg-surfaceContainerHighest transition-colors m3-interactive">
                        <td className="px-6 py-4 text-onSurfaceVariant font-medium whitespace-nowrap font-mono">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 font-bold text-onSurface">
                          {e.action}
                        </td>
                        <td className="px-6 py-4 text-onSurfaceVariant font-semibold font-mono whitespace-nowrap">
                          {e.resource_type} · {e.resource_id?.slice(0, 8)}
                        </td>
                      </tr>
                    ))}
                    {auditLog.entries.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-onSurfaceVariant">No logs captured.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* MODEL INTEGRITY TAB */}
        {tab === 'models' && modelStatus && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(modelStatus).map(([key, status]) => {
              const matches = status.exists && status.hash_match;
              return (
                <div key={key} className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-m p-6 flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-onSurface text-xs uppercase tracking-wider">{key.replace(/_/g, ' ')}</h4>
                    <div className="mt-3.5 space-y-1 text-onSurfaceVariant font-medium">
                      <div>File Status: <span className={status.exists ? 'text-onSurface font-bold' : 'text-error font-bold'}>{status.exists ? 'FOUND' : 'MISSING'}</span></div>
                      <div>Hash Verification: <span className={status.hash_match ? 'text-primary font-bold' : 'text-error font-bold'}>{status.hash_match ? 'VERIFIED' : 'MISMATCH / UNVERIFIED'}</span></div>
                    </div>
                  </div>
                  
                  <div className={`p-2.5 rounded-m3-m border ${matches ? 'bg-primaryContainer/30 border-primary/20 text-primary' : 'bg-errorContainer/30 border-error/20 text-error'}`}>
                    {matches ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
}
