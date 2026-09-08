import sharp from "sharp";
import type { Box } from "./artboard-geometry";

/**
 * Did the generated frame actually leave a light, quiet area for the type?
 *
 * The scene prompt asks for one, per placement, and asking is not a control.
 * This is the control: the copy region and the wordmark corner are cropped out
 * of the returned frame and measured, and a frame that did not deliver them is
 * rejected and regenerated the same way a frame with a misspelled label is.
 *
 * Two numbers, because "readable" needs both and either one alone passes
 * things it should not.
 *
 * `luminance` is the region's mean brightness. Near-black copy needs a pale
 * ground; a calm mid-grey slab is compositionally perfect and still unreadable.
 *
 * `contrast` is the standard deviation of brightness across the region, which
 * is a decent proxy for busy. A region can average out pale while being a
 * high-contrast jumble of bright highlights and dark cracks, and type sitting
 * across that is harder to read than type on a uniform mid-tone. Averages hide
 * exactly the texture that hurts.
 *
 * Sharp does the sampling. It is already in the tree as one of Next's own
 * dependencies for image optimisation, and it is declared explicitly in
 * package.json rather than reached for through hoisting, because a transitive
 * dependency is one upgrade away from not being there.
 */

/**
 * Mean brightness the reserved area must reach, 0 to 255.
 *
 * Near-black type on this is comfortable. Set from the brand's own canvas
 * tokens, which sit around 244 to 247: a region this bright or brighter is
 * indistinguishable in practice from the flat ground photographic mode uses.
 */
export const MIN_COPY_LUMINANCE = 175;

/**
 * Maximum brightness spread across the reserved area.
 *
 * A pale region that swings wildly is a texture, not a surface. This is
 * deliberately loose: soft gradients and gentle vignetting are normal in
 * product photography and read fine under type.
 */
export const MAX_COPY_CONTRAST = 52;

export interface RegionTone {
  /** Mean brightness, 0 to 255. */
  luminance: number;
  /** Standard deviation of brightness across the region. */
  contrast: number;
}

export interface SceneToneReport {
  copy: RegionTone;
  wordmark: RegionTone;
  /** Every measured region is pale enough and quiet enough to take near-black type. */
  ok: boolean;
  /** Which regions failed and why, for the marketer rather than for a log. */
  problems: string[];
}

/** The wordmark's corner, as a fraction of the canvas. Matches the artboard's padding. */
const WORDMARK_REGION: Box = { x: 0.02, y: 0.02, w: 0.34, h: 0.1 };

function verdict(name: string, tone: RegionTone): string | null {
  if (tone.luminance < MIN_COPY_LUMINANCE) {
    return `the ${name} area came back too dark for near-black type (brightness ${Math.round(tone.luminance)}, needs ${MIN_COPY_LUMINANCE})`;
  }
  if (tone.contrast > MAX_COPY_CONTRAST) {
    return `the ${name} area came back too busy to read type over (contrast ${Math.round(tone.contrast)}, allows ${MAX_COPY_CONTRAST})`;
  }
  return null;
}

/** Clamps a fractional box to real pixels inside the image, never zero-sized. */
function toPixels(box: Box, width: number, height: number) {
  const left = Math.max(0, Math.min(width - 1, Math.round(box.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(box.y * height)));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(box.w * width))),
    height: Math.max(1, Math.min(height - top, Math.round(box.h * height))),
  };
}

async function measure(image: Buffer, box: Box, width: number, height: number): Promise<RegionTone> {
  // The crop is rendered to its own buffer before being measured, and that is
  // not a stylistic step. Sharp's `stats()` reads the image it was constructed
  // with and ignores operations queued ahead of it, so
  // `sharp(image).extract(box).stats()` silently returns statistics for the
  // whole frame. The first version did exactly that, and it was caught only
  // because the copy region and the wordmark corner came back with identical
  // numbers to the decimal, which two different crops of a photograph never
  // do. It would otherwise have looked like a working check while measuring
  // the wrong thing entirely.
  //
  // Greyscale first, so brightness is one channel rather than three averaged
  // by hand, and the standard deviation means what it says.
  const crop = await sharp(image).extract(toPixels(box, width, height)).greyscale().toBuffer();
  const channel = (await sharp(crop).stats()).channels[0];
  return { luminance: channel.mean, contrast: channel.stdev };
}

/**
 * Measures the regions the type lands on. Returns null when the frame cannot be
 * read at all, which is not treated as a failed frame: an unreadable buffer is
 * a bug here, not evidence about the image, and rejecting the scene for it
 * would blame the model for our own broken measurement.
 */
export async function readSceneTone(
  data: string,
  mimeType: string,
  copyRegion: Box
): Promise<SceneToneReport | null> {
  try {
    const image = Buffer.from(data, "base64");
    const meta = await sharp(image).metadata();
    if (!meta.width || !meta.height) return null;

    const copy = await measure(image, copyRegion, meta.width, meta.height);
    const wordmark = await measure(image, WORDMARK_REGION, meta.width, meta.height);

    const problems = [verdict("copy", copy), verdict("wordmark", wordmark)].filter(
      (p): p is string => p !== null
    );

    return { copy, wordmark, ok: problems.length === 0, problems };
  } catch {
    return null;
  }
}
