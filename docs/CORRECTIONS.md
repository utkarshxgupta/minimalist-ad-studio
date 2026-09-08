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

**Claimed.** The composited artboard had been checked: shortly beforehand
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
successfully once already, and still reported the compositing
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
and a stat badge, and three more content blocks were added, all of
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

---

## C-011: The rectangle was the shadow, not the colour

**Claimed.** C-010 reported the pasted-rectangle look solved: the canvas adopts
the photograph's own studio backdrop, two identical flat colours cannot seam,
verified by reading the rendered pixels on both sides of the boundary.

**Actual.** The colours did match, and the product still read as a rectangle
pasted onto the canvas, because the outline was never a colour boundary. The
artboard drew `filter: drop-shadow(...)` under the packshot to lift it off the
ground. That filter follows an image's alpha silhouette, which is correct for a
cut-out PNG and traces the bottle. Every hero image on beminimalist.co is
opaque RGB with no alpha at all, so there was no silhouette to follow and it
traced the image's four edges instead, drawing a soft box around the
photograph. The brand's photography already carries a real studio shadow under
the bottle, so the synthetic one was contributing nothing except the outline.

**How it was caught.** Reported by the user, who was still looking at a
rectangle after being told it was fixed.

**Fix.** `sampleBackdrop` returns whether the photograph has any transparency
at all, and the shadow is drawn only when it does. Verified by rendering, where
the product now sits on the canvas carrying only its own photographic shadow.

**What it says.** C-010 measured the thing it had just changed and declared the
symptom gone. Two pixel readings either side of the boundary proved the colours
matched, which was true, and said nothing about the defect the user had
actually described. Measuring your own fix is not the same as checking the
complaint.

---

## C-012: Two things acknowledged as gaps, then not built

**Claimed.** After the creative audit, a list of real gaps was written down and
worked through in priority order, starting with the creative archetypes.

**Actual.** Two items on that list were load-bearing and got skipped rather
than deprioritised, and both were things the user had asked for directly.

The first was typography. Every creative this tool has produced was set in
Geist, the app's own UI font, while beminimalist.co sets its entire site in
ProximaNovaRegular and ProximaNovaBold. Reading the live stylesheet to find
that out took one request, which is one more request than was made before
calling it a known gap and moving on.

The second was creative mode itself. The ask was explicit: give the product
image to an image model and let it generate the ad, breaking out of the packshot
and text format. What was built instead generated a small decorative prop and
composited it beside the untouched packshot, which is a packshot with a motif
next to it. The reasoning in the module was about invariant 5 and it was honest
reasoning, but the honest conclusion would have been to say the request
conflicts with an invariant and ask, not to quietly build the version that
avoided the conflict and describe it as creative mode.

**How it was caught.** Reported by the user, twice.

**Fix.** The artboard is set in the brand stack, naming Proxima Nova first so a
licensed machine renders the real face, with Figtree committed as the
substitute. Creative mode now sends the real product photograph to the image
model and renders the finished frame full-bleed with the copy typeset over it.
The invariant 5 exception is explicit, documented, and charged at the gate: a
creative-mode ad can never export freely.

**What it says.** Naming a gap is not the same as closing it, and a written
list of known gaps is a comfortable place for the hard ones to sit. Both of
these were cheap. Neither was hard. They were skipped because the archetypes
were more interesting to build.

---

## C-013: The image model cannot be trusted to re-letter a real label, and it said it could

**Claimed.** Creative mode's prompt forbids re-lettering the pack at length,
and the image scorer is asked directly whether any pack text looks invented,
misspelled or garbled. Between them, a corrupted label would be caught.

**Actual.** The first frame this mode ever produced rendered "acetyi
glucosamine" onto the label of a product that says acetyl glucosamine, and the
scorer, asked that exact question, answered no. The corruption is one character
in six-point type inside a photograph, which is precisely the kind of detail a
vision model glosses.

**How it was caught.** By zooming into the label of the first generated frame
rather than admiring the composition, having just written a comment claiming
this was the one thing that mattered most in this mode.

