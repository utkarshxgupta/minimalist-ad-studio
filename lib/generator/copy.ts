import { GoogleGenAI } from "@google/genai";
import { AdCopy, type ClaimTrace, type ProductFacts } from "@/lib/types";
import { registryDigestFor } from "@/lib/standard/loader";
import { buildCopyPrompt, factsBlock, COPY_SCHEMA, type Brief, type Mode } from "./prompt";
import { canvasWordCount, fieldsFor, type CopyField, type Placement } from "./placements";

/**
 * Stage 3: write the copy.
 *
 * Temperature is not zero here, unlike the scorer. Judgment should be
 * reproducible; writing should not be, or the WARN loop would regenerate the
 * identical ad and the retry would be theatre.
 */

export const COPY_MODEL = "gemini-3.8-flash";
const TEMPERATURE = 0.85;

export interface CopyResult {
  copy: AdCopy;
  /** Trace entries that could not be verified against the facts. */
  ungrounded: ClaimTrace[];
  /** Copy fields over this placement's budget. Layout problems, not compliance ones. */
  overLength: string[];
  model: string;
}

export class CopyError extends Error {}

export async function generateCopy(
  facts: ProductFacts,
  placement: Placement,
  brief: Brief = {},
  avoid: string[] = [],
  mode: Mode = "photographic"
): Promise<CopyResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new CopyError("GEMINI_API_KEY is not set, so no copy can be generated.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = buildCopyPrompt(facts, placement, brief, avoid, mode);

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: COPY_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: COPY_SCHEMA,
          temperature: TEMPERATURE,
        },
      });

      const parsed = AdCopy.safeParse(JSON.parse(res.text ?? "{}"));
      if (!parsed.success) {
        lastError = `Response did not match the copy schema: ${parsed.error.issues[0]?.message}`;
        continue;
      }

      // A field this placement or this mode does not use is blanked rather
      // than trusted to be empty. The model is told to leave it alone; the
      // artboard should not depend on it having listened.
      const copy = clearUnusedFields(parsed.data, placement, mode);

      return {
        copy,
        ungrounded: [...verifyClaimTrace(facts, copy), ...verifyStatBadge(facts, copy)],
        overLength: overLengthFields(copy, placement),
        model: COPY_MODEL,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // Fails loudly rather than degrading to a blank ad. Same policy as the
  // scorer: a surface that silently produces nothing is indistinguishable from
  // one that produced nothing worth showing.
  throw new CopyError(`Copy generation failed after a retry. ${lastError}`);
}

const ALL_FIELDS: CopyField[] = ["headline", "subhead", "body", "cta", "footnote"];

function clearUnusedFields(copy: AdCopy, placement: Placement, mode: Mode): AdCopy {
  const used = new Set(fieldsFor(placement));
  const out = { ...copy };
  for (const f of ALL_FIELDS) if (!used.has(f)) out[f] = "";
  if (!placement.hasCaption) out.caption = "";

  // Photographic mode gets no checklist and no stat badge regardless of what
  // the model returned. The prompt already says so; this is the check, not
  // the instruction.
  if (mode !== "creative") {
    out.checklist = [];
    out.statBadge = {};
  }
  return out;
}

/**
 * The text the scorer sees, and the text a claim trace entry is checked
 * against for presence.
 *
 * The caption is included deliberately. On a Meta placement the caption is
 * where the actual argument gets made, so scoring only the canvas would check
 * the six words nobody reads closely and ignore the paragraph making the
 * claim. The checklist and stat badge are included for the same reason: they
 * are rendered on the creative, so a claim living only in a checklist bullet
 * has to be checkable exactly like a claim in the body copy.
 */
