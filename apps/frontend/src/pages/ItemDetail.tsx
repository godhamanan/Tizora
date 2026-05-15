import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClothingItem, deleteClothingItem } from '../api/client';
import type { ClothingItem } from '../types/index';
import './ItemDetail.css';

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await getClothingItem(parseInt(id, 10));
        setItem(r);
      } catch {
        setError('We could not find this piece.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      await deleteClothingItem(item.id);
      navigate('/wardrobe');
    } catch { setBusy(false); setShowDelete(false); }
  }

  if (loading) {
    return (
      <div className="page-bare detail">
        <div className="detail-top">
          <button className="detail-back" onClick={() => navigate(-1)}>←</button>
        </div>
        <div className="skeleton" style={{ aspectRatio: '1/1' }} />
        <div className="section" style={{ marginTop: 'var(--s-8)' }}>
          <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 32, width: '70%' }} />
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="page detail">
        <div className="detail-top">
          <button className="detail-back" onClick={() => navigate('/wardrobe')}>←</button>
        </div>
        <p className="notice" style={{ margin: 'var(--s-8) var(--s-6)' }}>{error}</p>
      </div>
    );
  }

  const tagsList = item.style_vibes ? item.style_vibes.split(/,\s*/).slice(0, 5) : [];
  const pairsList = item.pairs_well_with ? item.pairs_well_with.split(/,\s*/).slice(0, 6) : [];

  return (
    <div className="page detail">
      {/* Top bar */}
      <div className="detail-top">
        <button className="detail-back" onClick={() => navigate(-1)}>←</button>
        <button
          className="detail-more"
          onClick={() => setShowDelete(true)}
          aria-label="More"
        >
          <svg width="20" height="4" viewBox="0 0 20 4" fill="currentColor">
            <circle cx="2" cy="2" r="1.6" />
            <circle cx="10" cy="2" r="1.6" />
            <circle cx="18" cy="2" r="1.6" />
          </svg>
        </button>
      </div>

      {/* Hero image */}
      <div className="detail-hero">
        <img src={item.image_url ?? item.image_base64 ?? ''} alt={item.name} />
      </div>

      <div className="section detail-content">
        <div className="eyebrow">— {item.category}{item.subcategory ? ` · ${item.subcategory}` : ''}</div>
        <h1 className="h1 detail-title">{item.name}</h1>

        {item.style_notes && (
          <p className="italic-serif detail-note">"{item.style_notes}"</p>
        )}

        {/* Stats */}
        <div className="detail-stats">
          <div>
            <div className="detail-stat-num">{item.color}</div>
            <div className="meta">colour</div>
          </div>
          {item.formality && (
            <>
              <div className="detail-stat-divide" />
              <div>
                <div className="detail-stat-num">{item.formality}</div>
                <div className="meta">formality</div>
              </div>
            </>
          )}
          {item.style && (
            <>
              <div className="detail-stat-divide" />
              <div>
                <div className="detail-stat-num">{item.style}</div>
                <div className="meta">style</div>
              </div>
            </>
          )}
        </div>

        {/* Properties */}
        <div className="detail-props">
          {item.fabric && <Prop label="Fabric" value={item.fabric} />}
          {item.fit && <Prop label="Fit" value={item.fit} />}
          {item.pattern && <Prop label="Pattern" value={item.pattern} />}
          {item.formality && <Prop label="Formality" value={item.formality} />}
          {item.style && <Prop label="Style" value={item.style} />}
          {item.occasion_tags && <Prop label="Occasion" value={item.occasion_tags.split(/,\s*/)[0]} />}
        </div>

        {/* Tags */}
        {tagsList.length > 0 && (
          <div className="detail-tags">
            {tagsList.map((t) => (
              <span key={t} className="detail-tag">{t.trim()}</span>
            ))}
          </div>
        )}

        {/* Pairs with */}
        {pairsList.length > 0 && (
          <div className="detail-section">
            <div className="eyebrow">— Pairs beautifully with</div>
            <div className="detail-pairs">
              {pairsList.map((p, i) => (
                <span key={i} className="italic-serif detail-pair">{p.trim()}</span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="detail-actions">
          <button
            className="pill pill-primary pill-full"
            onClick={() => navigate(`/suggest?itemId=${item.id}`)}
          >
            Style this piece →
          </button>
          <button className="pill pill-ghost pill-full" onClick={() => setShowDelete(true)}>
            Remove from wardrobe
          </button>
        </div>
      </div>

      {/* Delete sheet */}
      {showDelete && (
        <div className="detail-sheet-overlay" onClick={() => setShowDelete(false)}>
          <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="detail-sheet-handle" />
            <h3 className="h3" style={{ marginBottom: 'var(--s-3)' }}>Remove from wardrobe?</h3>
            <p className="body" style={{ marginBottom: 'var(--s-6)' }}>
              This piece will be permanently removed.
            </p>
            <button className="pill pill-primary pill-full" onClick={remove} disabled={busy}>
              Yes, remove
            </button>
            <button className="pill pill-ghost pill-full" style={{ marginTop: 'var(--s-3)' }} onClick={() => setShowDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Prop({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-prop">
      <span className="eyebrow detail-prop-label">{label}</span>
      <span className="detail-prop-value">{value}</span>
    </div>
  );
}
