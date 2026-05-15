import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeRun } from '@trigger.dev/react-hooks';
import { scanImage, saveClothingItem } from '../api/client';
import type { ScannedItem } from '../types/index';
import { CATEGORIES } from '../types/index';
import { useUpload } from '../context/UploadContext';
import type { ReviewItem } from '../context/UploadContext';
import './Upload.css';

const MAX_BATCH = 10;
const PENDING_KEY = 'tizora_pending_batch';

function toReviewItem(item: ScannedItem): ReviewItem {
  return {
    scanned:        item,
    selected:       true,
    editedName:     item.label,
    editedCategory: item.category,
    editedColor:    item.primaryColor,
    editedOccasion: item.occasionTags?.[0] ?? 'casual',
    editedSeason:   Array.isArray(item.season) ? item.season[0] : 'all-season',
    editedStyle:    item.style,
  };
}

export default function Upload() {
  const navigate = useNavigate();
  const {
    step, setStep,
    path, setPath,
    reviewItem, setReviewItem,
    batchItems, setBatchItems,
    batchProgress, setBatchProgress,
    batchJobId, setBatchJobId,
    runId, setRunId,
    publicToken, setPublicToken,
    savedCount, setSavedCount,
    notice, setNotice,
    batchPreviews, setBatchPreviews,
    fileRef,
    reset,
  } = useUpload();

  const stepIndex = ['choose', 'drop', 'reading', 'meet'].indexOf(step);

  // ── Realtime subscription ─────────────────────────────────────────────────
  const { run } = useRealtimeRun(runId ?? '', {
    accessToken: publicToken ?? '',
    enabled:     !!runId && !!publicToken,
  });

  // ── Fetch current items from DB whenever Trigger.dev signals progress ─────
  const fetchItems = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/scan/batch/${jobId}`, { credentials: 'include' });
      if (!res.ok) return;
      const job = await res.json() as {
        status: string; total: number; processed: number; failed: number; results: string;
      };
      const items: ReviewItem[] = JSON.parse(job.results ?? '[]').map(toReviewItem);
      setBatchProgress({ current: job.processed, total: job.total, failed: job.failed });
      setBatchItems(items);
      if (items.length > 0) {
        setStep('meet');
        localStorage.removeItem(PENDING_KEY);
      }
    } catch { /* ignore transient errors */ }
  }, [setBatchProgress, setBatchItems, setStep]);

  // ── React to Trigger.dev signals ──────────────────────────────────────────
  useEffect(() => {
    if (!run || !batchJobId) return;

    const meta = run.metadata as { processed?: number; total?: number; failed?: number } | undefined;
    const serverProcessed = meta?.processed ?? 0;

    if (meta?.total && (!batchProgress || batchProgress.total === 0)) {
      setBatchProgress({
        current: batchProgress?.current ?? 0,
        total:   meta.total!,
        failed:  batchProgress?.failed  ?? 0,
      });
    }

    if (serverProcessed > batchItems.length) fetchItems(batchJobId);

    if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CRASHED') {
      fetchItems(batchJobId).then(() => {
        setBatchItems(prev => {
          if (prev.length === 0) {
            setNotice('Nothing we could read in there. Try clearer photos?');
            setStep('drop');
          }
          return prev;
        });
      });
      setRunId(null);
      setPublicToken(null);
    }
  }, [run?.metadata, run?.status, batchJobId, batchItems.length, batchProgress,
      fetchItems, setBatchProgress, setBatchItems, setNotice, setStep, setRunId, setPublicToken]);

  // ── On mount: resume any pending batch job from localStorage ─────────────
  useEffect(() => {
    // If state is already live (user navigated away and back), don't reset
    if (step !== 'choose' || batchJobId) return;

    const stored = localStorage.getItem(PENDING_KEY);
    if (!stored) return;
    try {
      const { jobId, runId: storedRunId, publicToken: storedToken, createdAt } = JSON.parse(stored);
      if (Date.now() - createdAt < 4 * 60 * 60 * 1000) {
        setBatchJobId(jobId);
        setRunId(storedRunId);
        setPublicToken(storedToken);
        setPath('batch');
        setStep('reading');
        fetch(`/api/scan/batch/${jobId}`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((job: any) => {
            if (!job) return;
            setBatchProgress({ current: job.processed, total: job.total, failed: job.failed ?? 0 });
            const items: ReviewItem[] = JSON.parse(job.results ?? '[]').map(toReviewItem);
            if (items.length > 0) {
              setBatchItems(items);
              if (job.status === 'complete') {
                setStep('meet');
                localStorage.removeItem(PENDING_KEY);
              }
            }
          })
          .catch(() => {});
      } else {
        localStorage.removeItem(PENDING_KEY);
      }
    } catch { localStorage.removeItem(PENDING_KEY); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPicker() { fileRef.current?.click(); }

  async function handleSingle(file: File) {
    setStep('reading');
    setPath('single');
    try {
      const r = await scanImage(file);
      setReviewItem(toReviewItem(r.item));
      setStep('meet');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not read this photo.');
      setStep('drop');
    }
  }

  async function handleBatch(files: File[]) {
    setNotice(null);
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length === 0) { setNotice('Please select image files (JPG, PNG, or WEBP).'); return; }
    if (images.length > MAX_BATCH) { setNotice(`You can upload up to ${MAX_BATCH} photos at a time.`); return; }

    // Create local previews immediately so the grid shows before scan completes
    const previews = images.map(f => URL.createObjectURL(f));
    setBatchPreviews(previews);
    setBatchItems([]);
    setBatchJobId(null);
    setRunId(null);
    setPublicToken(null);
    setBatchProgress({ current: 0, total: images.length, failed: 0 });
    setStep('meet');  // go straight to interactive grid
    setPath('batch');

    const formData = new FormData();
    for (const file of images) formData.append('images', file);

    try {
      const res = await fetch('/api/scan/batch', { method: 'POST', credentials: 'include', body: formData });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as { jobId: string; runId: string; publicToken: string; total: number };
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        jobId: data.jobId, runId: data.runId, publicToken: data.publicToken, createdAt: Date.now(),
      }));
      setBatchJobId(data.jobId);
      setRunId(data.runId);
      setPublicToken(data.publicToken);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Upload failed. Try again?');
      setStep('drop');
      setBatchPreviews([]);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function buildPayload(r: ReviewItem) {
    const s = r.scanned;
    return {
      name:            r.editedName,
      category:        r.editedCategory,
      subcategory:     s.subcategory,
      color:           r.editedColor,
      secondary_color: s.secondaryColor,
      pattern:         s.pattern,
      fabric:          s.fabric,
      fit:             s.fit,
      formality:       s.formality,
      season:          r.editedSeason,
      style:           r.editedStyle,
      gender_style:    s.genderStyle,
      layers_with:     s.layersWith?.join(', ')    ?? null,
      pairs_well_with: s.pairsWellWith?.join(', ') ?? null,
      style_notes:     s.styleNotes,
      style_vibes:     s.styleVibes?.join(', ')    ?? null,
      occasion_tags:   (() => {
        const tags    = s.occasionTags ?? [];
        const primary = r.editedOccasion;
        const merged  = primary ? [primary, ...tags.filter(t => t !== primary)] : tags;
        return merged.join(', ') || null;
      })(),
      energy:          s.energy?.join(', ')       ?? null,
      works_best_for:  s.worksBestFor?.join(', ') ?? null,
      image_base64:    s.image,
    };
  }

  async function saveAll() {
    setStep('saving');
    let saved = 0;
    if (path === 'single' && reviewItem) {
      try { await saveClothingItem(buildPayload(reviewItem)); saved = 1; }
      catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not add to wardrobe. Try again?';
        setNotice(msg);
        setStep('meet');
        return;
      }
    } else {
      for (const item of batchItems.filter(i => i.selected)) {
        try { await saveClothingItem(buildPayload(item)); saved++; }
        catch { /* continue */ }
      }
      if (batchJobId) {
        fetch(`/api/scan/batch/${batchJobId}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      }
      localStorage.removeItem(PENDING_KEY);
    }
    setSavedCount(saved);
    setStep('welcomed');
  }

  const isStillScanning = path === 'batch' && !!runId && step === 'meet' &&
    (batchProgress?.current ?? 0) < (batchProgress?.total ?? 0);

  // ── STEP RENDERERS ────────────────────────────────────────────────────────

  if (step === 'welcomed') {
    return (
      <div className="page-bare upload">
        <div className="upload-welcomed animate-up">
          <div className="eyebrow">— Welcomed</div>
          <h1 className="display upload-welcomed-title">
            <em>{savedCount}</em> {savedCount === 1 ? 'piece' : 'pieces'}<br/>added to your wardrobe.
          </h1>
          <p className="lead" style={{ marginTop: 'var(--s-6)' }}>Your wardrobe is growing. Beautifully.</p>
          <div className="upload-welcomed-actions">
            <button className="pill pill-primary pill-full" onClick={() => navigate('/wardrobe')}>Visit my wardrobe →</button>
            <button className="pill pill-ghost pill-full" onClick={reset}>Add another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-bare upload">
      <div className="upload-top">
        <button className="upload-back" onClick={() => {
          if (step === 'choose' || step === 'drop') navigate(-1);
          else if (step === 'meet') setStep('choose');
          else reset();
        }}>←</button>
        <div className="stepper">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`stepper-dot ${i <= stepIndex ? 'is-active' : ''}`} />
          ))}
        </div>
        <div className="upload-top-right">
          {step === 'meet' && path === 'single' && (
            <button className="upload-skip" onClick={reset}>Discard</button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture={path === 'single' ? 'environment' : undefined}
        multiple={path === 'batch'}
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          if (path === 'single') handleSingle(files[0]);
          else handleBatch(files);
          e.target.value = '';
        }}
      />

      {/* LANDING */}
      {(step === 'choose' || step === 'drop') && (
        <div className="upload-step animate-fade">
          <div className="eyebrow">— Step one</div>
          <h1 className="display upload-step-title">How shall<br/>we <em>begin?</em></h1>
          <p className="lead upload-step-sub">Choose what feels easiest. You can always add more later.</p>

          {notice && <p className="notice" style={{ marginTop: 'var(--s-4)' }}>{notice}</p>}

          <div className="upload-paths" style={{ marginTop: 'var(--s-8)' }}>
            <button className="upload-path" onClick={() => { setPath('single'); openPicker(); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <div>
                <div className="h3">Take a photo</div>
                <div className="body" style={{ marginTop: 4 }}>Photograph a single garment. We'll do the rest.</div>
              </div>
              <span className="upload-path-arrow">→</span>
            </button>
            <button className="upload-path" onClick={() => { setPath('batch'); openPicker(); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <div>
                <div className="h3">Choose photos</div>
                <div className="body" style={{ marginTop: 4 }}>Select up to {MAX_BATCH} photos. We'll scan each piece.</div>
              </div>
              <span className="upload-path-arrow">→</span>
            </button>
            <button className="upload-path" onClick={() => navigate('/catalog')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              <div>
                <div className="h3">Browse catalog</div>
                <div className="body" style={{ marginTop: 4 }}>Pick from pre-loaded pieces and add to your wardrobe.</div>
              </div>
              <span className="upload-path-arrow">→</span>
            </button>
          </div>
        </div>
      )}

      {/* READING — single */}
      {step === 'reading' && path === 'single' && (
        <div className="upload-step animate-fade upload-reading">
          <div className="upload-reading-frame"><div className="upload-reading-line" /></div>
          <div className="eyebrow upload-reading-eyebrow" style={{ color: 'var(--accent)' }}>— A moment, please</div>
          <h2 className="h2 upload-reading-title">Reading the colour, the cut,<br/>the way it falls.</h2>
          <div className="dot-pulse upload-reading-dots"><span/><span/><span/></div>
        </div>
      )}


      {/* MEET — single */}
      {step === 'meet' && path === 'single' && reviewItem && (
        <div className="upload-step animate-fade">
          <div className="eyebrow">— We've found</div>
          <h1 className="display upload-step-title">
            <em>{reviewItem.scanned.primaryColor}</em><br/>{labelTail(reviewItem.scanned)}
          </h1>
          <div className="upload-meet-img">
            <img src={reviewItem.scanned.image} alt={reviewItem.scanned.label} />
          </div>
          <div className="upload-meet-fields">
            <Field label="Name">
              <input className="field" value={reviewItem.editedName} onChange={e => setReviewItem({ ...reviewItem, editedName: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className="select" value={reviewItem.editedCategory} onChange={e => setReviewItem({ ...reviewItem, editedCategory: e.target.value })}>
                {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Occasion">
              <select className="select" value={reviewItem.editedOccasion} onChange={e => setReviewItem({ ...reviewItem, editedOccasion: e.target.value })}>
                {['casual','office','date-night','dinner','wedding','festive','travel','sports','lounge'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div className="upload-meet-pills">
            {reviewItem.scanned.fabric    && <span className="upload-meta-pill">{reviewItem.scanned.fabric}</span>}
            {reviewItem.scanned.fit       && <span className="upload-meta-pill">{reviewItem.scanned.fit}</span>}
            {reviewItem.scanned.pattern   && <span className="upload-meta-pill">{reviewItem.scanned.pattern}</span>}
            {reviewItem.scanned.formality && <span className="upload-meta-pill">{reviewItem.scanned.formality}</span>}
          </div>
          {reviewItem.scanned.styleNotes && (
            <div className="upload-meet-note">
              <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 8 }}>— A note</div>
              <p className="italic-serif body">"{reviewItem.scanned.styleNotes}"</p>
            </div>
          )}
          {notice && <p className="notice" style={{ marginTop: 'var(--s-4)' }}>{notice}</p>}
          <button className="pill pill-primary pill-full upload-cta" onClick={saveAll}>Add to wardrobe →</button>
        </div>
      )}

      {/* MEET — batch (interactive scanning grid) */}
      {step === 'meet' && path === 'batch' && (
        <div className="upload-step animate-fade">
          <div className="eyebrow">— Your pieces</div>
          <div className="upload-batch-header">
            <h1 className="display upload-step-title" style={{ margin: 0 }}>
              {isStillScanning
                ? <><em>{batchItems.length}</em> ready · <span className="upload-scanning-badge">{(batchProgress?.total ?? 0) - batchItems.length} scanning</span></>
                : <><em>{batchItems.length}</em> {batchItems.length === 1 ? 'piece' : 'pieces'} found</>
              }
            </h1>
            {isStillScanning && batchProgress && (
              <div className="upload-progress upload-progress-inline">
                <div className="upload-progress-fill" style={{ transform: `scaleX(${batchProgress.total > 0 ? batchProgress.current / batchProgress.total : 0})` }} />
              </div>
            )}
          </div>

          <div className="upload-batch-grid">
            {/* Classified cards */}
            {batchItems.map((item, i) => (
              <BatchCard
                key={`done-${i}`}
                item={item}
                onToggle={() => setBatchItems(prev => prev.map((it, idx) => idx === i ? { ...it, selected: !it.selected } : it))}
                onUpdate={(field, value) => setBatchItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))}
              />
            ))}
            {/* Scanning placeholder cards */}
            {Array.from({ length: Math.max(0, (batchProgress?.total ?? 0) - batchItems.length) }).map((_, i) => (
              <ScanningCard key={`scanning-${i}`} preview={batchPreviews[batchItems.length + i]} />
            ))}
          </div>

          {batchProgress && batchProgress.failed > 0 && (
            <p className="meta" style={{ color: 'var(--ink-4)', marginTop: 'var(--s-3)' }}>
              {batchProgress.failed} {batchProgress.failed === 1 ? 'photo' : 'photos'} skipped — no garment detected.
            </p>
          )}
          <button
            className="pill pill-primary pill-full upload-cta"
            disabled={batchItems.filter(i => i.selected).length === 0}
            onClick={saveAll}
          >
            {isStillScanning
              ? `Add ${batchItems.filter(i => i.selected).length} ready pieces →`
              : `Add ${batchItems.filter(i => i.selected).length} to wardrobe →`
            }
          </button>
        </div>
      )}

      {/* SAVING */}
      {step === 'saving' && (
        <div className="upload-step upload-reading animate-fade">
          <div className="eyebrow upload-reading-eyebrow" style={{ color: 'var(--accent)' }}>— Welcoming</div>
          <h2 className="h2 upload-reading-title">Adding to your wardrobe.</h2>
          <div className="dot-pulse upload-reading-dots"><span/><span/><span/></div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="upload-field">
      <span className="eyebrow upload-field-label">— {label}</span>
      {children}
    </label>
  );
}

function BatchCard({ item, onToggle, onUpdate }: {
  item: ReviewItem; onToggle: () => void; onUpdate: (field: keyof ReviewItem, value: string) => void;
}) {
  return (
    <div className={`upload-batch-card ${!item.selected ? 'is-deselected' : ''}`} onClick={onToggle}>
      <div className="upload-batch-img">
        <img src={item.scanned.image} alt={item.editedName} />
        <div className={`upload-batch-check ${item.selected ? 'is-checked' : ''}`}>
          {item.selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      </div>
      <div className="upload-batch-meta">
        <input
          className="upload-batch-name"
          value={item.editedName}
          onChange={e => { e.stopPropagation(); onUpdate('editedName', e.target.value); }}
          onClick={e => e.stopPropagation()}
          disabled={!item.selected}
        />
        <div className="meta">{item.editedCategory} · {item.editedColor}</div>
      </div>
    </div>
  );
}

function ScanningCard({ preview }: { preview?: string }) {
  return (
    <div className="upload-batch-card upload-batch-card--scanning">
      <div className="upload-batch-img">
        {preview
          ? <img src={preview} alt="Scanning…" style={{ filter: 'brightness(0.7)' }} />
          : <div className="skeleton" style={{ width: '100%', height: '100%' }} />
        }
        <div className="upload-scanning-overlay">
          <div className="dot-pulse" style={{ '--dot-size': '6px' } as React.CSSProperties}><span/><span/><span/></div>
        </div>
      </div>
      <div className="upload-batch-meta">
        <div className="skeleton" style={{ height: 13, width: '80%', borderRadius: 4, marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 10, width: '55%', borderRadius: 4 }} />
      </div>
    </div>
  );
}

function labelTail(s: ScannedItem): string {
  const colorRe = new RegExp(`^${s.primaryColor}\\s+`, 'i');
  return s.label.replace(colorRe, '').toLowerCase();
}
