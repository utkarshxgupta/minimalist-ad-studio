import type { Finding } from "@/lib/types";
import type { Rulebook } from "@/lib/standard/loader";

/**
 * Layer 2. Model judgment, for the things that cannot be deterministic: tone,
 * brand language, and whether a claim is substantiated given the product facts.
 *
 * NOT YET IMPLEMENTED. Wired as a no-op so the eval harness runs end to end on
 * the deterministic layer alone and gives us a real layer-1 baseline before any
 * model is involved. Implementing this before we have that baseline would mean
 * we could never tell which layer was carrying the score.
 *
 * When implemented: one call per dimension, run in parallel. Separate calls
 * because a single prompt doing three jobs bleeds, and because we want to tune
 * one dimension without disturbing the other two.
 */
export async function scoreModel(
  _text: string,
  _book: Rulebook,
  _factsContext?: string
): Promise<{ findings: Finding[]; model: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { findings: [], model: "skipped:no-api-key" };
  }
  return { findings: [], model: "skipped:not-implemented" };
}
