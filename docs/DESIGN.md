# Design record

Working design for the Nudge PM assignment. This is the internal record. The
one-page decision doc that ships as a deliverable is `docs/DECISIONS.md` and is
written last, against what actually got built.

## Problem restatement

Two halves, per the brief: producing creative is slow, and getting it through
brand and legal review is slow. The second half is the interesting one. The
brief says reviewers disagree with each other and rejected ads bounce for days,
which means the standard is unwritten. An unwritten standard cannot be applied
consistently, cannot be appealed against, and cannot be improved, because there
is nothing to amend.

Writing the standard down and versioning it is therefore the intervention. Both
surfaces are consumers of it.

## The standard

```
standard/
  claims.rules.yaml   # policy + claims. deterministic matchers where possible
  tone.md             # what Minimalist sounds like
  language.md         # vocabulary, claim structure, concentration formatting
  SOURCES.md          # provenance for every rule
```

Rule shape: `id`, `dimension`, `severity`, `provenance` (corpus | regulation |
inference), `source`, `rationale`, and either a deterministic `matcher` or
`guidance` text handed to the model.

The scorer's prompts are assembled from these files at runtime. That satisfies
the brief's request for "the prompts your app itself uses" while keeping the
substance in the rulebook rather than in a string literal.

### Derivation method

Two sources, kept separate and labelled, because the brief grades "the brand
rules you derived, and how you derived them."

**Corpus.** 10 to 15 real beminimalist.co product pages plus available ad copy.
Extract observed patterns: exact concentration formatting, which claim verbs
appear and which never do, competitor references, before/after usage,
dermatologist framing, hedging language.

**Regulation.** Cosmetics Rules 2020, Drugs & Magic Remedies (Objectionable
Advertisements) Act 1954 schedule, ASCI code chapter II on substantiation, CCPA
Guidelines for Prevention of Misleading Advertisements 2022. Cited per rule,
verified against source text.

Anything neither observed nor regulated is marked `inference`. A rulebook that
admits which part of itself is guesswork is worth more than one that does not.

**Note for the decision doc:** the brief says claims are subject to "India's
Drugs and Cosmetics rules and the ASCI code." Cosmetics are governed by the
Cosmetics Rules 2020 under the Drugs and Cosmetics Act; the sharper constraint
on ad copy is the D&MR Act plus the CCPA 2022 guidelines. The brief invited us
to flag anything that seems wrong, so this goes in.

## Part B: the scorer (built first)

Built before the generator, because the standard is the product and the
generator is a consumer of it. Building the consumer first would mean guessing
at the interface.

**Input.** Pasted text, or an uploaded image. The brief says it will be tested
with ads we have not seen, and real ads are pictures. Flash is multimodal so
image input is cheap. Stated limitation: layer 1 runs on extracted text only, so
image ads get weaker deterministic coverage.

**Layers.** Deterministic first, then three parallel model calls (policy, tone,
language). Findings tagged by layer.

**Output.** Verdict, three dimension scores, and a findings list where each item
carries severity, the exact flagged span, the rule ID violated, and a suggested
fix. No bare number anywhere: a single score tells a reviewer nothing.

## Part A: the generator

Product URL in, composed creative out.

- Fetch server-side in a route handler, which sidesteps the CORS problem the
  brief warns about. Manual paste and manual field entry remain as documented
  fallbacks.
- Scrape into structured `ProductFacts`: name, actives and concentrations,
  page-stated benefits, hero image URL.
- Copy generation constrained so every claim traces to a `ProductFacts` field.
- Compose in HTML/CSS over the real product photograph. Optional generated
  background, itself scored.
- Export to PNG.

**One placement, 1080x1080.** ~~Cut deliberately: each placement changes the
copy-length budget and therefore the claim surface, so supporting one properly
beats four badly.~~

**Superseded.** Four placements now, across two channels. The reasoning above
was right about the mechanism and wrong about the conclusion: because each
placement changes the claim surface, supporting one and rescaling it is the
unsafe option, not the conservative one. See "Build notes, the channel split".

