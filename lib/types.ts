import { z } from "zod";

export const Dimension = z.enum(["policy", "tone", "language"]);
export type Dimension = z.infer<typeof Dimension>;

export const Severity = z.enum(["BLOCK", "WARN"]);
export type Severity = z.infer<typeof Severity>;

/**
 * Where a rule came from. `regulation` rules are the dangerous ones: a
 * confidently-cited clause that does not exist would be a fatal finding in a
 * project about unsubstantiated claims, so they carry `verified` and are not
 * trusted until a human has checked them against actual source text.
 */
export const Provenance = z.enum(["corpus", "regulation", "inference"]);
export type Provenance = z.infer<typeof Provenance>;

export const Matcher = z.object({
  type: z.enum(["regex", "lexicon"]),
  pattern: z.string().optional(),
  terms: z.array(z.string()).optional(),
  flags: z.string().default("gi"),
});

export const Rule = z.object({
  id: z.string().regex(/^(POLICY|TONE|LANG)-\d{3}$/),
  dimension: Dimension,
  severity: Severity,
  title: z.string(),
  provenance: Provenance,
  source: z.string(),
  /**
   * Whether the cited text was read in the original, or only through a
   * secondary publisher. Two load-bearing citations here are secondary because
   * the government hosts refused automated retrieval. Recorded rather than
   * glossed, so a reader can weight the rule accordingly.
   */
  source_confidence: z.enum(["primary", "secondary", "na"]).default("na"),
  /** Checked against actual source text by a human. Regulation rules are inert until true. */
  verified: z.boolean().default(false),
  rationale: z.string(),
  /** Layer 1. Present means this rule is checked deterministically. */
  matcher: Matcher.optional(),
  /** Layer 2. Present means this rule is handed to the model as judgment guidance. */
  guidance: z.string().optional(),
  /**
   * This rule cannot be evaluated without ProductFacts. When facts are absent
   * the rule is withheld from the prompt entirely, rather than being included
   * with an instruction not to guess. Asking a model politely to skip a check
   * is not a control; not giving it the check is.
   */
  requires_facts: z.boolean().default(false),
});
export type Rule = z.infer<typeof Rule>;

export const Layer = z.enum(["deterministic", "model"]);
export type Layer = z.infer<typeof Layer>;

export const Finding = z.object({
  ruleId: z.string(),
  dimension: Dimension,
  severity: Severity,
  layer: Layer,
  /** Exact substring of the input. Verified to exist verbatim or the finding is dropped. */
  span: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  explanation: z.string(),
  suggestedFix: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const Verdict = z.enum(["BLOCK", "WARN", "PASS"]);
export type Verdict = z.infer<typeof Verdict>;

export const ScoreResult = z.object({
  verdict: Verdict,
  dimensionScores: z.record(Dimension, z.number()),
  findings: z.array(Finding),
  meta: z.object({
    rulebookVersion: z.string(),
    model: z.string(),
    /** Model findings discarded because their quoted span was not in the input. */
    droppedFindings: z.number(),
    unverifiedRulesApplied: z.number(),
    /**
     * Dimensions whose model call failed. If `policy` is here, the verdict is
     * forced to BLOCK: an unrun compliance check must never read as a pass.
     */
    dimensionsFailed: z.array(Dimension).default([]),
  }),
});
export type ScoreResult = z.infer<typeof ScoreResult>;

/** Scraped from a beminimalist.co product page. The only source of truth for claims. */
export const ProductFacts = z.object({
  url: z.string(),
  name: z.string(),
  actives: z.array(z.object({ ingredient: z.string(), concentration: z.string() })),
  statedBenefits: z.array(z.string()),
  heroImageUrl: z.string().optional(),
  rawText: z.string(),
});
export type ProductFacts = z.infer<typeof ProductFacts>;

export const EvalCase = z.object({
  id: z.string(),
  /** hard-negative rows are copy that sounds risky but is fine. They catch over-eager scoring. */
  source: z.enum(["minimalist", "competitor", "seeded", "hard-negative"]),
  text: z.string(),
  expectedVerdict: Verdict,
  expectedRules: z.array(z.string()).default([]),
  rationale: z.string(),
  /**
   * ProductFacts for rows that exercise facts-dependent rules. Without this,
   * POLICY-005 is correctly withheld and a fabricated-concentration row can
   * never be tested. Supplying it here is what makes that rule evaluable.
   */
  factsContext: z.string().optional(),
});
export type EvalCase = z.infer<typeof EvalCase>;
