# Rule derivation record

How each rule in `standard/claims.rules.yaml` was arrived at: what the corpus or
the regulation actually supported, what severity was argued for and against, and
which candidates were cut. The shipped rulebook is the rulebook; this is the
reasoning behind it, kept because a rule nobody can interrogate is the thing
this project exists to replace.

Derived from 179 corpus observations and verified regulatory text. Severity was
the column that needed deciding, because severity is what the tool is asked to
defend.

Corpus: 130 observations from 8 beminimalist.co product pages, 49 from four
competitor brands (Mamaearth, The Derma Co, Plum, Foxtale), 1 absence record for
live ad copy (see `docs/CORRECTIONS.md` C-003).

## The governing finding

The brief says Minimalist "deliberately avoids the fear-based and
exaggerated-claim marketing common in the category." The corpus does not support
that as a rule.

> Minimalist: `"Reduces Acne, Blackheads & Excessive Oil"`
> The Derma Co: `"Reduces Acne & Blackheads"`

Same claim, same verb, same absence of hedging. A rulebook built on claim
strength flags the brand's own bestseller.

What separates them is **evidence linkage**. Across 130 Minimalist observations:
20 cite a study or lab test, 11 give a subject count, 9 give a timeframe, 6 name
the testing body. The competitor set makes comparable claims with none of that.

**Derived principle: a claim's legitimacy comes from the evidence attached to it,
not from its strength.** Every rule below follows from that.

---

## Policy (10) — legal and claims exposure

| ID | Rule | Sev | Provenance | Source |
|---|---|---|---|---|
| POLICY-001 | Therapeutic or treatment claim on a cosmetic | BLOCK | regulation | Cosmetics Rules 2020 r.36; CDSCO notice 18 May 2026 |
| POLICY-002 | Claim to treat a D&MR Schedule condition | BLOCK | regulation | D&MR Act 1954 s.3(d) + Schedule |
| POLICY-003 | Quantified efficacy claim without attached substantiation | BLOCK | corpus + regulation | ASCI Ch I 1.1, 1.2 |
| POLICY-004 | Superlative or ranking without substantiation | BLOCK | regulation | ASCI Ch I 1.1; Awards/Rankings guideline cl.7, 8 |
| POLICY-005 | Concentration not present in ProductFacts | BLOCK | inference | Front-of-pack disclosure practice |
| POLICY-006 | Comparative claim against an unnamed benchmark | WARN | regulation | ASCI Ch IV 4.1(a) |
| POLICY-007 | Approximation attached to a quantified claim | WARN | regulation | ASCI Ch I 1.1 |
| POLICY-008 | Absolute or permanence claim | BLOCK | regulation | ASCI Ch I 1.1; Cosmetics Rules 2020 r.36 |
| POLICY-009 | Testimonial presented as a typical result | **?** | regulation | ASCI Ch I 1.4 |
| POLICY-010 | Skin-tone discrimination framing, copy or imagery | BLOCK | regulation | ASCI Skin Lightening guideline cl.1 to 4 |

### POLICY-001, therapeutic claim
Mechanism is reclassification, not vocabulary: a therapeutic claim moves the
product out of the cosmetic category into drug licensing it does not hold.
Matcher: lexicon on `cures`, `heals`, `medicine for`, `treatment for`, `cure for`.
**Hard-negative risk, high.** `"Treats your skin to a lightweight layer of
hydration"` must pass. `treats` alone cannot be a term; require a following
condition noun.

### POLICY-002, Schedule condition
Narrow and specific. The Schedule does **not** contain acne, pigmentation, dark
spots, wrinkles or ageing. It does contain **Leucoderma**, Lupus, Trachoma.
Matcher: lexicon on `leucoderma`, `vitiligo`, `lupus`, `trachoma`.
Live exposure for the Alpha Arbutin line specifically. This rule is worth more
than the generic one it replaced.

### POLICY-003, unsubstantiated quantified efficacy claim
**The core rule.** Any numeric efficacy claim (a percentage of effect, or a
result within N days/weeks) must carry, in the same creative, at least one of:
subject count, study duration, or a named source.
Passes: `"93% subjects saw significant reduction in active acne in 4 weeks"`.
Fails: `"Glow in 3 Days*"`, `"fades dark spots in 14 days"`.
Layer 2 rule. Cannot be deterministic: it requires reading whether evidence is
present, not whether a pattern matches.

### POLICY-004, superlative or ranking
Regex, tightened. `\b(no\.?\s?1|number one|#1|india's (best|no)|world's most|most effective)\b`.
**`best` alone is deliberately excluded from the matcher.** `"Best used at
night"` is in the eval set as a hard negative precisely to stop this.
A ranking claim additionally requires published criteria and an undertaking of no
commercial relationship with the awarding body.

### POLICY-005, fabricated concentration
Every percentage in the ad must appear identically in `ProductFacts.actives`.
Layer 2, needs facts context. The worst single output this tool could produce on
a brand whose position is front-of-pack concentration disclosure.

