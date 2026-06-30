import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-primary flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="bg-surface-raised rounded-lg border border-border-hairline shadow-card p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <h1 className="text-base font-semibold text-ink-primary">FinFlow</h1>
        </div>
        <p className="text-sm text-ink-muted mb-6">Karnataka CID — Economic Offences Wing</p>

        {error && (
          <div className="bg-risk-high-bg text-risk-high text-sm rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-ink-secondary mb-1">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full bg-surface-base border border-border rounded-md px-3 py-2 mb-4 text-sm text-ink-primary"
          required
        />

        <label className="block text-sm font-medium text-ink-secondary mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface-base border border-border rounded-md px-3 py-2 mb-6 text-sm text-ink-primary"
          required
        />

        <button
          disabled={busy}
          type="submit"
          className="w-full bg-accent hover:bg-accent-hover text-accent-fg rounded-md py-2 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