### Build notes, fetch and extract

**Extraction uses no model at all.** The plan allowed a model to propose
`statedBenefits` under verbatim verification. It turned out not to be needed:
the storefront renders every content block as a `toggle-tab`, so the benefit
bullets, the per-ingredient concentrations and the substantiation notes are all
readable from structure. Fully deterministic `ProductFacts` is a stronger
position than model-proposed-then-verified, so the model path was dropped rather
than kept in case it was useful later. This matters more than it sounds: if a
model extracted the facts, a hallucinated fact would become a *licensed* claim,
and the grounding check in invariant 4 would certify the ad against fiction.

**The fetcher is host-allowlisted.** A server-side fetch of a user-supplied URL
is an SSRF primitive: type an internal address and the server retrieves it and
hands back the body. Only `beminimalist.co` is fetchable, and only over https. A
blocklist of private ranges is the weaker control, because it has to be complete
to work and an allowlist does not.

**Snapshots, not a cache.** Live first, committed `ProductFacts` snapshots as
fallback, and the result carries which path ran plus the capture date so the UI
can say so. `AD_STUDIO_OFFLINE=1` forces the snapshot path, which is how the
fallback is tested on purpose and how a reviewer with no network still sees the
pipeline work.

**Three parser bugs the first live run caught**, all now regression cases in
`npm run test:extract`: "Niacinamide 10% Face Serum" yielded a 10% active called
*Face*; the site header's "Save an additional up to 15% off" was read as a
formulation; and a letters-only tokeniser silently dropped "Vitamin B5" and
"Hyaluronic + PGA". The third is the instructive one, because it fails quietly.
The other two produce visible nonsense; that one just loses an ingredient, and
an ad written against incomplete facts is exactly what this pipeline is supposed
to prevent.

### Build notes, generation, imagery and the surfaces

**Copy runs warm, judgment runs cold.** The scorer is at temperature 0 because a
verdict that changes between runs is not a standard. Copy generation is at 0.85,
because a WARN retry at temperature 0 regenerates the identical ad and the retry
becomes theatre.

**The shown attempt is the best one, not the last one.** Retries are not
monotonically better: attempt 3 can introduce two WARNs while fixing one. The
whole chain stays visible in the UI, so the selection is auditable rather than
hidden.

**Ungrounded claims cost an override, but are not findings.** Invariant 1 says
every finding cites a rule ID, and there is no rule for "the generator could not
point at its evidence". So the claim trace produces a separate class of warning
that gates export without pretending to be a rule violation. This does leave a
real gap in the standard: the rulebook enforces invariant 4 only for
concentrations, via POLICY-005. A rule covering benefit claims absent from
`ProductFacts` looks worth adding, but adding rules is a human decision and the
eval has to be run either side of it, so it is recorded here rather than done.

**The product photograph is bled off the edge, not cut out.** The storefront
images are photographs on their own studio backgrounds, not transparent PNGs.
Composited as a rectangle over a generated backdrop the product reads as a
sticker. It is instead full-height against the right edge with its inner edge
faded into the backdrop, which also keeps the printed concentration on the label
legible, and the legibility of that label is the entire point of invariant 5.

**The photograph is proxied, not hotlinked.** PNG export rasterises the artboard
in the browser and a cross-origin image taints the canvas, so the export would
silently produce a creative with a hole where the product should be. The proxy
is host-allowlisted for the same reason the page fetcher is.

**The override log is in the browser, and says so.** A prototype that wrote
overrides to a module-level array on the server would look durable and lose
every entry on the next deploy. An audit trail nobody can trust is worse than
none, because people rely on it. Production writes to the review system; this
writes to `localStorage` with a label.

### Build notes, the channel split

Derived from an external audit of the brand's real asset library, covering
roughly 170 master assets and Meta Ad Library creatives. That is the corpus
`docs/CORRECTIONS.md` C-003 records as unobtainable here, so the findings below
come from a source this repo cannot independently verify, and are labelled
accordingly rather than absorbed silently.

