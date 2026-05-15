import type { ClothingItem, ScanResponse, CatalogItem } from '../types/index';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.detail ?? body.error ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function scanImage(file: File): Promise<ScanResponse> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${BASE}/scan`, { method: 'POST', credentials: 'include', body: formData });
  return handleResponse<ScanResponse>(res);
}

export async function getClothes(params?: {
  category?: string;
}): Promise<ClothingItem[]> {
  const url = new URL(`${BASE}/clothes`, window.location.origin);
  if (params?.category && params.category !== 'All') url.searchParams.set('category', params.category);
  const res = await fetch(url.toString(), { credentials: 'include' });
  return handleResponse<ClothingItem[]>(res);
}

export async function getClothingItem(id: number): Promise<ClothingItem> {
  const res = await fetch(`${BASE}/clothes/${id}`, { credentials: 'include' });
  return handleResponse<ClothingItem>(res);
}

export async function saveClothingItem(item: {
  name: string;
  category: string;
  subcategory?: string | null;
  color: string;
  secondary_color?: string | null;
  pattern?: string | null;
  fabric?: string | null;
  fit?: string | null;
  formality?: string | null;
  season?: string | null;
  style?: string | null;
  gender_style?: string | null;
  layers_with?: string | null;
  pairs_well_with?: string | null;
  style_notes?: string | null;
  style_vibes?: string | null;
  occasion_tags?: string | null;
  energy?: string | null;
  works_best_for?: string | null;
  image_base64?: string | null;
  image_url?: string | null;
}): Promise<ClothingItem> {
  const res = await fetch(`${BASE}/clothes`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return handleResponse<ClothingItem>(res);
}

export async function updateClothingItem(
  id: number,
  updates: Partial<ClothingItem>
): Promise<ClothingItem> {
  const res = await fetch(`${BASE}/clothes/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return handleResponse<ClothingItem>(res);
}

export async function deleteClothingItem(id: number): Promise<void> {
  const res = await fetch(`${BASE}/clothes/${id}`, { method: 'DELETE', credentials: 'include' });
  return handleResponse<void>(res);
}

export async function clearWardrobe(): Promise<{ deleted: number }> {
  const res = await fetch(`${BASE}/clothes`, { method: 'DELETE', credentials: 'include' });
  return handleResponse<{ deleted: number }>(res);
}

export async function getCatalog(category?: string, gender?: 'men' | 'women'): Promise<CatalogItem[]> {
  const url = new URL(`${BASE}/catalog`, window.location.origin);
  if (category && category !== 'All') url.searchParams.set('category', category);
  if (gender) url.searchParams.set('gender', gender);
  const res = await fetch(url.toString(), { credentials: 'include' });
  return handleResponse<CatalogItem[]>(res);
}

export async function getOutfitSuggestions(
  theme: string,
  weather?: string,
  anchorItemId?: number
): Promise<{ outfits: import('../types/index').OutfitSuggestion[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000); // 45s timeout
  try {
    const res = await fetch(`${BASE}/suggest`, {
      method:  'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ theme, weather, anchorItemId }),
      signal:  controller.signal,
    });
    return handleResponse(res);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out — Gemini is taking too long. Try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
