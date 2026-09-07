# Corrections log

Where the agent was wrong, how it was caught, and what changed. Kept because a
tool that judges other people's claims should be able to show its own error rate.

---

## C-001: Wrong ASCI chapter cited for substantiation

**Claimed.** Seed rule POLICY-002 cited "ASCI Code chapter II (substantiation)".

**Actual.** Chapter II of the ASCI Code is "Non-offensive to Public". The
substantiation requirement is **Chapter I, clause 1.1**. Confirmed against the
Code's own index and the clause text in the ASCI Codes and Guidelines Book PDF.

**How it was caught.** The verification pass, which exists specifically because
this class of error was predicted before any rule was written. A web search
returned Chapter I text in response to a query asking for Chapter II, and the
discrepancy was chased rather than smoothed over.

**Severity of the error.** High. A rule that polices unsubstantiated claims
while itself citing a non-existent authority would have been the single most
damaging thing in this submission.

**Fix.** Citation corrected to Chapter I clause 1.1, with verbatim text recorded
in `standard/regulatory-sources.md`.

---

## C-002: Wrong statute grounding for cure claims

**Claimed.** Seed rule POLICY-001 grounded a prohibition on "cures acne" in the
Schedule to the Drugs and Magic Remedies (Objectionable Advertisements) Act 1954.

**Actual.** The Schedule lists 54 diseases, disorders and conditions. Acne,
pimples, pigmentation, dark spots, wrinkles, skin ageing and dandruff are **not
among them**. The only skin-adjacent entries are Leucoderma, Lupus and Trachoma.
An acne cure claim is not a Schedule offence.

**How it was caught.** Fetching the actual Schedule instead of accepting the
plausible-sounding association between "cosmetic cure claims" and "the Act about
cure claims".

**What replaces it.** Two things, and the second is sharper than the original:

1. The correct general anchor is **Cosmetics Rules 2020, Rule 36** (prohibition
   against false or misleading claims), reinforced by the CDSCO public notice of
   18 May 2026 stating that cosmetics "shall not be used for therapeutic or
   medical treatment". The real mechanism is not that "cure" is a banned word;
   it is that a therapeutic claim reclassifies the product out of the cosmetic
   category and into drug licensing.
2. The D&MR Act does still bite, but narrowly and specifically: a brightening or
   pigmentation product that strays into claiming to treat **leucoderma** or
   vitiligo engages s.3(d) directly. For a brand selling Alpha Arbutin this is a
   real and named exposure, which is more useful than the generic rule we
   started with.

**Note.** The error made the rulebook look better sourced than it was. Citing a
famous statute is more persuasive than citing a rule from a 2020 instrument, and
that is precisely why it needed checking.

---

## C-003: Real Minimalist ad copy could not be obtained

**Not an error, but a limitation that changes what the rulebook can claim.**

The corpus agent tasked with live ad copy returned one observation, an absence
record, and no verbatim ad text. Meta Ad Library returned HTTP 403 to automated
retrieval on both attempted query forms. Trade press covered the brand
extensively but paraphrased campaigns rather than quoting headlines.

**Consequence for the standard.** Brand tone and brand language rules will be
derived from **product page copy**, not from ad copy. Those are different
registers: ad copy is shorter, more compressed, and under more pressure to
overclaim. A rulebook built only on product pages may be systematically lenient
about the exact failure mode it exists to catch.

This goes in the limitations section of the decision doc and in the failure modes
list. It is not papered over.

**Behaviour worth recording.** The agent declined to substitute product-page text
or the Instagram bio for ad copy, flagged a false lead (a Muse by Clios article
about The Ordinary, where "minimalist" was a style adjective), and rejected a
scraper site offering unattributable "recurring ad copy motifs". The negative
result is trustworthy because of what it refused to do.

---

## C-004: Sources that could not be retrieved

Recorded so that no reader assumes more verification happened than did.

