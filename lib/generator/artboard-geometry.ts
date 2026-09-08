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
export const MIN_MARGIN = 0.08;

/**
 * The product box never exceeds this fraction of canvas height.
 *
 * From the creative audit: "lock container scaling so product cutouts never
 * exceed 65% of canvas height, maintaining a minimum 120px padding from canvas
 * edges", benchmarked against the brand's own production creatives. The split
 * layout ran the product to 82 percent, which is why that composition read as
 * a packshot with words next to it rather than an ad: at that size the product
 * is the frame, and the copy is a caption on it.
 *
 * 120px on a 1080 canvas is 11 percent. MIN_MARGIN is set to 8 rather than
 * that, because the audit's figure is one house style's and a margin large
 * enough to be safe on every layout starts costing the copy column real room.
 * The cap on height is the load-bearing half.
 */
export const MAX_PRODUCT_HEIGHT = 0.65;

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
        product: { x: 0.54, y: 0.18, w: 0.38, h: 0.64 },
        copy: { x: 0.08, y: 0, w: 0.42, h: 1 },
        align: "center",
      };
    case "tall":
      // Sized to clear both Story safe zones, not just fit the canvas.
      // Regression: an earlier layout ran the product box to y=0.86, into the
      // zone Instagram overlays with its own caption and reply-bar UI.
      //
      // Then, having moved the product out of that zone, the first version of
      // this left a band of empty canvas between the copy and the product:
      // "all copy squeezed into the top third, leaving a vacant center block",
      // exactly as the creative audit described it. Clearing a safe zone is
      // not the same as composing the space that clearing it created. The
      // product now starts where the copy stops and takes the room back.
      return {
        product: { x: 0.13, y: 0.40, w: 0.74, h: 0.36 },
        copy: { x: 0.08, y: 0.14, w: 0.84, h: 0.24 },
        align: "start",
      };
    case "stacked":
    default:
      return {
        product: { x: 0.24, y: 0.08, w: 0.52, h: 0.40 },
        copy: { x: 0.08, y: 0.52, w: 0.84, h: 0.42 },
        align: "start",
      };
  }
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

/**
 * True if every edge of `box` clears the canvas edge by at least `margin`.
 *
 * The epsilon is not slack in the rule, it is float arithmetic: a box at
 * x=0.54 with w=0.38 leaves exactly the 0.08 margin it was written to leave,
 * and `1 - (0.54 + 0.38)` evaluates to 0.0799999999999999. `within` already
 * carries the same tolerance for the same reason.
 */
const EPSILON = 1e-9;

export function hasMargin(box: Box, margin = MIN_MARGIN): boolean {
  return (
    within(box) &&
    box.x >= margin - EPSILON &&
    box.y >= margin - EPSILON &&
    1 - (box.x + box.w) >= margin - EPSILON &&
    1 - (box.y + box.h) >= margin - EPSILON
  );
}

/** True if `box` does not intrude into a Story/Reel platform safe zone. */
export function clearsStorySafeZone(box: Box): boolean {
  return box.y >= STORY_SAFE_ZONE.top && box.y + box.h <= 1 - STORY_SAFE_ZONE.bottom;
}
