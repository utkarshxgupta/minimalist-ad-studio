import type { ProductFacts, Rule } from "@/lib/types";
import { loadRulebook, registryDigest } from "@/lib/standard/loader";

/**
 * The generation prompt, assembled from `standard/` at runtime.
 *
 * The same rulebook that scores the ad also writes it. That is the whole point
 * of putting the standard in version control: if the generator had its own
 * private idea of good, amending a rule would fix review and leave generation
 * producing the same violation as before, and the two surfaces would drift
 * until nobody trusted either.
 *
 * Rules are rendered here as constraints rather than as detectors. Same text,
 * different job: the scorer asks "was this broken", the generator is told "do
 * not break this".
 */

export interface Brief {
  /** What the marketer wants this ad to do. Free text, optional. */
  angle?: string;
  /** Who it is for. Free text, optional. */
  audience?: string;
}

/** 1080x1080 has a hard copy budget. Exceeding it is a layout bug, not a style note. */
export const COPY_LIMITS = { headline: 60, subhead: 90, body: 180, cta: 24 };

export function factsBlock(facts: ProductFacts): string {
  const actives = facts.actives.length
    ? facts.actives.map((a) => `- ${a.ingredient}: ${a.concentration}`).join("\n")
    : "- (none could be read from the page)";

  const benefits = facts.statedBenefits.length
    ? facts.statedBenefits.map((b) => `- ${b}`).join("\n")
    : "- (none could be read from the page)";

  return `Product name: ${facts.name}
Source: ${facts.url}

Actives and concentrations:
${actives}

Benefits stated on the product page:
${benefits}

Full page copy:
${facts.rawText}`;
}

function constraintBlock(rules: Rule[]): string {
  const render = (r: Rule) =>
    [`- ${r.id} ${r.title}`, `  ${r.rationale.trim()}`, r.guidance ? `  ${r.guidance.trim()}` : null]
      .filter(Boolean)
      .join("\n");

  const block = rules.filter((r) => r.severity === "BLOCK");
  const warn = rules.filter((r) => r.severity === "WARN");

  return `### Absolute. Copy breaking any of these is never published.

${block.map(render).join("\n\n")}

### Strong preferences. Breaking one costs a reviewer's time and an override.

${warn.map(render).join("\n\n")}`;
}

export function buildCopyPrompt(facts: ProductFacts, brief: Brief = {}, avoid: string[] = []): string {
  const book = loadRulebook();

  const briefLine = [
    brief.angle ? `Angle the marketer asked for: ${brief.angle}` : null,
    brief.audience ? `Audience: ${brief.audience}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // On a retry after review, the previous attempt's problems are stated as
  // things to avoid. Not the previous copy: handing back the rejected text
  // invites a reword of the same claim, which is how a scorer gets Goodharted.
  const avoidBlock = avoid.length
    ? `\n## What the last attempt got wrong\n\n${avoid.map((a) => `- ${a}`).join("\n")}\n\nDo not solve these by rephrasing. Solve them by not making the claim.\n`
    : "";

  return `You write advertising copy for Minimalist, an Indian science-led skincare
brand. You are writing one 1080x1080 social ad.

## The only facts you may use

Every benefit, ingredient and concentration in your copy must come from this
block. Not from what you know about skincare, not from what is usually true of
this ingredient, not from a reasonable inference. If it is not written here, it
is not a fact about this product and you may not say it.

<product-facts>
${factsBlock(facts)}
</product-facts>

${briefLine ? `## The brief\n\n${briefLine}\n` : ""}
## The standard you are writing to

${constraintBlock(book.active)}

## Substantiation registry

These are the only studies this brand can cite. A number or a study reference
that is not in this list is unsubstantiated no matter how precise it sounds.

${registryDigest()}

## How Minimalist actually writes

Confidence is not the problem. The brand writes "Reduces Acne, Blackheads &
Excessive Oil", which is as strong as anything a competitor says. What makes it
legitimate is that the evidence is attached. So write with conviction, and
attach the evidence, or drop the claim. Do not hedge a claim into vagueness and
call it compliant: "may help support skin wellness" is worse copy and no safer.
${avoidBlock}
## Copy budget

- headline: at most ${COPY_LIMITS.headline} characters
- subhead: at most ${COPY_LIMITS.subhead} characters
- body: at most ${COPY_LIMITS.body} characters
- cta: at most ${COPY_LIMITS.cta} characters

## The claim trace

For every phrase in your copy that makes a claim about what the product is or
does, add a claimTrace entry:

- "claim": the phrase, copied character for character from your own copy
- "supportedBy": the text from the product facts above that supports it, copied
  character for character from that block

Both halves are checked programmatically. A trace whose supportedBy is not
verbatim in the facts is reported as an ungrounded claim, so do not paraphrase
the evidence to make it fit. If you cannot point at supporting text, the honest
move is to not make the claim.`;
}

export const COPY_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    subhead: { type: "string" },
    body: { type: "string" },
    cta: { type: "string" },
    claimTrace: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          supportedBy: { type: "string" },
        },
        required: ["claim", "supportedBy"],
      },
    },
  },
  required: ["headline", "subhead", "body", "cta", "claimTrace"],
} as const;
