import type { Dimension, Finding, ProductFacts, ScoreResult } from "@/lib/types";
import { computeVerdict, dimensionScores, scoreAd } from "@/lib/scorer";
import { generateCreativeProp, scoreCreativeProp, type PropResult } from "./creative";
import { adText, generateCopy } from "./copy";
import { getProductFacts, type FactsResult } from "./facts";
import { avoidList, chooseBest, decide, shouldRetry, type Attempt, type GateDecision } from "./gate";
import type { Archetype, Brief, Mode } from "./prompt";
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
 *
 * Two modes. Photographic, the default, calls no image model at all: a flat
 * brand canvas cannot produce the colour-temperature seam a generated
 * backdrop did, because there is only one photograph in the frame. Creative is
 * opt-in and adds one generated prop graphic, shared across every placement in
 * the run, plus the checklist and stat-badge elements observed on the brand's
 * own homepage banners.
 */

export interface GenerationOptions extends Brief {
  /** Placements to produce. Defaults to the square feed unit. */
  placements?: PlacementId[];
  mode?: Mode;
  /**
   * Which creative-mode content block to write. Ignored in photographic
   * mode, which renders none of them.
   */
  archetype?: Archetype;
  /** Style direction for the creative-mode prop. Deny-list checked before it reaches an image model. */
  propHint?: string;
}

/** One placement's worth of output: its attempt chain and its own gate decision. */
export interface PlacementRun {
  placement: Placement;
  attempts: Attempt[];
  /** Index into `attempts` of the one to show. Not always the last. */
  chosen: number;
  decision: GateDecision;
}

export interface GenerationRun {
  facts: ProductFacts;
  /** live or snapshot, with the capture date. Shown, never implied. */
  factsSource: FactsResult["source"];
  fetchedAt: string;
  factWarnings: string[];
  fallbackReason?: string;

  mode: Mode;
  /** Which content block the creative-mode ads carry. Recorded, not inferred from the copy. */
  archetype: Archetype;
  /** The one generated prop, shared across every placement. Absent in photographic mode. */
  prop?: PropResult;
  propError?: string;

  placements: PlacementRun[];
  /** Campaign rollup, so a marketer sees the shape of the batch at a glance. */
  summary: { total: number; free: number; override: number; blocked: number };
}

export async function generateAd(url: string, opts: GenerationOptions = {}): Promise<GenerationRun> {
  const facts = await getProductFacts(url);
  const mode: Mode = opts.mode ?? "photographic";
  const archetype: Archetype = opts.archetype ?? "statement";
  const placements = (opts.placements?.length ? opts.placements : [DEFAULT_PLACEMENT]).map(getPlacement);

  // One prop for the whole run, not one per placement. It is a small
  // decorative graphic, not a per-aspect backdrop, so there is nothing to gain
  // from generating it more than once, and image generation is the slowest
  // and priciest call here by an order of magnitude.
  const propJob = mode === "creative" ? runCreativeProp(facts.facts, opts.propHint ?? "") : Promise.resolve(null);

  const factsContext = JSON.stringify(facts.facts, null, 2);

  // Placements run in parallel. They share nothing but the facts and the mode.
  const runs = await Promise.all(
    placements.map(async (p): Promise<PlacementRun> => {
      const attempts = await generateForPlacement(facts.facts, p, opts, factsContext, mode, archetype);
      const job = await propJob;

      // Prop findings attach to every attempt, because the prop is the same
      // behind all of them. A BLOCK on the prop blocks the creative whatever
      // the copy says, which is the point of scoring it at all.
      const withImage = attempts.map((a) => ({
        ...a,
        score: mergeFindings(a.score, job?.findings ?? []),
      }));

      const chosen = chooseBest(withImage);

      return { placement: p, attempts: withImage, chosen, decision: decide(withImage[chosen]) };
    })
  );

  const propOutcome = await propJob;

  return {
    facts: facts.facts,
    factsSource: facts.source,
    fetchedAt: facts.fetchedAt,
    factWarnings: facts.warnings,
    fallbackReason: facts.fallbackReason,
    mode,
    archetype,
    prop: propOutcome?.prop,
    propError: propOutcome?.error,
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
  factsContext: string,
  mode: Mode,
  archetype: Archetype
): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  let avoid: string[] = [];
  let retriesUsed = 0;

  for (;;) {
    const result = await generateCopy(facts, p, opts, avoid, mode, archetype);
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

interface PropJob {
  prop?: PropResult;
  findings: Finding[];
  error?: string;
}

async function runCreativeProp(facts: ProductFacts, hint: string): Promise<PropJob> {
  try {
    const prop = await generateCreativeProp(facts, hint);
    const scored = await scoreCreativeProp(prop);

    // The model was told, twice, never to draw the product. Checked anyway:
    // an instruction is not a control. If it drew one, the prop is discarded
    // outright rather than shown with a warning, because a generated product
    // container is the one thing invariant 5 exists to forbid.
    if (scored.containsProduct) {
      return {
        findings: [],
        error: "The generated prop appeared to contain a product container and was discarded.",
      };
    }

    return { prop, findings: scored.findings };
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
export { ARCHETYPES } from "./prompt";
export type { Archetype, Mode } from "./prompt";
