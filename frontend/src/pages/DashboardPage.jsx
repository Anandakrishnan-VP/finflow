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
    if (!window.confirm("Are you sure you want to delete this case?")) return;
    if (!window.confirm("WARNING: This will permanently delete all case data, uploaded statements, and transactions from the database. This action cannot be undone. Do you want to proceed?")) return;
    try {
      await apiClient.delete(`/cases/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete case. Make sure you are logged in as ADMIN.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-hairline">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">Forensic Investigation Cases</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Select an active case below or initialize a new forensic investigation.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Initialize Case
        </button>
      </div>

      {/* Grid List of Cases */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cases.map((c, idx) => {
          const isAnalyzed = c.status === 'ANALYZED';
          return (
            <div
              key={c.id}
              onClick={() => navigate(`/cases/${c.id}`)}
              style={{ animationDelay: `${idx * 50}ms` }}
              className="group text-left bg-surface-raised border border-border-hairline rounded-2xl p-6 cursor-pointer flex flex-col justify-between h-52 premium-card relative shadow-sm hover:shadow-md animate-slide-up"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-extrabold text-accent tracking-wider bg-accent-subtle px-2.5 py-0.5 rounded border border-accent/15">
                    {c.case_number}
                  </span>
                  <span className={`text-[9px] font-extrabold tracking-wider px-2.5 py-0.5 rounded-full uppercase ${
                    isAnalyzed
                      ? 'bg-accent-subtle text-accent border border-accent/20'
                      : c.status === 'ANALYZING'
                      ? 'bg-risk-medium-bg text-risk-medium border border-risk-medium/15 animate-pulse'
                      : 'bg-surface-sunken text-ink-secondary border border-border-hairline'
                  }`}>
                    {c.status}
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-ink-primary mt-3 group-hover:text-accent transition-colors duration-200 line-clamp-1">
                  {c.title}
                </h3>
                <p className="text-xs text-ink-muted mt-2 line-clamp-2 leading-relaxed">
                  {c.description || 'No description provided. Click to open and add details.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border-hairline/60 flex items-center justify-between">
                <span className="text-[10px] text-ink-muted font-bold tracking-wide font-data">
                  Created: {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <button
                  onClick={(e) => archiveCase(e, c.id)}
                  className="text-[10px] text-risk-high hover:bg-risk-high-bg border border-transparent hover:border-risk-high/15 rounded-lg px-2.5 py-1.5 transition-all duration-200 font-extrabold uppercase tracking-wider"
                  title="Delete Case Permanent"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {cases.length === 0 && (
          <div className="col-span-full bg-surface-raised border border-dashed border-border rounded-2xl py-16 text-center shadow-sm">
            <div className="text-3xl mb-3">📁</div>
            <h3 className="text-sm font-extrabold text-ink-primary">No Active Forensic Cases</h3>
            <p className="text-xs text-ink-muted mt-1.5 max-w-sm mx-auto leading-relaxed">
              Create your first investigation case to upload statements, analyze money trails, and audit suspects.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-xs font-extrabold text-accent hover:text-accent-hover bg-accent-subtle hover:bg-accent-subtle-bg px-4 py-2 rounded-lg transition-colors border border-accent/20"
            >
              Add New Case
            </button>
          </div>
        )}
      </div>

      {/* Modal - Create Case */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-surface-shading/35 backdrop-blur-sm transition-all duration-300"
            onClick={() => setShowCreate(false)}
          ></div>
          <form
            onSubmit={createCase}
            className="bg-surface-raised border border-border-hairline rounded-2xl p-6 w-full max-w-md shadow-xl relative z-10 animate-zoom-in"
          >
            <h2 className="text-base font-extrabold text-ink-primary mb-4 border-b border-border-hairline pb-2.5">
              Initialize Forensic Case
            </h2>
            <div className="space-y-3.5 mb-5">
              <div>
                <label className="text-[10px] uppercase font-extrabold text-ink-muted block mb-1 tracking-wider">
                  Case ID / Number
                </label>
                <input
                  placeholder="e.g., MH-EOW-2026-0091"
                  required
                  value={form.case_number}
                  onChange={(e) => setForm({ ...form, case_number: e.target.value })}
                  className="w-full border border-border/80 rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-extrabold text-ink-muted block mb-1 tracking-wider">
                  Case Title
                </label>
                <input
                  placeholder="e.g., Syndicate Alpha Mule Ring"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-border/80 rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-extrabold text-ink-muted block mb-1 tracking-wider">
                  Case Description
                </label>
                <textarea
                  placeholder="Details on accounts, initial flags, source of statement..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-border/80 rounded-lg px-3 py-2 text-xs bg-surface-raised text-ink-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="text-xs font-extrabold px-4 py-2 text-ink-secondary hover:text-ink-primary disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="text-xs font-extrabold px-5 py-2.5 bg-accent hover:bg-accent-hover text-accent-fg rounded-xl shadow-md transition-all duration-200 disabled:opacity-50"
              >
                {creating ? 'Creating Case...' : 'Create Case'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
