import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getOutfitSuggestions, getClothingItem, submitOutfitFeedback } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ClothingItem, OutfitSuggestion, PieceImage } from '../types/index';
import { OCCASIONS } from '../constants/occasions';
import { occasionImg } from '../constants/userPrefs';
import { sortPieces } from '../constants/outfitOrder';
import './Suggest.css';

// Min horizontal distance for a swipe to count as next/prev intent.
// Below this we treat the gesture as accidental drift.
const SWIPE_THRESHOLD = 50;

type Step = 'occasion' | 'looks';

const OUTER = new Set(['Outerwear', 'Sherwani']);
const TORSO = new Set(['Tops', 'Kurta', 'Kurti', 'Anarkali', 'Salwar Kameez', 'Saree', 'Lehenga', 'Dress', 'Sharara']);
const DRAPE = new Set(['Dupatta']);
const LOWER = new Set(['Bottoms']);
const FEET  = new Set(['Shoes']);
const ACC   = new Set(['Accessories']);

function sizeClass(category: string): string {
  if (OUTER.has(category)) return 'suggest-board-upper';
  if (TORSO.has(category)) return 'suggest-board-upper';
  if (DRAPE.has(category)) return 'suggest-board-acc';
  if (LOWER.has(category)) return 'suggest-board-lower';
  if (FEET.has(category))  return 'suggest-board-feet';
  return 'suggest-board-acc';
}

