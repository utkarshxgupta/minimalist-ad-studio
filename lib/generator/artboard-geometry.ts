import type { Placement } from "./placements";

/**
 * Layout geometry, as fractions of the canvas, shared by the Artboard
 * component and its tests.
 *
 * Extracted rather than left inline in JSX because "the product gets cut off"
 * was a real defect in the previous version, caught only by looking at a
 * screenshot. A fraction table can be asserted against directly: the product
 * box must fit inside the canvas with margin, and copy must clear each
 * placement's platform safe zone. That is cheaper to check on every commit
 * than a screenshot, and it is what actually caught the bug this file exists
 * to prevent from coming back.
 *
 * The previous version also cropped the product with `object-fit: cover`
 * inside a box shaped nothing like the photo. A 1100x1600 portrait bottle
 * forced into a short landscape strip loses its cap or its base to the crop,
 * which is exactly what "the tube scale calculation is broken" was showing.
 * `object-fit: contain` inside a correctly proportioned box cannot clip the
 * product; the cost is a shrunk product with margin around it, which is also
 * what the brand's own packshots look like: "always fully contained with
 * clear margin padding."
 */

export interface Box {
  /** Fraction of canvas width/height, 0 to 1. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometry {
  /** Where the product photo's bounding box sits. Sized generously; `contain` does the rest. */
  product: Box;
  /** Where the copy column sits. */
  copy: Box;
  align: "start" | "center" | "end";
}

/**
 * Minimum margin, as a fraction of the shorter canvas dimension, between any
 * rendered element and the canvas edge. Real packshots are never bled to the
 * frame edge.
 */
export const MIN_MARGIN = 0.05;

/**
 * Platform safe zones, as a fraction of canvas height, where a Story or Reel
 * overlays its own UI (caption, sticker tray, reply bar). Nothing load-bearing
 * may sit inside these on a `meta_story_9x16` placement.
 */
export const STORY_SAFE_ZONE = { top: 0.12, bottom: 0.2 };

export function geometryFor(p: Placement): Geometry {
  switch (p.layout) {
    case "split":
      return {
        product: { x: 0.52, y: 0.08, w: 0.42, h: 0.82 },
        copy: { x: 0.06, y: 0, w: 0.44, h: 1 },
        align: "center",
      };
    case "tall":
      // Sized to clear both Story safe zones, not just fit the canvas.
      // Regression: an earlier layout ran the product box to y=0.86, into the
      // zone Instagram overlays with its own caption and reply-bar UI.
      return {
        product: { x: 0.14, y: 0.48, w: 0.72, h: 0.28 },
        copy: { x: 0.07, y: 0.14, w: 0.86, h: 0.32 },
        align: "start",
      };
    case "stacked":
    default:
      return {
        product: { x: 0.22, y: 0.06, w: 0.56, h: 0.42 },
        copy: { x: 0.07, y: 0.52, w: 0.86, h: 0.42 },
        align: "start",
      };
  }
}

/**
 * Where the creative-mode prop accent sits: a small square, guaranteed clear
 * of the product's own box.
 *
 * The first version centred a large prop on the product box, on the theory
 * that it would read as a motif surrounding the bottle. On the split layout,
 * where the product fills up to 82 percent of the canvas, that put the prop's
 * actual graphic content directly behind the opaque product photo: invisible,
 * with only its blank white margin showing elsewhere, which multiplies away
 * to nothing. Caught by looking at the rendered output, not by reasoning
 * about the layout math, which is exactly why this is a function with a test
 * rather than an inline style rule: the failure mode is silent.
 */
const PROP_GAP = 0.01;
const PROP_MAX_SIZE = 0.16;

export function propAccentFor(p: Placement): Box {
  const product = geometryFor(p).product;
  const edge = 1 - MIN_MARGIN;

  if (p.layout === "split") {
    // The product spans nearly the full canvas height here (up to 82
    // percent), so the band beside it is a hairline gutter but the band
    // beneath it is real, if narrow. Sized to what that band actually is,
    // not to a fixed fraction: a fixed size is what put the prop's own
    // graphic behind the opaque product photo the first time.
    const y = product.y + product.h + PROP_GAP;
    const size = Math.max(0, Math.min(PROP_MAX_SIZE, edge - y));
    return { x: edge - size, y, w: size, h: size };
  }

  // "tall" and "stacked" both centre the product horizontally, leaving real
  // margin to its right, not a hairline. The accent rides beside it, top
  // aligned with the product's own top edge.
  const x = product.x + product.w + PROP_GAP;
  const size = Math.max(0, Math.min(PROP_MAX_SIZE, edge - x, edge - product.y));
  return { x, y: product.y, w: size, h: size };
}

/** True if two fractional boxes overlap at all. */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function within(box: Box): boolean {
  return (
    box.x >= 0 && box.y >= 0 && box.x + box.w <= 1.0001 && box.y + box.h <= 1.0001 && box.w > 0 && box.h > 0
  );
}

/** True if every edge of `box` clears the canvas edge by at least `margin`. */
export function hasMargin(box: Box, margin = MIN_MARGIN): boolean {
  return within(box) && box.x >= margin && box.y >= margin && 1 - (box.x + box.w) >= margin && 1 - (box.y + box.h) >= margin;
}

/** True if `box` does not intrude into a Story/Reel platform safe zone. */
export function clearsStorySafeZone(box: Box): boolean {
  return box.y >= STORY_SAFE_ZONE.top && box.y + box.h <= 1 - STORY_SAFE_ZONE.bottom;
}
