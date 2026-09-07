/**
 * Placements, and the channel split.
 *
 * The single most useful thing learned from auditing the brand's real asset
 * library: PDP listing infographics and Meta paid ads are not the same artefact
 * at different sizes. They are different formats with different jobs.
 *
 *   A PDP listing image is studied. The buyer has already clicked, they are
 *   zooming in to read chemistry and routine steps, and 40 to 90 words is
 *   normal.
 *
 *   A Meta feed ad is scrolled past. It gets a beat of attention, so the canvas
 *   carries a hook and the deep copy goes in the caption instead.
 *
 * This matters for compliance, not just design, and in a direction that is easy
 * to miss. Substantiation takes words. "93% subjects saw significant reduction
 * in active acne in 4 weeks" is eleven of the fifteen a feed ad gets. So the
 * short placements are the ones where evidence gets squeezed out, which makes
 * them the most dangerous formats the brand owns, not the most trivial.
 *
 * Hence: copy is generated per placement against that placement's budget, and
 * scored per placement. Never one creative rescaled four ways.
 */

export type Channel = "meta" | "pdp";

export type CopyField = "headline" | "subhead" | "body" | "cta" | "footnote";

export type PlacementId =
  | "meta_feed_4x5"
  | "meta_square_1x1"
  | "meta_story_9x16"
  | "pdp_listing_11x16";

export interface Placement {
  id: PlacementId;
  label: string;
  channel: Channel;
  width: number;
  height: number;
  /**
   * Character budget per field rendered on the canvas. A field absent from this
   * map is not written at all for this placement, which is how the body copy
   * disappears from a Story without the prompt having to argue about it.
   */
  fields: Partial<Record<CopyField, number>>;
  /**
   * Words permitted on the canvas, excluding the footnote.
   *
   * Provenance matters here: this is a brand and performance heuristic, NOT
   * platform policy. Meta's old 20 percent text rule was retired around 2021.
   * Exceeding this is a layout and effectiveness problem, so it is reported as
   * a note and never gates export.
   */
  canvasWordLimit: number;
  /** Meta placements write deep copy into the post caption, not onto the image. */
  hasCaption: boolean;
  /** Layout family the artboard renders. */
  layout: "split" | "stacked" | "tall";
  /**
   * Aspect ratio requested from the image model for this placement's backdrop.
   *
   * Not always the placement's own ratio: 11:16 is not a ratio image models
   * offer, so the PDP format asks for the nearest supported one and the
   * artboard covers. Generating one square backdrop and stretching it across a
   * Story is the version of this that looks obviously wrong.
   */
  imageAspect: "1:1" | "4:5" | "9:16" | "3:4";
}

export const PLACEMENTS: Record<PlacementId, Placement> = {
  meta_feed_4x5: {
    id: "meta_feed_4x5",
    label: "Meta feed 4:5",
    channel: "meta",
    width: 1080,
    height: 1350,
    fields: { headline: 52, subhead: 62, cta: 22, footnote: 96 },
    canvasWordLimit: 15,
    hasCaption: true,
    layout: "stacked",
    imageAspect: "4:5",
  },
  meta_square_1x1: {
    id: "meta_square_1x1",
    label: "Meta square 1:1",
    channel: "meta",
    width: 1080,
    height: 1080,
    fields: { headline: 52, subhead: 62, cta: 22, footnote: 96 },
    canvasWordLimit: 15,
    hasCaption: true,
    layout: "split",
    imageAspect: "1:1",
  },
  meta_story_9x16: {
    id: "meta_story_9x16",
    label: "Story / Reel 9:16",
    channel: "meta",
    width: 1080,
    height: 1920,
    fields: { headline: 42, subhead: 48, cta: 20, footnote: 96 },
    canvasWordLimit: 12,
    hasCaption: true,
    layout: "tall",
    imageAspect: "9:16",
  },
  pdp_listing_11x16: {
    id: "pdp_listing_11x16",
    label: "PDP listing 11:16",
    channel: "pdp",
    width: 1100,
    height: 1600,
    // The dominant format in the brand's own listing library, and the one place
    // long copy belongs: the buyer is zoomed in and reading.
    fields: { headline: 62, subhead: 96, body: 340, cta: 24, footnote: 110 },
    canvasWordLimit: 90,
    hasCaption: false,
    layout: "stacked",
    imageAspect: "3:4",
  },
};

export const PLACEMENT_LIST = Object.values(PLACEMENTS);

export const DEFAULT_PLACEMENT: PlacementId = "meta_square_1x1";

export function placement(id: PlacementId): Placement {
  const p = PLACEMENTS[id];
  if (!p) throw new Error(`Unknown placement: ${id}`);
  return p;
}

/** Fields this placement expects the model to write, longest budget first. */
export function fieldsFor(p: Placement): CopyField[] {
  return (Object.keys(p.fields) as CopyField[]).filter((f) => (p.fields[f] ?? 0) > 0);
}

/** Words on the canvas. The footnote is fine print and is excluded by design. */
export function canvasWordCount(parts: Partial<Record<CopyField, string>>): number {
  return (["headline", "subhead", "body", "cta"] as CopyField[])
    .map((f) => parts[f] ?? "")
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}
