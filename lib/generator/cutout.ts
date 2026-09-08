/**
 * Removing the studio backdrop from a packshot, so the product is not a
 * rectangle sitting on the ad.
 *
 * Matching the canvas to the photograph's backdrop was the previous answer and
 * it was the weaker one. It only works while the two colours agree exactly:
 * one export captured a frame early, the canvas painted as the brand fallback
 * while the photo carried its own grey, and the rectangle was back. It also
 * cannot survive a photograph whose backdrop is a soft gradient rather than a
 * flat tone, and it forces every ad's ground to be whatever colour the
 * photographer's sweep happened to be.
 *
 * This removes the backdrop instead of matching it, which makes the whole
 * class of problem go away: with nothing behind the product there is no edge
 * to mismatch, and the canvas is free to be any brand colour or gradient.
 *
 * ## The method, and why not alpha keying
 *
 * The obvious approach is an alpha matte: work out how far each pixel is from
 * the backdrop and use that as opacity. It breaks on this photography. The
 * label is brighter than the backdrop, so a luminance-keyed alpha computes
 * negative and clamps to zero, and the product's own label goes transparent.
 *
 * So the image is divided by its backdrop instead, and composited with
 * `multiply`:
 *
 *   normalised = pixel x 255 / backdrop
 *
 * The backdrop maps to pure white, and white under `multiply` is the identity,
 * so it disappears onto any light canvas without leaving an edge. The bottle
 * is far darker than the backdrop and survives essentially untouched. The cast
 * shadow, which is the part a hard cut-out throws away, maps to a light grey
 * and multiplies down onto whatever the canvas is, which is exactly what a
 * real shadow does to a real surface. Anything brighter than the backdrop
 * clips to white and takes the canvas tone, which is why this is only used on
 * a light, near-neutral canvas: on a saturated ground the label would tint.
 *
 * This is a compositing operation on the studio sweep, not a retouch of the
 * product. The pack, the label and the printed concentration are the same
 * pixels, scaled. Invariant 5 is about never generating the product, and
 * nothing here generates anything.
 */

/** Backdrops darker than this are not sweeps, and dividing by them blows up. */
const MIN_BACKDROP = 140;

/** Longest edge of the divided image, in pixels. See the note on ENCODING. */
const MAX_EDGE = 640;

/**
 * WebP at a modest size, rather than a full-resolution PNG.
 *
 * The result rides on the img's `src` as a data URL and the PNG export inlines
 * that string into an SVG, so its size is not free: a 1000px PNG of this
 * packshot came to 465 KB, against 19 KB here, which is smaller than the
 * original photograph the proxy serves. The product box is never rendered
 * larger than about 800 pixels on any placement, so most of that was bytes
 * nobody could see.
 *
 * Quality is set high because the result is composited with `multiply`. The
 * divided sweep is a flat white field that compresses to nothing, but ringing
 * around the bottle's dark edge would multiply onto the canvas as a visible
 * fringe.
 *
 * What this is NOT is a fix for slow exports. Export timings measured in dev
 * ranged from 17 seconds with no image at all to 40 and then 88 seconds with
 * progressively smaller images, which is noise rather than signal: the cost is
 * somewhere in rasterising the artboard through an SVG foreignObject, and it
 * was slow before any of this existed. Fixing it properly means rendering
 * server-side in headless Chrome rather than in the page, which is a change
 * this file has no business pretending to have made.
 *
 * A browser that cannot encode WebP returns a PNG data URL from `toDataURL`
 * instead of failing, which is a larger string and a correct image.
 */
const ENCODING = { type: "image/webp", quality: 0.94 } as const;

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Divides one channel by its backdrop value, so the backdrop becomes white.
 *
 * Exported for the tests: this single line is the whole idea, and it is worth
 * being able to assert that a backdrop pixel lands on 255 and a dark pixel
 * stays dark.
 */
export function normaliseChannel(value: number, backdrop: number): number {
  if (backdrop < MIN_BACKDROP) return value;
  return Math.min(255, Math.round((value * 255) / backdrop));
}

/**
 * Returns a data URL of the photograph with its backdrop divided out, ready to
 * be composited with `mix-blend-mode: multiply`, or null when that cannot be
 * done: no usable backdrop colour, a backdrop too dark to divide by, or a
 * canvas the browser will not let us read. Null means fall back to drawing the
 * photograph as-is, which is what happened before this existed.
 */
export function backdropDividedDataUrl(img: HTMLImageElement, backdropHex: string): string | null {
  const backdrop = parseHex(backdropHex);
  if (!backdrop) return null;
  if (backdrop.some((c) => c < MIN_BACKDROP)) return null;

  const sourceW = img.naturalWidth;
  const sourceH = img.naturalHeight;
  if (!sourceW || !sourceH) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceW, sourceH));
  const w = Math.max(1, Math.round(sourceW * scale));
  const h = Math.max(1, Math.round(sourceH * scale));

  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;

    for (let i = 0; i < d.length; i += 4) {
      d[i] = normaliseChannel(d[i], backdrop[0]);
      d[i + 1] = normaliseChannel(d[i + 1], backdrop[1]);
      d[i + 2] = normaliseChannel(d[i + 2], backdrop[2]);
    }

    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL(ENCODING.type, ENCODING.quality);
  } catch {
    // Tainted canvas, or a browser that will not allocate one. The photograph
    // still renders, just with its backdrop showing, which is the old
    // behaviour and not a failure worth interrupting anyone about.
    return null;
  }
}
