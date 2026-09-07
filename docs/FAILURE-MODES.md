# Failure modes

Where this system is weak, stated plainly. A tool that judges other people's
claims should be able to state the limits of its own.

This document is cited as the source of `POLICY-012` in
`standard/claims.rules.yaml` and referenced from
`standard/claims-registry.yaml`. It should have been written when those
citations were made. See `docs/CORRECTIONS.md` C-005.

---

## 1. The corpus is product pages, not ad copy

The brand rules were derived from beminimalist.co product pages. Real Minimalist
ad copy could not be obtained: Meta Ad Library returned HTTP 403 to automated
retrieval, and trade press paraphrased campaigns rather than quoting them. Full
account in `docs/CORRECTIONS.md` C-003.

**Why it matters.** Ad copy and product-page copy are different registers. Ad
copy is shorter, more compressed, and under more pressure to overclaim. A
rulebook built on product pages may be systematically lenient about the exact
failure mode it exists to catch.

**What would fix it.** Fifty real ads from the brand's own archive, which the
brand has and we do not.

---

## 2. Two load-bearing citations are secondary

Cosmetics Rules 2020 Rule 36 and the CDSCO notice of 18 May 2026 rest on
secondary publishers, because the government hosts refused automated retrieval
(HTTP 403 and a TLS failure). Both are flagged `source_confidence: secondary` in
the rulebook and listed in `docs/CORRECTIONS.md` C-004.

They are the anchor for `POLICY-001`, the single most-used BLOCK rule. If the
secondary text is wrong, the rule is wrong.

---

## 3. The red team shares a model family with the scorer

`npm run redteam` is a white-box adversary: it sees the rulebook, because
attacking rules you cannot see mostly tests luck. It is also Gemini, scored by
Gemini, so their blind spots correlate.

**This measures gameability, not safety.** An attack that neither model thinks
of is invisible to the whole exercise.

Latest run, 24 attacks: 17 blocked, 6 downgraded to WARN by design, 1 escaped.
The escape was a ranking claim written as spaced-out characters, which the
matcher did not catch; the response was to move generalisation to model guidance
rather than chase spacing permutations in a regex, and to add the attack to the
eval set as a regression row.

Earlier runs in `redteam/runs/` show `outcome: (none)` because they predate the
outcome taxonomy. They are kept rather than deleted: the first run's headline
number was wrong, and the record of that is worth more than a tidy directory.

---

## 4. The eval set is a fit, not a generalisation result

29/29 with zero false positives sounds better than it is. The rulebook was
iterated against these 29 cases. A number produced on the set you tuned against
measures fit.

The hard-negative rows are the most valuable ones, because they catch
over-eager scoring, and false positives are the metric that matters here: a
scorer that blocks everything is abandoned in week two, and abandonment is the
failure mode that actually costs money.

---

## 5. Layer 2 is not reproducible

Layer 1 reruns identically forever. Layer 2 is a model, and the same ad can
score differently between runs. Every finding is tagged with the layer that
produced it so a reviewer knows which kind they are reading, but a WARN that
appears on Tuesday and not on Wednesday will still erode trust.

**Partly mitigated.** Temperature is 0, severity comes from the rulebook rather
than the model, and rules with a matcher are checked by layer 1 first with layer
1 winning on overlap.

---

## 6. Extraction is coupled to one storefront theme

`ProductFacts` is read from the DOM structure the Shopify theme currently
renders: `h1.product__title`, `span.product__subtitle`, `toggle-tab`. A theme
change breaks the selectors.

**How it fails.** Loudly for the product name, which is checked and falls back to
a committed snapshot. Quietly for benefits and concentrations, which would come
back empty and produce a warning the marketer has to read. A generated ad with
fewer facts behind it is a more constrained ad, not a wrong one, so this
degrades in the safe direction. It is still a maintenance burden, and it is the
reason `npm run test:extract` runs against committed page fixtures.

---

## 7. The claim trace can be escaped by omission

The generator declares which facts support which claims, and the declaration is
verified in code. A model escapes this by simply not declaring a claim.

**What closes it.** The scorer runs over the finished copy with the same facts
attached and does not care what the generator declared. The trace catches the
confident mistake; the scorer catches the convenient omission. Neither alone is
sufficient, which is why both run.

**What is still open.** The rulebook enforces invariant 4 only for
concentrations, via `POLICY-005`. There is no rule for a benefit claim absent
from `ProductFacts`, so an ungrounded benefit is surfaced as a generation
warning that costs an override, not as a rule violation. That gap is real and is
recorded in `docs/DESIGN.md` rather than closed, because adding a rule is a human
decision and the eval has to be run either side of it.

---

## 8. Image findings have no span verification

The anti-hallucination guarantee for text is that a model must quote the exact
substring it objects to, verified in code. An image has no substring. Image
findings carry a description instead and are tagged `target: "image"` so a
reviewer weights them differently, but the guarantee genuinely does not hold
there.

The deny-list that runs over the background hint before generation is a word
list, so a paraphrase gets through it. It is a cheap filter in front of an
expensive call, not a control.

---

## 9. The generator inherits the brand's own claim risk

Copy generation is constrained to `ProductFacts`, and `ProductFacts` is the
brand's own page copy. Where the page overclaims, grounded generation will
reproduce the overclaim, correctly cited to a page that should not have said it.

The scorer judges the result independently, which is the check, and this is
partly by design: the tool's job is not to be more conservative than the brand,
it is to stop the ad saying things the brand never said. But "it is on our
website" is not a legal defence, and a `PASS` here means "consistent with the
product page", not "certainly lawful".

---

## 10. The substantiation registry records marketing summaries, not studies

`standard/claims-registry.yaml` holds the studies this brand may cite.
`POLICY-012` checks citations against it. It now carries 19 entries covering
every consumer study published on the six scraped product pages, and every entry
is machine-checked against the scraped `ProductFacts` by `npm run test:registry`.

Two limits remain, and the second is the real one.

**Coverage.** Only products in the scraped catalogue are represented. A claim
absent from the registry reads as unsubstantiated, so an unscraped product's
real claims will produce false positives.

**Provenance.** Entries are extracted from **product page copy**, which is the
brand's own summary of its studies, not the study reports. "93% subjects saw
significant reduction in active acne in 4 weeks" is recorded because the page
says so, not because the report was read. Sample size, methodology, controls and
whether the panel was representative are all unknown here. `SUB-001` is the
exception and shows the standard the rest should meet: a named lab, a named ISO
standard, and a study number.

So the registry currently answers "did the brand publish this claim", not "is
this claim substantiated". Those are different questions, and closing the gap is
a process problem owned by whoever holds the studies, not a software one.

This was also where a real error lived for four commits: a study filed against
the wrong product, which `POLICY-012` would have used to certify an ad making a
claim that product never made. See `docs/CORRECTIONS.md` C-006.

---

## 11. The override log lives in one browser

WARN exports require a logged reason, and the log is `localStorage`. It is
per-browser and it is labelled as such in the interface. Production writes to
the review system.

A durable-looking audit trail that silently loses entries would be worse than
this, because people would rely on it.

---

## 12. Operational

- **Quota exhaustion fails closed.** If the policy call fails after a retry, the
  verdict is forced to BLOCK. Correct, and indistinguishable from a broken
  scorer unless the reason is surfaced, which is why it is. This cost an hour
  once already.
- **One placement.** 1080x1080 only. Each additional placement changes the copy
  budget and therefore the claim surface.
- **No auth, no persistence, no multi-tenancy.** Prototype scope.
