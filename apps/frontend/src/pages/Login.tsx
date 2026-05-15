import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '../lib/authClient';
import { useAuth } from '../context/AuthContext';
import './Login.css';

export default function Login() {
  const { session, isPending } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && session) navigate('/', { replace: true });
  }, [isPending, session, navigate]);

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn.social({
        provider:    'google',
        callbackURL: `${window.location.origin}/`,
      });
      if (result?.error) {
        setError(result.error.message ?? 'Sign-in failed. Try again.');
        setLoading(false);
      }
      // On success better-auth redirects the page — loading stays true intentionally
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach server. Try again.');
      setLoading(false);
    }
  }

  if (isPending) {
    return <div className="login-root"><div className="login-spinner" /></div>;
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-wordmark">tizora</span>
          <p className="login-tagline">Your wardrobe, styled by AI</p>
        </div>

        <button
          className="login-google-btn"
          onClick={handleGoogle}
          disabled={loading}
        >
          {loading
            ? <span className="login-spinner-sm" />
            : <GoogleIcon />
          }
          {loading ? 'Connecting…' : 'Continue with Google'}
        </button>

        {error && <p className="login-error">{error}</p>}

        <p className="login-fine-print">By continuing you agree to Tizora's terms of service.</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="login-google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
