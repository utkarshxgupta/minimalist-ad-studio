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

---

## C-007: Exported creatives were not publication-ready, on the exact claim I had verified

**Claimed.** The composited artboard had been checked: earlier in this session
a live browser run showed a product photo cleanly contained on a flat backdrop,
and I reported the seam bug from an earlier iteration fixed.

**Actual, per the user's report and their own screenshots.** Three real defects
were live in the shipped compositing: the product photo was cropped out of
frame on several placements, the generated backdrop did not share a light
source or colour temperature with the product photo and read as a visible
seam, and an `SPF 50` pill badge wrapped its second line below its own border
in the *exported* PNG while looking correct in the live preview.

**How it was caught.** Not by me. The user attached three exported PNGs and
asked for an honest audit against real Minimalist creative, rather than
accepting my earlier "looks right" assessment. Measuring the actual pixels
(R-minus-B colour temperature across the frame, an in-browser decode of the
exported bytes) confirmed all three were real, not cosmetic.

**Root causes, and why each survived earlier review.**

1. Cropping was `object-fit: cover` forcing a 1100x1600 portrait photo into a
   landscape box, which crops whatever does not fit the box's own aspect. It
   had been visually checked at one placement (the 1:1 square) where the box
   aspect happened to be close enough to the photo's that the crop was mild;
   the 4:5 and 9:16 placements, checked less carefully, cropped the cap off.
2. The seam was architectural: two independently generated photographs
   (the real product photo and a generated photoreal backdrop) do not share a
   light source, and feathering the edge between them hides the boundary, not
   the mismatch.
3. The pill wrap was a preview-versus-export divergence: `html-to-image`
   clones the DOM for capture before webfonts are guaranteed ready, so the
   clone can compute different text metrics than the live page did. I had
   checked the live preview and never decoded an actual exported file.

**Fix.** Not a patch to the existing approach. The generated backdrop was
removed from the default path entirely, replaced with a flat brand-token
canvas that cannot produce a colour seam because there is only one photograph
in the frame. `object-fit: contain` replaced `cover` everywhere, which cannot
clip. Single-line elements got `white-space: nowrap`, and the export path now
awaits `document.fonts.ready` before capture. All three verified against the
actual exported bytes, decoded in-browser via canvas, not the preview: correct
dimensions, flat colour temperature across the whole frame, pill on one line.

**What it says about verification in this project.** I had a real check
(colour-temperature sampling, CDP export decoding) available and had used it
successfully once already this session, and still reported the compositing
fixed on visual impression alone at the next opportunity. The check existing
in the toolbox is not the same as running it every time the claim is "this
looks right."

---

## C-008: A geometry fix introduced the same failure it was fixing

**Claimed.** After C-007, the creative-mode prop graphic was repositioned to
sit "around" the product, verified by rendering the square placement and
confirming the exported bytes were pixel-correct.

**Actual.** The prop was sized and centred on the product's own bounding box.
On the square placement specifically, where the product occupies up to 82
percent of the canvas, that put the prop's own graphic content directly
underneath the opaque product photo. It rendered as an empty flat panel: the
prop was there, loaded, blending correctly, and completely invisible, because
a decoration positioned behind an opaque photo is invisible regardless of how
correctly everything else about it works.

**How it was caught.** Self-caught, this time. Re-verifying the fix by looking
at the actual composited render, the same discipline C-007 had just been about,
rather than trusting that "the pill wraps correctly now" meant the whole
composite was right.

**Fix.** `propAccentFor` in `lib/generator/artboard-geometry.ts` derives the
prop's box from the product's box on each layout, placed beside it with a
verified gap rather than centred on top of it, sized to whatever room actually
exists (a few percent of the frame on the tightest layout, meaningfully larger
on the others). A test asserts the two boxes never overlap, on every
placement, so this specific failure cannot silently return.

**What it says.** Two compositing bugs in the same session, from the same
underlying gap: nothing checked layout geometry, only claims and policy. That
gap is now closed with data both the renderer and the tests read from the same
module, but it took shipping the same class of bug twice, once past me, once
past my own fix, to close it.

---

## C-009: A canvas word limit that did not count half the canvas

**Claimed.** Every placement carries a canvas word budget, tight on the short
formats and generous on the PDP listing image, and the generator reports copy
that exceeds it as a layout note. That budget was described in the decisions
doc as the mechanism that keeps substantiation honest on formats too small to
carry it.

**Actual.** The count was assembled from a hand-written list of four field
names: headline, subhead, body, cta. Creative mode had since added a checklist
and a stat badge, and this session added three more content blocks, all of
which are printed on the creative exactly like the headline is. None of them
were counted. A live mechanism-archetype run put roughly forty words on a Meta
square whose limit is fifteen and reported nothing wrong, because the four
fields it did look at were within budget.

**How it was caught.** Running the three new archetypes against the live site
and reading the output, rather than trusting that the tests passing meant the
feature worked. The tests passed because they tested the four fields too.

**Fix.** `canvasWordCount` moved into `lib/generator/ad-text.ts` and is now
derived from `canvasText`, the same function that decides what is rendered.
There is no longer a list of field names to fall behind; anything that appears
on the canvas is counted because it is the canvas text that gets counted. The
archetype prompts were also told the block spends the budget, which took a
mechanism block from forty words to eight. A regression test asserts a content
block moves the count.

**What it says.** The same failure shape as C-006 and the grounding false
positive: two places encoding one fact, drifting apart quietly. The pattern in
all three fixes is identical, and it is the only fix that works. Derive the
second thing from the first instead of writing it down twice.

---

## C-010: The compositing rewrite fixed the generated backdrop and never looked at the photograph's

**Claimed.** The compositing rewrite (C-007) resolved the visible colour seam
by removing the generated backdrop entirely and compositing the product onto a
flat brand canvas, reasoning that a flat colour cannot have a seam.

**Actual.** It cannot have a seam with itself. The product photograph is not a
cut-out: every hero image on beminimalist.co is an opaque RGB PNG with a flat
studio backdrop baked in, and the niacinamide serum's is a uniform #e5e9ea.
Composited onto the brand's warm #f6f5f2 canvas, that draws a hard-edged cool
rectangle around the bottle on every single ad the tool produces. It is the
same defect the user originally reported as "the gradient doesn't feel
continuous", and it survived the rewrite that was carried out to fix it,
because the rewrite treated the generated backdrop as the only backdrop in the
frame.

**How it was caught.** Rendering the three new archetypes and looking at them,
where it was immediately obvious, then confirming it by reading the actual
corner pixels of the source PNG rather than judging by eye.

**Fix.** `lib/generator/hero-backdrop.ts` samples the photograph's own corners
and, when they agree and are light enough to keep near-black copy readable,
the canvas adopts that colour. Two identical flat colours cannot have a seam,
which is the same construction argument the flat canvas was chosen on,
finally applied to both photographs in the frame instead of one. A photograph
with a cut-out, gradient, or dark ground keeps the brand canvas.

**What it says.** C-007's reasoning was right and its scope was wrong. "A flat
colour cannot have a seam" was true of the canvas and said nothing about what
was being composited onto it, and the conclusion held for two more sessions
because nobody looked at a render and asked what the grey rectangle was.
