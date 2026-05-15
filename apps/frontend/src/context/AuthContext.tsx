import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from '../lib/authClient';

export interface Profile {
  user_id: string;
  gender: string | null;
  onboarding_complete: boolean;
}

interface AuthContextValue {
  session:        ReturnType<typeof useSession>['data'];
  isPending:      boolean;
  profile:        Profile | null;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const [profile, setProfile]               = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  async function refreshProfile() {
    if (!session) return;
    setProfileLoading(true);
    try {
      const res = await fetch('/api/profile', { credentials: 'include' });
      if (res.ok) setProfile(await res.json());
    } catch { /* ignore */ } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (session) refreshProfile();
    else          setProfile(null);
  }, [session]);

  return (
    <AuthContext.Provider value={{ session, isPending, profile, profileLoading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
