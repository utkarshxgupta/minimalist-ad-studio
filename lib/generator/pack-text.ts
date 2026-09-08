import type { ProductFacts } from "@/lib/types";

/**
 * Did the image model corrupt the words printed on a real product's label?
 *
 * This exists because asking a model "does this label look garbled" was tried
 * first and was not enough. The very first creative-mode frame came back with
 * "acetyi glucosamine" printed on the pack where the real product says acetyl
 * glucosamine, and the image scorer, which had been asked in as many words
 * whether any pack text looked invented or misspelled, said no. It is a single
 * character on a small line of six-point type in a photograph, which is
 * exactly the kind of thing a vision model glosses and a reader's eye slides
 * over, and exactly the kind of thing that makes an ad a false statement about
 * a product on a shelf.
 *
 * So the model is asked to do the thing models are good at, transcribe what it
 * sees, and the judgment is made here in code, deterministically, against the
 * product's own page text.
 *
 * The rule is narrow on purpose: a word on the pack that is NOT in the
 * product's own vocabulary but is one edit away from a word that IS, is
 * almost certainly a corruption of it. That catches acetyi for acetyl and
 * niacinamlde for niacinamide, and it does not fire on words the page simply
 * never happened to use, because those are not near-misses of anything.
 */

/** Levenshtein, bounded: anything past `max` is not interesting, so stop early. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Words that appear on cosmetic packaging generally rather than on this
 * product's page specifically. Without these, "serum" or "types" would be
 * flagged on any product whose page prose never used the word, which is a
 * false positive, and false positives are what get a tool abandoned.
 */
const PACKAGING_VOCABULARY = [
  "face", "serum", "cream", "gel", "lotion", "oil", "sunscreen", "cleanser", "moisturizer",
  "with", "and", "for", "all", "skin", "types", "type", "type", "use", "net", "vol",
  "fl", "oz", "ml", "gm", "mfg", "exp", "batch", "made", "india", "manufactured",
  "minimalist", "beminimalist", "com", "www",
];

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 0);
}

/**
 * Every word this product's own page uses, plus general packaging words.
 *
 * Built from rawText rather than from the curated fields, deliberately. The
 * label carries ingredient names and volumes the structured extraction never
 * pulls out, and a check that flagged all of those would be useless. The page
 * is the widest honest source of "words that legitimately belong to this
 * product".
 */
export function packVocabulary(facts: ProductFacts): Set<string> {
  const sources = [
    facts.name,
    facts.rawText,
    ...facts.actives.flatMap((a) => [a.ingredient, a.concentration]),
    ...facts.statedBenefits,
    ...facts.trustBadges,
    ...facts.ingredientNotes.flatMap((n) => [n.ingredient, n.note]),
    ...PACKAGING_VOCABULARY,
  ];
  return new Set(sources.flatMap(tokenise));
}

export interface PackTextProblem {
  /** The word as it was rendered onto the pack. */
  rendered: string;
  /** The word from the product's own page that it is one edit away from. */
  probably: string;
}

/**
 * Words rendered onto the pack that are near-misses of the product's real
 * vocabulary.
 *
 * Short tokens are skipped: at four characters or fewer, an edit distance of
 * one is a different word rather than a typo, and "for" against "fog" is not
 * evidence of anything.
 */
export function findCorruptedPackText(packText: string[], facts: ProductFacts): PackTextProblem[] {
  const vocabulary = packVocabulary(facts);
  const known = [...vocabulary].filter((w) => w.length > 4);
  const problems: PackTextProblem[] = [];
  const seen = new Set<string>();

  for (const token of packText.flatMap(tokenise)) {
    if (token.length <= 4 || vocabulary.has(token) || seen.has(token)) continue;

    // Nearest first, so the reported suggestion is the most plausible one
    // rather than whichever candidate happened to be enumerated first.
    let best: { word: string; distance: number } | null = null;
    for (const candidate of known) {
      const d = editDistance(token, candidate, 1);
      if (d <= 1 && (!best || d < best.distance)) best = { word: candidate, distance: d };
      if (best?.distance === 0) break;
    }

    if (best) {
      seen.add(token);
      problems.push({ rendered: token, probably: best.word });
    }
  }

  return problems;
}
