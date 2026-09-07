# Decisions

The judgment behind this build, and the alternatives that were rejected. Written
last, against what actually got built.

---

## The problem, restated

The brief describes the bottleneck as reviewers disagreeing with each other while
rejected ads bounce back and forth for days. That is worth reading twice, because
it does not describe a speed problem. Reviewers disagreeing is not slowness; it is
**the absence of a written standard**. An unwritten standard cannot be applied
consistently, cannot be appealed against, and cannot be improved, because there is
nothing to amend.

If that reading is right, then the fastest possible ad generator does not fix
this. Two marketers with a faster tool and no agreed standard argue at higher
throughput.

So the intervention is to write the standard down and version it, and to build
both surfaces as consumers of that one artefact. `standard/` is the product.
`app/` is where it gets applied.

## What was built

Two surfaces over one rulebook.

**Generate.** A product URL in, scored creatives out across four placements in
two channels. The page is fetched server-side, parsed into `ProductFacts`, copy
is generated against those facts and nothing else, a background is generated and
scored, and each creative self-scores before it renders.

**Review.** Paste any ad. Every finding cites a rule ID, quotes the exact words
it objects to, says why, and says what to do instead.

**The standard.** 18 rules at v1.1.0: 12 policy, 4 tone, 2 language; 9 BLOCK and
9 WARN. Provenance is labelled per rule: 9 from regulation, 7 observed in the
brand's own corpus, 2 our inference. 10 citations are primary text, 1 is
secondary and flagged as such. Derived from 179 recorded corpus observations.

---

## The decisions that mattered

### Every finding cites a rule ID

No finding may be produced by a model opinion that is not anchored to a written
rule. A finding citing a rule that does not exist is discarded in code.

*Rejected:* free-form model critique. It produces plausible, unfalsifiable
objections, which is precisely the Slack argument the tool is meant to end, now
with a machine's authority behind it.

### Severity is what the agent does alone, refuses, and escalates

| | |
|---|---|
| `PASS` | Acts alone. Exports freely. |
| `WARN` | Acts, with a logged reason. Brand tone and language. |
| `BLOCK` | Refuses and escalates. No finished creative is rendered. |

The line is drawn at legal and claims exposure, because the expensive failure in
marketing AI is publishing something wrong, not writing something bland. Tone is
a matter of taste and gets an override. Substantiation is not.

### A BLOCK is never auto-rewritten

If copy says "cures acne" and a rewrite loop turns it into "helps clear acne",
compliance did not improve. We found phrasing the detector misses, which is
Goodharting our own scorer. A BLOCK means the claim is unsupported, so the
correct action is to drop the claim, and dropping a claim is a decision a person
makes. WARN findings loop, capped at two retries, and the retry is told what was
wrong rather than shown the rejected sentence.

*Rejected:* the obvious demo, where the agent fixes its own violations and shows
a green tick. It demos better and is worse.

### Placements are formats, not sizes

A Meta feed ad is scrolled past and keeps under 15 words on the canvas, moving
the argument into the caption. An 11:16 PDP listing image is studied by a buyer
already zoomed in and runs 40 to 90 words. Copy is written and scored per
placement, never rescaled from one master.

This is a compliance decision wearing design clothes, and it points against
intuition. Substantiation costs words: "93% subjects saw significant reduction in
active acne in 4 weeks" is eleven of the fifteen a feed ad gets. The short
formats are therefore where evidence gets squeezed out, which makes them the most
dangerous placements the brand owns, not the most trivial.

*Rejected:* one creative rendered at four aspect ratios. It is the cheaper build
and it silently truncates the evidence exactly where evidence is scarcest.

### The disclaimer is part of the standard, and has to be legible

A quantified claim must carry its substantiation footnote on the creative, and
the footnote must sit with the claim it disclaims: on the canvas if the stat is
on the canvas, at the end of the caption if the stat is in the caption. A
disclaimer printed on an image whose claim lives in the caption satisfies nobody.

The wording lives in `standard/disclosures.yaml` marked `secondary` and
`verified: false`, because it appears on none of the scraped product pages and
comes from an external audit this repo cannot verify. The requirement is sound
regardless of the wording; a disclosure that misstates who ran the study is its
own problem, so it is not quietly hardcoded.

### A BLOCK does not get a finished-looking creative

The interface shows the copy as text with the flagged spans marked, and no
artboard. A composed creative carrying a warning is halfway to published:
somebody screenshots it, somebody else asks why not, and the argument restarts.

### Two layers, and each finding says which one it came from

Layer 1 is lexicon and pattern matching, and reruns identically forever. Layer 2
is Gemini Flash with the rulebook in context, one call per dimension in parallel.
6 rules run in layer 1, 16 in layer 2, and 4 in both, where layer 1 wins on
overlap because it is reproducible. Separate calls per dimension because a single
prompt doing three jobs bleeds: tone concerns contaminate legal judgments, and
you cannot tune one dimension without disturbing the others.

### Extraction uses no model at all

`ProductFacts` is the ground truth every generated claim is checked against. If a
model extracted the facts, a hallucinated fact would become a *licensed* claim:
the grounding check would look it up, find the invented entry, and certify the
ad. The check would still pass. It would just be checking against fiction. When
the parser cannot find a field it says so and leaves it empty.

