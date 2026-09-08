/**
 * The colour the product photograph is already sitting on.
 *
 * The brand's product photography is not cut out. Every hero image on
 * beminimalist.co is a JPEG-style RGB PNG with an opaque, flat studio backdrop
 * baked in: the niacinamide serum's is a uniform #e5e9ea on all four corners.
 * Compositing that onto the brand's warm #f6f5f2 canvas draws a hard-edged
 * cool rectangle around the bottle, which is the exact "the gradient doesn't
 * feel continuous" complaint that started the compositing rewrite, surviving
 * that rewrite because the rewrite fixed the generated backdrop and never
 * questioned the photograph's own.
 *
 * The fix follows the same reasoning the flat canvas did. Rather than tuning a
 * blend or keying the backdrop out, which would be retouching a real product
 * photograph, the canvas adopts the photograph's own ground. Two identical
 * flat colours cannot have a seam between them, by construction.
 */

/** Corners may differ by this much per channel and still count as one flat colour. */
const FLATNESS_TOLERANCE = 8;

/**
 * Below this relative luminance the ad's near-black ink stops being readable,
 * so a dark or heavily tinted backdrop is refused and the brand canvas is kept.
 * A visible seam is a worse ad; unreadable copy is a broken one.
 */
const MIN_LUMINANCE = 0.72;

/** Small enough to be cheap, large enough that scaling averages out JPEG noise. */
const SAMPLE_SIZE = 32;

export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function isFlat(corners: [number, number, number, number][]): boolean {
  if (corners.some((c) => c[3] < 250)) return false;
  for (let channel = 0; channel < 3; channel++) {
    const values = corners.map((c) => c[channel]);
    if (Math.max(...values) - Math.min(...values) > FLATNESS_TOLERANCE) return false;
  }
  return true;
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

export interface HeroGround {
  /** The backdrop colour to paint the canvas, or null to keep the brand canvas. */
  color: string | null;
  /**
   * The photograph has no transparency anywhere, so it is a rectangle.
   *
   * This is the other half of "why does the product look pasted on", and it
   * turned out to matter more than the colour did. The artboard drew a
   * `drop-shadow` under the product to lift it off the canvas, which is right
   * for a cut-out PNG: the filter follows the alpha silhouette, so the shadow
   * traces the bottle. On an opaque rectangle there is no silhouette to
   * follow, so it traces the image's four edges instead and draws a soft box
   * around the photograph. The brand's own photography already carries a real
   * studio shadow under the bottle, so the synthetic one was adding nothing
   * except the outline that made it read as a pasted rectangle.
   */
  opaque: boolean;
}

/**
 * Reads the photograph's backdrop colour and whether it is a solid rectangle.
 *
 * `color` is null when the image has no usable flat backdrop: a cut-out, a
 * gradient or scene ground, a ground too dark to keep near-black copy
 * readable, or a canvas the browser refuses to read. Null means keep the brand
 * canvas, which is always a correct answer, just occasionally a seamed one.
 *
 * The image must be same-origin or CORS-clean or the canvas is tainted and the
 * read throws. Hero photographs already come through our own image proxy for
 * exactly that reason, since a tainted canvas also breaks the PNG export.
 */
export function sampleBackdrop(img: HTMLImageElement): HeroGround {
  const opaqueUnknown: HeroGround = { color: null, opaque: false };

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return opaqueUnknown;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return opaqueUnknown;

    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const at = (x: number, y: number): [number, number, number, number] => {
      const i = (y * SAMPLE_SIZE + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };

    // Opacity is read across the whole downscale, not just the corners: a
    // photograph can be cut out around the product and still have opaque
    // corners if the transparency is only in the middle of the frame.
    let opaque = true;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        opaque = false;
        break;
      }
    }

    const last = SAMPLE_SIZE - 1;
    const corners: [number, number, number, number][] = [
      at(0, 0),
      at(last, 0),
      at(0, last),
      at(last, last),
    ];

    if (!isFlat(corners)) return { color: null, opaque };

    const avg = [0, 1, 2].map((c) => corners.reduce((sum, k) => sum + k[c], 0) / corners.length);
    if (luminance(avg[0], avg[1], avg[2]) < MIN_LUMINANCE) return { color: null, opaque };

    return { color: hex(avg[0], avg[1], avg[2]), opaque };
  } catch {
    // A tainted canvas, or a browser that will not allocate one. Not worth
    // surfacing: the brand canvas is a fine fallback and nothing is wrong.
    // `opaque` stays false so the shadow is drawn, which is the safe default:
    // a shadow on a cut-out is correct, and a missing shadow is invisible.
    return opaqueUnknown;
  }
}
