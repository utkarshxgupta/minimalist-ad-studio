import { ProductFacts } from "@/lib/types";

import hyaluronic from "@/fixtures/products/2-hyaluronic-acid.json";
import alphaArbutin from "@/fixtures/products/alpha-arbutin-2.json";
import spf from "@/fixtures/products/multi-vitamin-spf-50.json";
import niacinamide from "@/fixtures/products/niacinamide-10-with-matmarine.json";
import retinol from "@/fixtures/products/retinol-0-3-q10.json";
import salicylic from "@/fixtures/products/salicylic-acid-2.json";
import vitaminB5 from "@/fixtures/products/vitamin-b5-10-moisturizer.json";
import vitaminC from "@/fixtures/products/vitamin-c-ethyl-ascorbic-acid-10-acetyl-glucosamine-1.json";

/**
 * Committed snapshots of the eight products the rulebook corpus was derived
 * from. Refreshed with `npm run snapshot`.
 *
 * These are imported statically rather than read from disk at request time.
 * A `readFileSync` on a path built at runtime is invisible to the bundler, so
 * it works locally and 404s in production, which is the worst possible place to
 * discover a fallback is missing.
 *
 * A snapshot is never presented as a live read. The UI shows the capture date,
 * because a cached page passed off as current is the same species of quiet
 * dishonesty this whole project argues against.
 */
const SNAPSHOTS = [
  hyaluronic,
  alphaArbutin,
  spf,
  niacinamide,
  retinol,
  salicylic,
  vitaminB5,
  vitaminC,
];

export interface Snapshot {
  handle: string;
  fetchedAt: string;
  facts: ProductFacts;
  warnings: string[];
}

const byHandle = new Map<string, Snapshot>(
  SNAPSHOTS.map((s) => [
    s.handle,
    {
      handle: s.handle,
      fetchedAt: s.fetchedAt,
      facts: ProductFacts.parse(s.facts),
      warnings: s.warnings ?? [],
    },
  ])
);

export function loadSnapshot(handle: string): Snapshot | null {
  return byHandle.get(handle) ?? null;
}

/** Powers the "or try one of these" list in the UI. */
export function listSnapshots(): Snapshot[] {
  return [...byHandle.values()];
}
