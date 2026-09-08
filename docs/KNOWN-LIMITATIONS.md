# Known limitations

Everything else this system is weak at. The three that would actually cost money
in production are in `docs/FAILURE-MODES.md`; these are the rest, written down
because a tool that judges other people's claims should be able to state the
limits of its own.

---

## 1. Two load-bearing citations rest on secondary sources

Cosmetics Rules 2020 Rule 36 and the CDSCO notice of 18 May 2026 were read
through secondary publishers, because the government hosts refused automated
retrieval (HTTP 403 and a TLS failure). Both are flagged
`source_confidence: secondary` in the rulebook.

They anchor `POLICY-001`, the most-used BLOCK rule. If the secondary text
misstates the clause, the rule built on it is wrong. Every other regulatory
citation was read in primary text.

## 2. Layer 2 is not reproducible

Layer 1 reruns identically forever. Layer 2 is a model, and the same ad can
score differently between runs. Every finding is tagged with the layer that
produced it so a reviewer knows which kind they are reading, but a WARN that
appears on Tuesday and not on Wednesday still erodes trust.

**Partly mitigated.** Temperature is 0, severity comes from the rulebook rather
than from the model, and any rule with a deterministic matcher is decided by
layer 1, which wins on overlap.

## 3. Extraction is coupled to one storefront theme

`ProductFacts` is read from the DOM the Shopify theme currently renders:
`h1.product__title`, `span.product__subtitle`, `toggle-tab`. A theme change
breaks the selectors.

**How it fails.** Loudly for the product name, which is checked and falls back to
a committed snapshot. Quietly for benefits and concentrations, which come back
empty and produce a warning the marketer has to read. An ad generated from fewer
facts is a more constrained ad rather than a wrong one, so this degrades in the
safe direction. It is still a maintenance burden, and it is why
`npm run test:extract` runs against committed page fixtures.

## 4. The claim trace can be escaped by omission

The generator declares which facts support which claims, and that declaration is
verified in code. A model escapes it by simply not declaring a claim.

**What closes it.** The scorer runs over the finished copy with the same facts
attached and does not care what the generator declared. The trace catches the
confident mistake; the scorer catches the convenient omission. Neither alone is
sufficient, which is why both run.

**What is still open.** The rulebook enforces the grounding invariant only for
concentrations, via `POLICY-005`. There is no rule for a benefit claim absent
from `ProductFacts`, so an ungrounded benefit surfaces as a generation warning
that costs an override rather than as a rule violation. Closing that gap means
adding a rule, which is a human decision that needs the eval run either side of
it.

## 5. Image findings have no span verification

The anti-hallucination guarantee for text is that a model must quote the exact
substring it objects to, verified in code. An image has no substring. Image
findings carry a description instead and are tagged `target: "image"` so a
reviewer can weight them differently, but the guarantee does not hold there.

The deny-list that screens the marketer's art-direction hint before an image
model is called is a word list, so a paraphrase passes it. It is a cheap filter
in front of an expensive call, not a control.

## 6. The layout checks are geometric, not visual

Box positions live in `lib/generator/artboard-geometry.ts` as data that both the
renderer and the tests read, so the two cannot silently disagree. Asserted on
every placement: the product clears the canvas edge, the product never exceeds
65 percent of canvas height, the copy column stays in bounds, a Story clears
Instagram's own UI safe zones, and the legibility scrim covers the whole copy
region before it fades. On a generated frame, `lib/generator/scene-tone.ts`
additionally measures whether the area under the copy is pale and quiet enough
to take near-black type, and rejects frames that are not.

**What none of that covers.** These assert rectangles and pixel statistics, not
"this looks good". Text overflow within its box, whether a webfont actually
loaded before an export was captured, and the contrast of copy against the exact
pixels behind it are unchecked. A layout can satisfy every assertion here and
still be an ugly composition. The checks catch wrong; they do not catch
mediocre.

## 7. The override log lives in one browser

WARN and creative-mode exports require a logged reason, and that log is
`localStorage`. It is per-browser, and the interface says so. Production would
write to the review system.

A durable-looking audit trail that silently loses entries would be worse than an
obviously local one, because people would rely on it.

## 8. Operational

- **Quota exhaustion fails closed.** If the policy call fails after a retry, the
  verdict is forced to BLOCK. Correct, and indistinguishable from a broken
  scorer unless the reason is surfaced, which is why it is surfaced.
- **Four placements, one brand.** Each placement changes the copy budget and
  therefore the claim surface, so each is written and scored separately rather
  than rescaled. Adding a fifth is not free.
- **No auth, no persistence, no multi-tenancy.** Prototype scope.
