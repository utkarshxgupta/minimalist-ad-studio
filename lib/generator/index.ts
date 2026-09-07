import type { Dimension, Finding, ProductFacts, ScoreResult } from "@/lib/types";
import { computeVerdict, dimensionScores, scoreAd } from "@/lib/scorer";
import { generateBackground, scoreBackground, type BackgroundResult } from "./background";
import { adText, generateCopy } from "./copy";
import { getProductFacts, type FactsResult } from "./facts";
import { avoidList, chooseBest, decide, shouldRetry, type Attempt, type GateDecision } from "./gate";
import type { Brief } from "./prompt";

/**
 * The generator, end to end: product URL in, gated creative out.
 *
 * The order matters. Facts before copy, because copy that cannot cite a fact
 * must not be written. Score before render, because the gate exists to stop a
 * finished-looking creative from being handed to someone who will then argue
 * about whether to ship it. A creative that looks done is halfway to published.
 */

export interface GenerationOptions extends Brief {
  /** Generated backdrop, or a flat brand surface composed in CSS. */
  background?: "generated" | "plain";
  /** Mood for the backdrop. Deny-list checked before it reaches an image model. */
  backgroundHint?: string;
}

export interface GenerationRun {
  facts: ProductFacts;
  /** live or snapshot, with the capture date. Shown, never implied. */
  factsSource: FactsResult["source"];
  fetchedAt: string;
  factWarnings: string[];
  fallbackReason?: string;

  /** Every attempt, in order. The chain is the audit trail, so it is never trimmed. */
  attempts: Attempt[];
  /** Index into `attempts` of the one to show. Not always the last. */
  chosen: number;
  decision: GateDecision;

  background?: BackgroundResult;
  backgroundError?: string;
}

export async function generateAd(url: string, opts: GenerationOptions = {}): Promise<GenerationRun> {
  const facts = await getProductFacts(url);

  // The background is independent of the copy, so it runs alongside the first
  // attempt rather than after it. Image generation is the slowest thing here by
  // an order of magnitude.
  const backgroundJob =
    opts.background === "generated"
      ? generateBackground(facts.facts, opts.backgroundHint ?? "").then(
          async (bg) => ({ bg, findings: await scoreBackground(bg) }),
          (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })
        )
      : Promise.resolve(null);

  const factsContext = JSON.stringify(facts.facts, null, 2);
  const attempts: Attempt[] = [];
  let avoid: string[] = [];
  let retriesUsed = 0;

  for (;;) {
    const result = await generateCopy(facts.facts, opts, avoid);
    const score = await scoreAd(adText(result.copy), { factsContext });

    const attempt: Attempt = {
      index: attempts.length,
      copy: result.copy,
      score,
      ungrounded: result.ungrounded,
      overLength: result.overLength,
    };
    attempts.push(attempt);

    if (!shouldRetry(attempt, retriesUsed)) break;
    retriesUsed++;
    avoid = avoidList(attempt);
  }

  const backgroundOutcome = await backgroundJob;
  const background = backgroundOutcome && "bg" in backgroundOutcome ? backgroundOutcome.bg : undefined;
  const backgroundError =
    backgroundOutcome && "error" in backgroundOutcome ? backgroundOutcome.error : undefined;
  const imageFindings =
    backgroundOutcome && "findings" in backgroundOutcome ? backgroundOutcome.findings : [];

  // Image findings attach to every attempt, because the backdrop is the same
  // behind all of them. A BLOCK in the backdrop blocks the creative whatever
  // the copy says, which is the point of scoring it at all.
  const withImage = attempts.map((a) => ({ ...a, score: mergeFindings(a.score, imageFindings) }));

  const chosen = chooseBest(withImage);

  return {
    facts: facts.facts,
    factsSource: facts.source,
    fetchedAt: facts.fetchedAt,
    factWarnings: facts.warnings,
    fallbackReason: facts.fallbackReason,
    attempts: withImage,
    chosen,
    decision: decide(withImage[chosen]),
    background,
    backgroundError,
  };
}

/**
 * Recomputes the verdict over text plus image findings, using the scorer's own
 * functions rather than a second copy of the rules. The verdict must come from
 * one place or the two surfaces disagree, which is the exact problem this
 * project exists to fix.
 */
function mergeFindings(score: ScoreResult, imageFindings: Finding[]): ScoreResult {
  if (imageFindings.length === 0) return score;

  const findings = [...score.findings, ...imageFindings];
  const failed = score.meta.dimensionsFailed as Dimension[];

  return {
    ...score,
    findings,
    verdict: failed.includes("policy") ? "BLOCK" : computeVerdict(findings),
    dimensionScores: dimensionScores(findings),
  };
}

export { adText } from "./copy";
export type { Attempt, GateDecision } from "./gate";