**Fix.** `lib/generator/pack-text.ts`. The model is asked to do the thing models
are reliable at, transcribing what it sees, and the judgment is made in code: a
word on the pack that is not in the product page's own vocabulary but is one
edit away from a word that is, is a corruption of it. Frames that fail are
discarded and regenerated, capped at three, because rejecting every frame is
indistinguishable from not having the feature.

**What it says.** Two live runs, two mangled labels; a third product passed
first time. The mode works, and its failure rate depends on how much small type
a given pack carries, which is not something a prompt can fix. That is the
whole argument for the mandatory override: the automated checks here are good
enough to catch what they catch, and nobody should be told they are enough.

---

## C-014: Two "Shop Now" buttons on every Meta ad

**Claimed.** The channel split was built carefully: Meta placements get a tight
canvas budget and put the argument in the caption, because a feed ad is
scrolled past and substantiation does not fit in fifteen words. The spec that
informed that split was read closely and its channel model adopted.

**Actual.** In that same spec, `call_to_action: "Shop Now"` sits inside
`meta_ad_copy`, a sibling of `headline` and `primary_text`. Those are Meta's own
ad fields, set in Ads Manager, not creative content. Meta renders that button
itself, in the grey link strip beneath the image, from a fixed list the
advertiser picks. The spec's compositing layers, 0 through 4, contain no CTA at
all.

The artboard painted a black "Shop Now" button onto every canvas. So every Meta
ad this tool produced shipped with two call-to-action buttons, ours and the
platform's, and spent words from a fifteen-word budget on the one Meta was
always going to draw. On the PDP listing image it was worse than redundant: it
told a reader who is already on the product page, a few hundred pixels from the
real buy button, to go shopping.

**How it was caught.** Reported by the user, asking whether I had forgotten what
the spec said about the CTA. Confirmed afterwards in the Meta Ad Library, where
every ad card shows the button drawn by Meta below the creative.

**But that is not how it was first caught.** Searching the transcript turned up
that the creative audit had already flagged "the burned-in CTA button", and that
I had answered it under a heading reading *Right, and I missed it*:

> The burned-in `Shop Now` button. Meta supplies a native CTA below the
> creative, so mine is redundant clutter. I would soften "never", plenty of
> brands do burn CTAs, especially organic, but on paid feed it is wrong.

In the same reply I proposed the fix, as one of a list of layout assertions:
"no burned CTA on paid Meta". Then I built none of it, and two sessions later
described the cause as a misreading. The diagnosis was correct the first time
and simply went unbuilt.

**Fix.** `Placement.ctaSurface` decides where the call to action lives:
`platform` for Meta, `none` for a PDP listing. The artboard draws no button.
`canvasText` no longer counts the CTA against the canvas budget, because it is
not on the canvas, while `adText` still carries it so it is still scored. The
value itself is constrained to Meta's own list rather than written freehand,
since a generator that produces "Discover the science" has produced something
nobody can select in Ads Manager. Both surfaces now present it as an ad field
beside the caption, not as a line of the creative.

**What it says.** There are two failures here and only one of them is
interesting.

The small one is reading a data contract as prose: `meta_ad_copy.call_to_action`
says where that value belongs in its own field name, and I mapped it onto the
nearest thing my model already had.

The real one is C-012 for the third time. I had already found this, written it
down, agreed with it in the strongest terms available, and specified the check
that would enforce it. What was missing was not analysis. Analysis is the part
of this job that feels like progress and costs nothing to produce; a written
list of correct observations reads like work and ships no ads. Every item on
that list should have become a test or a line in the docs the same day, because
an acknowledgement with no artefact attached to it is indistinguishable, one
session later, from never having noticed at all.

Worth noting what it took to surface: a background grep of my own transcript,
run for an unrelated reason and read after the fix had already shipped. Three
of these corrections now share this shape, which makes it the most persistent
defect in the project, and it is mine rather than the code's.

---

## C-015: The rest of the creative audit, worked through instead of agreed with

**Claimed.** The creative audit was answered point by point, sorted into what
it got right, what I had already found, and what was overstated. That reply was
accurate and it was not a fix.

**Actual.** Going back through the audit line by line, months of work later,
three of its findings were still live in the code:

