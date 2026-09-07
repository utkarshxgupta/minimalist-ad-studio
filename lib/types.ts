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
  /**
   * What the finding is about. Image findings come from scoring a generated
   * background, which has no text to quote, so they carry a description in
   * `span` instead of a substring and never pass through span verification.
   * Tagged rather than blended so a reviewer knows which kind they are reading.
   */
  target: z.enum(["text", "image"]).default("text"),
  /** Exact substring of the input, for text findings. Verified verbatim or dropped. */
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

/**
 * A generated claim and the ProductFacts text that supports it.
 *
 * The trace is verified in code: `supportedBy` must appear verbatim in the
 * facts, and `claim` must appear verbatim in the ad. It is the generation-side
 * analogue of span verification in the scorer.
 */
export const ClaimTrace = z.object({
  /** The phrase in the ad copy that makes a claim. */
  claim: z.string(),
  /** Verbatim text from ProductFacts that supports it. */
  supportedBy: z.string(),
});
export type ClaimTrace = z.infer<typeof ClaimTrace>;

export const AdCopy = z.object({
  headline: z.string(),
  subhead: z.string(),
  body: z.string(),
  cta: z.string(),
  /**
   * The substantiation disclaimer, rendered as fine print on the creative.
   *
   * Required whenever the copy carries a quantified claim. POLICY-003 asks
   * whether evidence is attached; this is where the brand's own convention
   * attaches it visually. Observed across the brand's asset library as
   * "*Claims are based on study conducted by an independent lab; individual
   * results may vary."
   */
  footnote: z.string().default(""),
  /**
   * Deep copy for the platform post, not rendered on the image.
   *
   * Meta placements get a few words on the canvas and put the argument in the
   * caption. Writing the body onto a feed image is the wrong output shape and
   * squeezes out the evidence that makes a strong claim legitimate.
   */
  caption: z.string().default(""),
  /**
   * Short benefit bullets rendered with a checkmark, observed across the
   * brand's real homepage banners ("Recommended by dermatologists", "For
   * every skin type and concern"). Populated only in creative mode. Each item
   * is grounded the same way a claim is: verified verbatim against
   * ProductFacts, never a rewrite of a claim already made elsewhere in the ad.
   */
  checklist: z.array(z.string()).default([]),
  /**
   * A stat badge, the kind that reads "150k+ Positive Reviews" on the real
   * site. Present only when the generator can point at a registry-backed
   * number for THIS product; there is no invented fallback. An empty object
   * means no badge is shown, which is the normal and expected outcome for a
   * product with no such figure available.
   */
  statBadge: z
    .object({ value: z.string(), label: z.string() })
    .partial()
    .default({}),
  claimTrace: z.array(ClaimTrace),
});
export type AdCopy = z.infer<typeof AdCopy>;

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
