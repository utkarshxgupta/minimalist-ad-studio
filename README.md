# Minimalist Ad Studio

Internal tool prototype for [Minimalist](https://beminimalist.co). Two surfaces
over one shared, versioned standard.

```bash
npm install
cp .env.example .env.local     # add a Gemini API key
npm run dev                    # http://localhost:3000
```

No key? The app still runs. Layer 2 reports itself as `skipped:no-api-key` and
the deterministic layer scores on its own. No network? Set
`AD_STUDIO_OFFLINE=1` and the generator reads committed product snapshots.

## The argument

The brief describes the bottleneck as reviewers disagreeing with each other
while rejected ads bounce back and forth for days. That is not a speed problem.
It is an **unwritten-standard problem**: review is non-deterministic and
unaccountable because nobody can point at a rule.

So the product is not "AI writes ads, AI grades ads". It is **one codified brand
and legal standard, versioned in this repo, applied at generation time and at
review time**. [`standard/`](standard/) is the product. `app/` is where it gets
applied.

Everything else follows from that. The generator writes against the same
rulebook the reviewer scores against, so the two surfaces cannot disagree. Every
finding cites a rule ID. Every rule cites its source and says whether that
source is the brand's own copy, a regulation, or our inference.

## The two surfaces

**Generate** (`/`). A product URL in, scored creatives out across the placements
you pick. The page is fetched server-side, parsed into `ProductFacts` with no
model involved, and every claim in the generated copy must trace to a field in
those facts. Each creative self-scores before it renders.

Placements are formats, not sizes. A Meta feed ad is scrolled past, so it keeps
under 15 words on the canvas and moves the argument into the caption. An 11:16
PDP listing image is studied by someone already zoomed in, so it runs long. Copy
is written and scored per placement, never rescaled from one master, because
substantiation costs words and the short formats are where evidence gets
squeezed out.

**Review** (`/review`). Paste any ad. Each finding carries the rule ID, the
exact words it objects to, why, and what to do instead.

## The gate

| Verdict | What happens |
|---|---|
| `PASS` | Renders. Exports on one click. |
| `WARN` | Renders. Export demands a reason, and the reason is logged. |
| `BLOCK` | **No finished creative is rendered.** Export disabled. Escalates. |

A BLOCK is never auto-rewritten. If copy says "cures acne" and a loop rewrites
it to "helps clear acne", compliance did not improve; we just found phrasing the
detector misses. A BLOCK means the claim is unsupported, so the fix is to drop
the claim, and that is a decision a person makes. WARN findings are loopable,
capped at two retries, and the retry is told what was wrong rather than shown
the rejected sentence.

## How scoring works

Two layers, and every finding says which one produced it, so a reviewer knows
how much to trust it.

- **Layer 1, deterministic** (`lib/scorer/deterministic.ts`). Lexicon and
  pattern matching. Same input, same output, forever. This is what makes the
  tool a standard rather than a second opinion.
- **Layer 2, judgment** (`lib/scorer/model.ts`). Gemini Flash with the rulebook
  in context, one call per dimension, in parallel. Separate calls because a
  single prompt doing three jobs bleeds: tone concerns contaminate legal
  judgments.

Three controls sit on top of the model:

1. **Span verification.** A model finding must quote the exact substring it is
   flagging. If that substring is not in the input verbatim, the finding is
   dropped in code, and the drop count is shown.
2. **Rule verification.** A finding citing a rule ID that does not exist is
   discarded. A model does not get to invent authority any more than an
   advertiser does.
3. **Fail closed.** If the policy call fails after a retry, the verdict is
   forced to BLOCK. An unrun compliance check must never read as a pass.

## Claim grounding

Generated copy may not assert a benefit, ingredient or concentration absent from
the scraped `ProductFacts`. Enforced twice, because neither check is sufficient
alone:

- the generator emits a **claim trace**, and the trace is verified in code: the
  supporting text must appear verbatim in the facts, and the claim must appear
  verbatim in the ad;
- the **scorer** then runs over the finished copy with the same facts attached,
  and does not care what the generator chose to declare.

The trace catches the confident mistake. The scorer catches the convenient
omission, which is what a model does when it simply leaves a claim out of its
own trace.

## Imagery

**The product photograph is never generated.** The pack, the label and the
printed concentration are photographic, because a generated label is a
fabricated fact about a real product. The default (photographic) mode calls no
image model at all: the real photo is composited onto a flat brand canvas, so
there is only one photograph in the frame and nothing for a generated backdrop
to clash with.

**Creative mode**, opt in, adds a benefit checklist, a registry-backed stat
badge, and one generated prop graphic — the elements actually observed on the
brand's own homepage banners, which turn out to be a repeating template (kicker,
headline, divider, checklist, CTA) beside real product photography with a
*small* prop, not a painted scene. The product photo is given to the image
model as a reference for scale and colour only; the prompt repeatedly forbids
it from drawing the product itself, and that instruction is checked, not
trusted — the model is asked directly whether its own output resembles a
bottle, tube, jar or dropper, and the prop is discarded if so.

