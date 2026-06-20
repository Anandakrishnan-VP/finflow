import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function DashboardPage() {
  const [cases, setCases] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ case_number: '', title: '', description: '' });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = () => apiClient.get('/cases').then((r) => setCases(r.data));
  useEffect(() => { load(); }, []);

  const createCase = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await apiClient.post('/cases', form);
      setShowCreate(false);
      navigate(`/cases/${data.id}`);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create case. Case number must be unique.");
    } finally {
      setCreating(false);
    }
  };

  const archiveCase = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete/archive this case?")) return;
    try {
      await apiClient.patch(`/cases/${id}/archive`);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to archive case. Make sure you are logged in as ADMIN.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Cases</h1>
        <button onClick={() => setShowCreate(true)}
                className="bg-slate-900 text-white text-sm rounded px-4 py-2">New Case</button>
      </div>

      <div className="grid gap-3">
        {cases.map((c) => (
          <div key={c.id} onClick={() => navigate(`/cases/${c.id}`)}
               className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-400 hover:shadow-sm cursor-pointer transition flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-800">{c.case_number} — {c.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  c.status === 'ANALYZED' 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-slate-50 text-slate-600 border border-slate-100'
                }`}>{c.status}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1.5">{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
            <button
              onClick={(e) => archiveCase(e, c.id)}
              className="text-xs text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-md px-2.5 py-1.5 transition font-semibold"
              title="Delete / Archive Case"
            >
              Delete
            </button>
          </div>
        ))}
        {cases.length === 0 && <div className="text-sm text-slate-400 text-center py-12">No cases yet.</div>}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4">
          <form onSubmit={createCase} className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="font-semibold mb-4">New Case</h2>
            <input placeholder="Case Number (e.g. KA-EOW-2024-0047)" required
                   value={form.case_number}
                   onChange={(e) => setForm({ ...form, case_number: e.target.value })}
                   className="w-full border border-slate-300 rounded px-3 py-2 mb-3 text-sm" />
            <input placeholder="Title" required value={form.title}
                   onChange={(e) => setForm({ ...form, title: e.target.value })}
                   className="w-full border border-slate-300 rounded px-3 py-2 mb-3 text-sm" />
            <textarea placeholder="Description" value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-2 mb-4 text-sm" rows={3} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)}
                      disabled={creating}
                      className="text-sm px-4 py-2 text-slate-500 disabled:opacity-40">Cancel</button>
              <button type="submit" disabled={creating} className="text-sm px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50">
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
