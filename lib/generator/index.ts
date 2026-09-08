import type { Dimension, Finding, ProductFacts, ScoreResult } from "@/lib/types";
import { computeVerdict, dimensionScores, scoreAd } from "@/lib/scorer";
import { generateCreativeScene, scoreCreativeScene, type SceneResult } from "./creative";
import { findCorruptedPackText } from "./pack-text";
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
 * Two modes. Photographic, the default, calls no image model for the picture
 * at all: it composites the real packshot onto a canvas taken from the
 * photograph's own ground and typesets over it. Creative is opt-in and sends
 * the real product photo to an image model, which returns a finished
 * art-directed frame with the product inside a scene; the copy is still
 * typeset over it in CSS, so every word is still scored.
 *
 * A creative-mode frame is generated per placement rather than once per run.
 * A composition built for a square puts the product in one half and the calm
 * space in the other, and rescaling that into a story crops one or the other.
 * Same reasoning as the channel split, applied to the picture.
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
  /** Art direction for the creative-mode frame. Deny-list checked before it reaches an image model. */
  propHint?: string;
}

/** One placement's worth of output: its attempt chain, its frame, and its own gate decision. */
export interface PlacementRun {
  placement: Placement;
  attempts: Attempt[];
  /** Index into `attempts` of the one to show. Not always the last. */
  chosen: number;
  decision: GateDecision;
  /** The generated frame this placement's copy is typeset over. Absent in photographic mode. */
  scene?: SceneResult;
  /** Why there is no frame, when creative mode was asked for and could not deliver one. */
  sceneError?: string;
  /** How many frames were generated for this placement. More than one means frames were rejected. */
  sceneAttempts?: number;
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
  placements: PlacementRun[];
  /** Campaign rollup, so a marketer sees the shape of the batch at a glance. */
  summary: { total: number; free: number; override: number; blocked: number };
}

export async function generateAd(url: string, opts: GenerationOptions = {}): Promise<GenerationRun> {
  const facts = await getProductFacts(url);
  const mode: Mode = opts.mode ?? "photographic";
  const archetype: Archetype = opts.archetype ?? "statement";
  const placements = (opts.placements?.length ? opts.placements : [DEFAULT_PLACEMENT]).map(getPlacement);

  const factsContext = JSON.stringify(facts.facts, null, 2);

  // Placements run in parallel, and within each one the copy and the frame run
  // in parallel too: they do not depend on each other, and image generation is
  // the slowest and priciest call here by an order of magnitude.
  const runs = await Promise.all(
    placements.map(async (p): Promise<PlacementRun> => {
      const [attempts, frame] = await Promise.all([
        generateForPlacement(facts.facts, p, opts, factsContext, mode, archetype),
        mode === "creative" ? runCreativeScene(facts.facts, p, opts.propHint ?? "") : Promise.resolve(null),
      ]);

      // Frame findings attach to every attempt, because the same frame sits
      // behind all of them. A BLOCK on the frame blocks the creative whatever
      // the copy says, which is the point of scoring the picture at all.
      //
      // `packIsGenerated` rides along so the gate can refuse to let a
      // model-rendered pack export without a human. That is the price of the
      // invariant 5 exception, and it is charged here rather than left to a
      // reviewer to remember.
      const withImage = attempts.map((a) => ({
        ...a,
        score: mergeFindings(a.score, frame?.findings ?? []),
        packIsGenerated: Boolean(frame?.scene),
      }));

      const chosen = chooseBest(withImage);

      return {
        placement: p,
        attempts: withImage,
        chosen,
        decision: decide(withImage[chosen]),
        scene: frame?.scene,
        sceneError: frame?.error,
        sceneAttempts: frame?.attempts,
      };
    })
  );

  return {
    facts: facts.facts,
    factsSource: facts.source,
    fetchedAt: facts.fetchedAt,
    factWarnings: facts.warnings,
    fallbackReason: facts.fallbackReason,
    mode,
    archetype,
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

interface SceneJob {
  scene?: SceneResult;
  findings: Finding[];
  error?: string;
  /** Frames generated before one passed, or the cap. Surfaced, not hidden. */
  attempts: number;
}

/**
 * How many frames to generate before giving up on a placement.
 *
 * The label check is reliable and image models are not: on the first two live
 * runs of this mode, both frames rendered a real ingredient name wrong, once
 * as "acetyi glucosamine" and once as "mgtmarine". Rendering small print is
 * simply where these models are weak, and rejecting a frame is worthless to a
 * marketer if it just means the mode quietly produces nothing.
 *
 * So the rejection is looped, and capped, for the same reason the WARN loop is
 * capped: a retry that has not worked twice is not going to work by being run
 * ten more times, and each one is the priciest call in this pipeline.
 *
 * Note what is NOT looped. A frame rejected on a policy rule is not retried,
 * exactly as a BLOCK on copy is not retried. Regenerating until the scorer
 * stops objecting to a lab-coat scene is Goodharting the scorer; a mangled
 * label is a rendering defect, and rerolling a rendering defect is just a
 * retry.
 */
const MAX_SCENE_ATTEMPTS = 3;

async function runCreativeScene(facts: ProductFacts, p: Placement, hint: string): Promise<SceneJob> {
  let lastError = "";

  for (let attempt = 0; attempt < MAX_SCENE_ATTEMPTS; attempt++) {
    try {
      const scene = await generateCreativeScene(facts, p, hint);
      const scored = await scoreCreativeScene(scene);

      // A frame is discarded outright rather than shown with a warning. A
      // reviewer skimming a thumbnail will catch a lab coat; nobody reliably
      // catches a label whose concentration drifted by one character, and that
      // is a false statement about a product on sale today.
      if (scored.fabricatedText) {
        lastError =
          `The frame carried text that is not the pack's own, or pack text that looked invented. ` +
          `${scored.fabricatedTextDetail}`.trim();
        continue;
      }

      // The same question again, asked deterministically. The model above was
      // told in as many words to report misspelled pack text and, on the first
      // real frame this mode ever produced, said no while the pack read
      // "acetyi glucosamine". So its transcription is checked in code against
      // the product's own page rather than its opinion being trusted.
      const corrupted = findCorruptedPackText(scored.packText, facts);
      if (corrupted.length > 0) {
        lastError =
          "The frame misspelled text printed on the real product: " +
          corrupted.map((c) => `"${c.rendered}" (the product says "${c.probably}")`).join(", ") +
          ".";
        continue;
      }

      return { scene, findings: scored.findings, attempts: attempt + 1 };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    findings: [],
    attempts: MAX_SCENE_ATTEMPTS,
    error:
      `No usable frame after ${MAX_SCENE_ATTEMPTS} attempts, so this placement fell back to the real ` +
      `photograph. Last reason: ${lastError}`,
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

export { adText, canvasText } from "./copy";
export type { Attempt, GateDecision } from "./gate";
export type { Placement, PlacementId } from "./placements";
export { ARCHETYPES } from "./prompt";
export type { Archetype, Mode } from "./prompt";
