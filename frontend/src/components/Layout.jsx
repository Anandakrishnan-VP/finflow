import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    {
      label: 'Cases',
      path: '/',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      )
    },
    {
      label: 'Watchlist',
      path: '/watchlist',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    }
  ];

  if (user?.role === 'ADMIN') {
    navItems.push({
      label: 'Admin Panel',
      path: '/admin',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      )
    });
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-surface-raised border-r border-border-hairline shadow-sm">
      {/* Brand Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border-hairline bg-gradient-to-b from-surface-sunken/20 to-transparent">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-accent to-accent-hover/80 flex items-center justify-center text-accent-fg font-extrabold shadow-md glow-accent-strong animate-pulse-slow">
          FF
        </div>
        <div>
          <span className="font-extrabold text-ink-primary tracking-tight text-base block bg-gradient-to-r from-ink-primary via-ink-primary to-accent bg-clip-text text-transparent">FinFlow</span>
          <span className="text-[9px] uppercase tracking-widest text-ink-muted font-bold block">Forensic Ledger Suite</span>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        <div className="text-[10px] uppercase font-extrabold text-ink-muted tracking-widest px-3 mb-3">Investigation</div>
        {navItems.map((item, idx) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.label}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              style={{ animationDelay: `${idx * 75}ms` }}
              className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 group relative animate-slide-right ${
                active
                  ? 'bg-accent text-accent-fg shadow-md glow-accent'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-sunken/55'
              }`}
            >
              <span className={`transition-transform duration-300 group-hover:scale-110 ${active ? 'text-accent-fg' : 'text-ink-muted group-hover:text-ink-primary'}`}>
                {item.icon}
              </span>
              {item.label}
              {active && (
                <span className="absolute right-3 w-1.5 h-1.5 bg-accent-fg rounded-full animate-pulse"></span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Section / Footer */}
      <div className="p-4 border-t border-border-hairline bg-surface-sunken/15">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-surface-raised border border-border-hairline/80 shadow-sm transition-all duration-300 hover:border-border hover:shadow-card">
          <div className="w-8 h-8 rounded-lg bg-accent-subtle border border-accent/15 flex items-center justify-center font-extrabold text-xs text-accent">
            {user?.username?.substring(0, 2).toUpperCase() || 'US'}
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-xs font-extrabold text-ink-primary truncate">{user?.username}</span>
            <span className="block text-[9px] text-ink-muted truncate font-bold uppercase tracking-wider">{user?.role}</span>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="p-2 text-ink-muted hover:text-risk-high hover:bg-risk-high-bg/30 rounded-lg transition-all duration-200"
            title="Log out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-base flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:block w-64 h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </aside>

      {/* Sidebar - Mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-surface-shading/30 backdrop-blur-sm transition-all duration-300"
            onClick={() => setMobileOpen(false)}
          ></div>
          <aside className="relative w-64 max-w-xs h-full animate-slide-in shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Workspace Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header */}
        <header className="h-14 bg-surface-raised/85 glass-effect border-b border-border-hairline/80 flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            {/* Hamburger Button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 text-ink-secondary hover:bg-surface-sunken rounded-md md:hidden"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="text-xs text-ink-muted font-bold hidden sm:flex items-center gap-2 tracking-wide uppercase">
              <span>Workspace</span>
              <span className="text-border-default">/</span>
              <span className="text-ink-primary font-extrabold normal-case">Investigation Dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 animate-slide-up">
          {children}
        </main>
      </div>
    </div>
  );
}
