/**
 * The eight products the rulebook corpus was derived from, and the only ones
 * with a committed offline snapshot. Any beminimalist.co product URL works in
 * the generator; these are the shortcuts, and the ones that survive a network
 * failure.
 *
 * Client-safe on purpose: the UI needs the names, and importing the snapshot
 * JSON to get them would ship the full fact sheets to the browser for a
 * dropdown.
 */
export interface CatalogueEntry {
  handle: string;
  name: string;
}

export const CATALOGUE: CatalogueEntry[] = [
  { handle: "niacinamide-10-with-matmarine", name: "Niacinamide 10% Face Serum" },
  { handle: "salicylic-acid-2", name: "Salicylic Acid 2% Face Serum" },
  { handle: "alpha-arbutin-2", name: "Alpha Arbutin 2% Face Serum" },
  { handle: "2-hyaluronic-acid", name: "Hyaluronic + PGA 2% Face Serum" },
  { handle: "vitamin-c-ethyl-ascorbic-acid-10-acetyl-glucosamine-1", name: "Vitamin C 10% Face Serum" },
  { handle: "retinol-0-3-q10", name: "Retinol 0.3% Face Serum" },
  { handle: "vitamin-b5-10-moisturizer", name: "Vitamin B5 10% Moisturizer" },
  { handle: "multi-vitamin-spf-50", name: "SPF 50 Sunscreen" },
];

export function productUrl(handle: string): string {
  return `https://beminimalist.co/products/${handle}`;
}
