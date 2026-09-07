import { GoogleGenAI } from "@google/genai";
import { AdCopy, type ClaimTrace, type ProductFacts } from "@/lib/types";
import { buildCopyPrompt, COPY_LIMITS, COPY_SCHEMA, type Brief } from "./prompt";

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
  /** Copy fields over the 1080x1080 budget. A layout problem, not a compliance one. */
  overLength: string[];
  model: string;
}

export class CopyError extends Error {}

export async function generateCopy(
  facts: ProductFacts,
  brief: Brief = {},
  avoid: string[] = []
): Promise<CopyResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new CopyError("GEMINI_API_KEY is not set, so no copy can be generated.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = buildCopyPrompt(facts, brief, avoid);

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

      return {
        copy: parsed.data,
        ungrounded: verifyClaimTrace(facts, parsed.data),
        overLength: overLengthFields(parsed.data),
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

/** The text the scorer sees. Spans in findings are offsets into this string. */
export function adText(copy: AdCopy): string {
  return [copy.headline, copy.subhead, copy.body, copy.cta].filter(Boolean).join("\n");
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
 */
export function verifyClaimTrace(facts: ProductFacts, copy: AdCopy): ClaimTrace[] {
  const haystack = normalise(
    [
      facts.name,
      facts.rawText,
      ...facts.statedBenefits,
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

function overLengthFields(copy: AdCopy): string[] {
  return (Object.keys(COPY_LIMITS) as (keyof typeof COPY_LIMITS)[])
    .filter((k) => copy[k].length > COPY_LIMITS[k])
    .map((k) => `${k} is ${copy[k].length} characters, budget is ${COPY_LIMITS[k]}`);
}