| Source | Outcome | Consequence |
|---|---|---|
| indiacode.nic.in D&MR PDF | HTTP 403 | Section 3 obtained from indiankanoon instead |
| drugscontrol.org Cosmetics Rules 2020 PDF | HTTP 403 | Rule 36 is secondary-sourced |
| drugscontrol.py.gov.in D&MR PDF | TLS failure | Schedule obtained from legitquest instead |
| CCPA Guidelines 2022 gazette text | Not retrieved | No rule depends on it |

Rule 36 and the CDSCO notice are the two load-bearing citations that rest on
secondary sources. Both are flagged as such in `standard/regulatory-sources.md`.

---

## C-005: A rule cited a document that did not exist

**Claimed.** `POLICY-012` cited its source as "Ours. Response to a red-team
finding, see docs/FAILURE-MODES.md and standard/claims-registry.yaml."
`standard/claims-registry.yaml` also referred readers to
`docs/FAILURE-MODES.md`.

**Actual.** `docs/FAILURE-MODES.md` did not exist. It had been named in two
places across two commits and never written.

**How it was caught.** Grepping the repo for dangling cross-references while
building Part A, not by any check that exists in the project.

**Severity of the error.** Higher than it looks. This is the same failure the
whole project is about, committed by the project: an authority cited by name,
which a reader would reasonably assume had been checked, and which was not
there. C-001 and C-002 were wrong citations of external sources. This one is a
wrong citation of ourselves, which is worse, because there was no retrieval
failure to blame.

**Fix.** `docs/FAILURE-MODES.md` written, with the twelve known weaknesses of
the system including the four that Part A introduced.

**What it says about the process.** Regulatory citations were verified because a
working agreement in CLAUDE.md says to verify them. Internal citations had no
such rule, so nothing checked them. The lesson is not "be more careful"; it is
that the citations which got verified were the ones something forced.

---

## C-006: A substantiation claim was filed against the wrong product

**Claimed.** `SUB-004` in `standard/claims-registry.yaml` recorded "97% of
subjects said skin felt less oily throughout the day after 2 weeks" as a study
belonging to **Niacinamide 10% Face Serum**.

**Actual.** That study is on the **Salicylic Acid 2% Face Serum** page. The
Niacinamide page carries ingredient-mechanism copy and no consumer study at all,
so there was no percentage to attribute in the first place.

**How it was caught.** Cross-checking the registry against the scraped
`ProductFacts` while reviewing an external spec that had transposed the same
family of numbers. Not by any check in the project. The external spec's error is
what prompted looking; the error found was ours.

**Severity of the error.** High, and worse than a wrong number. `POLICY-012`
exists to answer "is the cited study one of ours". A misfiled entry does not
fail loudly: it means an ad for Niacinamide claiming "97% said skin felt less
oily" gets looked up, found, and **certified**. The rule works exactly as
designed and licenses a claim that product has never made.

**The shape of it.** `POLICY-012` verifies ad copy against the registry. Nothing
was verifying the registry against reality. The control had a control, and the
control did not. This is the same failure the registry was built to prevent,
displaced one level up, which is where these tend to hide.

**Fix.** Three things, because fixing only the entry would leave the hole.

1. `SUB-004` refiled against Salicylic Acid.
2. Every entry now carries `product_handle` and `verbatim`, so an entry states
   which product it belongs to and quotes the page text backing it.
3. `npm run test:registry` asserts every `verbatim` appears word for word in
   that product's `ProductFacts`, that handles are real products, and that no
   claim is filed against a product whose page contains no study. Verified by
   reintroducing the bug: it fails two checks independently.

**Also done, since the data was in hand.** The registry went from 7 entries to
19, every one verbatim-checked. `docs/FAILURE-MODES.md` section 10 warned that a
thin registry produces false positives on real claims, because a claim absent
from the registry reads as unsubstantiated. Twelve real claims were absent.

**What it says about the process.** The registry was described in its own header
as "a demonstration of the mechanism, not a complete registry", and that framing
made it feel exempt from checking. Demonstrations get graded too, and a wrong
example teaches the wrong thing.
