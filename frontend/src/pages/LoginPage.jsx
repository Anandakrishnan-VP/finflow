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
      setError(err.response?.data?.detail || 'Authentication failed. Please verify credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden text-onSurface">
      
      {/* Visual background details */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-m3-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/5 rounded-m3-full blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10 animate-fade-in">
        
        {/* Top Header Identity */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3.5 bg-primaryContainer rounded-m3-m text-onPrimaryContainer shadow-sm mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17M3 12h18M6.5 6.5l11 11M6.5 17.5l11-11" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-onSurface font-serif">FinFlow</h1>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wider mt-1.5">Forensic Investigations & Intelligence</p>
          <div className="text-[10px] text-onSurfaceVariant font-medium tracking-wide mt-2">
            Karnataka CID — Economic Offences Wing (EOW)
          </div>
        </div>

        {/* Login Form Container */}
        <div className="bg-surfaceContainer border border-outlineVariant rounded-m3-l p-8 shadow-sm">
          <h2 className="text-lg font-bold text-onSurface mb-2">Secure Investigator Sign-In</h2>
          <p className="text-xs text-onSurfaceVariant mb-6">Enter credentials authorized by CID administration.</p>

          {error && (
            <div className="bg-errorContainer border border-error/20 text-error text-xs rounded-m3-s p-3.5 mb-5 flex items-start gap-2.5 animate-pulse font-sans">
              <svg className="w-4.5 h-4.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Username Input */}
            <div>
              <label className="block text-xs font-semibold text-onSurfaceVariant mb-1.5 uppercase tracking-wider">Username</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-onSurfaceVariant">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-xs bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                  placeholder="investigator.name"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold text-onSurfaceVariant mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-onSurfaceVariant">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-xs bg-surfaceContainerHighest border border-outlineVariant rounded-m3-s text-onSurface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              disabled={busy}
              type="submit"
              className="w-full bg-primary text-onPrimary rounded-m3-s py-3 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 m3-interactive"
            >
              {busy ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-onPrimary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Secure Access Sign In</span>
                </>
              )}
            </button>
          </form>

        </div>

        {/* Legal Disclaimer Footer */}
        <div className="text-center mt-6 text-[10px] text-onSurfaceVariant px-6">
          This workstation is subject to monitoring. Unauthorized access is strictly prohibited under the Information Technology Act.
        </div>

      </div>
    </div>
  );
}
