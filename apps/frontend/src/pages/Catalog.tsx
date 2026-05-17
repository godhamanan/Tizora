import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCatalog, saveClothingItem } from '../api/client';
import type { CatalogItem } from '../types/index';
import { useAuth } from '../context/AuthContext';
import './Catalog.css';

export default function Catalog() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const gender = profile?.gender === 'female' ? 'women' : 'men';

  const [items,          setItems]          = useState<CatalogItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [selected,       setSelected]       = useState<Set<number>>(new Set());
  const [activeCategory, setActiveCategory] = useState('All');
  const [savedCount,     setSavedCount]     = useState(0);
  const [done,           setDone]           = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setItems(await getCatalog(undefined, gender)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  const filtered = activeCategory === 'All'
    ? items
    : items.filter(i => i.category === activeCategory);

  const visibleCategories = ['All', ...Array.from(new Set(items.map(i => i.category)))];

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addToWardrobe() {
    const toAdd = items.filter(i => selected.has(i.id));
    if (!toAdd.length) return;
    setSaving(true);
    let count = 0;
    for (const item of toAdd) {
      try {
        await saveClothingItem({
          name:              item.name,
          category:          item.category,
          subcategory:       item.subcategory,
          color:             item.color,
          secondary_color:   item.secondary_color,
          pattern:           item.pattern,
          fabric:            item.fabric,
          fit:               item.fit,
          formality:         item.formality,
          style:             item.style,
          gender_style:      item.gender_style,
          season:            item.season,
          style_vibes:       item.style_vibes,
          occasion_tags:     item.occasion_tags,
          color_undertone:   item.color_undertone,
          color_saturation:  item.color_saturation,
          piece_role:        item.piece_role,
          layer_role:        item.layer_role,
          fabric_weight:     item.fabric_weight,
          color_pairs:       item.color_pairs,
          contrast_affinity: item.contrast_affinity,
          image_url:         item.image_url,
        });
        count++;
      } catch { /* skip failures */ }
    }
    setSavedCount(count);
    setSaving(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="page-bare catalog">
        <div className="catalog-done animate-up">
          <div className="eyebrow">— Added</div>
          <h1 className="display"><em>{savedCount}</em><br/>{savedCount === 1 ? 'piece' : 'pieces'} added.</h1>
          <p className="lead" style={{ marginTop: 'var(--s-5)' }}>They're in your wardrobe now.</p>
          <div style={{ marginTop: 'var(--s-10)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <button className="pill pill-primary pill-full" onClick={() => navigate('/wardrobe')}>See my wardrobe →</button>
            <button className="pill pill-ghost pill-full" onClick={() => { setDone(false); setSelected(new Set()); }}>Add more pieces</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-bare catalog">
      {/* Header */}
      <div className="catalog-head">
        <button className="catalog-back" onClick={() => navigate(-1)}>←</button>
        <div>
          <div className="eyebrow">— Essentials</div>
          <h1 className="display catalog-title">Your wardrobe,<br/><em>started.</em></h1>
        </div>
      </div>

      {/* Category chips */}
      <div className="catalog-filters">
        <div className="scroll-x" style={{ padding: '0 var(--s-6)' }}>
          {visibleCategories.map(cat => (
            <button
              key={cat}
              className={`chip ${activeCategory === cat ? 'is-active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="catalog-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="catalog-card">
              <div className="catalog-card-img skeleton" />
              <div style={{ padding: '10px 12px' }}>
                <div className="skeleton" style={{ height: 13, width: '75%', borderRadius: 4, marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 10, width: '50%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: 'var(--s-12) var(--s-6)', textAlign: 'center' }}>
          <p className="lead" style={{ color: 'var(--ink-3)' }}>No essentials yet.</p>
          <p className="meta" style={{ marginTop: 'var(--s-3)', color: 'var(--ink-4)' }}>Upload your own photos to build your wardrobe.</p>
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="catalog-grid">
          {filtered.map(item => {
            const isSelected = selected.has(item.id);
            return (
              <button
                key={item.id}
                className={`catalog-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => toggle(item.id)}
              >
                <div className="catalog-card-img">
                  <img src={item.image_url} alt={item.name} loading="lazy" />
                  {isSelected && (
                    <div className="catalog-card-check">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="catalog-card-meta">
                  <div className="catalog-card-name">{item.name}</div>
                  <div className="meta">
                    {item.brand ? `${item.brand} · ` : ''}{item.color}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sticky CTA */}
      {selected.size > 0 && (
        <div className="catalog-cta">
          <button
            className="pill pill-primary pill-full"
            onClick={addToWardrobe}
            disabled={saving}
          >
            {saving ? 'Adding…' : `Add ${selected.size} ${selected.size === 1 ? 'piece' : 'pieces'} to wardrobe →`}
          </button>
        </div>
      )}
    </div>
  );
}
