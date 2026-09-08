import type { ProductFacts, Rule } from "@/lib/types";
import { loadRulebook, loadDisclosures, registryDigestFor } from "@/lib/standard/loader";
import { fieldsFor, type CopyField, type Placement } from "./placements";
import type { Archetype } from "./archetypes";

/**
 * Photographic: the default. Real photo, flat canvas, no image model call.
 * Creative: opt-in. Adds a generated prop graphic and the checklist/stat-badge
 * elements observed on the brand's own homepage banners.
 */
export type Mode = "photographic" | "creative";

/**
 * The archetypes themselves live in `./archetypes`, which imports nothing, so
 * the generator form in the browser can read the list without dragging the
 * rulebook loader and its filesystem calls into the client bundle. Re-exported
 * here because this is where they become instructions, and it is the import
 * every caller already reaches for.
 */
export { ARCHETYPES, DEFAULT_ARCHETYPE, isArchetype } from "./archetypes";
export type { Archetype, ArchetypeSpec } from "./archetypes";

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

  const ingredientNotes = facts.ingredientNotes.length
    ? facts.ingredientNotes.map((n) => `- ${n.ingredient}: ${n.note}`).join("\n")
    : "- (no per-ingredient descriptions could be read from the page)";

  const audience = facts.audience
    ? Object.entries(facts.audience)
        .filter(([, v]) => v)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "- (none stated on the page)";

  return `Product name: ${facts.name}
Source: ${facts.url}

Actives and concentrations:
${actives}

Benefits stated on the product page:
${benefits}

Formulation trust badges stated on the product page:
${badges}

What each named ingredient does, per the product's own ingredient tabs:
${ingredientNotes}

Who this is for and how to use it, per the product's own labelled fields:
${audience}

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
 * The rule every archetype shares, stated once. A testimonial card sits
 * beside every one of these on the real site and none of them produce one:
 * it needs a real reviewer's name and real words, and a model asked to
 * supply both is inventing a customer, a fabricated testimonial regardless of
 * how the copy praises the product. POLICY-009 and POLICY-010 exist for
 * testimonials that overreach; a testimonial that does not exist overreaches
 * by definition.
 */
const NO_TESTIMONIAL = `Do NOT write a testimonial, a customer quote, a reviewer name, or a star
rating. Those elements exist on the real site but require a real customer,
which this tool does not have. Inventing one is a fabricated testimonial.`;

/**
 * Creative-mode content blocks, one per archetype. Every one of these is a
 * real, repeating structure on the brand's own homepage banners, not an
 * invented layout: this function decides which fields the model is asked to
 * fill in, and every field it fills is grounded exactly like a claim in the
 * body copy is.
 */
function archetypeBlock(facts: ProductFacts, p: Placement, archetype: Archetype): string {
  const header = `\n## Creative-mode element: ${archetype}\n\n`;

  // The block is printed on the canvas next to the headline, so it spends the
  // same word budget. Saying so here is the instruction; `overLengthFields`
  // counting it is the check. Both are needed: without the instruction the
  // model reliably writes a paragraph, and without the check nobody finds out.
  const budget = `These words are printed on the creative, so they count against the ${p.canvasWordLimit}-word
canvas budget above, along with the headline, subhead and cta. Keep them short.
`;

  switch (archetype) {
    case "mechanism":
      return `${header}"benefitBreakdown": one to three entries, each a short bold action verb
("FIGHTS ACNE", "REGULATES SEBUM") plus one sentence of mechanism, the pattern
the corpus uses ("FIGHTS ACNE: provides potent anti-microbial activity against
p-acne bacteria"). The verb is a label; the mechanism sentence is the part that
must be a fact from the product facts block above, so add a claimTrace entry
for each mechanism sentence exactly as you would for a claim in the body copy.
Two entries usually reads better than three, and keep each mechanism to one
clause of around ten words, as in the corpus example. A full paragraph in this
element is wrong for the format.
Leave "checklist", "statBadge", "ingredientSynergy" and "audienceGrid" empty.

${budget}

${NO_TESTIMONIAL}`;

    case "synergy":
      return `${header}"ingredientSynergy": one to three entries, each a named ingredient from the
product facts above and a short phrase for what it does. The ingredient must
be one that is actually named in "What each named ingredient does" above; the
role phrase must be grounded there too, so add a claimTrace entry for each
role phrase exactly as you would for a claim in the body copy. Do not invent a
synergy between two ingredients that the product's own ingredient tabs never
described as working together; state what each one does on its own if that is
all the page supports. The role is a phrase, not a sentence: a handful of words
each, since three of these sit stacked on the creative.
Leave "checklist", "statBadge", "benefitBreakdown" and "audienceGrid" empty.

${budget}

${NO_TESTIMONIAL}`;

    case "audience":
      return `${header}"audienceGrid" is filled in automatically from the product's own labelled
fields after you respond, not by you: leave it as {} with every field empty.
Write the headline, subhead and cta as you normally would, consistent with who
the product facts say this is for, since that grid will be shown beside them.
The grid is wordy on its own and is already spending most of the canvas budget
above, so keep the headline and subhead tight.
Leave "checklist", "statBadge", "benefitBreakdown" and "ingredientSynergy" empty.

${NO_TESTIMONIAL}`;

    case "statement":
    default:
      return `${header}Two elements are available. Use either, both, or neither: an empty ad is safer
than a decorated one that has to invent something to fill the space.

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

Leave "benefitBreakdown", "ingredientSynergy" and "audienceGrid" empty.

${budget}

${NO_TESTIMONIAL}`;
  }
}

/**
 * The disclosure requirement.
 *
 * Loaded from standard/disclosures.yaml rather than hardcoded, and the prompt
 * says the wording is fixed, because a disclaimer a model paraphrases is a
 * disclaimer that can quietly stop naming who ran the study.
 */
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
  mode: Mode = "photographic",
  archetype: Archetype = "statement"
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
      ? archetypeBlock(facts, placement, archetype)
      : `\n## Five fields you always leave empty\n\nSet "checklist" and "benefitBreakdown" and "ingredientSynergy" to empty arrays, and "statBadge" and "audienceGrid" to {} with every field empty. Those elements are for creative mode only.\n`
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
    benefitBreakdown: {
      type: "array",
      items: {
        type: "object",
        properties: { verb: { type: "string" }, mechanism: { type: "string" } },
        required: ["verb", "mechanism"],
      },
    },
    ingredientSynergy: {
      type: "array",
      items: {
        type: "object",
        properties: { ingredient: { type: "string" }, role: { type: "string" } },
        required: ["ingredient", "role"],
      },
    },
    audienceGrid: {
      type: "object",
      properties: {
        concerns: { type: "string" },
        skinType: { type: "string" },
        howToUse: { type: "string" },
        timing: { type: "string" },
      },
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
  required: [
    "headline",
    "subhead",
    "body",
    "cta",
    "footnote",
    "caption",
    "checklist",
    "statBadge",
    "benefitBreakdown",
    "ingredientSynergy",
    "audienceGrid",
    "claimTrace",
  ],
} as const;
