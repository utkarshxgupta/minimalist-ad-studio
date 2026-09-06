import type { Dimension, Finding, ScoreResult, Verdict } from "@/lib/types";
import { loadRulebook } from "@/lib/standard/loader";
import { scoreDeterministic } from "./deterministic";
import { scoreModel } from "./model";

const DIMENSIONS: Dimension[] = ["policy", "tone", "language"];

/**
 * Drops any model finding whose quoted span is not present verbatim in the
 * input. Cheap, enforceable anti-hallucination check: a model that invents a
 * quote loses the finding, rather than the reviewer losing their afternoon.
 *
 * Returns the surviving findings with corrected offsets, plus a dropped count
 * that gets surfaced in the result so the guardrail is visible, not silent.
 */
export function verifySpans(
  text: string,
  findings: Finding[]
): { kept: Finding[]; dropped: number } {
  const kept: Finding[] = [];
  let dropped = 0;

  for (const f of findings) {
    const idx = text.indexOf(f.span);
    if (f.span.length === 0 || idx === -1) {
      dropped++;
      continue;
    }
    kept.push({ ...f, start: idx, end: idx + f.span.length });
  }

  return { kept, dropped };
}

export function computeVerdict(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === "BLOCK")) return "BLOCK";
  if (findings.some((f) => f.severity === "WARN")) return "WARN";
  return "PASS";
}

/**
 * Deliberately blunt. The number exists so a reviewer can sort a queue; the
 * findings are what they act on. A single score tells a marketer nothing, which
 * is why it is never shown alone in the UI.
 */
export function dimensionScores(findings: Finding[]): Record<Dimension, number> {
  const out = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) {
    const hits = findings.filter((f) => f.dimension === d);
    const penalty = hits.reduce((n, f) => n + (f.severity === "BLOCK" ? 40 : 15), 0);
    out[d] = Math.max(0, 100 - penalty);
  }
  return out;
}

export interface ScoreOptions {
  /** Skip layer 2. Used by the eval harness to isolate deterministic performance. */
  deterministicOnly?: boolean;
  /** ProductFacts JSON, when scoring a creative this tool generated. */
  factsContext?: string;
}

export async function scoreAd(text: string, opts: ScoreOptions = {}): Promise<ScoreResult> {
  const book = loadRulebook();

  const det = scoreDeterministic(text, book.active);

  let model: Finding[] = [];
  let dropped = 0;
  let modelName = "none";

  if (!opts.deterministicOnly) {
    const res = await scoreModel(text, book, opts.factsContext);
    const verified = verifySpans(text, res.findings);
    model = verified.kept;
    dropped = verified.dropped;
    modelName = res.model;
  }

  const findings = [...det, ...model];

  return {
    verdict: computeVerdict(findings),
    dimensionScores: dimensionScores(findings),
    findings,
    meta: {
      rulebookVersion: book.version,
      model: modelName,
      droppedFindings: dropped,
      // Surfaced so nobody reads a clean PASS as meaning the rulebook is complete.
      unverifiedRulesApplied: book.unverified.length,
    },
  };
}
