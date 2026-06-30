import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function WatchlistPage() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ entry_type: 'KEYWORD', value: '', reason: '' });
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const load = () => apiClient.get('/watchlist').then(r => setEntries(r.data));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    await apiClient.post('/watchlist', form);
    setForm({ entry_type: 'KEYWORD', value: '', reason: '' });
    load();
  };

  const deactivate = async (id) => {
    await apiClient.patch(`/watchlist/${id}/deactivate`);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-border-hairline">
        <h1 className="text-xl font-bold text-ink-primary">Forensic Watchlist</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Manage system-wide high-risk accounts, PAN cards, UPI IDs, and transaction keywords.
        </p>
      </div>

      {/* Add New Entry Form */}
      {canEdit && (
        <form
          onSubmit={add}
          className="bg-surface-raised border border-border-hairline rounded-xl p-4 flex flex-col md:flex-row gap-3 shadow-card"
        >
          <div className="w-full md:w-48 shrink-0">
            <select
              value={form.entry_type}
              onChange={(e) => setForm({ ...form, entry_type: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            >
              {['ACCOUNT','PHONE','PAN','UPI','KEYWORD','ENTITY'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <input
              placeholder="Value (e.g. UPI alias, PAN card number...)"
              required
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div className="flex-1">
            <input
              placeholder="Reason for flagging / case reference"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <button
            type="submit"
            className="bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold px-5 py-2 rounded-lg transition-colors shadow-sm shrink-0"
          >
            Add Entry
          </button>
        </form>
      )}

      {/* Table of Entries */}
      <div className="bg-surface-raised border border-border-hairline rounded-xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-ink-muted bg-surface-sunken/40 border-b border-border-hairline uppercase font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Value</th>
                <th className="px-5 py-3">Flagging Reason</th>
                {canEdit && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-hairline">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-sunken/20 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-ink-secondary">
                    <span className="font-mono bg-surface-sunken/80 px-2 py-0.5 rounded border border-border-hairline">
                      {entry.entry_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono font-semibold text-ink-primary text-xs">
                    {entry.value}
                  </td>
                  <td className="px-5 py-3.5 text-ink-secondary leading-relaxed">
                    {entry.reason || <span className="italic text-ink-muted">No reason specified</span>}
                  </td>
                  {canEdit && (
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => deactivate(entry.id)}
                        className="text-[10px] font-bold text-risk-high hover:bg-risk-high-bg border border-transparent hover:border-risk-high/15 rounded px-2.5 py-1 transition-colors uppercase tracking-wider"
                      >
                        Deactivate
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="text-center py-12 text-ink-muted italic">
                    No active entries on the watchlist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