That check has two layers, mirroring the text scorer. A deny-list runs over the
marketer's style hint before an image model is ever called, which is the only
control that runs before the money is spent. The returned prop is then scored
against the policy rules. Image findings are tagged `image` rather than blended
in, because they have no span to verify and a reviewer should weight them
differently.

No generated testimonial, even though the reference banners have one: a model
supplying a reviewer's name and quote is inventing a customer, which is a
fabricated testimonial regardless of how the copy reads.

**Layout is checked, not just claims.** `lib/generator/artboard-geometry.ts`
holds every box position as data the renderer and the tests both read, checked
for the product never touching the canvas edge, a Story clearing Instagram's
own UI safe zones, and the creative-mode prop never landing behind the product.
Two real defects, a cropped product photo and a prop hidden behind an opaque
photo, shipped before this existed; both were caught by looking at the actual
render, not by reasoning about the layout math. See `docs/CORRECTIONS.md` C-007
and C-008.

## Commands

| Command | What |
|---|---|
| `npm run dev` | App on :3000 |
| `npm run eval` | Score the labelled set, print confusion matrix and per-rule breakdown |
| `npm run redteam` | Adversarial round: generate attack ads, score, log survivors |
| `npm run generate -- <url>` | The generator, headless. `--placements`, `--angle`, `--background generated` |
| `npm test` | Extraction, gate, citation and registry checks. Offline, no API key |
| `npm run snapshot` | Refresh the committed product snapshots |

## Layout

```
standard/          the product: rules, sources, substantiation registry
  claims.rules.yaml
  SOURCES.md
  claims-registry.yaml   19 claims, each verbatim-checked against a real page
  disclosures.yaml       text that must appear ON the creative
lib/scorer/        two-layer scorer, prompts assembled from standard/
lib/generator/     fetch, extract, copy, background, gate, placements
eval/dataset.jsonl 29 labelled ads, including hard negatives
docs/              decisions, failure modes, rule derivation, corrections
fixtures/          committed product snapshots and parser fixtures
```

## The written record

The two deliverable documents:

- [`docs/DECISIONS.md`](docs/DECISIONS.md) is the one-pager: the brand rules and
  how they were derived, what was cut and why, and the decision with the least
  confidence behind it.
- [`docs/FAILURE-MODES.md`](docs/FAILURE-MODES.md) is the three ways this costs
  money in production, with mitigations and whether each lands before or after
  launch.

Behind them, kept because the reasoning is the part worth reading:

- [`docs/RULE-DERIVATION.md`](docs/RULE-DERIVATION.md), how each rule was
  arrived at: what the corpus or the regulation actually supported, what
  severity was argued both ways, and which candidates were cut for lacking
  evidence.
- [`docs/DECISION-LOG.md`](docs/DECISION-LOG.md), every decision in long form
  with the alternatives rejected.
- [`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md), the fuller register
  of everything else known to be weak.
- [`docs/CORRECTIONS.md`](docs/CORRECTIONS.md), every claim in this build that
  turned out to be false, how it was caught and what changed: two regulatory
  citations confidently wrong before verification, a study filed against the
  wrong product, a legibility scrim that faded across the text it existed to
  protect. A tool that judges other people's claims should be able to show its
  own error rate.

Commits are the working record and are not squashed. The raw agent session
transcripts run to 64MB of mostly base64 image data, so they are submitted
alongside this repo rather than carried in every clone of it.
