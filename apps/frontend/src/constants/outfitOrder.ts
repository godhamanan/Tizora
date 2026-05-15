import type { PieceImage } from '../types/index';

// Canonical display order: outermost layer first, feet last
const LAYER_ORDER: Record<string, number> = {
  // Outerwear — worn over everything
  Outerwear:      0,
  Sherwani:       0,

  // Upper body / torso
  Tops:           1,
  Kurta:          1,
  Kurti:          1,
  Anarkali:       1,
  'Salwar Kameez':1,

  // Full-length ethnic (saree wraps over blouse+petticoat, lehenga is skirt+blouse)
  Saree:          2,
  Lehenga:        2,
  Dress:          2,
  Sharara:        2,

  // Dupatta — draped last over the outfit
  Dupatta:        3,

  // Lower body
  Bottoms:        4,

  // Feet
  Shoes:          5,

  // Accessories — smallest, shown last
  Accessories:    6,
};

function layerOf(category: string): number {
  return LAYER_ORDER[category] ?? 3;
}

export function sortPieces(pieces: PieceImage[]): PieceImage[] {
  return [...pieces].sort((a, b) => layerOf(a.category) - layerOf(b.category));
}
