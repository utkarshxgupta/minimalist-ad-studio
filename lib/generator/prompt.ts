import type { ProductFacts, Rule } from "@/lib/types";
import { loadRulebook, loadDisclosures, registryDigestFor } from "@/lib/standard/loader";
import { fieldsFor, type CopyField, type Placement } from "./placements";

/**
 * Photographic: the default. Real photo, flat canvas, no image model call.
 * Creative: opt-in. Adds a generated prop graphic and the checklist/stat-badge
 * elements observed on the brand's own homepage banners.
 */
export type Mode = "photographic" | "creative";

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

const FIELD_BRIEF: Record<CopyField, string> = {
  headline: "the hook. The thing that earns the next second of attention.",
  subhead: "one line qualifying the hook.",
  body: "the argument, for a reader who is already zoomed in and studying.",
  cta: "the action.",
  footnote: "the substantiation disclaimer, set as fine print.",
};

export function factsBlock(facts: ProductFacts): string {
  const actives = facts.actives.length
    ? facts.actives.map((a) => `- ${a.ingredient}: ${a.concentration}`).join("\n")
    : "- (none could be read from the page)";

  const benefits = facts.statedBenefits.length
    ? facts.statedBenefits.map((b) => `- ${b}`).join("\n")
    : "- (none could be read from the page)";

  const badges = facts.trustBadges.length
    ? facts.trustBadges.map((b) => `- ${b}`).join("\n")
    : "- (none stated on the page)";

  return `Product name: ${facts.name}
Source: ${facts.url}

Actives and concentrations:
${actives}

Benefits stated on the product page:
${benefits}

Formulation trust badges stated on the product page:
${badges}

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

/**
 * The placement brief. This is where the channel split lands in the prompt.
 *
 * A feed ad and a PDP listing image are different formats with different jobs,
 * so they get different copy, generated separately against their own budget.
 * The alternative, one creative rescaled, silently truncates the evidence on
 * the short formats, which is exactly where evidence matters most.
 */
function placementBlock(p: Placement): string {
  const fields = fieldsFor(p)
    .map((f) => `- ${f}: at most ${p.fields[f]} characters. ${FIELD_BRIEF[f]}`)
    .join("\n");

  const channelNote =
    p.channel === "meta"
      ? `This is a paid social placement. It is scrolled past, not studied, so the
canvas carries the hook and the argument goes in the caption. Keep the words ON
THE IMAGE under ${p.canvasWordLimit}, excluding the footnote.

Write "caption" as the post copy: this is where a real case gets made, and it
has room for the evidence that does not fit on the image. Several sentences is
correct here. It is scored against the same rules as everything else.`
      : `This is a product detail page listing image. The reader has already clicked
and is zoomed in studying the chemistry, so long copy is correct here and thin
copy wastes the placement. Aim for the body to do real explanatory work.

There is no caption. The image must stand alone. Leave "caption" empty.`;

  return `## The placement

${p.label}, ${p.width} by ${p.height}.

${channelNote}

Write exactly these fields, and leave every other field an empty string:

${fields}`;
}

/**
 * The disclosure requirement.
 *
 * Loaded from standard/disclosures.yaml rather than hardcoded, and the prompt
 * says the wording is fixed, because a disclaimer a model paraphrases is a
 * disclaimer that can quietly stop naming who ran the study.
 */
/**
 * Creative-mode elements: the checklist and the stat badge.
 *
 * Both observed directly on beminimalist.co's own homepage banners
 * ("Recommended by dermatologists", "For every skin type and concern" as a
 * checklist; "150k+ Positive Reviews" as a bordered stat badge), not invented.
 * What is NOT taken from those banners is the testimonial card that sits
 * alongside them. A testimonial card needs a real reviewer's name and real
 * words, and a model asked to supply both would be inventing a customer,
 * which is a fabricated testimonial regardless of how the copy praises the
 * product. POLICY-009 and POLICY-010 exist for testimonials that overreach;
 * a testimonial that does not exist overreaches by definition. So this
 * generator does not produce one. A marketer can add a real quote by hand.
 */
function creativeElementsBlock(facts: ProductFacts): string {
  return `\n## Creative-mode elements

Two additional elements are available, both seen on the brand's own homepage
banners. Use either, both, or neither: an empty ad is safer than a decorated
one that has to invent something to fill the space.

"checklist": zero to three short benefit bullets, each one a fact from the
product facts block above, not a rephrasing of the headline. Each item is
checked the same way a claim is: it must be traceable to the facts, so add a
claimTrace entry for each checklist item exactly as you would for a claim in
the body copy.

The formulation trust badges above ("Fragrance Free", "Non-comedogenic", a pH
range) are good checklist material and are exactly the kind of line the real
site's own checklists use ("For every skin type and concern", "Recommended by
dermatologists"). Prefer them over a paraphrase of the headline when you need
a third item and the benefits list is thin.

"statBadge": a single number-and-label pair for a bordered badge, the kind
that reads "150k+ Positive Reviews" on the real site. Use it ONLY if one of
the studies below, registered specifically for THIS product, gives you a
number worth pulling out. If none does, leave both fields of statBadge empty.
Never estimate, round differently than the source, or invent a number to fill
this element.

Studies registered for ${facts.name}:
${registryDigestFor(facts.name)}

Do NOT write a testimonial, a customer quote, a reviewer name, or a star
rating. Those elements exist on the real site but require a real customer,
which this tool does not have. Inventing one is a fabricated testimonial.`;
}

function disclosureBlock(p: Placement): string {
  if (!fieldsFor(p).includes("footnote")) return "";

  const d = loadDisclosures().disclosures.find((x) => x.applies_to === "quantified_claim");
  if (!d) return "";

  const captionRule = p.hasCaption
    ? `

WHERE IT GOES. The disclaimer belongs with the claim it disclaims, and on this
placement the canvas and the caption are read by different people at different
moments.

- Quantified claim on the canvas: "footnote" carries the disclaimer.
- Quantified claim only in the caption: end the caption with the disclaimer
  instead, and leave "footnote" empty.
- Both: put it in both.

A disclaimer printed on an image whose claim lives in the caption satisfies
nobody. The scroller reads a footnote for a claim that is not on the image, and
the caption reader gets the claim with no source attached.`
    : "";

  return `\n## The substantiation footnote

If any copy you write carries a quantified claim, a percentage of users, a
proportion, or a result in a stated number of days or weeks, it must be
accompanied by exactly this string and nothing else:

${d.text}

Reproduce it character for character. Do not reword it, shorten it, or drop the
asterisk. If your copy makes no quantified claim anywhere, leave "footnote"
empty rather than adding it decoratively.${captionRule}

A claim whose substantiation is legible only to the reviewer is not
substantiated to the reader.
`;
}

export function buildCopyPrompt(
  facts: ProductFacts,
  placement: Placement,
  brief: Brief = {},
  avoid: string[] = [],
  mode: Mode = "photographic"
): string {
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
brand.

## The only facts you may use

Every benefit, ingredient and concentration in your copy must come from this
block. Not from what you know about skincare, not from what is usually true of
this ingredient, not from a reasonable inference. If it is not written here, it
is not a fact about this product and you may not say it.

<product-facts>
${factsBlock(facts)}
</product-facts>

${briefLine ? `## The brief\n\n${briefLine}\n` : ""}
${placementBlock(placement)}

## The standard you are writing to

${constraintBlock(book.active)}

## Substantiation registry

These are the only studies registered for THIS product. A number or a study
reference that is not here is unsubstantiated no matter how precise it sounds,
and a study belongs to the product it was run on, never to a different one in
the same range.

${registryDigestFor(facts.name)}

## How Minimalist actually writes

Confidence is not the problem. The brand writes "Reduces Acne, Blackheads &
Excessive Oil", which is as strong as anything a competitor says. What makes it
legitimate is that the evidence is attached. So write with conviction, and
attach the evidence, or drop the claim. Do not hedge a claim into vagueness and
call it compliant: "may help support skin wellness" is worse copy and no safer.
${disclosureBlock(placement)}${
    mode === "creative"
      ? creativeElementsBlock(facts)
      : `\n## Two fields you always leave empty\n\nSet "checklist" to an empty array and "statBadge" to {} with both fields empty. Those elements are for creative mode only.\n`
  }${avoidBlock}
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
    footnote: { type: "string" },
    caption: { type: "string" },
    checklist: { type: "array", items: { type: "string" } },
    statBadge: {
      type: "object",
      properties: { value: { type: "string" }, label: { type: "string" } },
    },
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
  required: ["headline", "subhead", "body", "cta", "footnote", "caption", "checklist", "statBadge", "claimTrace"],
} as const;
