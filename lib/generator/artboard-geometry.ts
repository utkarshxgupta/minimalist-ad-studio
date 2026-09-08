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
        // Bottom-aligned, so short copy sits against the product instead of
        // hanging from the top of its box. A Story headline can be three words
        // or three lines; top-aligning it meant the shortest ones left a hole
        // in the middle of the frame, which is the "vacant center block" the
        // creative audit named and which survived the first attempt at fixing
        // it. Anchoring copy to the product puts the slack above the headline,
        // where it reads as breathing room under the wordmark.
        align: "end",
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


/**
 * How far past the copy the scrim keeps fading, as a fraction of the canvas.
 *
 * The scrim has to be at full strength everywhere the copy sits and reach zero
 * before the product, and it needs room in between or the falloff reads as a
 * hard-edged panel pasted over the photograph. Which is what the first version
 * of this produced on a Story: it stopped dead at its box edge while still at
 * 0.94, cutting a straight line across the middle of the frame.
 *
 * Kept tight rather than generous, because on a tall frame the copy ends at
 * 0.38 and the generated scene puts its product not far below; a longer fade
 * washes out the top of the product it is meant to stop short of.
 */
export const SCRIM_FADE = 0.12;

/**
 * Opacity the scrim holds across the copy region when nothing is known about
 * what is underneath it.
 *
 * Strong, because it has to cover the worst frame the image model might return.
 */
export const SCRIM_STRENGTH = 0.92;

/**
 * How pale and quiet a measured frame has to be before the scrim eases off.
 *
 * Comfortably above the threshold a frame must clear to be accepted at all:
 * this is not "readable", it is "readable with room to spare", which is the
 * bar for showing more of the photograph.
 */
/*
 * Calibrated against measured frames rather than picked: the first values here
 * were guessed at 210 and 30, and both real generated frames measured below
 * 210, so the light-touch tier would never once have fired. A threshold no
 * observation can reach is not a conservative default, it is dead code that
 * looks like a policy.
 *
 * Evidence is thin and worth saying so: two frames. A pale concrete ledge
 * measured 206 brightness at 12 spread, a textured warm stone 185 at 34. The
 * first should keep its photograph, the second needs help, and these sit
 * between them. Recalibrate when there are twenty frames rather than two.
 */
const SCRIM_RELAXED_LUMINANCE = 200;
const SCRIM_RELAXED_CONTRAST = 20;

/** Scrim opacity when the frame measured clean. Enough to lift type off texture, not enough to flatten the scene. */
export const SCRIM_STRENGTH_RELAXED = 0.4;

/** Scrim opacity when the frame is measurably light but not pristine. */
export const SCRIM_STRENGTH_MEASURED = 0.68;

/**
 * The scrim only needs to be as strong as the frame under it is difficult.
 *
 * Before the generated frame's copy area was measured, this could not be
 * known, so the scrim was sized for the worst case on every ad and washed out
 * the scene on all of them, including the ones that had handed us a pale quiet
 * surface exactly as asked. With a measurement in hand the common case gets a
 * light touch and the photograph survives.
 *
 * Absent a measurement it returns the strong default. An unmeasured frame is
 * not a good frame, it is an unknown one.
 */
export function scrimStrengthFor(tone?: { copyLuminance: number; copyContrast: number }): number {
  if (!tone) return SCRIM_STRENGTH;
  if (tone.copyLuminance >= SCRIM_RELAXED_LUMINANCE && tone.copyContrast <= SCRIM_RELAXED_CONTRAST) {
    return SCRIM_STRENGTH_RELAXED;
  }
  return SCRIM_STRENGTH_MEASURED;
}

export interface Scrim {
  box: Box;
  /** CSS gradient angle, pointing from the opaque end toward the transparent end. */
  angle: number;
  /** Fraction along that axis where the copy ends. Opacity holds until here, then falls to zero. */
  hold: number;
}

/**
 * The legibility scrim for a creative-mode frame, anchored to where the copy
 * actually is.
 *
 * The first version pinned the gradient's opaque end to the scrim box's own
 * edge and let it fade across the box. On the split layout the copy sits at
 * the opaque end and that happened to work, which is why it looked fine on the
 * one composite it was checked against. On the stacked layouts the copy sits
 * at the far end, so the headline landed on 0.25 opacity and the wordmark on
 * nothing at all: the fade ran across the text instead of past it. Measured,
 * not guessed, and it is why type over a generated frame was unreadable.
 *
 * `hold` is what fixes it. Opacity is held flat from the opaque edge all the
 * way to the copy's far edge, and only then falls away, so no part of the copy
 * can sit in the falloff regardless of which end of the canvas it is on.
 */
export function scrimFor(geo: Geometry, layout: Placement["layout"]): Scrim {
  const copy = geo.copy;

  if (layout === "split") {
    // Copy on the left, product on the right: opaque at the left edge.
    const box: Box = { x: 0, y: 0, w: Math.min(1, copy.x + copy.w + SCRIM_FADE), h: 1 };
    return { box, angle: 90, hold: (copy.x + copy.w) / box.w };
  }

  if (layout === "tall") {
    // Copy above the product: opaque at the top edge.
    const box: Box = { x: 0, y: 0, w: 1, h: Math.min(1, copy.y + copy.h + SCRIM_FADE) };
    return { box, angle: 180, hold: (copy.y + copy.h) / box.h };
  }

  // Stacked: product above, copy below, so the scrim is opaque at the bottom.
  const top = Math.max(0, copy.y - SCRIM_FADE);
  const box: Box = { x: 0, y: top, w: 1, h: 1 - top };
  return { box, angle: 0, hold: (1 - copy.y) / box.h };
}

/**
 * True when the scrim leaves the top of the canvas bare, so the wordmark needs
 * a band of its own.
 *
 * Only the stacked layouts do: their scrim starts below the product, and the
 * wordmark sits in the top corner over whatever the generated scene put there.
 */
export function needsWordmarkBand(scrim: Scrim): boolean {
  return scrim.box.y > 0;
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
