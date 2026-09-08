# Failure modes

The three ways this costs money in production, what is already done about each,
and what is left. A tool that judges other people's claims should be able to
state the limits of its own.

The fuller register of everything else known to be weak is
`docs/KNOWN-LIMITATIONS.md`. This document is cited as the source of
`POLICY-012` in `standard/claims.rules.yaml`.

---

## 1. A PASS gets read as legal clearance, and it is not one

**The scenario.** A marketer generates an ad, sees PASS with three green
dimension scores, and ships it. The claim on it was lawful only in the sense
that beminimalist.co already says it.

**Why it happens.** Two independent paths, and they compound:

- Copy generation is constrained to `ProductFacts`, and `ProductFacts` is the
  brand's own page copy. Where the page overclaims, grounded generation
  reproduces the overclaim, correctly cited to a page that should not have said
  it. That is partly deliberate: the tool's job is to stop the ad saying things
  the brand never said, not to be more conservative than the brand. But "it is
  on our website" has never been a defence.
- `POLICY-012` checks quantified claims against `standard/claims-registry.yaml`,
  and those 19 entries are extracted from **product page copy**, which is the
  brand's marketing summary of its studies rather than the study reports. Sample
  size, methodology, controls and panel representativeness are all unknown.
  `SUB-001` is the exception and shows the standard the rest should meet: a
  named lab, a named ISO standard, a study number.

So the registry currently answers "did the brand publish this claim", not "is
this claim substantiated". Those are different questions.

**Mitigation, pre-launch.** Rename the verdict in the interface: PASS should
read as "consistent with the product page", not as clearance. Every
registry entry gets a `provenance` field distinguishing a study report from a
page summary, and `POLICY-012` treats a page-summary citation as WARN rather
than PASS, which forces the override log to record who accepted it.

**Mitigation, post-launch.** The registry needs an owner who holds the actual
studies, which is a process problem rather than a software one. Until that
exists, a quarterly reconciliation of registry entries against study reports,
with any entry that cannot be traced to a report demoted.

**Already done.** Provenance is labelled per rule; `npm run test:registry`
machine-checks every entry against the scraped facts, after a real error where a
study sat against the wrong product for four commits (`docs/CORRECTIONS.md`
C-006).

---

## 2. Creative mode prints a wrong fact onto a real product's pack

**The scenario.** Creative mode sends the real packshot to an image model, which
redraws the whole frame including the pack. An ad ships showing a Minimalist
bottle whose label states an ingredient or a concentration the product does not
have.

**Why it happens.** Image models are unreliable at small type, and a cosmetic
label is six lines of it. Measured on two products: one passed on the first
frame, the other failed three consecutive attempts, rendering `acetyi
glucosamine`, `mgtmarine` and `bakuchiol oll` onto a real label. The failure
rate tracks how much small print a pack carries, and no prompt fixes that.

This is a deliberate exception to the rule that the product photograph is never
generated, taken because the mode was explicitly asked for. It is the single
riskiest surface in the tool.

**Mitigation, pre-launch.** Three controls, all shipped, none sufficient alone:

1. The vision scorer is asked whether any pack text looks invented. It passed
   `acetyi glucosamine` clean on the first frame, so it is not trusted alone.
2. `lib/generator/pack-text.ts` has the model transcribe rather than judge, and
   decides in code: a word on the pack that is not in the product page's
   vocabulary but is one edit from a word that is, is a corruption. Failed
   frames regenerate, capped at three.
3. A creative-mode ad can never export freely. It always costs a logged human
   override, because there is no text check for a fact that exists only in
   pixels.

**The hole that remains.** The deterministic check catches corruptions of real
words, not plausible inventions: an ingredient that appears nowhere in the page
vocabulary and is not near any word in it passes silently. Closing it needs the
label read against a structured pack specification, which does not exist yet.

**Mitigation, post-launch.** Photographic mode stays the default and nothing in
its frame is generated. If override reasons show reviewers are approving
creative-mode frames without checking the label, the mode should be restricted
to compositions where the pack is deliberately out of focus.

---

## 3. The rulebook was derived from the wrong register, and validated against itself

**The scenario.** The tool is quietly lenient about exactly the copy it exists
to police, and nothing in the current numbers would reveal it.

**Why it happens.** Three confidence signals that all look stronger than they
are:

- **The corpus is product pages, not ads.** Real Minimalist ad copy could not be
  obtained: `standard/corpus/raw/minimalist-ads.jsonl` holds exactly one record,
  and that record is Meta's Ad Library returning HTTP 403, logged as an absence
  rather than dropped. Ad copy is shorter, more compressed and under more
  pressure to overclaim, so a rulebook built on page prose is systematically
  lenient about the register it is aimed at.
- **The eval is a fit.** 29/29 with zero false positives, on 29 cases the
  rulebook was iterated against. That measures fit, not generalisation.
- **The red team shares a model family with the scorer.** `npm run redteam` is
  Gemini attacking a Gemini-scored rulebook, so their blind spots correlate.
  This measures gameability, not safety.

**Mitigation, pre-launch.** State it, which is what this document is for, and
keep the hard-negative rows in the eval set, since false positives are the
metric that matters: a scorer that blocks good work is abandoned in week two,
and abandonment is the failure mode that actually costs money.

**Mitigation, post-launch.** Fifty real ads from the brand's archive, re-derive
the tone and language rules against them, and hold out a portion as a set the
rulebook is never tuned on. Then a red team from a different model family, so
the blind spots stop correlating. Until the ads exist, the override log is the
working instrument: a rule overridden repeatedly with reasons amounting to "this
is fine" is a wrong rule, and the log names it.
