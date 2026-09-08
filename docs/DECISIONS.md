# Decision doc

The rules this tool enforces and where they came from, what was deliberately
left out, and the decision least likely to survive contact with real data.
Every other decision, in long form with its rejected alternatives, is in
`docs/DECISION-LOG.md`.

The reading that drove everything: reviewers disagreeing while ads bounce for
days is not a speed problem, it is the absence of a written standard, which
cannot be applied consistently, appealed against, or improved. So `standard/` is
the product and `app/` is where it gets applied. Both surfaces read the same
rulebook, which is why they cannot disagree.

---

## 1. The brand rules, and how they were derived

**18 rules at v1.1.0.** 12 policy, 4 tone, 2 language. 9 BLOCK, 9 WARN.

Every rule carries its provenance, because the difference between a law and an
opinion is the thing a reviewer needs most and the thing a model erases:

| Provenance | Count | Meaning |
|---|---|---|
| `regulation` | 9 | Statute or code text, cited by clause |
| `corpus` | 7 | Observed on beminimalist.co |
| `inference` | 2 | Ours. Labelled, not laundered as law |

**Two independent derivation passes.**

*Corpus.* 179 recorded observations across 8 product pages and a competitor
contrast set, in `standard/corpus/raw/`. Extracted: concentration formatting,
which claim verbs appear and which never do, hedging vocabulary. Rules record
the observation count behind them, so "0 fear appeals across 130 observations"
is checkable rather than asserted.

*Regulation.* Cosmetics Rules 2020 Rule 36, the Drugs and Magic Remedies Act
1954 s.3(d) and Schedule, ASCI Code chapter II, CCPA Guidelines 2022. Cited per
rule in `standard/SOURCES.md`, with 11 citations read in primary text and 1
flagged `secondary` because the government host refused automated retrieval.

Anything neither observed nor regulated is marked `inference`. A rulebook that
admits which part of itself is guesswork is worth more than one that does not.

**Verification, because citations are where this fails.** Two were confidently
wrong before checking. One grounded "cures acne" in the D&MR Schedule, which
lists 54 conditions and does not include acne: the real mechanism is
reclassification out of the cosmetic category, not a banned word. The Act does
bite where it applies, and a brightening product claiming to treat leucoderma
engages s.3(d) directly, which for a brand selling Alpha Arbutin is a named
exposure. See `docs/CORRECTIONS.md` C-002.

## 2. What was cut, and why

- **A rewrite loop on BLOCK findings.** The obvious demo is an agent that fixes
  its own violations and shows a green tick. Turning "cures acne" into "helps
  clear acne" does not improve compliance, it finds phrasing the detector
  misses, which is Goodharting our own scorer. BLOCK means the claim is
  unsupported, so the fix is to drop it, and that is a person's decision. WARN
  loops, capped at two.
- **Free-form model critique.** It produces plausible, unfalsifiable objections:
  the Slack argument this tool exists to end, now with a machine's authority.
  Every finding cites a rule ID, and a finding citing a rule that does not exist
  is discarded in code.
- **One creative rescaled to four sizes.** Cheaper, and it silently truncates
  evidence exactly where evidence is scarcest. Substantiation costs words: a
  subject-count stat is eleven of the fifteen a feed ad gets, so short formats
  are the brand's most dangerous placements, not its most trivial. Copy is
  written and scored per placement.
- **A generated testimonial**, despite the brand's own banners having one.
  Inventing a reviewer's name and words is a fabricated testimonial however the
  copy reads, which is what POLICY-009 and POLICY-010 exist to catch.
- **RAG over the rulebook** (it fits in context; retrieval removes determinism),
  **agent frameworks** (they hide the judgment this project exists to show),
  **multi-agent debate** (unauditable), **LLM-as-judge** (labels beat a judge),
  **fine-tuning, vector DB, auth** (prototype scope).

## 3. The decision I have least confidence in

**That the 4 tone rules and 2 language rules describe the brand's advertising
voice at all.**

They are derived from product-page prose and enforced against ads, which are
different registers: ad copy is shorter, more compressed, and under more
pressure to overclaim. The gap is not hypothetical.
`standard/corpus/raw/minimalist-ads.jsonl` contains exactly one record, and that
record is the HTTP 403 from Meta's Ad Library, logged as an absence rather than
quietly dropped. So 6 of 18 rules generalise from the wrong corpus.

The failure this produces is not a missed violation, it is nagging: WARN
findings on copy that is actually on-brand. That matters more than it sounds,
because a scorer that objects to good work gets abandoned in week two, and
abandonment is the failure mode that actually costs money.

**How I would resolve it.** Fifty real ads from the brand's own archive, which
the brand has and this project does not, and re-derive the tone and language
rules against them. Until then the instrument is already built and running: WARN
exports require a logged override reason, so the override log is the evidence.
A tone rule that marketers override repeatedly, with reasons that amount to
"this is fine", is a wrong rule, and the log says which rule and how often. That
is a measurable disconfirmation rather than a matter of taste, and it needs no
new tooling to collect.