export default function Suggest() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const { profile } = useAuth();
  const [step,        setStep]        = useState<Step>('occasion');
  const [occasion,    setOccasion]    = useState<string | null>(null);
  const [anchor,      setAnchor]      = useState<ClothingItem | null>(null);
  const [outfits,     setOutfits]     = useState<OutfitSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    const itemId = params.get('itemId');
    if (itemId) {
      getClothingItem(parseInt(itemId, 10)).then(setAnchor).catch(() => {});
    }
  }, [params]);

  useEffect(() => {
    const initial = params.get('theme');
    if (initial && OCCASIONS.find(o => o.value === initial)) {
      setOccasion(initial);
      setStep('looks');
      fetchOutfitsFor(initial);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);

  // ── Carousel navigation: swipe + keyboard + arrow buttons ────────────────
  const touchStartX = useRef<number | null>(null);
  const touchEndX   = useRef<number | null>(null);

  const goPrev = () => setActiveIndex(i => Math.max(0, i - 1));
  const goNext = () => setActiveIndex(i => Math.min(outfits.length - 1, i + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };
  const onTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const dx = touchStartX.current - touchEndX.current;
    if (dx >  SWIPE_THRESHOLD) goNext();
    if (dx < -SWIPE_THRESHOLD) goPrev();
    touchStartX.current = null;
    touchEndX.current = null;
  };

  useEffect(() => {
    if (step !== 'looks' || outfits.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft')  goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, outfits.length]);

  // ── Reinforcement: per-outfit thumbs feedback ────────────────────────────
  // Tracks which outfits the user has already voted on (this session) and
  // pulses the matching button. Feedback is fire-and-forget — failures are
  // logged but don't block UX.
  const [voted, setVoted] = useState<Record<number, 'up' | 'down'>>({});

  async function sendFeedback(outfit: OutfitSuggestion, vote: 'up' | 'down', idx: number) {
    if (!occasion) return;
    setVoted(prev => ({ ...prev, [idx]: vote }));
    try {
      await submitOutfitFeedback({
        theme:    occasion,
        pieceIds: outfit.pieceIds ?? [],
        feedback: vote,
      });
    } catch (err) {
      console.warn('feedback save failed:', err);
    }
    // After a vote, advance to next outfit so the user keeps moving forward.
    // Small delay so the user sees their selection register.
    setTimeout(() => {
      setActiveIndex(i => Math.min(outfits.length - 1, i + 1));
    }, 320);
  }

  async function fetchOutfitsFor(occ: string, anchorId?: number) {
    setLoading(true);
    setError(null);
    setOutfits([]);
    setStep('looks');
    try {
      const r = await getOutfitSuggestions(occ, undefined, anchorId);
      if (!r.outfits?.length) {
        setError('no_outfits_found');
      } else {
        setOutfits(r.outfits);
        setActiveIndex(0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      console.error('Suggest error:', msg);
      if (msg.includes('No clothes') || msg.includes('empty')) setError('empty_wardrobe');
      else if (msg.includes('no_outfits_found') || msg.includes('No outfits')) setError('no_outfits_found');
      else setError(msg || 'generic');
    } finally {
      setLoading(false);
    }
  }

  function fetchOutfits() {
    if (!occasion) return;
    fetchOutfitsFor(occasion, anchor?.id);
  }

  function back() {
    if (step === 'occasion') navigate(-1);
    else setStep('occasion');
  }

  const stepIndex = { occasion: 0, looks: 1 }[step];

  return (
    <div className="page suggest">
      <div className="suggest-top">
        <button className="suggest-back" onClick={back}>←</button>
        <div className="stepper">
          {[0, 1].map(i => <div key={i} className={`stepper-dot ${i <= stepIndex ? 'is-active' : ''}`} />)}
        </div>
        <div style={{ width: 40 }} />
      </div>

      {step === 'occasion' && (
        <div className="suggest-step animate-fade">
          {anchor ? (
            <>
              <div className="eyebrow">— Styling</div>
              <h1 className="display suggest-step-title"><em>{anchor.name}</em></h1>
              <div className="suggest-anchor">
                <img src={anchor.image_url ?? anchor.image_base64 ?? ''} alt={anchor.name} className="suggest-anchor-img" />
                <div className="suggest-anchor-meta">
                  <div className="meta">{anchor.category}{anchor.subcategory ? ` · ${anchor.subcategory}` : ''}</div>
                  <div className="meta">{anchor.color}{anchor.formality ? ` · ${anchor.formality}` : ''}</div>
                </div>
              </div>
              <div className="eyebrow" style={{ marginTop: 'var(--s-6)' }}>— Where are you wearing it</div>
            </>
          ) : (
            <>
              <div className="eyebrow">— Where are you going</div>
              <h1 className="display suggest-step-title">What's the<br/><em>occasion?</em></h1>
            </>
          )}
          <div className="suggest-grid">
            {OCCASIONS.map(o => (
              <button
                key={o.value}
                className="suggest-card"
                style={{ '--card-from': o.from, '--card-to': o.to } as React.CSSProperties}
                onClick={() => { setOccasion(o.value); fetchOutfitsFor(o.value, anchor?.id); }}
              >
                <img src={occasionImg(o, profile?.gender)} alt={o.label} className="suggest-card-photo" loading="lazy" draggable={false} />
                <div className="suggest-card-overlay" />
                <div className="suggest-card-content">
                  <div className="suggest-card-label">{o.label}</div>
                  <div className="suggest-card-feel">{o.feel}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'looks' && (
        <div className="suggest-step animate-fade">
          {loading && <LooksLoading />}

          {!loading && error === 'empty_wardrobe' && (
            <div className="suggest-empty">
              <div className="suggest-empty-icon">🧺</div>
              <h2 className="h2">Your wardrobe is empty</h2>
              <p className="body suggest-empty-sub">Add some pieces first and we'll build looks around them.</p>
              <button className="pill pill-primary" onClick={() => navigate('/upload')}>Add clothes</button>
              <button className="pill pill-ghost" onClick={() => setStep('occasion')}>Change occasion</button>
            </div>
          )}

          {!loading && (error === 'no_outfits_found' || (!error && !loading && outfits.length === 0)) && (
            <div className="suggest-empty">
              <div className="suggest-empty-icon">🪡</div>
              <h2 className="h2">Nothing matched this occasion</h2>
              <p className="body suggest-empty-sub">Try a different occasion or add more pieces to your wardrobe.</p>
              <button className="pill pill-primary" onClick={() => navigate('/upload')}>Add more clothes</button>
              <button className="pill pill-ghost" onClick={() => setStep('occasion')}>Try a different occasion</button>
            </div>
          )}

          {!loading && error && error !== 'empty_wardrobe' && error !== 'no_outfits_found' && (
            <div className="suggest-empty">
              <div className="suggest-empty-icon">✦</div>
              <h2 className="h2">Something went wrong</h2>
              <p className="body suggest-empty-sub">{error === 'generic' ? 'Couldn\'t generate looks right now.' : error}</p>
              <button className="pill pill-primary" onClick={fetchOutfits}>Try again</button>
              <button className="pill pill-ghost" onClick={() => setStep('occasion')}>Change occasion</button>
            </div>
          )}

          {!loading && !error && outfits.length > 0 && (
            <div
              className="suggest-carousel"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {/* Floating chevron arrows — always reachable, fixed to viewport edges */}
              {outfits.length > 1 && (
                <>
                  <button
                    className="suggest-arrow suggest-arrow-prev"
                    onClick={goPrev}
                    disabled={activeIndex === 0}
                    aria-label="Previous look"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    className="suggest-arrow suggest-arrow-next"
                    onClick={goNext}
                    disabled={activeIndex === outfits.length - 1}
                    aria-label="Next look"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              )}

              {/* Slide content — keyed so each outfit gets a fresh enter animation */}
              <div key={activeIndex} className="suggest-slide">
                <div className="suggest-look-header">
                  <div className="eyebrow">— Look {activeIndex + 1} of {outfits.length}</div>
                  {outfits.length > 1 && (
                    <div className="suggest-progress" role="tablist" aria-label="Outfit looks">
                      {outfits.map((_, i) => (
                        <button
                          key={i}
                          role="tab"
                          aria-selected={i === activeIndex}
                          aria-label={`Look ${i + 1}`}
                          className={`suggest-progress-seg ${i === activeIndex ? 'is-active' : ''} ${i < activeIndex ? 'is-past' : ''}`}
                          onClick={() => setActiveIndex(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <h1 className="display suggest-look-title">{outfits[activeIndex].name}</h1>
                <p className="lead suggest-look-trend">
                  {outfits[activeIndex].trendContext} — {outfits[activeIndex].mood?.toLowerCase()}
                </p>
                {outfits[activeIndex].matchQuality === 'closest' && (
                  <p className="meta" style={{ color: 'var(--ink-4)', marginBottom: 'var(--s-2)' }}>
                    Closest match from your wardrobe
                  </p>
                )}
                <div className="suggest-board-wrap">
                  <OutfitBoard images={outfits[activeIndex].pieceImages ?? []} pieces={outfits[activeIndex].pieces} />

                  {/* Floating thumbs — pinned to the board so feedback feels
                      tied to the visual, not lost in the page footer */}
                  <div className="suggest-thumbs">
                    <button
                      className={`suggest-thumb suggest-thumb-down ${voted[activeIndex] === 'down' ? 'is-voted' : ''}`}
                      onClick={() => sendFeedback(outfits[activeIndex], 'down', activeIndex)}
                      disabled={!!voted[activeIndex]}
                      aria-label="Not for me"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 2v11M22 11V4a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 1.7L3.1 12.7A2 2 0 0 0 5 15h6.3l-1 4.7A1.5 1.5 0 0 0 12 21.5L17 13" />
                      </svg>
                    </button>
                    <button
                      className={`suggest-thumb suggest-thumb-up ${voted[activeIndex] === 'up' ? 'is-voted' : ''}`}
                      onClick={() => sendFeedback(outfits[activeIndex], 'up', activeIndex)}
                      disabled={!!voted[activeIndex]}
                      aria-label="I like this outfit"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 22V11M2 13v7a2 2 0 0 0 2 2h13.5a2 2 0 0 0 2-1.7l1.4-9A2 2 0 0 0 19 9h-6.3l1-4.7A1.5 1.5 0 0 0 12 2.5L7 11" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="suggest-pieces">
                  {outfits[activeIndex].pieces.map((p, i) => (
                    <div key={i} className="suggest-piece">
                      <span className="suggest-piece-dot" />
                      <span className="italic-serif">{p}</span>
                    </div>
                  ))}
                </div>
                {outfits[activeIndex].tip && (
                  <div className="suggest-tip">
                    <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 8 }}>— A note on why</div>
                    <p className="italic-serif body">"{outfits[activeIndex].tip}"</p>
                  </div>
                )}

                {/* Navigation pills — descriptive, large tap targets */}
                {outfits.length > 1 && (
                  <div className="suggest-nav-pills">
                    {activeIndex > 0 && (
                      <button className="suggest-nav-pill suggest-nav-pill-prev" onClick={goPrev}>
                        <span className="suggest-nav-pill-arrow">←</span>
                        <span className="suggest-nav-pill-stack">
                          <span className="suggest-nav-pill-eyebrow">Previous</span>
                          <span className="suggest-nav-pill-name italic-serif">{outfits[activeIndex - 1].name}</span>
                        </span>
                      </button>
                    )}
                    {activeIndex < outfits.length - 1 && (
                      <button className="suggest-nav-pill suggest-nav-pill-next" onClick={goNext}>
                        <span className="suggest-nav-pill-stack">
                          <span className="suggest-nav-pill-eyebrow">Next look</span>
                          <span className="suggest-nav-pill-name italic-serif">{outfits[activeIndex + 1].name}</span>
                        </span>
                        <span className="suggest-nav-pill-arrow">→</span>
                      </button>
                    )}
                  </div>
                )}

                <p className="meta suggest-nav-help">
                  Swipe, tap the arrows, or use ← / → keys
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OutfitBoard({ images, pieces }: { images: PieceImage[]; pieces: string[] }) {
  if (!images.length) {
    return (
      <div className="suggest-board-fallback">
        {pieces.map((p, i) => <div key={i} className="suggest-board-fallback-pill">{p}</div>)}
      </div>
    );
  }
  const sorted = sortPieces(images);
  const outer  = sorted.filter(p => OUTER.has(p.category));
  const torso  = sorted.filter(p => TORSO.has(p.category));
  const drape  = sorted.filter(p => DRAPE.has(p.category));
  const lower  = sorted.filter(p => LOWER.has(p.category));
  const ground = sorted.filter(p => FEET.has(p.category) || ACC.has(p.category));

  const Row = ({ pieces }: { pieces: PieceImage[] }) =>
    pieces.length === 0 ? null : (
      <div className="suggest-board-row">
        {pieces.map(p => (
          <div key={p.id} className={`suggest-board-img ${sizeClass(p.category)}`}>
            <img src={p.image_url ?? p.image_base64 ?? ''} alt={p.name} />
          </div>
        ))}
      </div>
    );

  return (
    <div className="suggest-board">
      <Row pieces={outer} /><Row pieces={torso} /><Row pieces={drape} />
      <Row pieces={lower} /><Row pieces={ground} />
    </div>
  );
}

function LooksLoading() {
  return (
    <div className="suggest-loading">
      <div className="dot-pulse"><span/><span/><span/></div>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>— Considering</div>
      <h2 className="h2 suggest-loading-title">Thinking through colour,<br/>fabric, and the moment.</h2>
    </div>
  );
}