export function adText(copy: AdCopy): string {
  return [
    copy.headline,
    copy.subhead,
    copy.body,
    copy.cta,
    copy.footnote,
    copy.caption,
    ...copy.checklist,
    copy.statBadge?.value ?? "",
    copy.statBadge?.label ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Just what is rendered on the image. Used for the canvas word budget. */
export function canvasText(copy: AdCopy): string {
  return [
    copy.headline,
    copy.subhead,
    copy.body,
    copy.cta,
    ...copy.checklist,
    copy.statBadge?.value ?? "",
    copy.statBadge?.label ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/**
 * Checks both halves of every trace entry: the supporting text must exist in
 * the facts, and the claim must exist in the ad. An entry that fails either is
 * returned as ungrounded and the gate treats it as a generation warning.
 *
 * This is a real control but not a complete one, and it is worth being precise
 * about why: a model can escape it simply by leaving a claim out of the trace.
 * What closes that hole is the scorer, which runs over the finished copy with
 * the same ProductFacts attached and does not care what the generator chose to
 * declare. The trace catches the confident mistake. The scorer catches the
 * convenient omission.
 *
 * Note the two halves are checked independently, against different sources.
 * That is what lets a translated ad verify: the claim can be in Hindi while the
 * evidence it points at stays in the English product facts.
 */
export function verifyClaimTrace(facts: ProductFacts, copy: AdCopy): ClaimTrace[] {
  // The haystack is the exact block the model was shown, not a second rendering
  // of the same facts. Those diverged once: the prompt lists an active as
  // "Vitamin C: 10%" while the verifier held only "Vitamin C 10%" and "10%
  // Vitamin C", so a model quoting the facts block character for character,
  // which is precisely what it is told to do, had its trace rejected. Two clean
  // ads were pushed into an override by a disagreement between our own files.
  //
  // Building it from factsBlock makes prompt and verifier agree by construction.
  // The extra orderings stay, because ad copy legitimately inverts them.
  const haystack = normalise(
    [
      factsBlock(facts),
      ...facts.actives.flatMap((a) => [
        `${a.ingredient} ${a.concentration}`,
        `${a.concentration} ${a.ingredient}`,
      ]),
    ].join("\n")
  );

  const written = normalise(adText(copy));

  return copy.claimTrace.filter((t) => {
    const supported = t.supportedBy.trim().length > 0 && haystack.includes(normalise(t.supportedBy));
    const present = t.claim.trim().length > 0 && written.includes(normalise(t.claim));
    return !supported || !present;
  });
}

/**
 * A stat badge is the highest-visibility element on a creative-mode ad, a
 * bordered call-out that reads as verified. So it gets a stricter check than
 * an ordinary claim: grounded specifically against the studies registered for
 * THIS product, not the general facts haystack. This is the same class of
 * error C-006 was, an eye-catching number attached to the wrong product, and
 * a stat badge is exactly the shape that mistake takes on a finished ad.
 */
export function verifyStatBadge(facts: ProductFacts, copy: AdCopy): ClaimTrace[] {
  const value = copy.statBadge?.value?.trim();
  const label = copy.statBadge?.label?.trim();
  if (!value && !label) return [];

  const registry = normalise(registryDigestFor(facts.name));
  const claim = [value, label].filter(Boolean).join(" ");
  const grounded = (value ? registry.includes(normalise(value)) : true) && registry.length > 0;

  return grounded ? [] : [{ claim: `stat badge: ${claim}`, supportedBy: "" }];
}

function overLengthFields(copy: AdCopy, placement: Placement): string[] {
  const out: string[] = [];

  for (const f of fieldsFor(placement)) {
    const budget = placement.fields[f] ?? 0;
    const len = copy[f].length;
    if (len > budget) out.push(`${f} is ${len} characters, budget is ${budget}`);
  }

  const words = canvasWordCount({
    headline: copy.headline,
    subhead: copy.subhead,
    body: copy.body,
    cta: copy.cta,
  });
  if (words > placement.canvasWordLimit) {
    out.push(
      `canvas carries ${words} words, and ${placement.label} wants under ${placement.canvasWordLimit}` +
        (placement.hasCaption ? ". Move the argument into the caption." : ".")
    );
  }

  return out;
}