### POLICY-006, unnamed comparative
**This rule flags Minimalist's own live copy.** Deliberate, per decision.
Observed: `"reduced melanin concentration significantly higher than the benchmark
product"`, `"~26% more hydration than the benchmark product"`, `"much higher than
40-50% content present in other Vitamin C derivatives"`.
ASCI 4.1(a) requires it be clear what is compared with what. An unnamed
"benchmark product" does not obviously clear that.
Proposed WARN not BLOCK: the underlying study exists and is cited, so the defect
is disclosure, not fabrication.

### POLICY-007, approximation on a quantified claim
From `"~26% more hydration"`. A tilde on a number that is presented as
objectively ascertainable. Matcher: `~\s*\d`, `up ?to \d+%`, `almost \d+%`.
Proposed WARN. Arguably pedantic; flagged as a candidate for cutting.

### POLICY-008, absolute or permanence
From `"bid adieu to acne & blemishes for good"` (Mamaearth).
Matcher: `permanently`, `forever`, `for good`, `guaranteed`, `100% (clear|free of acne)`, `never again`.

### POLICY-009, testimonial as typical result
Observed: `"Nothing else worked on my pimples and marks except this serum"`,
`"Just 2 months in and my skin is clearer than ever"`.
ASCI 1.4 prohibits misleading by implication. An untypical result presented
without qualification implies typicality.
Argument for BLOCK: it is a claim, and an unsubstantiated one.
Argument for WARN: the fix is a disclaimer, not a retraction, and BLOCK would
stop a large share of legitimate creative.
**Needs a decision.**

### POLICY-010, skin-tone discrimination
Applies to **imagery as well as copy**, per guideline cl.2 on pre-usage
depiction. This is the rule that makes generated backgrounds scoreable rather
than decorative. Layer 2, and the only rule that must run on the image input.

---

## Tone (4) — how it sounds

| ID | Rule | Sev | Provenance | Source |
|---|---|---|---|---|
| TONE-001 | Fear-based framing | WARN | corpus | 0 of 130 Minimalist observations; present in contrast set |
| TONE-002 | Social or romantic consequence framing | WARN | corpus + regulation | ASCI Skin Lightening cl.1 |
| TONE-003 | Hype register: intensifiers carrying no information | WARN | corpus | Clinical register across all 8 pages |
| TONE-004 | Emotional outcome asserted in place of mechanism | WARN | corpus | Mechanism named in the majority of benefit statements |

TONE-001 is now corpus-grounded rather than a restatement of the brief: zero fear
appeals across 130 Minimalist observations, against multiple in the contrast set.

TONE-003 note: `"superstar ingredient"` and `"baby-soft"` both appear in
Minimalist copy. The rule cannot be a blanket ban on colour. It targets
intensifiers that replace information, not intensifiers that accompany it.

---

## Language (4) — vocabulary and claim structure

| ID | Rule | Sev | Provenance | Source |
|---|---|---|---|---|
| LANG-001 | Concentration and ingredient must be adjacent | WARN | corpus | Both observed formats |
| LANG-002 | Appearance claims require hedging vocabulary | WARN | corpus | 14 hedge observations |
| LANG-003 | Name the active and what it does | WARN | corpus | Mechanism-first structure |
| LANG-004 | Actives-containing creative carries a safety note | WARN | corpus, **inconsistent** | Present on some pages, absent on others |

### LANG-001
Two formats observed, both valid: `"Niacinamide 10% Face Serum"` (ingredient
first, in titles) and `"Pure 10% Niacinamide"` (percentage first, in body).
The rule is adjacency, not order. A bare percentage with no adjacent ingredient
is the violation.

### LANG-004, cut as unsupported
The patch-test note `"The product has been evaluated for safety through patch
testing under the supervision of a Dermatologist"` appears on 2 of 4 pages in
batch A and is absent from the Niacinamide page. **The brand is not consistent
here, so the corpus does not support a rule.** Proposed as `inference`, not
`corpus`, or cut entirely. Candidate for the "what we cut" section.

---

## Decisions taken

1. **POLICY-009 severity: BLOCK.** A testimonial carrying a quantified or
   absolute claim is a substantiation problem wearing a customer's voice, and
   substantiation does not get an override.
2. **POLICY-007: kept.** Approximation on a quantified claim looked pedantic
   until the red team used it, hedging a number into deniability while keeping
   its persuasive force.
3. **LANG-004: cut.** The corpus did not support it, and a rule that cannot cite
   an observation is an opinion with a rule ID. LANG-003 was cut for the same
   reason at v1.1.0.

The shipped rulebook is 18 rules: 12 policy, 4 tone, 2 language.

## What is deliberately not proposed

- A rule against strong claim verbs. The corpus disproves it. See the governing
  finding.
- A rule derived from live ad copy. None could be retrieved. See C-003.
- Anything sourced to the CCPA 2022 guidelines. Primary text was not retrieved,
  so no rule rests on it.
