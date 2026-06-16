import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">FinFlow</h1>
        <p className="text-sm text-slate-500 mb-6">Karnataka CID — Economic Offences Wing</p>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded p-2 mb-4">{error}</div>}
        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)}
               className="w-full border border-slate-300 rounded px-3 py-2 mb-4 text-sm" required />
        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
               className="w-full border border-slate-300 rounded px-3 py-2 mb-6 text-sm" required />
        <button disabled={busy} type="submit"
                className="w-full bg-slate-900 text-white rounded py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
