# Known limitations

The full register. `docs/FAILURE-MODES.md` carries the three that would actually
cost money in production, which is what the deliverable asks for; these are the
rest, kept because a tool that judges other people's claims should be able to
state the limits of its own.

Numbering is the original numbering, so references from `docs/CORRECTIONS.md`
and the rulebook still resolve. Items 1, 3, 4, 9 and 10 were promoted into
`docs/FAILURE-MODES.md` and are not repeated here.

---

## 2. Two load-bearing citations are secondary

Cosmetics Rules 2020 Rule 36 and the CDSCO notice of 18 May 2026 rest on
secondary publishers, because the government hosts refused automated retrieval
(HTTP 403 and a TLS failure). Both are flagged `source_confidence: secondary` in
the rulebook and listed in `docs/CORRECTIONS.md` C-004.

They are the anchor for `POLICY-001`, the single most-used BLOCK rule. If the
secondary text is wrong, the rule is wrong.

---

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

---

## 8. Image findings have no span verification

The anti-hallucination guarantee for text is that a model must quote the exact
substring it objects to, verified in code. An image has no substring. Image
findings carry a description instead and are tagged `target: "image"` so a
reviewer weights them differently, but the guarantee genuinely does not hold
there.

The deny-list that runs over the marketer's style hint before generation is a
word list, so a paraphrase gets through it. It is a cheap filter in front of an
expensive call, not a control.

---

---

## 8b. Creative mode's compositing has no rendered-layout check

Everything the deterministic scorer verifies is verified against the text or
the pixels of a generated image. Nothing verifies that the *composed* creative
is legible: that the product is inside the frame, that a caption clears a
platform's own safe zones, that a decorative prop does not end up hidden
behind an opaque photo.

That last one happened. The first version of the creative-mode prop was sized
and centred on the product's own bounding box, on the theory that it would
read as a motif surrounding the bottle. On the square placement, where the
product box fills up to 82 percent of the canvas, that put the prop's actual
graphic content directly behind the opaque product photo: invisible, because
a decoration behind an opaque photo is invisible, and only the prop's own
blank white margin showed elsewhere, which multiplies away to nothing against
a light canvas. It shipped, passed every existing test, and rendered as an
empty flat panel. Caught by looking at the actual output, not by reasoning
about the position math, in response to a direct report that the generated
images did not look publication-ready.

**What now exists.** `lib/generator/artboard-geometry.ts` is the one place
box positions are computed, imported by both the component that renders them
and the tests that check them, so the two cannot silently disagree. It is
checked for: the product never touching the canvas edge, the copy column
staying in bounds, a Story clearing Instagram's own UI safe zones, and the
prop accent never overlapping the product box, on every placement.

**What this still does not cover.** The checks are geometric, not visual: they
assert non-overlapping rectangles, not "this looks good." A layout could pass
every one of these and still be an ugly composition. Font rendering, text
overflow within a box, and colour contrast between the copy and whatever sits
behind it are unchecked. The gate this session added catches wrong; it does
not yet catch merely mediocre.

---

---

## 11. The override log lives in one browser

WARN exports require a logged reason, and the log is `localStorage`. It is
per-browser and it is labelled as such in the interface. Production writes to
the review system.

A durable-looking audit trail that silently loses entries would be worse than
this, because people would rely on it.

---

---

## 12. Operational

- **Quota exhaustion fails closed.** If the policy call fails after a retry, the
  verdict is forced to BLOCK. Correct, and indistinguishable from a broken
  scorer unless the reason is surfaced, which is why it is. This cost an hour
  once already.
- **One placement.** 1080x1080 only. Each additional placement changes the copy
  budget and therefore the claim surface.
- **No auth, no persistence, no multi-tenancy.** Prototype scope.