**Taken, and load-bearing.** PDP listing infographics and Meta paid ads are
different formats, not one artefact at different sizes. The listing image is
studied by a buyer who has already clicked and runs 40 to 90 words; the feed ad
is scrolled past, keeps under 15 on the canvas, and moves the argument to the
caption. The 11:16 listing format dominates the brand's own library and was
absent here entirely.

This is a compliance finding, not a design one, and it points against intuition.
Substantiation costs words: the acne study claim is eleven of the fifteen a feed
ad gets. The short formats are therefore where evidence gets squeezed out, which
makes them the most dangerous placements the brand owns.

**Taken, with provenance recorded.** The substantiation footnote convention. The
requirement is sound and now enforced; the exact wording lives in
`standard/disclosures.yaml` flagged `secondary` and `verified: false`, because
it appears on none of the eight scraped product pages and is presumably an
ad-creative convention. A disclosure that misstates who ran the study is its own
problem, so it is not quietly hardcoded.

**Taken, not yet built.** The leading-zero concentration convention (`02%` on
packaging and creative, `2%` in website copy), the four sub-brand wordmarks, the
brand type stack and category tints, and the ten creative archetypes. The
archetypes are the largest remaining gap: this repo has three layout families
where the brand has ten recurring structures.

**Rejected.** The audit proposed a compliance linter built on a banned-substring
list, raising a hard error with no severity taxonomy, no rule IDs, no
provenance, and no evaluation. That is the design this project already argues
against: a term list misses every paraphrase, and the red team walked a ranking
claim past a regex by spacing it out. Its terms are worth folding in as
additional layer-1 matchers; the gate stays two-layer, rule-cited and evaluated.

Its "Meta 15-word rule" is also presented as platform policy. Meta's 20 percent
text rule was retired around 2021, so this is a performance heuristic. It is
implemented as `canvasWordLimit`, reported as a layout note, and never gates
export. Labelling matters: that is `inference`, not `regulation`.

**Corrected.** The audit's clinical percentages were transposed against the live
pages, attaching the larger number to the more aggressive claim. Checking it
against ours found a worse error in ours. See `docs/CORRECTIONS.md` C-006.

### Build notes, the compositing rewrite and creative mode

A user report that exported creatives did not look publication-ready, with
the product clipped out of frame and a visible seam behind it, was correct on
both counts. Neither was a tuning problem.

**The seam was architectural, not aesthetic.** The prior version generated a
full photoreal backdrop and composited the product photo over it with a
feathered edge, on the assumption that feathering hides a boundary. It hides
the boundary; it does not give two independently generated photographs a
shared light source or colour temperature, and the mismatch read as a visible
seam regardless of how the edge was treated. The fix removes the second
photograph rather than blending it better: the default (photographic) path
composites the real product photo onto a flat brand canvas token and calls no
image model at all. A flat colour cannot have a seam.

**The clipping was `object-fit: cover` doing exactly what it is told.** A
1100x1600 portrait product photo forced into a short landscape box, to fill
it edge to edge, crops whatever does not fit; for these products that was
routinely the cap or the base. Switched to `object-fit: contain` everywhere,
which cannot clip, at the cost of a smaller product with margin around it,
which is also what the brand's own packshots look like: fully contained, never
bled to the frame edge.

**Both were caught late because nothing checked geometry.** The gate checks
claims and policy; nothing checked whether the resulting layout was legible.
`lib/generator/artboard-geometry.ts` now holds every box position as data,
imported by both the renderer and the tests, and is checked for containment,
margin, and (for Stories) clearing Instagram's own UI safe zones.

**Creative mode was scoped from what the brand's real banners contain, not
from what "AI ad creativity" usually means.** The request was to feed the
product photo to an image model and push past a plain product-plus-text
format, referencing the brand's own homepage banners. Looking at those
banners rather than assuming: they are not painted scenes either. Each one is
the same template — a kicker, a headline, a divider, a benefit checklist with
checkmarks, a CTA — beside real product photography with a *small* physical
or graphic prop (a molecule motif woven through hair, a scatter of glass
droplets), on a near-flat canvas, occasionally a stat badge or a testimonial
card. So creative mode adds exactly those elements: a checklist, a
registry-backed stat badge, and one generated prop graphic, never a generated
environment.

