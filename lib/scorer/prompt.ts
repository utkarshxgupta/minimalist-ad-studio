import type { Dimension, Rule } from "@/lib/types";

/**
 * Prompt assembly for layer 2.
 *
 * Deliberately its own module. The brief asks for "the prompts your app itself
 * uses", and this is where they are: assembled from `standard/`, not written by
 * hand. Change a rule's guidance and the prompt changes with it. There is no
 * second, hidden statement of what good means.
 *
 * The model is never asked to decide severity. It reports which rule was broken
 * and quotes the span; severity comes from the rulebook. That keeps the standard
 * in version control rather than in a model's judgment on the day.
 */

const DIMENSION_BRIEF: Record<Dimension, string> = {
  policy:
    "legal and claims exposure for a cosmetic sold in India. You are the last check before ad spend.",
  tone: "whether this sounds like Minimalist, or like a generic skincare advertiser.",
  language:
    "vocabulary, claim structure, and how ingredients and concentrations are stated.",
};

export function buildPrompt(
  dimension: Dimension,
  rules: Rule[],
  adText: string,
  factsContext?: string,
  registry?: string
): string {
  const ruleBlock = rules
    .map((r) =>
      [
        `### ${r.id} — ${r.title}  [${r.severity}]`,
        `Why: ${r.rationale.trim()}`,
        r.guidance ? `How to apply: ${r.guidance.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return `You are reviewing an advertisement for Minimalist, an Indian science-led
skincare brand, against a written standard. Your dimension is ${dimension}: ${DIMENSION_BRIEF[dimension]}

You judge ONLY against the rules below. You have no other opinions. If something
bothers you but does not violate a listed rule, you do not report it.

## The rules

${ruleBlock}

## The governing principle behind this standard

A claim's legitimacy comes from the evidence attached to it, not from its
strength. This was derived from the brand's own copy: Minimalist writes
"Reduces Acne, Blackheads & Excessive Oil", which is word for word as strong as
a competitor's line. What separates them is that Minimalist attaches the study,
the subject count, the duration, and often the testing lab.

Therefore: DO NOT flag copy for being confident, bold, or strongly worded. That
is not a violation. Flag missing evidence, prohibited claim types, and off-register
language, as defined by the rules above and nothing else.

## Critical output constraints

1. "span" must be copied CHARACTER FOR CHARACTER from the advertisement text
   below. It is checked programmatically against the source. If your quote is not
   an exact substring, your finding is discarded and the reviewer never sees it.
2. Cite the rule id you are applying. Do not invent rule ids.
3. Do not assign severity. That comes from the rulebook.
4. A clean advertisement returns an empty findings array. That is a normal and
   frequent result. Do not manufacture a finding to appear useful.
5. False positives are more damaging than misses here. A reviewer who stops
   trusting this tool goes back to arguing on Slack, which is the problem it
   exists to solve. When genuinely uncertain, do not flag.

## Grammatical mood does not change what a claim is

A claim posed as a question, a hypothetical, a suggestion, or an implication is
still a claim, and is judged exactly as though it were asserted flatly.

  "Why not let this serum balance melanocyte function?"
  "Imagine skin that never breaks out again."
  "What if three days was all it took?"

Each of these asserts the thing it appears to merely ask. The red team used
interrogative framing to walk therapeutic and Schedule-condition claims past an
earlier version of this standard. Read for what the copy makes a reader believe,
not for its sentence mood.
${factsContext ? `\n## Product facts (the only permitted source of truth for claims)\n\n${factsContext}\n` : ""}${
    registry
      ? `\n## Substantiation registry (the only studies this brand can cite)\n\n${registry}\n\nA citation absent from this list is unsubstantiated no matter how precise it looks.\n`
      : ""
  }
## The advertisement to review

<advertisement>
${adText}
</advertisement>`;
}

/** Response schema handed to the model. Severity is deliberately absent. */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ruleId: { type: "string" },
          span: { type: "string" },
          explanation: { type: "string" },
          suggestedFix: { type: "string" },
        },
        required: ["ruleId", "span", "explanation", "suggestedFix"],
      },
    },
  },
  required: ["findings"],
} as const;
