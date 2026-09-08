/**
 * The creative-mode content blocks.
 *
 * Scoped from the brand's own homepage banners rather than invented. Every
 * banner observed on beminimalist.co is the same template (wordmark, headline,
 * one content block, CTA, product photo) with a different block in the middle,
 * so "archetype" here means which block, not a different canvas design. That
 * is why they all render through one `Artboard` and share one set of layout
 * tests: four templates would be four things to keep compliant.
 *
 * This module holds data and nothing else, deliberately. `prompt.ts` is where
 * the archetypes turn into instructions, and it reads `standard/` off disk, so
 * the browser cannot import it. The generator form needs the list to build its
 * selector, so the list lives here where both sides can reach it.
 */

export type Archetype = "statement" | "mechanism" | "synergy" | "audience";

export interface ArchetypeSpec {
  id: Archetype;
  label: string;
  /** Shown under the selector. What the marketer is choosing, and what grounds it. */
  note: string;
  /**
   * This block puts a lot of words on the canvas no matter how tightly the
   * headline is written, so it does not fit a short-format word budget.
   *
   * Not a guess: the audience grid is verbatim page text, and a live run of it
   * against a Meta square put 53 words on a canvas whose limit is 15. The
   * generator reports that afterwards as a layout note, correctly, but a note
   * that fires on every single run of an archetype is a note people learn to
   * scroll past. Saying it before the call is cheaper and more honest than
   * exempting the block from the budget, which is the hole this project just
   * finished closing.
   */
  canvasHeavy?: true;
}

export const ARCHETYPES: ArchetypeSpec[] = [
  {
    id: "statement",
    label: "Statement (checklist + stat badge)",
    note:
      "A benefit checklist, plus a stat badge when the study registry holds a figure for this exact " +
      "product. No figure on file means no badge, never a rounded guess.",
  },
  {
    id: "mechanism",
    label: "Mechanism of action",
    note:
      "A bold action verb with the mechanism under it, up to three. Reads as an explanation rather " +
      "than an assertion, which is what a strong claim needs in order to be defensible.",
  },
  {
    id: "synergy",
    label: "Ingredient synergy",
    note:
      "Each named ingredient and what it does, checked against the product page's own per-ingredient " +
      "text. An ingredient the page does not describe cannot appear here at all.",
  },
  {
    id: "audience",
    label: "Audience qualification",
    note:
      "Who it is for and how to use it, as a bordered grid. Not written by the model: the values are " +
      "copied verbatim from the page's own labelled fields, because they already are exact.",
    canvasHeavy: true,
  },
];

export const DEFAULT_ARCHETYPE: Archetype = "statement";

export function isArchetype(value: string): value is Archetype {
  return ARCHETYPES.some((a) => a.id === value);
}

/**
 * The placements this archetype's block will not fit on, by word budget.
 *
 * Advisory, not a block. A marketer who wants the qualification grid on a feed
 * square can still have it; they should just know before the call rather than
 * after it that it will come back flagged as over-length.
 */
export function tooWordyFor(archetype: Archetype, canvasWordLimit: number): boolean {
  const spec = ARCHETYPES.find((a) => a.id === archetype);
  return Boolean(spec?.canvasHeavy) && canvasWordLimit < 40;
}
