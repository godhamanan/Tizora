import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Onboarding.css';

export default function Onboarding() {
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [saving, setSaving]   = useState(false);
  const { refreshProfile }    = useAuth();
  const navigate              = useNavigate();

  async function handleContinue() {
    if (!gender) return;
    setSaving(true);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gender, onboarding_complete: true }),
      });
      await refreshProfile();
      navigate('/', { replace: true });
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-root">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <span className="eyebrow">— Welcome to tizora</span>
          <h1 className="display">One quick thing</h1>
          <p className="onboarding-sub">This helps us suggest outfits that actually fit your style.</p>
        </div>

        <div className="onboarding-section">
          <p className="onboarding-label">I dress as</p>

          <label className={`onboarding-radio ${gender === 'male' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="gender"
              value="male"
              checked={gender === 'male'}
              onChange={() => setGender('male')}
            />
            <span className="onboarding-radio-dot" />
            <span className="onboarding-radio-label">Male</span>
          </label>

          <label className={`onboarding-radio ${gender === 'female' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="gender"
              value="female"
              checked={gender === 'female'}
              onChange={() => setGender('female')}
            />
            <span className="onboarding-radio-dot" />
            <span className="onboarding-radio-label">Female</span>
          </label>
        </div>

        <button
          className="onboarding-cta"
          onClick={handleContinue}
          disabled={!gender || saving}
        >
          {saving ? 'Setting up…' : 'Start styling →'}
        </button>
      </div>
    </div>
  );
}
