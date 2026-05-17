import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { UploadProvider } from './context/UploadContext';
import Login      from './pages/Login';
import Onboarding from './pages/Onboarding';
import Home       from './pages/Home';
import Upload     from './pages/Upload';
import Wardrobe   from './pages/Wardrobe';
import ItemDetail from './pages/ItemDetail';
import Suggest    from './pages/Suggest';

// ─── Nav icons ────────────────────────────────────────────────────────────────

function IconToday({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 1.6 : 1.3} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.4 1.4M17.67 17.67l1.4 1.4M4.93 19.07l1.4-1.4M17.67 6.33l1.4-1.4" />
    </svg>
  );
}
function IconWardrobe({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 1.6 : 1.3} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <circle cx="9" cy="12" r="0.6" fill="currentColor" />
      <circle cx="15" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}
function IconAdd({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 1.6 : 1.3} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
function IconStyle({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 1.6 : 1.3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M18.5 16l.7 1.8L21 18.5l-1.8.7L18.5 21l-.7-1.8L16 18.5l1.8-.7L18.5 16z" />
    </svg>
  );
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────

const NAV = [
  { path: '/',         label: 'Today',    Icon: IconToday },
  { path: '/wardrobe', label: 'Wardrobe', Icon: IconWardrobe },
  { path: '/upload',   label: 'Add',      Icon: IconAdd },
  { path: '/suggest',  label: 'Style',    Icon: IconStyle },
] as const;

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <nav className="bnav" role="navigation" aria-label="Primary">
      {NAV.map(({ path, label, Icon }) => {
        const active = location.pathname === path;
        return (
          <button key={path} className={`bnav-item ${active ? 'is-active' : ''}`}
            onClick={() => navigate(path)} aria-label={label}
            aria-current={active ? 'page' : undefined}>
            <span className="bnav-icon"><Icon active={active} /></span>
            <span className="bnav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Protected route ──────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isPending, profile, profileLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending || profileLoading) return;
    if (!session) {
      navigate('/login', { replace: true });
      return;
    }
    if (profile && !profile.onboarding_complete) {
      navigate('/onboarding', { replace: true });
    }
  }, [isPending, profileLoading, session, profile, navigate]);

  if (isPending || profileLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--ink-3)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    );
  }

  if (!session) return null;
  return <>{children}</>;
}

// ─── App shell ────────────────────────────────────────────────────────────────

function AppInner() {
  return (
    <Routes>
      <Route path="/login"      element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <div className="app">
            <Routes>
              <Route path="/"             element={<Home />} />
              <Route path="/wardrobe"     element={<Wardrobe />} />
              <Route path="/wardrobe/:id" element={<ItemDetail />} />
              <Route path="/upload"       element={<Upload />} />
              <Route path="/suggest"      element={<Suggest />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Routes>
            <BottomNav />
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UploadProvider>
          <AppInner />
        </UploadProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
