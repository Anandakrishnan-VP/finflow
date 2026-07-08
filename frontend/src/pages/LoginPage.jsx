import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid username or password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070A09] flex flex-col items-center justify-center px-4 relative">
      
      {/* Subtle Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-accent/5 filter blur-[100px] pointer-events-none"></div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-[#0F1412] border border-[#1F2E26] rounded-2xl shadow-2xl relative overflow-hidden backdrop-blur-md">
        
        {/* Indian Tricolor Border Accent (Saffron, White, Green) */}
        <div className="h-[3.5px] w-full flex">
          <div className="w-1/3 bg-[#FF9933]"></div>
          <div className="w-1/3 bg-[#FFFFFF]"></div>
          <div className="w-1/3 bg-[#138808]"></div>
        </div>

        <div className="p-8">
          
          {/* Karnataka State / Police Crest SVG Emblem */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 text-accent/80 flex items-center justify-center mb-3">
              <svg viewBox="0 0 100 100" className="w-full h-full fill-none stroke-current" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* Shield Outline */}
                <path d="M50 15 C65 15, 75 22, 75 35 C75 60, 50 82, 50 82 C50 82, 25 60, 25 35 C25 22, 35 15, 50 15 Z" />
                {/* Three Lions outline inside shield */}
                <path d="M43 45 Q50 42 57 45 M45 35 Q50 32 55 35 M47 28 Q50 26 53 28" strokeWidth="2" />
                <line x1="50" y1="52" x2="50" y2="72" strokeWidth="2" />
                <circle cx="50" cy="72" r="5" fill="currentColor" />
                {/* Star Accent */}
                <polygon points="50,2 53,8 59,8 54,12 56,18 50,14 44,18 46,12 41,8 47,8" fill="currentColor" stroke="none" />
              </svg>
            </div>
            
            <h2 className="text-[10px] font-bold tracking-widest text-ink-muted uppercase">
              Government of Karnataka
            </h2>
            <h1 className="text-base font-extrabold text-[#F1F5F9] mt-0.5 tracking-wider">
              EOW Forensic Audit Panel
            </h1>
            <p className="text-[10px] text-accent font-semibold uppercase mt-0.5">
              Criminal Investigation Department
            </p>
          </div>

          <div className="h-[1px] w-full bg-[#1B2921] mb-6"></div>

          {error && (
            <div className="bg-risk-high-bg/85 border border-risk-high/20 text-risk-high text-xs rounded-lg px-3.5 py-2.5 mb-5 flex items-center gap-2">
              <span>⚠️</span>
              <span className="font-semibold">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div>
              <label className="block text-[10px] font-bold text-ink-secondary uppercase tracking-wider mb-1.5">
                Officer Username / Badge ID
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs text-ink-muted">👤</span>
                <input
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#070A09] border border-[#23352A] hover:border-[#2D4537] focus:border-accent focus:ring-1 focus:ring-accent outline-none rounded-lg pl-9 pr-3 py-2 text-sm text-[#F8FAFC] placeholder-ink-muted/50 transition-all duration-150"
                  required
                  disabled={busy}
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-[10px] font-bold text-ink-secondary uppercase tracking-wider mb-1.5">
                Security Password
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs text-ink-muted">🔑</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#070A09] border border-[#23352A] hover:border-[#2D4537] focus:border-accent focus:ring-1 focus:ring-accent outline-none rounded-lg pl-9 pr-10 py-2 text-sm text-[#F8FAFC] placeholder-ink-muted/50 transition-all duration-150"
                  required
                  disabled={busy}
                />
                {/* Eye toggle show/hide password icon button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-xs text-ink-muted hover:text-ink-primary transition-colors focus:outline-none"
                >
                  {showPassword ? (
                    // Eye Slash Icon (Hide)
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    // Eye Icon (Show)
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                disabled={busy}
                type="submit"
                className="w-full bg-accent hover:bg-accent-hover text-accent-fg font-bold rounded-lg py-2.5 text-sm transition-all duration-150 shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-accent-fg border-t-transparent rounded-full animate-spin"></span>
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <span>Authorized Sign In</span>
                )}
              </button>
            </div>
          </form>

          {/* Compliance Disclaimer Notice */}
          <div className="mt-6 pt-5 border-t border-border-hairline text-center text-[10px] text-ink-muted leading-relaxed">
            This system is restricted to the Karnataka State Police. Access is strictly audited. Unauthorized login attempts are punishable under the Information Technology Act.
          </div>

        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-4 text-[10px] text-ink-muted">
        FinFlow Forensic Suite v2.2.0 • Secured Audit Session
      </div>

    </div>
  );
}
