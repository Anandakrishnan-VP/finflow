import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { caseId } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Theme state
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Sidebar case selection modal state
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [targetTab, setTargetTab] = useState('');
  const [cases, setCases] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch cases for the modal if needed
  const openCaseModal = (tabName) => {
    setTargetTab(tabName);
    setShowCaseModal(true);
    apiClient.get('/cases').then(r => setCases(r.data));
  };

  const handleCaseSelect = (selectedId) => {
    setShowCaseModal(false);
    navigate(`/cases/${selectedId}?tab=${targetTab}`);
  };

  const getMenuClass = (path, tabName) => {
    const isCurrentPage = location.pathname === path;
    const isCurrentTab = tabName && searchParams.get('tab') === tabName;
    const active = isCurrentPage || (caseId && isCurrentTab);

    return `flex items-center gap-3 px-6 py-3 text-sm font-semibold rounded-m3-full m3-interactive transition-all duration-200
      ${active
        ? 'bg-primaryContainer text-onPrimaryContainer font-bold'
        : 'text-onSurfaceVariant hover:bg-surfaceContainerHigh hover:text-onSurface'
      }`;
  };

  const handleMenuClick = (e, path, tabName) => {
    if (tabName && !caseId) {
      e.preventDefault();
      openCaseModal(tabName);
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-onSurface transition-colors duration-300">
      
      {/* LEFT SIDEBAR (280px) */}
      <aside className="w-[280px] bg-surfaceContainer border-r border-outlineVariant flex flex-col fixed h-screen z-30 transition-colors duration-300">
        
        {/* Logo and App Brand */}
        <div className="h-20 flex items-center px-6 border-b border-outlineVariant">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primaryContainer rounded-m3-m text-onPrimaryContainer shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17M3 12h18M6.5 6.5l11 11M6.5 17.5l11-11" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg text-onSurface tracking-wide font-serif">FinFlow</span>
              <span className="block text-[10px] text-secondary font-semibold tracking-wider uppercase">Forensic Intelligence</span>
            </div>
          </div>
        </div>

        {/* Sidebar Nav Links */}
        <nav className="flex-1 px-4 py-6 space-y-2.5 overflow-y-auto">
          
          <Link to="/" className={getMenuClass('/', '')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
            </svg>
            <span>Dashboard</span>
          </Link>

          <div className="h-px bg-outlineVariant my-4" />
          <div className="px-6 text-[10px] font-bold text-onSurfaceVariant uppercase tracking-widest mb-2">Investigation</div>

          <Link
            to={caseId ? `/cases/${caseId}?tab=Upload` : '#'}
            onClick={(e) => handleMenuClick(e, '', 'Upload')}
            className={getMenuClass(`/cases/${caseId}?tab=Upload`, 'Upload')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Statement Upload</span>
          </Link>

          <Link
            to={caseId ? `/cases/${caseId}?tab=Graph` : '#'}
            onClick={(e) => handleMenuClick(e, '', 'Graph')}
            className={getMenuClass(`/cases/${caseId}?tab=Graph`, 'Graph')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a3 3 0 11-5.4-1.8l-2.2-1.2a3 3 0 110-3.4l2.2-1.2a3 3 0 115.4 1.8v1.8z" />
            </svg>
            <span>Investigation Graph</span>
          </Link>

          <Link
            to={caseId ? `/cases/${caseId}?tab=Alerts` : '#'}
            onClick={(e) => handleMenuClick(e, '', 'Alerts')}
            className={getMenuClass(`/cases/${caseId}?tab=Alerts`, 'Alerts')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Alerts</span>
          </Link>

          <Link
            to={caseId ? `/cases/${caseId}?tab=Reports` : '#'}
            onClick={(e) => handleMenuClick(e, '', 'Reports')}
            className={getMenuClass(`/cases/${caseId}?tab=Reports`, 'Reports')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Reports</span>
          </Link>

          <div className="h-px bg-outlineVariant my-4" />
          <div className="px-6 text-[10px] font-bold text-onSurfaceVariant uppercase tracking-widest mb-2">Management</div>

          <Link to="/watchlist" className={getMenuClass('/watchlist', '')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span>Watchlist</span>
          </Link>

          <Link to="/admin" className={getMenuClass('/admin', '')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span>Settings</span>
          </Link>

        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-outlineVariant">
          <div className="flex items-center gap-3 bg-surfaceContainerLow p-3 rounded-m3-m">
            <div className="w-9 h-9 rounded-m3-full bg-primaryContainer text-onPrimaryContainer flex items-center justify-center font-bold text-sm">
              {user?.username?.substring(0, 2).toUpperCase() || 'IO'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-onSurface truncate">{user?.username}</div>
              <div className="text-[10px] text-onSurfaceVariant font-medium truncate">{user?.role}</div>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="text-onSurfaceVariant hover:text-error transition-colors p-1"
              title="Log Out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

      </aside>

      {/* RIGHT SIDE MAIN WRAPPER */}
      <div className="flex-1 pl-[280px] flex flex-col min-h-screen">
        
        {/* TOP NAVBAR (80px) */}
        <header className="h-20 bg-surfaceContainerLow border-b border-outlineVariant sticky top-0 z-20 flex items-center justify-between px-8 transition-colors duration-300">
          
          {/* Left search */}
          <div className="w-80">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-onSurfaceVariant">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search cases or transactions..."
                className="w-full pl-10 pr-4 py-2 text-xs rounded-m3-full bg-surfaceContainerHighest text-onSurface placeholder-onSurfaceVariant/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
              />
            </div>
          </div>

          {/* Right quick actions */}
          <div className="flex items-center gap-5">
            
            {/* Active Case indicator */}
            {caseId && (
              <div className="hidden sm:flex items-center gap-2 bg-primaryContainer text-onPrimaryContainer font-semibold text-[11px] px-3.5 py-1.5 rounded-m3-full">
                <span className="w-1.5 h-1.5 rounded-m3-full bg-primary animate-pulse" />
                Active Case: {caseId.substring(0, 8)}...
              </div>
            )}

            {/* M3 Switch Component Theme toggle */}
            <div className="flex items-center gap-3">
              <span className="m3-label-s text-onSurfaceVariant font-bold">{darkMode ? 'Dark' : 'Light'}</span>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`w-14 h-8 rounded-m3-full p-1 transition-colors duration-200 focus:outline-none flex items-center relative ${
                  darkMode ? 'bg-primaryContainer' : 'bg-surfaceContainerHighest border border-outline'
                }`}
                role="switch"
                aria-checked={darkMode}
                title="Toggle Theme"
              >
                <div
                  className={`w-6 h-6 rounded-m3-full flex items-center justify-center transition-all duration-200 absolute ${
                    darkMode 
                      ? 'translate-x-6 bg-primary text-onPrimary' 
                      : 'translate-x-0 bg-outline text-surface'
                  }`}
                >
                  {darkMode ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95a1 1 0 11-1.414-1.414 1 1 0 011.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            </div>

            {/* Alerts Bell notification */}
            <div className="relative">
              <button className="p-2.5 rounded-m3-m border border-outlineVariant hover:bg-surfaceContainerHighest text-onSurfaceVariant transition-colors m3-interactive">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <span className="absolute top-1 right-1 w-2 h-2 rounded-m3-full bg-error animate-ping" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-m3-full bg-error" />
            </div>

            {/* Profile Avatar */}
            <div className="w-9 h-9 rounded-m3-full bg-secondaryContainer text-onSecondaryContainer m3-interactive flex items-center justify-center font-bold text-sm cursor-pointer">
              {user?.username?.substring(0, 1).toUpperCase() || 'U'}
            </div>

          </div>
        </header>

        {/* MAIN BODY CONTENT */}
        <main className="flex-1 p-8 bg-background text-onSurface animate-fade-in">
          {children}
        </main>

      </div>

      {/* CASE SELECTION DIALOG */}
      {showCaseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surfaceContainer border border-outlineVariant rounded-m3-l m3-shadow-dialog w-full max-w-md p-6 overflow-hidden flex flex-col max-h-[80vh] transition-all">
            
            <div className="flex items-center justify-between pb-4 border-b border-outlineVariant">
              <div>
                <h3 className="font-bold text-lg text-onSurface font-serif">Select Active Case</h3>
                <p className="text-xs text-onSurfaceVariant mt-0.5">Please choose a case context for this operation.</p>
              </div>
              <button
                onClick={() => setShowCaseModal(false)}
                className="p-1 rounded-m3-s text-onSurfaceVariant hover:bg-surfaceContainerHighest hover:text-onSurface transition-colors m3-interactive"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l18 18" />
                </svg>
              </button>
            </div>

            {/* Search Input inside Modal */}
            <div className="my-4">
              <input
                type="text"
                placeholder="Search by case number or title..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-m3-s border border-outlineVariant bg-surfaceContainerHighest text-onSurface focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans"
              />
            </div>

            {/* Cases list */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {cases
                .filter(c =>
                  c.case_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  c.title.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleCaseSelect(c.id)}
                    className="w-full text-left p-3.5 rounded-m3-m border border-outlineVariant bg-surfaceContainerLow hover:bg-surfaceContainerHighest transition-all flex items-center justify-between m3-interactive"
                  >
                    <div>
                      <div className="font-bold text-xs text-onSurface">{c.case_number}</div>
                      <div className="text-[11px] text-onSurfaceVariant truncate max-w-[280px] mt-0.5">{c.title}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-m3-xs bg-primaryContainer text-onPrimaryContainer font-semibold tracking-wide uppercase">
                      {c.status}
                    </span>
                  </button>
                ))
              }
              {cases.length === 0 && (
                <div className="text-center py-6 text-xs text-onSurfaceVariant">Loading cases...</div>
              )}
            </div>

            <div className="pt-4 border-t border-outlineVariant flex justify-end">
              <button
                onClick={() => { setShowCaseModal(false); navigate('/'); }}
                className="text-xs px-4 py-2 border border-outlineVariant text-primary rounded-m3-s hover:bg-surfaceContainerHighest font-semibold m3-interactive"
              >
                Go to Dashboard to Create Case
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