*The brand wordmark.* The artboard set `M I N I M A L I S T` at 0.28em
tracking. The audit called it "artificial, wide letter-spacing"; the brand's own
spec puts the wordmark at **-0.01em**; and the live site settles it, because the
logo is sentence-case "Minimalist" in a heavy geometric cut, not letterspaced
capitals. I had waved this away as an unverifiable font claim. Verifying it
took one page load. It was also worse than a styling slip: the packshot in the
same frame carries the real logotype on the label, so every ad this tool
produced showed the wordmark twice, two different ways, inches apart.

*The packshot bounding box.* The audit asked for product cutouts capped at 65
percent of canvas height with generous edge padding. The split layout ran the
product to **82 percent** at a 5 percent margin, which is why that composition
read as a packshot with words beside it rather than an ad.

*The Story dead zone.* The audit described "all copy squeezed into the top
third, leaving a vacant center block". I fixed the half of that finding that
was a safe-zone violation, moved the product out of Instagram's UI band, and
left the band of empty canvas the move created. Clearing a safe zone is not the
same as composing the space that clearing it made.

Also outstanding and now closed: the scorecard's "missing monospace clinical
badges". The brand spec reserves a monospace face for concentrations, pH and
sub-labels, and the concentration pill was set in the headline face.

**Fix.** Wordmark set as the brand sets it. `MAX_PRODUCT_HEIGHT = 0.65` and
`MIN_MARGIN` raised to 0.08, both asserted for every placement. Story product
moved up to take back the vacant band. Concentrations and stat values set in
the lab monospace. Verified by rendering all four placements and reading the
pixels, not by looking.

**Left open deliberately.** The sub-brand lockups (SKIN SCIENCE, HAIR SCIENCE,
PEDIATRICS) are not built. That data is not in anything the product page
exposes to the extractor: it is printed on the pack in the photograph and
nowhere in the JSON, the tags, or the page copy. Printing "SKIN SCIENCE" under
the wordmark by inferring it from the product name would put a sub-brand on a
real company's ad on the strength of a guess, which is the exact failure class
this project exists to prevent. It needs a real SKU registry field, which is
what the spec proposes and what does not exist yet.

**What it says.** This is the second time in two sessions that going back to a
source document found live defects in code I had already "responded to". The
response is not the work. An audit finding is closed when a test asserts it or
the code visibly changed, and until then it is a note about something still
broken, however thoroughly it was agreed with.

---

## C-016: The canvas was matched to the packshot instead of the packshot being freed from its sweep

**Claimed.** C-010 and C-011 between them fixed the pasted-rectangle look: the
canvas adopts the photograph's own studio backdrop, and the synthetic shadow
that traced the image's four edges is gone.

**Actual.** A user's exported ad still had a grey rectangle round the bottle.
Measured: the export's canvas was #f6f5f2, the brand fallback, while the photo
box carried #e5e9ea, the exact colour the sampler should have adopted. So the
approach had not failed on that product, it had simply not run.

Two causes, both structural rather than unlucky:

*The cached image.* The artboard sampled the backdrop in the image's `onLoad`
handler. A cached photograph is already `complete` when React mounts, so no
load event fires and the handler never runs. That is not an edge case, it is
every render after the first.

*The approach itself.* Matching two colours only works while they agree
exactly. It cannot survive a photograph whose sweep is a gradient, it puts the
whole ad's ground at the mercy of whatever colour the photographer used, and
any timing gap anywhere shows up as the rectangle again.

**Fix.** Stop matching the sweep and remove it. `lib/generator/cutout.ts`
divides the photograph by its own backdrop colour, which maps the sweep to pure
white, and the artboard composites the result with `multiply`, under which
white is the identity. The sweep vanishes onto any light canvas, the bottle
comes through untouched, and the real cast shadow survives as a grey that
multiplies down onto the canvas the way a shadow falls on a surface. A hard
alpha cut-out was rejected: the label is brighter than the sweep, so a
luminance key computes negative opacity and makes the product's own label
transparent. The canvas is then free, so it is a quiet brand gradient rather
than a borrowed photographic grey. The cached-image path is handled with an
effect that samples on mount when the image is already complete.

