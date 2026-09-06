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

| Rule | Provenance | Verified | Blocker |
|---|---|---|---|
| POLICY-001 | regulation | NO | Need D&MR Act 1954 schedule text |
| POLICY-002 | regulation | NO | Need ASCI Code chapter II text |
| POLICY-003 | inference | yes | none |
| TONE-001 | corpus | NO | Need corpus extraction |
| LANG-001 | corpus | NO | Need corpus extraction |

**5 rules, 1 verified.** The rulebook is a skeleton until this table is green.

## Open question about the brief

The brief states that claims are subject to "India's Drugs and Cosmetics rules
and the ASCI code." Cosmetics in India are governed by the Cosmetics Rules 2020,
framed under the Drugs and Cosmetics Act 1940. The sharper constraints on
advertising copy specifically are the D&MR Act 1954 and the CCPA Guidelines for
Prevention of Misleading Advertisements 2022.

The brief invited us to flag anything that reads wrong, so this is logged for the
decision doc. To be confirmed during verification, not asserted before.
