import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClothes, getOutfitSuggestions } from '../api/client';
import type { ClothingItem, OutfitSuggestion } from '../types/index';
import { OCCASIONS } from '../constants/occasions';
import { occasionImg } from '../constants/userPrefs';
import { useAuth } from '../context/AuthContext';
import { sortPieces } from '../constants/outfitOrder';
import './Home.css';

const GREETINGS = ['Good morning', 'Good afternoon', 'Good evening'];
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return GREETINGS[0];
  if (h < 17) return GREETINGS[1];
  return GREETINGS[2];
}

const LOOK_CACHE_KEY = `todayLook_${new Date().toDateString()}`;

function getCachedLook(): OutfitSuggestion | null {
  try {
    const raw = localStorage.getItem(LOOK_CACHE_KEY);
    return raw ? (JSON.parse(raw) as OutfitSuggestion) : null;
  } catch { return null; }
}

function cacheLook(look: OutfitSuggestion) {
  try {
    // Clear stale daily entries before writing today's
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('todayLook_') && key !== LOOK_CACHE_KEY) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(LOOK_CACHE_KEY, JSON.stringify(look));
  } catch { /* storage full */ }
}


export default function Home() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [items,       setItems]       = useState<ClothingItem[] | null>(null);
  const [todayLook,   setTodayLook]   = useState<OutfitSuggestion | null>(getCachedLook);
  const [loadingLook, setLoadingLook] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const c = await getClothes();
        if (!cancel) setItems(c);
      } catch {
        if (!cancel) setItems([]);
      }
    })();
    return () => { cancel = true; };
  }, []);

  async function buildTodayLook(bust = false) {
    if (!items?.length) return;
    if (bust) {
      localStorage.removeItem(LOOK_CACHE_KEY);
      setTodayLook(null);
    }
    setLoadingLook(true);
    try {
      const r    = await getOutfitSuggestions('Casual Outing');
      const look = r.outfits[0] ?? null;
      if (look) { cacheLook(look); setTodayLook(look); }
    } catch { /* quiet */ }
    finally { setLoadingLook(false); }
  }

  useEffect(() => {
    if (items && items.length >= 2 && !todayLook && !loadingLook) {
      buildTodayLook();
    }
  // todayLook intentionally excluded — only trigger on first items load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const isEmpty = items !== null && items.length === 0;

  return (
    <div className="page">
      <header className="home-greet">
        <div className="eyebrow">{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</div>
        <h1 className="display home-display">
          {greeting()},<br/><em>back to you.</em>
        </h1>
      </header>

      {isEmpty && <EmptyHome onAdd={() => navigate('/upload')} />}

      {!isEmpty && items !== null && (
        <section className="section">
          <div className="section-eyebrow">
            <span className="eyebrow">— Today's look</span>
            {todayLook && (
              <button className="home-refine" onClick={() => buildTodayLook(true)}>
                Try another →
              </button>
            )}
          </div>

          {loadingLook && !todayLook && <LookSkeleton />}

          {todayLook && (
            <div className="home-look animate-up">
              <div className="home-look-board">
                {todayLook.pieceImages && todayLook.pieceImages.length > 0
                  ? sortPieces(todayLook.pieceImages).slice(0, 3).map((p, idx) => (
                      <div key={p.id} className={`home-look-piece home-look-piece-${idx}`}>
                        <img src={p.image_url ?? p.image_base64 ?? ''} alt={p.name} />
                      </div>
                    ))
                  : <div className="home-look-empty">{todayLook.pieces.join(' · ')}</div>
                }
              </div>
              <div className="home-look-meta">
                <h2 className="h2">{todayLook.name}</h2>
                <p className="meta home-look-trend">{todayLook.trendContext} · for the warmth today</p>
              </div>
              <div className="home-look-actions">
                <button className="pill pill-primary" onClick={() => navigate('/suggest')}>
                  Build a look →
                </button>
                <button className="pill pill-ghost" onClick={() => navigate('/wardrobe')}>
                  My wardrobe
                </button>
              </div>
            </div>
          )}

          {!loadingLook && !todayLook && items.length < 2 && (
            <div className="home-thin">
              <p className="italic-serif body">
                Add a few more pieces and I'll begin building looks for you.
              </p>
              <button className="pill pill-primary" style={{ marginTop: 'var(--s-5)' }} onClick={() => navigate('/upload')}>
                Add a piece →
              </button>
            </div>
          )}
        </section>
      )}

      {!isEmpty && items && items.length >= 2 && (
        <section className="section">
          <div className="section-eyebrow">
            <span className="eyebrow">— Dress for the moment</span>
          </div>
          <div className="home-occasions-scroll">
            {OCCASIONS.map((o, i) => (
              <button
                key={o.value}
                className="home-occ-card animate-up"
                style={{
                  '--card-from': o.from,
                  '--card-to': o.to,
                  animationDelay: `${i * 60}ms`,
                } as React.CSSProperties}
                onClick={() => navigate(`/suggest?theme=${encodeURIComponent(o.value)}`)}
              >
                <img
                  src={occasionImg(o, profile?.gender)}
                  alt={o.label}
                  className="home-occ-photo"
                  loading="lazy"
                  draggable={false}
                />
                <div className="home-occ-grain" />
                <div className="home-occ-body">
                  <span className="home-occ-feel">{o.feel}</span>
                  <span className="home-occ-label">{o.label}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {!isEmpty && items && items.length >= 5 && (
        <section className="section">
          <div className="home-observation">
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>— A quiet note</div>
            <p className="home-observation-text">
              You have <em>{items.length} pieces</em> in your wardrobe.<br/>
              Plenty to begin with.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyHome({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="section">
      <div className="home-empty">
        <div className="home-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="1" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        </div>
        <h2 className="h2">Your wardrobe is waiting.</h2>
        <p className="lead home-empty-body">
          Add a few pieces and I'll start building looks for you.<br/>Two minutes is all it takes.
        </p>
        <button className="pill pill-primary" onClick={onAdd}>Add my first piece →</button>
      </div>
    </section>
  );
}

function LookSkeleton() {
  return (
    <div className="home-look">
      <div className="home-look-board">
        <div className="skeleton" style={{ width: '38%', aspectRatio: '4/5' }} />
        <div className="skeleton" style={{ width: '34%', aspectRatio: '3/4' }} />
        <div className="skeleton" style={{ width: '30%', aspectRatio: '5/3' }} />
      </div>
      <div style={{ padding: 'var(--s-6) 0 0' }}>
        <div className="skeleton" style={{ height: 26, width: '60%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 14, width: '40%' }} />
      </div>
    </div>
  );
}
