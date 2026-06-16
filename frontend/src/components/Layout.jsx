import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-semibold tracking-tight">FinFlow</Link>
          <Link to="/" className="text-sm text-slate-300 hover:text-white">Cases</Link>
          <Link to="/watchlist" className="text-sm text-slate-300 hover:text-white">Watchlist</Link>
          {user?.role === 'ADMIN' && (
            <Link to="/admin" className="text-sm text-slate-300 hover:text-white">Admin</Link>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">{user?.username} · {user?.role}</span>
          <button onClick={() => { logout(); navigate('/login'); }}
                  className="text-slate-300 hover:text-white">Log out</button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