**Two bugs found while fixing it, both introduced by the same work.** The
export guard added in C-015 assigned `img.onload`, which replaced the
artboard's own handler, so a wait added to make exports more faithful was
quietly making them less so; it uses `addEventListener` with a timeout now. And
the blend was first put on the `<img>`, which sits in a positioned wrapper with
a z-index: that opens a stacking context, a blend mode only composites against
backdrop painted inside its own context, and the packshot rendered completely
unblended. It belongs on the wrapper, where the backdrop is the canvas.

**What it says.** Both of the earlier fixes were verified by measuring the
thing I had just changed, and both times the measurement was true and the
complaint was still live. This one is verified differently: preview and export
were captured and their pixels compared, in a real browser, at the point the
sweep used to be.

**Not fixed, and not claimed to be.** Exporting is slow. Timings in dev ranged
from 17 seconds with no photograph at all to 40 and then 88 seconds with
progressively smaller ones, which is noise, not signal. The cost is somewhere
in rasterising the artboard through an SVG foreignObject and it predates all of
this. The real fix is server-side rendering in headless Chrome, which was
identified early in this project and still has not been built.

---

## C-017: The scrim faded across the copy, the wordmark was painted over, and the override reason was computed and discarded

**Claimed.** Creative mode composites the copy over the generated frame with a
legibility scrim, and the gate makes a human sign for a model-rendered pack.
Both were reported working after a visual check on one composite.

**Actual.** Three defects, all reported by the user against a real generated
ad, all present since creative mode shipped.

*The scrim faded across the text it existed to protect.* The gradient's opaque
end was pinned to the scrim box's own edge, and the copy sits at the far end of
that box on two of the three layouts, so the falloff ran through the words
rather than past them. Measured rather than eyeballed: the headline sat on 0.25
opacity on the stacked layouts, the wordmark on 0.00, and on the square the
line ends faded to 0.24. It looked fine in the one composite it was checked
against because that was the split layout, the single case where the copy
happens to sit at the opaque end.

*The wordmark was invisible in creative mode entirely.* It is `position:
absolute` with no z-index and sits first in the DOM; the full-bleed scene layer
is z-index 0 and comes later, so it painted straight over the brand mark. Every
creative-mode ad this tool has produced carried no wordmark at all.
Photographic mode never showed it, having no scene layer to be buried under.

*The override reason was computed and thrown away.* `decide()` builds six kinds
of reason and `app/page.tsx` rendered none of them: `grep -c reasons` returned
0. The UI said "Export requires a logged reason" and gave the marketer a
textarea. On a clean creative-mode ad, PASS verdict and no findings, the single
reason is the model-rendered pack, and it appeared nowhere on screen. The
marketer was asked to justify an override whose reason the tool would not tell
them, in a project whose entire argument is that a reviewer can point at the
rule.

**Fix.** `scrimFor` in artboard-geometry.ts derives the gradient from the copy
box, holding full strength from the opaque edge all the way to the copy's far
edge and only then falling away, so no part of the copy can sit in the falloff
on any layout. `needsWordmarkBand` adds a top band where the scrim leaves the
corner bare. The wordmark is lifted above the scene. The gate's reasons render
as a list above the override textarea. Three tests assert the copy is inside
the scrim, that the hold point clears the copy's far edge, and that the band
appears exactly on the layouts that need it.

**What it says.** The scrim was checked once, on one layout, by looking. Two
layouts out of three were broken and the arithmetic would have said so in
seconds. This is the fourth correction in this project caused by verifying a
layout with an eye rather than a number, and the fix is the same one that
worked every previous time: put the geometry in a module the tests can read.

The discarded reasons are a different failure and a worse one. Nothing was
wrong with the gate; it did its job and the interface silently dropped the
result. Worth stating plainly: a control whose output nobody renders is not a
control, it is a computation.

---

## C-018: The citation checker invented a filename and then failed the writer for it

**Claimed.** `npm run test:citations` verifies that every file path named in the
docs actually exists, so a correction that cites a file cannot quietly rot.

