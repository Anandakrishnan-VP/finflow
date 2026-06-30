import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CaseDetailPage from './pages/CaseDetailPage';
import WatchlistPage from './pages/WatchlistPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-ink-muted text-sm">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={
              <ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>
            } />
            <Route path="/cases/:caseId" element={
              <ProtectedRoute><Layout><CaseDetailPage /></Layout></ProtectedRoute>
            } />
            <Route path="/watchlist" element={
              <ProtectedRoute><Layout><WatchlistPage /></Layout></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute roles={['ADMIN']}><Layout><AdminPage /></Layout></ProtectedRoute>
            } />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
