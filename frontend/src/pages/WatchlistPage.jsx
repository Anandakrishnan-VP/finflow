import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function WatchlistPage() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ entry_type: 'KEYWORD', value: '', reason: '' });
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const load = () => apiClient.get('/watchlist').then(r => setEntries(r.data));
  
  useEffect(() => {
    load();
  }, []);

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

  const filteredEntries = entries.filter(e => 
    e.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.entry_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-onSurface font-serif">Watchlist Database</h1>
        <p className="text-xs text-onSurfaceVariant mt-1">Configure target keywords, account numbers, and intelligence markers to flag during bank statements import.</p>
      </div>

      {/* Add Mark Form Card */}
      {canEdit && (
        <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l p-6">
          <h3 className="text-xs font-bold text-onSurface uppercase tracking-wider mb-4">Register intelligence Watchlist Marker</h3>
          
          <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs">
            
            {/* Entry Type */}
            <div>
              <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">Marker Type</label>
              <select 
                value={form.entry_type} 
                onChange={(e) => setForm({ ...form, entry_type: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans"
              >
                {['ACCOUNT','PHONE','PAN','UPI','KEYWORD','ENTITY'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Marker Value */}
            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">Value (e.g. Account No, UPI ID, etc)</label>
              <input 
                placeholder="Enter search term..." 
                required 
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="w-full px-4 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans" 
              />
            </div>

            {/* Reason */}
            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-onSurfaceVariant uppercase tracking-wider mb-1.5">Context / Reason</label>
              <input 
                placeholder="Describe reason for marker..." 
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-4 py-2.5 bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans" 
              />
            </div>

            {/* Submit */}
            <div>
              <button 
                type="submit" 
                className="w-full bg-primary text-onPrimary text-xs font-bold py-2.5 rounded-m3-s shadow-sm transition-all m3-interactive"
              >
                Create Marker
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l overflow-hidden">
        
        {/* Table Search bar */}
        <div className="p-5 border-b border-outlineVariant flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-bold text-onSurface">Active Watchlist Entries</h3>
            <p className="text-[11px] text-onSurfaceVariant mt-0.5">List of keywords and accounts flagged across imported statements.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-onSurfaceVariant">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search watchlist entries..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface focus:outline-none focus:ring-1 focus:ring-primary font-sans"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surfaceContainer border-b border-outlineVariant text-onSurfaceVariant font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Marker Type</th>
                <th className="px-6 py-4">Flag Value</th>
                <th className="px-6 py-4">Investigation Justification</th>
                {canEdit && <th className="px-6 py-4"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outlineVariant">
              {filteredEntries.map((e) => (
                <tr key={e.id} className="hover:bg-surfaceContainerHighest transition-colors m3-interactive">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-m3-xs bg-primaryContainer text-onPrimaryContainer uppercase border border-primary/10 font-sans">
                      {e.entry_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-onSurface whitespace-nowrap">
                    {e.value}
                  </td>
                  <td className="px-6 py-4 text-onSurfaceVariant max-w-sm truncate">
                    {e.reason || 'No justification provided.'}
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button 
                        onClick={() => deactivate(e.id)} 
                        className="text-xs text-error hover:text-error/85 font-bold transition-colors m3-interactive p-1.5"
                      >
                        Deactivate
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="px-6 py-12 text-center text-onSurfaceVariant">
                    No matching watchlist markers found.
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
