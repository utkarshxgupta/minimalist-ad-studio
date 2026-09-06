# Provenance

Every rule in `standard/` traces to a row here. Three kinds:

- **corpus**: observed on beminimalist.co product pages, packaging, or live ads.
  Verification means the pattern was seen in N real pages, and N is recorded.
- **regulation**: statute, rule, or code text. Verification means a human read
  the actual cited text and confirmed it says what the rule claims it says.
- **inference**: ours. Neither observed nor regulated. Verification is trivially
  true because we claim no external authority, but these are labelled so a
  reader can discount them accordingly.

A rule with `verified: false` does not run. This is deliberate. The failure this
guards against is a model producing a confident citation to a clause that does
not exist, which in a project about unsubstantiated claims would be fatal.

## Status

18 rules, all verified. Verbatim source text is in `regulatory-sources.md`;
corpus observations are in `corpus/raw/*.jsonl` (179 rows).

| Provenance | Rules | Confidence |
|---|---|---|
| regulation, primary source read | 8 | POLICY-002, 004, 006, 007, 008, 009, 010, 011 |
| regulation, secondary source only | 1 | POLICY-001 (Cosmetics Rules r.36 and CDSCO notice, both hosts 403'd) |
| corpus, observed | 8 | POLICY-003, TONE-001 to 004, LANG-001 to 003 |
| inference, ours | 1 | POLICY-005 |

TONE-002 draws on both a primary ASCI guideline and corpus absence.

**One rule rests on secondary sourcing.** POLICY-001 is the therapeutic-claim
rule, and it is a BLOCK. Its wording is consistently reproduced across
CDSCO-derived materials, but the gazette text itself was not retrieved. This is
the single weakest link in the rulebook and it is named as such in the decision
doc rather than left for a reader to discover.

## Cut deliberately

**LANG-004**, a safety-note rule. The patch-test disclaimer appears on 2 of 4
pages in corpus batch A and is absent from the Niacinamide page. The brand is
not consistent, so encoding it would have been manufacturing a pattern from
noise.

## Open question about the brief

The brief states that claims are subject to "India's Drugs and Cosmetics rules
and the ASCI code." Cosmetics in India are governed by the Cosmetics Rules 2020,
framed under the Drugs and Cosmetics Act 1940. The sharper constraints on
advertising copy specifically are the D&MR Act 1954 and the CCPA Guidelines for
Prevention of Misleading Advertisements 2022.

The brief invited us to flag anything that reads wrong, so this is logged for the
decision doc. To be confirmed during verification, not asserted before.