**The product photo is given to the image model, honouring the letter of the
request, inside the boundary invariant 5 requires.** It rides along as a
reference image so the model can match scale and colour, with the prompt
repeatedly and explicitly forbidding the model from depicting the product
itself. That instruction is checked, not trusted: layer 2 asks the model
directly whether its own output contains anything resembling a bottle, tube,
jar, or dropper, and the prop is discarded outright if so. An instruction is
not a control in this codebase, on either surface.

**No testimonial card, even though the reference banners have one.** A
testimonial needs a real reviewer's name and real words. A model asked to
supply both is inventing a customer, which is a fabricated testimonial no
matter how the copy reads, and `POLICY-009`/`POLICY-010` exist for exactly
this failure mode. The component exists for a marketer to paste a real quote
into by hand; the generator does not write one.

**The prop hid behind the product on first render, for the same reason the
photo used to clip.** Sized and centred on the product's own box under the
assumption that it would read as surrounding the bottle, it landed directly
underneath the opaque product photo on the square placement, where the
product occupies up to 82 percent of the frame: invisible, with only its
blank white margin showing elsewhere, which multiplies away to nothing. Fixed
by deriving the prop's position from the same geometry module, placed beside
the product rather than behind it, with a test asserting the two boxes never
overlap on any placement. Caught, again, by looking at the render rather than
the layout math.

## How A and B connect: gate

The generator self-scores before it renders. A BLOCK-severity claims finding
means no finished creative is shown; the marketer gets the flagged span and a
fix instead. WARN renders, and export requires a logged override reason. PASS
exports freely.

Rejected alternatives: **advisor** (always render, score alongside) optimises
for speed, which is the cheap failure, over publishing correctness, which is the
expensive one. **Silent filter** (never show the score) hides the standard from
the person who most needs to learn it and makes the tool unauditable.

The override log is the artefact that replaces the Slack thread.

## Evaluation

25 to 30 labelled ads in `eval/dataset.jsonl`, each with an expected verdict and
a rationale. Composition:

- Real Minimalist ads (mostly PASS)
- Real competitor ads (mixed, several genuinely violate)
- Seeded violations, one per violation class
- **Hard negatives**: copy that sounds risky but is fine. These catch an
  over-eager scorer and are the most valuable rows in the set.

`npm run eval` prints a confusion matrix and a per-rule breakdown. The headline
metric is false positives, not recall.

## Loops

Three, at different layers.

1. **In-product**: WARN findings are loopable, capped at 2, chain logged. BLOCK
   findings are not. See CLAUDE.md.
2. **Dev-time**: a `PostToolUse` hook runs the eval on any write under
   `standard/`, so a rule change immediately shows its cost elsewhere.
   Automate the running, never the deciding.
3. **Red-team**: `npm run redteam` generates ads designed to slip past the
   scorer, scores them, and logs survivors for human triage. Committed as a
   script rather than run in the harness, because a loop that lives in the repo
   is a deliverable and a loop that lives in the harness is not.

## Stack

Next.js (App Router, TypeScript, Tailwind), deployed to Vercel with the Gemini
key as a server-side env var, so setup for a reviewer is zero minutes.
`npm i && npm run dev` documented as fallback. Gemini Flash for judgment, Gemini
image generation for backgrounds only.

## Schedule

| When | What |
|---|---|
| D1 AM | Repo, CLAUDE.md, eval harness, corpus research, rulebook v0 |
| D1 PM | Scorer, both layers, first eval run, iterate |
| D2 AM | Generator: fetch, extract, copy, compose, export |
| D2 PM | Gate, deploy, red-team rounds |
| D3 AM | Decision doc, failure modes, README, transcript export |
