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
    <div>
      <h1 className="text-lg font-semibold text-slate-900 mb-4">Watchlist</h1>

      {canEdit && (
        <form onSubmit={add} className="bg-white border border-slate-200 rounded-lg p-4 mb-4 flex gap-2">
          <select value={form.entry_type} onChange={(e) => setForm({ ...form, entry_type: e.target.value })}
                  className="border border-slate-300 rounded px-2 py-1.5 text-sm">
            {['ACCOUNT','PHONE','PAN','UPI','KEYWORD','ENTITY'].map(t => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Value" required value={form.value}
                 onChange={(e) => setForm({ ...form, value: e.target.value })}
                 className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm" />
          <input placeholder="Reason" value={form.reason}
                 onChange={(e) => setForm({ ...form, reason: e.target.value })}
                 className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm" />
          <button type="submit" className="bg-slate-900 text-white text-sm rounded px-4 py-1.5">Add</button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400 text-xs">
            <tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Reason</th>{canEdit && <th className="px-4 py-2"></th>}</tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500">{e.entry_type}</td>
                <td className="px-4 py-2 text-slate-900">{e.value}</td>
                <td className="px-4 py-2 text-slate-500">{e.reason}</td>
                {canEdit && (
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => deactivate(e.id)} className="text-xs text-red-500 hover:underline">Deactivate</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
