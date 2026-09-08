import type { AdCopy, ClaimTrace, ScoreResult, Verdict } from "@/lib/types";

/**
 * The gate: what the generator is allowed to hand back.
 *
 * Rejected alternatives, recorded because rejecting them is the design:
 *
 *   advisor      always render, show the score beside it. Optimises for speed,
 *                which is the cheap failure, over publishing correctness, which
 *                is the expensive one.
 *   silent filter never show the score. Hides the standard from the person who
 *                most needs to learn it, and makes the tool unauditable.
 *
 * Two inputs, kept separate on purpose. The verdict comes from the scorer and
 * every part of it cites a rule. Grounding warnings come from the generator's
 * own claim trace and cite no rule, because they are not findings about the
 * copy, they are the generator reporting that it could not point at evidence
 * for something it wrote. Invariant 1 says a finding cites a rule ID, so this
 * is deliberately not called a finding.
 */

export interface Attempt {
  /** 0 is the first try. Later entries exist only for WARN retries. */
  index: number;
  copy: AdCopy;
  score: ScoreResult;
  /** Claim trace entries whose support could not be verified in the facts. */
  ungrounded: ClaimTrace[];
  /** Copy fields over the 1080x1080 budget. */
  overLength: string[];
  /**
   * The pack in this creative was rendered by an image model from a reference
   * photograph, rather than being the photograph. True only in creative mode.
   *
   * This is the deliberate exception to invariant 5, and this is where it gets
   * paid for: an attempt carrying a generated pack can never export freely,
   * however clean its copy is. A model that redraws a real product's label can
   * alter a concentration or a claim in a way that reads as perfectly normal,
   * and there is no text check for a fact that only exists in pixels. So a
   * human signs for it, every time.
   */
  packIsGenerated?: boolean;
}

export interface GateDecision {
  /** May a finished creative be shown at all. */
  render: boolean;
  /**
   * free     export with one click
   * override export allowed, but a reason is logged against the ad
   * blocked  no export, escalate to a human
   */
  export: "free" | "override" | "blocked";
  reasons: string[];
}

/**
 * A BLOCK is never looped. If copy says "cures acne" and a rewrite loop turns
 * it into "helps clear acne", compliance did not improve, we just found
 * phrasing the detector misses, which is Goodharting our own scorer. A BLOCK
 * means the claim is unsupported, so the fix is to drop the claim, and dropping
 * a claim is a decision a person makes.
 */
export const MAX_WARN_RETRIES = 2;

export function decide(attempt: Attempt): GateDecision {
  const { score, ungrounded, overLength } = attempt;
  const reasons: string[] = [];

  if (score.meta.dimensionsFailed.length > 0) {
    reasons.push(
      `The ${score.meta.dimensionsFailed.join(" and ")} check did not run. An unrun compliance check is not a pass.`
    );
  }

  if (score.verdict === "BLOCK") {
    for (const f of score.findings.filter((f) => f.severity === "BLOCK")) {
      reasons.push(`${f.ruleId}: ${f.explanation}`);
    }
    return { render: false, export: "blocked", reasons };
  }

  for (const f of score.findings.filter((f) => f.severity === "WARN")) {
    reasons.push(`${f.ruleId}: ${f.explanation}`);
  }
  for (const u of ungrounded) {
    reasons.push(`Ungrounded claim: "${u.claim}" could not be traced to the product facts.`);
  }
  for (const o of overLength) {
    reasons.push(`Layout: ${o}`);
  }
  if (attempt.packIsGenerated) {
    reasons.push(
      "The product pack in this creative was rendered by an image model from the real photograph, not " +
        "photographed. Check the label, the concentration and any pack text against the real product before " +
        "this ships."
    );
  }

  // Over-length copy is a layout problem, not a compliance one, so it does not
  // gate export. It is surfaced because a headline that overflows the artboard
  // is still a broken deliverable.
  const needsOverride = score.verdict === "WARN" || ungrounded.length > 0 || Boolean(attempt.packIsGenerated);

  return {
    render: true,
    export: needsOverride ? "override" : "free",
    reasons,
  };
}

/** Loop only on WARN, and only while there is a retry left. */
export function shouldRetry(attempt: Attempt, retriesUsed: number): boolean {
  if (attempt.score.verdict !== "WARN") return false;
  return retriesUsed < MAX_WARN_RETRIES;
}

/**
 * What a retry is told to avoid. The rejected copy is deliberately not handed
 * back: showing a model its own rejected sentence invites a reword of the same
 * claim, which is the failure mode the whole no-auto-rewrite rule exists to
 * prevent. It is told the problem, not the text.
 */
export function avoidList(attempt: Attempt): string[] {
  return [
    ...attempt.score.findings
      .filter((f) => f.severity === "WARN")
      .map((f) => `${f.ruleId} ${f.explanation} Fix: ${f.suggestedFix}`),
    ...attempt.ungrounded.map(
      (u) => `The claim "${u.claim}" had no support in the product facts. Do not make it at all.`
    ),
  ];
}

const RANK: Record<Verdict, number> = { PASS: 0, WARN: 1, BLOCK: 2 };

/**
 * Which attempt to show. Retries are not monotonically better: attempt 3 can
 * introduce two new WARNs while fixing one, and showing the last attempt just
 * because it is last would hand the marketer the worst of the three. The whole
 * chain stays visible either way, so the choice is auditable.
 */
export function chooseBest(attempts: Attempt[]): number {
  if (attempts.length === 0) throw new Error("chooseBest called with no attempts");

  let best = 0;
  for (let i = 1; i < attempts.length; i++) {
    if (compare(attempts[i], attempts[best]) < 0) best = i;
  }
  return best;
}

function compare(a: Attempt, b: Attempt): number {
  const byVerdict = RANK[a.score.verdict] - RANK[b.score.verdict];
  if (byVerdict !== 0) return byVerdict;

  const blocks = (x: Attempt) => x.score.findings.filter((f) => f.severity === "BLOCK").length;
  const byBlocks = blocks(a) - blocks(b);
  if (byBlocks !== 0) return byBlocks;

  const byFindings = a.score.findings.length - b.score.findings.length;
  if (byFindings !== 0) return byFindings;

  const byGrounding = a.ungrounded.length - b.ungrounded.length;
  if (byGrounding !== 0) return byGrounding;

  // Earliest wins ties. A later attempt that is no better is not an improvement.
  return a.index - b.index;
}
