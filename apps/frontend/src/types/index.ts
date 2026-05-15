export interface ScannedItem {
  isClothing: boolean;
  label: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  pattern: string;
  fabric: string | null;
  fit: string | null;
  style: string;
  formality: string;
  season: string[];
  genderStyle: string;
  layersWith: string[];
  pairsWellWith: string[];
  styleNotes: string | null;
  styleVibes: string[];
  occasionTags: string[];
  energy: string[];
  worksBestFor: string[];
  image: string;
  imageUrl?: string;
}

export interface ScanResponse {
  item: ScannedItem;
}

export interface ClothingItem {
  id: number;
  name: string;
  category: string;
  subcategory: string | null;
  color: string;
  secondary_color: string | null;
  pattern: string | null;
  fabric: string | null;
  fit: string | null;
  formality: string | null;
  season: string | null;
  style: string | null;
  gender_style: string | null;
  layers_with: string | null;
  pairs_well_with: string | null;
  style_notes: string | null;
  style_vibes: string | null;
  occasion_tags: string | null;
  energy: string | null;
  works_best_for: string | null;
  image_base64: string | null;
  image_url: string | null;
  favorite: boolean;
  last_worn: string | null;
  user_id: string | null;
  created_at: string;
}

export interface PieceImage {
  id: number;
  name: string;
  category: string;
  image_base64: string | null;
  image_url: string | null;
}

export interface OutfitSuggestion {
  name: string;
  trendContext: string;
  pieceIds: number[];
  pieces: string[];
  pieceImages: PieceImage[];
  occasion: string;
  tip: string;
  mood: string;
  matchQuality?: 'exact' | 'closest';
}

export interface CatalogItem {
  id: number;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  color: string;
  secondary_color: string | null;
  pattern: string | null;
  fabric: string | null;
  fit: string | null;
  formality: string | null;
  style: string | null;
  gender_style: string | null;
  season: string | null;
  style_vibes: string | null;
  occasion_tags: string | null;
  image_url: string;
}

export interface SuggestResponse {
  outfits: OutfitSuggestion[];
}

export const CATEGORIES = [
  'All', 'Tops', 'Bottoms', 'Kurta', 'Saree',
  'Lehenga', 'Sherwani', 'Dupatta', 'Dress',
  'Outerwear', 'Shoes', 'Accessories',
] as const;

export const OCCASIONS = [
  'All', 'Casual', 'Work', 'Wedding', 'Festival', 'Formal', 'Sport',
] as const;

export const THEMES = [
  { label: 'Casual Day',     icon: '☀️', value: 'Casual'   },
  { label: 'Work Ready',     icon: '💼', value: 'Work'     },
  { label: 'Wedding Guest',  icon: '✨', value: 'Wedding'  },
  { label: 'Festival Vibes', icon: '🪔', value: 'Festival' },
  { label: 'Formal Evening', icon: '🌙', value: 'Formal'   },
  { label: 'Sport & Active', icon: '🏃', value: 'Sport'    },
] as const;