### Claim grounding is enforced twice

The generator emits a claim trace, verified in code: the supporting text must
appear verbatim in the facts and the claim must appear verbatim in the ad. A
model escapes that by simply not declaring a claim, so the scorer then runs over
the finished copy with the same facts attached and does not care what the
generator declared. The trace catches the confident mistake. The scorer catches
the convenient omission.

### The product photograph is never generated

The pack, the label and the printed concentration are photographic. A generated
label is a fabricated fact about a real product, which is the same offence as a
fabricated claim and harder to spot. Only the environment behind it is generated,
and generated environments are scored, because a backdrop of dewy glowing skin is
an efficacy claim made in pixels instead of words.

### Fail closed

If the policy check fails after a retry, the verdict is forced to BLOCK. An
unrun compliance check must never read as a pass. This is surfaced with its
cause, because safe behaviour that hides why it happened is hard to tell from
broken behaviour, and that cost an hour once already.

### Deliberately not built

RAG over the rulebook (it fits in context; retrieval adds a failure mode and
removes determinism), agent frameworks (they hide the judgment this project
exists to make visible), multi-agent debate per ad (slower, costlier, and it
makes the standard unauditable), LLM-as-judge for evaluating the scorer (we have
human labels, and labels beat a judge), fine-tuning, vector DB, auth. One
placement, because each additional placement changes the copy budget and
therefore the claim surface.

---

## Where the brief looks wrong

The brief refers claims to "India's Drugs and Cosmetics rules and the ASCI code".
Cosmetics are governed by the Cosmetics Rules 2020 under that Act, but the
sharper constraint on ad copy is **Cosmetics Rules 2020 Rule 36** plus the
**CCPA Guidelines 2022**, with the Drugs and Magic Remedies Act biting narrowly
and specifically rather than generally.

That distinction was not free. An early rule grounded a prohibition on "cures
acne" in the D&MR Act Schedule. The Schedule lists 54 conditions and acne,
pigmentation, wrinkles and dandruff are not among them. The real mechanism is not
that "cure" is a banned word; it is that a therapeutic claim reclassifies the
product out of the cosmetic category and into drug licensing. The D&MR Act does
apply, but precisely: a brightening product straying into claiming to treat
**leucoderma** engages s.3(d) directly, which for a brand selling Alpha Arbutin
is a real and named exposure. Full account in `docs/CORRECTIONS.md` C-002.

---

## Evidence, and what it is worth

**Eval.** 29 labelled ads: 13 seeded violations, 9 hard negatives, 4 real
competitor ads, 3 real Minimalist ads. Current result is 29/29 exact verdict
match with **0 false positives**.

That number is a fit, not a generalisation result, and should be read that way.
The rulebook was iterated against these cases. The headline metric here is false
positives rather than recall, because a scorer that blocks everything is
abandoned in week two, and abandonment is the failure mode that actually costs
money.

**Red team.** A white-box adversary that sees the rulebook, at temperature 1.1,
because a red team at temperature 0 writes the same attacks every run. Latest
round: 24 attacks, 17 blocked, 6 downgraded to WARN by design, 1 escaped. The
escape was a ranking claim written as spaced-out characters; the response was to
move generalisation into model guidance rather than chase spacing permutations in
a regex, and to add the attack to the eval set as a regression row.

The attacker and the scorer are the same model family, so their blind spots
correlate. **This measures gameability, not safety.**

**Corrections.** Six logged in `docs/CORRECTIONS.md`, including two regulatory
citations that were confidently wrong before verification, one rule that cited an
internal document which did not exist, and one substantiation claim filed against
the wrong product. That last one is the instructive failure: POLICY-012 answers
"is the cited study one of ours", so a misfiled entry does not fail loudly, it
certifies an ad making a claim that product has never made. The rule verified ad
copy against the registry and nothing verified the registry against reality.
`npm run test:registry` now does, and the registry carries 19 entries each
checked verbatim against a real product page. A tool that judges other people's
claims should be able to show its own error rate.

Twelve known weaknesses are written down in `docs/FAILURE-MODES.md`. The one
worth reading first: `ProductFacts` is the brand's own page copy, so where the
page overclaims, grounded generation reproduces the overclaim. A PASS means
"consistent with the product page", not "certainly lawful".

---

## What I would do next, in order

1. **Build the creative archetypes.** An external audit of the brand's asset
   library identified ten recurring creative structures. This repo has three
   layout families. That is the largest single gap between what it produces and
   what the brand actually ships.
2. **Get 50 real ads from the brand's archive.** The tone and language rules were
   derived from product pages because ad copy could not be obtained. Those are
   different registers, and a rulebook built on the wrong one is systematically
   lenient about the exact failure it exists to catch.
3. **Close the grounding gap in the standard.** Invariant 4 is enforced by rule
   only for concentrations. A benefit claim absent from `ProductFacts` is
   currently a generation warning, not a finding. That rule should exist, and
   adding it needs the eval run either side.
4. **Give the registry an owner.** `standard/claims-registry.yaml` is populated
   from what product pages state, not from study reports. Until whoever holds the
   studies owns it, POLICY-012 will produce false positives on real claims.
5. **Image input on the review surface.** Real ads are pictures, and the tool
   currently reads text.
6. **An independent red team.** A different model family, so the blind spots stop
   correlating.
