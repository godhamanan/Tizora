import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClothes } from '../api/client';
import type { ClothingItem } from '../types/index';
import { CATEGORIES } from '../types/index';
import './Wardrobe.css';

const DEFAULT_VISIBLE = new Set(['All', 'Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Kurta']);

export default function Wardrobe() {
  const navigate = useNavigate();
  const [items,          setItems]          = useState<ClothingItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search,         setSearch]         = useState('');
  const [showSearch,     setShowSearch]     = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try { setItems(await getClothes()); }
    catch { setError('We could not load your wardrobe.'); }
    finally { setLoading(false); }
  }

  const filtered = items.filter(item => {
    const cat  = activeCategory === 'All' || item.category.toLowerCase() === activeCategory.toLowerCase();
    const q    = search.trim().toLowerCase();
    const srch = !q || item.name.toLowerCase().includes(q) || item.color.toLowerCase().includes(q);
    return cat && srch;
  });

  const visibleCategories = CATEGORIES.filter(cat =>
    DEFAULT_VISIBLE.has(cat) || items.some(i => i.category === cat)
  );

  return (
    <div className="page wardrobe">
      <header className="wardrobe-head">
        <div className="wardrobe-head-row">
          <div>
            <div className="eyebrow">— {items.length} {items.length === 1 ? 'piece' : 'pieces'}</div>
            <h1 className="display wardrobe-title">Your<br/><em>wardrobe.</em></h1>
          </div>
          <button className="wardrobe-search-btn" onClick={() => setShowSearch(v => !v)} aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
        {showSearch && (
          <div className="wardrobe-search animate-fade">
            <input className="field" placeholder="Search by name or colour…" value={search}
              onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
        )}
      </header>

      {/* Filter chips */}
      <div className="wardrobe-filters">
        <div className="scroll-x" style={{ padding: '0 var(--s-6)' }}>
          {visibleCategories.map(cat => {
            const count = cat === 'All' ? items.length : items.filter(i => i.category === cat).length;
            return (
              <button
                key={cat}
                className={`chip ${activeCategory === cat ? 'is-active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}{count > 0 ? ` · ${count}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="wardrobe-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="wardrobe-card">
              <div className="wardrobe-card-img skeleton" />
              <div className="wardrobe-card-meta">
                <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 11, width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && <p className="notice section">{error}</p>}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="wardrobe-empty section">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="1" /><line x1="12" y1="3" x2="12" y2="21" />
          </svg>
          <h2 className="h2" style={{ marginTop: 'var(--s-5)' }}>
            {search || activeCategory !== 'All' ? 'Nothing matches.' : 'Empty for now.'}
          </h2>
          <p className="lead" style={{ marginTop: 'var(--s-3)', maxWidth: 280 }}>
            {search || activeCategory !== 'All'
              ? 'Try a different filter or search.'
              : "Add your first piece and we'll begin."}
          </p>
          {!search && activeCategory === 'All' && (
            <button className="pill pill-primary" style={{ marginTop: 'var(--s-6)' }} onClick={() => navigate('/upload')}>
              Add a piece →
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="wardrobe-grid">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className="wardrobe-card animate-up"
              style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
              onClick={() => navigate(`/wardrobe/${item.id}`)}
            >
              <div className="wardrobe-card-img">
                {item.image_url || item.image_base64
                  ? <img src={item.image_url ?? item.image_base64 ?? ''} alt={item.name} loading="lazy" />
                  : <div className="wardrobe-card-placeholder">—</div>
                }
              </div>
              <div className="wardrobe-card-meta">
                <div className="wardrobe-card-name">{item.name}</div>
                <div className="meta">{item.color} · {item.category}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

