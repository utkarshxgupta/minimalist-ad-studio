import type { Dimension, Finding, ProductFacts, ScoreResult } from "@/lib/types";
import { computeVerdict, dimensionScores, scoreAd } from "@/lib/scorer";
import { generateBackground, scoreBackground, type BackgroundResult } from "./background";
import { adText, generateCopy } from "./copy";
import { getProductFacts, type FactsResult } from "./facts";
import { avoidList, chooseBest, decide, shouldRetry, type Attempt, type GateDecision } from "./gate";
import type { Brief } from "./prompt";
import {
  DEFAULT_PLACEMENT,
  placement as getPlacement,
  type Placement,
  type PlacementId,
} from "./placements";

/**
 * The generator, end to end: product URL in, gated creatives out.
 *
 * The order matters. Facts before copy, because copy that cannot cite a fact
 * must not be written. Score before render, because the gate exists to stop a
 * finished-looking creative from being handed to someone who will then argue
 * about whether to ship it. A creative that looks done is halfway to published.
 *
 * A run covers several placements, and each one is generated and scored
 * separately rather than rescaled from a master. A Story has room for about six
 * words and substantiation does not fit in six words, so the short formats are
 * where evidence gets squeezed out. Sharing copy across them would hide that.
 */

export interface GenerationOptions extends Brief {
  /** Placements to produce. Defaults to the square feed unit. */
  placements?: PlacementId[];
  /** Generated backdrop, or a flat brand surface composed in CSS. */
  background?: "generated" | "plain";
  /** Mood for the backdrop. Deny-list checked before it reaches an image model. */
  backgroundHint?: string;
}

/** One placement's worth of output: its attempt chain and its own gate decision. */
export interface PlacementRun {
  placement: Placement;
  attempts: Attempt[];
  /** Index into `attempts` of the one to show. Not always the last. */
  chosen: number;
  decision: GateDecision;
  /** The backdrop behind this placement, at this placement's aspect ratio. */
  background?: BackgroundResult;
  backgroundError?: string;
}

export interface GenerationRun {
  facts: ProductFacts;
  /** live or snapshot, with the capture date. Shown, never implied. */
  factsSource: FactsResult["source"];
  fetchedAt: string;
  factWarnings: string[];
  fallbackReason?: string;

  placements: PlacementRun[];
  /** Campaign rollup, so a marketer sees the shape of the batch at a glance. */
  summary: { total: number; free: number; override: number; blocked: number };
}

export async function generateAd(url: string, opts: GenerationOptions = {}): Promise<GenerationRun> {
  const facts = await getProductFacts(url);
  const placements = (opts.placements?.length ? opts.placements : [DEFAULT_PLACEMENT]).map(getPlacement);

  // One backdrop per distinct aspect ratio, not per placement. Two Meta units
  // that share 1:1 share an image; a Story does not borrow a square one and get
  // stretched. Image generation is the slowest and priciest call here by an
  // order of magnitude, so the dedupe is worth the bookkeeping.
  const backgrounds = new Map<string, Promise<BackgroundJob>>();
  if (opts.background === "generated") {
    for (const p of placements) {
      if (backgrounds.has(p.imageAspect)) continue;
      backgrounds.set(p.imageAspect, runBackground(facts.facts, opts.backgroundHint ?? "", p.imageAspect));
    }
  }

  const factsContext = JSON.stringify(facts.facts, null, 2);

  // Placements run in parallel. They share nothing but the facts.
  const runs = await Promise.all(
    placements.map(async (p): Promise<PlacementRun> => {
      const attempts = await generateForPlacement(facts.facts, p, opts, factsContext);
      const job = await (backgrounds.get(p.imageAspect) ?? Promise.resolve(null));

      // Image findings attach to every attempt, because the backdrop is the same
      // behind all of them. A BLOCK in the backdrop blocks the creative whatever
      // the copy says, which is the point of scoring it at all.
      const withImage = attempts.map((a) => ({
        ...a,
        score: mergeFindings(a.score, job?.findings ?? []),
      }));

      const chosen = chooseBest(withImage);

      return {
        placement: p,
        attempts: withImage,
        chosen,
        decision: decide(withImage[chosen]),
        background: job?.bg,
        backgroundError: job?.error,
      };
    })
  );

  return {
    facts: facts.facts,
    factsSource: facts.source,
    fetchedAt: facts.fetchedAt,
    factWarnings: facts.warnings,
    fallbackReason: facts.fallbackReason,
    placements: runs,
    summary: {
      total: runs.length,
      free: runs.filter((r) => r.decision.export === "free").length,
      override: runs.filter((r) => r.decision.export === "override").length,
      blocked: runs.filter((r) => r.decision.export === "blocked").length,
    },
  };
}

/** The WARN retry loop, for one placement. */
async function generateForPlacement(
  facts: ProductFacts,
  p: Placement,
  opts: GenerationOptions,
  factsContext: string
): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  let avoid: string[] = [];
  let retriesUsed = 0;

  for (;;) {
    const result = await generateCopy(facts, p, opts, avoid);
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

  return attempts;
}

interface BackgroundJob {
  bg?: BackgroundResult;
  findings: Finding[];
  error?: string;
}

async function runBackground(facts: ProductFacts, hint: string, aspect: string): Promise<BackgroundJob> {
  try {
    const bg = await generateBackground(facts, hint, aspect);
    return { bg, findings: await scoreBackground(bg) };
  } catch (err) {
    return { findings: [], error: err instanceof Error ? err.message : String(err) };
  }
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

export { adText, canvasText } from "./copy";
export type { Attempt, GateDecision } from "./gate";
export type { Placement, PlacementId } from "./placements";
