import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getOutfitSuggestions, getClothingItem } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ClothingItem, OutfitSuggestion, PieceImage } from '../types/index';
import { OCCASIONS } from '../constants/occasions';
import { occasionImg } from '../constants/userPrefs';
import { sortPieces } from '../constants/outfitOrder';
import './Suggest.css';

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
                className={`suggest-card ${occasion === o.value ? 'is-active' : ''}`}
                style={{ '--card-from': o.from, '--card-to': o.to } as React.CSSProperties}
                onClick={() => setOccasion(o.value)}
              >
                <img src={occasionImg(o, profile?.gender)} alt={o.label} className="suggest-card-photo" loading="lazy" draggable={false} />
                <div className="suggest-card-overlay" />
                <div className="suggest-card-content">
                  <div className="suggest-card-label">{o.label}</div>
                  <div className="suggest-card-feel">{o.feel}</div>
                </div>
                <div className="suggest-card-radio" />
              </button>
            ))}
          </div>
          <button className="pill pill-primary pill-full suggest-cta" disabled={!occasion} onClick={fetchOutfits}>
            Build my looks →
          </button>
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
            <>
              <div className="eyebrow">— Look {activeIndex + 1} of {outfits.length}</div>
              <h1 className="display suggest-look-title">{outfits[activeIndex].name}</h1>
              <p className="lead suggest-look-trend">
                {outfits[activeIndex].trendContext} — {outfits[activeIndex].mood?.toLowerCase()}
              </p>
              {outfits[activeIndex].matchQuality === 'closest' && (
                <p className="meta" style={{ color: 'var(--ink-4)', marginBottom: 'var(--s-2)' }}>
                  Closest match from your wardrobe
                </p>
              )}
              <OutfitBoard images={outfits[activeIndex].pieceImages ?? []} pieces={outfits[activeIndex].pieces} />
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
              <div className="suggest-nav">
                {outfits.map((_, i) => (
                  <button key={i} className={`suggest-nav-dot ${i === activeIndex ? 'is-active' : ''}`} onClick={() => setActiveIndex(i)} aria-label={`Look ${i + 1}`} />
                ))}
              </div>
              {activeIndex < outfits.length - 1 && (
                <p className="meta italic-serif suggest-nav-hint" onClick={() => setActiveIndex(activeIndex + 1)}>
                  {outfits.length - activeIndex - 1} more {outfits.length - activeIndex - 1 === 1 ? 'look' : 'looks'} to see →
                </p>
              )}
            </>
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
