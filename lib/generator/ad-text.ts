import type { AdCopy } from "@/lib/types";

/**
 * One definition of "the text of this ad", reachable from both surfaces.
 *
 * This lived inside `copy.ts` next to the generation call, which meant the
 * browser could not import it, which meant the review page kept a second
 * hand-written version of it. The two drifted exactly as you would expect:
 * the page's copy still listed five fields after creative mode added a
 * checklist, so a finding quoting a checklist bullet had nothing to highlight
 * and silently rendered as plain text. A project whose whole argument is that
 * generation and review must apply one standard cannot have two answers to
 * what the ad even says. So there is one, here, importing nothing but types.
 */

/**
 * The text the scorer sees, and the text a claim trace entry is checked
 * against for presence.
 *
 * The caption is included deliberately. On a Meta placement the caption is
 * where the actual argument gets made, so scoring only the canvas would check
 * the six words nobody reads closely and ignore the paragraph making the
 * claim. Every creative-mode element is included for the same reason: each
 * one is rendered on the finished creative, so a claim living only in a
 * checklist bullet, a mechanism sentence, or an ingredient's role has to be
 * checkable exactly like a claim in the body copy.
 */
export function adText(copy: AdCopy): string {
  return [copy.headline, copy.subhead, copy.body, copy.cta, copy.footnote, copy.caption, ...blockText(copy)]
    .filter(Boolean)
    .join("\n");
}

/** Just what is rendered on the image. Used for the canvas word budget. */
export function canvasText(copy: AdCopy): string {
  return [copy.headline, copy.subhead, copy.body, copy.cta, ...blockText(copy)].filter(Boolean).join("\n");
}

/**
 * Words on the canvas. The footnote is fine print and is excluded by design.
 *
 * Counted off `canvasText` rather than off a list of field names, which is the
 * fix for a hole this had while the list was written out by hand: it named the
 * four original fields, so every creative-mode block was ink on the image that
 * no budget counted. A live mechanism-archetype run put roughly forty words on
 * a Meta square whose limit is fifteen and reported nothing, because the four
 * fields it did count were within budget. A word limit that does not count
 * half the words on the canvas is not a limit.
 */
export function canvasWordCount(copy: AdCopy): number {
  return canvasText(copy).split(/\s+/).filter(Boolean).length;
}

/**
 * The creative-mode content blocks, flattened. Only one archetype's fields are
 * ever populated, since `copy.ts` blanks the rest, so this reads as a single
 * block in practice.
 */
function blockText(copy: AdCopy): string[] {
  return [
    ...copy.checklist,
    copy.statBadge?.value ?? "",
    copy.statBadge?.label ?? "",
    ...copy.benefitBreakdown.flatMap((b) => [b.verb, b.mechanism]),
    ...copy.ingredientSynergy.flatMap((s) => [s.ingredient, s.role]),
    ...Object.values(copy.audienceGrid ?? {}).filter((v): v is string => Boolean(v)),
  ];
}
