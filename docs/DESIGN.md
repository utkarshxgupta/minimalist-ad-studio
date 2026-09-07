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

**One placement, 1080x1080.** Cut deliberately: each placement changes the
copy-length budget and therefore the claim surface, so supporting one properly
beats four badly.

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