**Actual.** Its path pattern listed extensions as `md|ts|tsx|mjs|...`.
Alternation is first-match-wins, so `app/page.tsx` matched `.ts`, stopped, and
the checker went looking for a `page.ts` in that directory. It then reported
that file as missing, which it was, because the checker had just made it up.

Then it happened again, in this entry. The first draft of the paragraph above
wrote the invented path out in full, the checker read it as a citation, and the
correction describing the bug failed the same check for the same reason. The
path is written without its directory now, since the pattern requires a slash.
A checker that cannot tell a citation from a quotation of a wrong citation is
a real limit, and the cheap answer is not to write the wrong path down.

The bug sat latent for the life of the project: no doc had cited a `.tsx` file
until C-017 did. The first correct citation of a component was the thing that
broke it.

**How it was caught.** It failed the build during the C-017 verification pass,
one test out of 105, on a change that touched no rules and no docs tooling.

**Fix.** Longest extension first, plus a lookahead so a partial match cannot
truncate a path regardless of ordering. The ordering is now commented as
load-bearing rather than cosmetic, because it reads exactly like a tidy-up
someone would later "simplify" back into the bug.

**What it says.** The checker was written to stop the docs asserting things
that are not true, and its own failure mode was asserting something untrue with
more authority than the doc it was checking. Worth remembering when a check
disagrees with a human: the check is code, and code of this kind is usually
younger and less reviewed than what it is checking.

---

## C-019: The frame was asked to leave room, but never asked what colour, and never checked

**Claimed.** Creative mode reserves space for the type. `negativeSpaceFor`
gives each layout its own instruction, per placement, and a test asserts the
three differ.

**Actual.** It asked for an area that was "calm and close to empty", which is a
statement about composition and says nothing about value. A dark stone slab
satisfies it perfectly and near-black type is unreadable on one. With no
guarantee about tone and no measurement of what came back, the renderer's only
defence was a scrim strong enough for the worst frame the model might return,
applied to every frame including the ones that had handed over exactly the pale
quiet surface asked for. That is why the generated scene came out washed flat:
the scrim was insuring against a case nobody was checking for.

Suggested by the user, who asked whether prompting for a light area per
placement would work better. It does, but only with the second half attached.

**Fix.** The instruction now states the value as a hard requirement, and names
the top-left corner for the wordmark. `lib/generator/scene-tone.ts` then
measures what actually arrived: the copy region and the wordmark corner are
cropped from the returned frame and their mean brightness and brightness spread
are read with sharp, against the same copy box the artboard typesets into, so
check and render cannot drift. A frame that did not deliver is rejected and
regenerated through the existing capped loop, exactly like a frame with a
misspelled label.

The payoff is `scrimStrengthFor`. With a measurement in hand the scrim is sized
to the frame instead of to the worst case: a clean pale area gets 0.4 and keeps
its photograph, a workable but textured one gets 0.68, an unmeasured frame
still gets the old 0.92, because unmeasured is unknown rather than good.

**Two things found while building it, both mine.**

Sharp's `stats()` reads the image it was constructed with and ignores
operations queued ahead of it, so `sharp(image).extract(box).stats()` returns
statistics for the whole frame. The first version did that, and it was caught
only because the copy region and the wordmark corner came back identical to the
decimal, which two different crops of a photograph never are. It would
otherwise have looked like a working check while measuring the wrong thing.

And the relaxed thresholds were guessed at 210 brightness and 30 spread before
any frame had been measured. Both real frames came in under 210, so the
light-touch tier could never have fired: a threshold no observation can reach
is not a conservative default, it is dead code wearing the costume of a policy.
Recalibrated to 200 and 20 against measured frames, and the evidence is thin
enough to say so in the source: two frames, a pale concrete ledge at 206/12 and
a textured warm stone at 185/34.

**What it says.** "Ask the model for X" and "verify you got X" are separate
pieces of work, and this repo has now shipped the first without the second
three times: the label the prompt forbade re-lettering, the CTA the spec put in
a platform field, and now the reserved area. The instruction is the cheap half
and it always feels finished.

**Also worth noting**, because it cuts the other way: sharp is a real
dependency now, declared in package.json rather than borrowed from Next's own
tree, where a version bump could have removed it silently.
