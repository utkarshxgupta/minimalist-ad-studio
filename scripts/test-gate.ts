/**
 * Gate tests.
 *
 * The generator behaves well, which is a problem for testing it: a hostile
 * brief asking for "permanently cures pigmentation" produced clean grounded
 * copy, so the BLOCK path never ran. A control you have never seen fire is a
 * control you are assuming, so these tests fire it directly.
 *
 * Layer 2 is not called. Everything here is either a pure function or the
 * deterministic layer of the scorer, so this runs offline with no API key and
 * gives the same answer every time.
 */
import { check, checkAsync, eq, ok, report } from "./assert";
import type { AdCopy, Finding, ProductFacts, ScoreResult, Verdict } from "../lib/types";
import { scoreAd } from "../lib/scorer";
import { avoidList, chooseBest, decide, shouldRetry, MAX_WARN_RETRIES, type Attempt } from "../lib/generator/gate";
import { verifyClaimTrace, verifyStatBadge, verifyIngredientSynergy, clearUnusedFields, adText } from "../lib/generator/copy";
import { sanitiseHint, buildScenePrompt } from "../lib/generator/creative";
import { PLACEMENT_LIST, fieldsFor, placement } from "../lib/generator/placements";
import { canvasWordCount } from "../lib/generator/ad-text";
import { tooWordyFor } from "../lib/generator/archetypes";
import { isFlat, luminance } from "../lib/generator/hero-backdrop";
import { findCorruptedPackText, editDistance } from "../lib/generator/pack-text";
import {
  geometryFor,
  hasMargin,
  clearsStorySafeZone,
  MIN_MARGIN,
} from "../lib/generator/artboard-geometry";

const FACTS: ProductFacts = {
  url: "https://beminimalist.co/products/salicylic-acid-2",
  name: "Salicylic Acid 2% Face Serum",
  actives: [{ ingredient: "Salicylic Acid", concentration: "2%" }],
  statedBenefits: ["Reduces Acne, Blackheads & Excessive Oil"],
  trustBadges: ["Fragrance Free", "Non-comedogenic", "pH: 3.2 - 4.0"],
  ingredientNotes: [{ ingredient: "Salicylic Acid", note: "A BHA that exfoliates inside the pore." }],
  audience: { concerns: "Acne, Blackheads", ageSuitability: "16+ years of age", timing: "AM & PM" },
  heroImageUrl: "https://cdn.shopify.com/x.png",
  rawText: "Salicylic Acid 2% Face Serum\nReduces Acne, Blackheads & Excessive Oil",
};

function finding(over: Partial<Finding>): Finding {
  return {
    ruleId: "POLICY-001",
    dimension: "policy",
    severity: "BLOCK",
    layer: "model",
    target: "text",
    span: "cures acne",
    explanation: "A cosmetic may not claim to cure.",
    suggestedFix: "Drop the claim.",
    ...over,
  };
}

function score(verdict: Verdict, findings: Finding[] = [], failed: ScoreResult["meta"]["dimensionsFailed"] = []): ScoreResult {
  return {
    verdict,
    dimensionScores: { policy: 100, tone: 100, language: 100 },
    findings,
    meta: {
      rulebookVersion: "test",
      model: "test",
      droppedFindings: 0,
      unverifiedRulesApplied: 0,
      dimensionsFailed: failed,
    },
  };
}

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    index: 0,
    copy: {
      headline: "h",
      subhead: "s",
      body: "b",
      cta: "c",
      footnote: "",
      caption: "",
      checklist: [],
      statBadge: {},
      benefitBreakdown: [],
      ingredientSynergy: [],
      audienceGrid: {},
      claimTrace: [],
    },
    score: score("PASS"),
    ungrounded: [],
    overLength: [],
    ...over,
  };
}

// --- The gate decision -----------------------------------------------------

check("a BLOCK renders nothing and exports nothing", () => {
  const d = decide(attempt({ score: score("BLOCK", [finding({})]) }));
  eq(d.render, false, "must not render a finished creative");
  eq(d.export, "blocked", "export");
  ok(d.reasons[0].startsWith("POLICY-001"), "the reason cites the rule, not a vibe");
});

check("a WARN renders but costs an override", () => {
  const d = decide(attempt({ score: score("WARN", [finding({ severity: "WARN", ruleId: "TONE-003" })]) }));
  eq(d.render, true, "render");
  eq(d.export, "override", "export");
});

check("a clean PASS exports freely", () => {
  eq(decide(attempt()).export, "free", "export");
});

check("an ungrounded claim costs an override even on a PASS", () => {
  // The scorer said nothing was wrong, but the generator could not point at
  // evidence for something it wrote. A human should look before this ships.
  const d = decide(attempt({ ungrounded: [{ claim: "clears acne overnight", supportedBy: "invented" }] }));
  eq(d.export, "override", "export");
  ok(d.reasons.some((r) => r.includes("Ungrounded")), "reason surfaced");
});

check("over-length copy is a layout note, not a compliance gate", () => {
  const d = decide(attempt({ overLength: ["headline is 74 characters, budget is 60"] }));
  eq(d.export, "free", "layout does not gate export");
  ok(d.reasons.some((r) => r.startsWith("Layout")), "but it is still reported");
});

check("an unrun policy check is never a pass", () => {
  const d = decide(attempt({ score: score("BLOCK", [], ["policy"]) }));
  eq(d.export, "blocked", "export");
  ok(d.reasons.some((r) => r.includes("did not run")), "says why");
});

// --- The retry loop --------------------------------------------------------

check("a BLOCK is never looped", () => {
  // Rewriting "cures acne" into "helps clear acne" does not improve compliance,
  // it finds phrasing the detector misses. The fix is to drop the claim.
  eq(shouldRetry(attempt({ score: score("BLOCK", [finding({})]) }), 0), false, "BLOCK must not retry");
});

check("a WARN loops, and stops at the cap", () => {
  const warn = attempt({ score: score("WARN", [finding({ severity: "WARN" })]) });
  eq(shouldRetry(warn, 0), true, "first retry");
  eq(shouldRetry(warn, MAX_WARN_RETRIES - 1), true, "last allowed retry");
  eq(shouldRetry(warn, MAX_WARN_RETRIES), false, "capped");
});

check("a PASS does not loop", () => {
  eq(shouldRetry(attempt(), 0), false, "nothing to fix");
});

check("the retry is told the problem, not the rejected sentence", () => {
  const a = attempt({
    score: score("WARN", [finding({ severity: "WARN", ruleId: "TONE-003", span: "miracle glow" })]),
    ungrounded: [{ claim: "overnight results", supportedBy: "" }],
  });
  const list = avoidList(a);
  ok(list.some((l) => l.startsWith("TONE-003")), "carries the rule");
  ok(list.some((l) => l.includes("Do not make it at all")), "ungrounded claims are dropped, not reworded");
});

// --- Choosing which attempt to show ----------------------------------------

check("a later attempt does not win just for being later", () => {
  const attempts = [
    attempt({ index: 0, score: score("WARN", [finding({ severity: "WARN" })]) }),
    attempt({ index: 1, score: score("WARN", [finding({ severity: "WARN" }), finding({ severity: "WARN" })]) }),
  ];
  eq(chooseBest(attempts), 0, "fewer findings wins");
});

check("a PASS beats a WARN whenever it appears", () => {
  const attempts = [
    attempt({ index: 0, score: score("WARN", [finding({ severity: "WARN" })]) }),
    attempt({ index: 1, score: score("PASS") }),
  ];
  eq(chooseBest(attempts), 1, "the clean attempt wins");
});

check("ties go to the earlier attempt", () => {
  eq(chooseBest([attempt({ index: 0 }), attempt({ index: 1 })]), 0, "no improvement is not an improvement");
});

// --- Claim grounding -------------------------------------------------------

function copyWith(trace: AdCopy["claimTrace"], body = "Reduces Acne, Blackheads & Excessive Oil"): AdCopy {
  return {
    headline: "Clear skin, earned",
    subhead: "",
    body,
    cta: "Shop Now",
    footnote: "",
    caption: "",
    checklist: [],
    statBadge: {},
    benefitBreakdown: [],
    ingredientSynergy: [],
    audienceGrid: {},
    claimTrace: trace,
  };
}

check("a claim traced to real page text verifies", () => {
  const copy = copyWith([{ claim: "Reduces Acne", supportedBy: "Reduces Acne, Blackheads & Excessive Oil" }]);
  eq(verifyClaimTrace(FACTS, copy), [], "should be grounded");
});

check("a claim traced to invented evidence is caught", () => {
  const copy = copyWith([{ claim: "Reduces Acne", supportedBy: "Clinically proven to cure acne in 3 days" }]);
  eq(verifyClaimTrace(FACTS, copy).length, 1, "invented support");
});

check("a trace entry for a claim not in the ad is caught", () => {
  // A decorative trace: the entry looks like diligence but points at nothing
  // the reader will ever see.
  const copy = copyWith([{ claim: "Doubles collagen", supportedBy: "Reduces Acne, Blackheads & Excessive Oil" }]);
  eq(verifyClaimTrace(FACTS, copy).length, 1, "claim absent from the copy");
});

check("a claim traced to the facts block as the prompt renders it verifies", () => {
  // Regression: the prompt lists actives as "Vitamin C: 10%" and the verifier
  // held only "Vitamin C 10%" / "10% Vitamin C". A model quoting the block
  // character for character, which is what it is told to do, was marked
  // ungrounded and pushed two clean ads into an override.
  const copy = copyWith(
    [{ claim: "Salicylic Acid 2%", supportedBy: "Salicylic Acid: 2%" }],
    "Salicylic Acid 2% clears pores"
  );
  eq(verifyClaimTrace(FACTS, copy), [], "colon form from the prompt should verify");
});

check("grounding is not defeated by punctuation or case", () => {
  const copy = copyWith([{ claim: "reduces acne", supportedBy: "reduces  acne, blackheads & excessive oil" }]);
  eq(verifyClaimTrace(FACTS, copy), [], "whitespace and case are normalised");
});

check("the scored text is exactly what the artboard shows", () => {
  const copy = copyWith([]);
  eq(adText(copy), "Clear skin, earned\nReduces Acne, Blackheads & Excessive Oil\nShop Now", "ad text");
});

// --- Creative-mode prop, layer 1 --------------------------------------------

check("a hostile art direction hint is stripped before it reaches an image model", () => {
  const s = sanitiseHint("dewy glowing skin close up, before and after transformation, clinical lab");
  eq(s.hint.includes("skin"), false, "skin removed");
  eq(s.hint.includes("glowing"), false, "glow removed");
  ok(s.rejected.length >= 6, `expected several rejections, got ${s.rejected.length}`);
  ok(s.rejected.every((r) => r.why.length > 0), "every rejection says why");
});

check("a badge/seal hint is stripped too", () => {
  // A generated certification seal is a fabricated credential, the same
  // failure class as a fabricated testimonial.
  const s = sanitiseHint("add a dermatologist approved badge and an award seal");
  ok(s.rejected.some((r) => /badge|seal|award/i.test(r.phrase)), "badge language rejected");
});

check("an innocent hint survives", () => {
  // "droplets" is deliberately not innocent: it is on the deny-list as a
  // moisture cue, so a genuinely innocent example has to avoid it too.
  const s = sanitiseHint("warm afternoon light, a soft matte surface");
  eq(s.rejected, [], "nothing to reject");
  eq(s.hint, "warm afternoon light, a soft matte surface", "hint intact");
});

check("the scene prompt forbids re-lettering the pack, at length", () => {
  // The one thing this mode can do that photographic mode cannot is quietly
  // change what a real product's label says. The prompt is not the control
  // that stops it, the image scorer and the gate are, but a prompt that does
  // not even ask is not a starting position worth defending.
  const p = buildScenePrompt(FACTS, placement("meta_square_1x1"), "");
  for (const required of [
    "DO NOT invent, re-letter",
    "concentration",
    "softly out of focus rather than guessing",
    "No people, no skin",
    "certification mark or rosette",
  ]) {
    ok(p.includes(required), `prompt should say "${required}"`);
  }
});

check("the scene prompt asks for the copy's own space, per layout", () => {
  // The frame and the type are composed against the same layout, so the model
  // is told where the words land instead of being left to fill the frame and
  // hope. A scene that puts visual incident under the headline produces copy
  // sitting on clutter, which no amount of scrim fixes.
  ok(buildScenePrompt(FACTS, placement("meta_square_1x1"), "").includes("LEFT half must stay"), "split");
  ok(buildScenePrompt(FACTS, placement("meta_story_9x16"), "").includes("TOP THIRD must stay"), "tall");
  ok(buildScenePrompt(FACTS, placement("pdp_listing_11x16"), "").includes("LOWER HALF must"), "stacked");
});

check("each placement gets a frame composed at its own aspect", () => {
  for (const p of PLACEMENT_LIST) {
    ok(buildScenePrompt(FACTS, p, "").includes(`Aspect ratio ${p.imageAspect}`), `${p.id} aspect`);
  }
});

check("a generated pack can never export freely, however clean the copy", () => {
  // The invariant 5 exception, charged at the gate. A model that redraws a
  // real label can alter a concentration in a way that reads as normal, and
  // there is no text check for a fact that only exists in pixels.
  const clean = decide(attempt());
  eq(clean.export, "free", "photographic mode with clean copy exports freely");

  const generated = decide(attempt({ packIsGenerated: true }));
  eq(generated.export, "override", "the same clean copy over a generated pack needs a human");
  eq(generated.render, true, "it still renders: this is a sign-off, not a block");
  ok(generated.reasons.some((r) => r.includes("rendered by an image model")), "and it says why");
});

// --- Claim grounding, creative-mode elements --------------------------------

check("a checklist item is grounded the same way a claim is, via the trace", () => {
  const copy = { ...copyWith([]), checklist: ["Reduces Acne, Blackheads & Excessive Oil"] };
  // adText includes the checklist, so a claimTrace entry pointing at it can verify.
  ok(adText(copy).includes("Reduces Acne, Blackheads & Excessive Oil"), "checklist item is scoreable text");
});

check("a stat badge matching this product's real registry entry is grounded", () => {
  // FACTS is Salicylic Acid 2% Face Serum, which SUB-002 in the real registry
  // backs with "93% subjects saw significant reduction in active acne".
  const copy = { ...copyWith([]), statBadge: { value: "93%", label: "reduction in active acne" } };
  eq(verifyStatBadge(FACTS, copy), [], "a real, registered figure for this product should verify");
});

check("a stat badge for a product with no registry entry is rejected", () => {
  const noStudy: ProductFacts = { ...FACTS, name: "A Product With No Registered Studies" };
  const copy = { ...copyWith([]), statBadge: { value: "99%", label: "made up" } };
  // Absence of registry data means absence of a badge, never a guess.
  eq(verifyStatBadge(noStudy, copy).length, 1, "no registry entry for this product, so ungrounded");
});

check("an empty stat badge needs no grounding", () => {
  eq(verifyStatBadge(FACTS, copyWith([])).length, 0, "nothing to check");
});

// --- The creative archetypes -------------------------------------------------

check("a synergy naming an ingredient the page describes is grounded", () => {
  const copy = {
    ...copyWith([]),
    ingredientSynergy: [{ ingredient: "Salicylic Acid", role: "exfoliates inside the pore" }],
  };
  eq(verifyIngredientSynergy(FACTS, copy), [], "the page's own ingredient tab names this one");
});

check("a synergy naming an ingredient the product does not contain is caught", () => {
  // The claim trace alone cannot catch this. An ingredient name is often a
  // single word that appears somewhere in a page of prose without being one of
  // this product's actives, so the name is checked against the ingredient tabs
  // directly rather than against the facts haystack.
  const copy = {
    ...copyWith([]),
    ingredientSynergy: [{ ingredient: "Retinol", role: "accelerates cell turnover" }],
  };
  eq(verifyIngredientSynergy(FACTS, copy).length, 1, "Retinol is not in this product");
});

check("matching an ingredient is not defeated by case or spacing", () => {
  const copy = { ...copyWith([]), ingredientSynergy: [{ ingredient: "salicylic  acid", role: "exfoliates" }] };
  eq(verifyIngredientSynergy(FACTS, copy), [], "normalised the same way every other check is");
});

check("every creative-mode block is text the scorer reads", () => {
  // A claim that only ever appears inside a mechanism sentence or a grid cell
  // is still printed on the finished creative. If adText did not carry it, the
  // scorer would pass an ad on the strength of the copy it happened to look at.
  const copy: AdCopy = {
    ...copyWith([]),
    benefitBreakdown: [{ verb: "FIGHTS ACNE", mechanism: "reduces p-acnes bacteria" }],
    ingredientSynergy: [{ ingredient: "Salicylic Acid", role: "exfoliates inside the pore" }],
    audienceGrid: { concerns: "Acne, Blackheads", timing: "AM & PM" },
  };
  const text = adText(copy);
  for (const fragment of ["FIGHTS ACNE", "reduces p-acnes bacteria", "exfoliates inside the pore", "AM & PM"]) {
    ok(text.includes(fragment), `adText should carry "${fragment}"`);
  }
});

const SQUARE = placement("meta_square_1x1");

function everyBlock(): AdCopy {
  return {
    ...copyWith([]),
    checklist: ["Fragrance Free"],
    statBadge: { value: "93%", label: "reduction in active acne" },
    benefitBreakdown: [{ verb: "FIGHTS ACNE", mechanism: "reduces p-acnes bacteria" }],
    ingredientSynergy: [{ ingredient: "Salicylic Acid", role: "exfoliates inside the pore" }],
    audienceGrid: { concerns: "invented", skinType: "invented", howToUse: "invented", timing: "invented" },
  };
}

check("only the chosen archetype's block survives, whatever the model returned", () => {
  // The prompt tells the model to leave the other blocks empty. This is what
  // makes that true when it does not listen, which matters because a stray
  // block is not a cosmetic problem: it is unrequested copy on a finished
  // creative that nobody asked a reviewer to look at.
  const mechanism = clearUnusedFields(everyBlock(), FACTS, SQUARE, "creative", "mechanism");
  eq(mechanism.checklist, [], "checklist dropped");
  eq(mechanism.statBadge, {}, "stat badge dropped");
  eq(mechanism.ingredientSynergy, [], "synergy dropped");
  eq(mechanism.benefitBreakdown.length, 1, "its own block kept");

  const synergy = clearUnusedFields(everyBlock(), FACTS, SQUARE, "creative", "synergy");
  eq(synergy.benefitBreakdown, [], "mechanism dropped");
  eq(synergy.ingredientSynergy.length, 1, "its own block kept");
});

check("photographic mode renders no creative block at all", () => {
  const copy = clearUnusedFields(everyBlock(), FACTS, SQUARE, "photographic", "mechanism");
  eq(copy.checklist, [], "checklist");
  eq(copy.statBadge, {}, "stat badge");
  eq(copy.benefitBreakdown, [], "mechanism");
  eq(copy.ingredientSynergy, [], "synergy");
  eq(copy.audienceGrid, {}, "audience grid");
});

check("the audience grid is taken from the facts, never from the model", () => {
  // Every value the model supplied here said "invented". None of them survive:
  // this content is already structured and exact on the product page, so it is
  // transcribed in code. A model asked to copy structured facts will usually
  // do it, and "usually" is not a control.
  const copy = clearUnusedFields(everyBlock(), FACTS, SQUARE, "creative", "audience");
  eq(copy.audienceGrid.concerns, "Acne, Blackheads", "concerns, verbatim from the page");
  eq(copy.audienceGrid.skinType, "16+ years of age", "the page's age suitability");
  eq(copy.audienceGrid.timing, "AM & PM", "timing");
  eq(copy.audienceGrid.howToUse, undefined, "a field the page does not state stays absent");
});

check("the wordy archetype is flagged for short formats and cleared for the listing", () => {
  // The advisory in the generator form and the layout note the generator
  // reports afterwards have to agree, or the form is lying to save a minute.
  for (const p of PLACEMENT_LIST) {
    const flagged = tooWordyFor("audience", p.canvasWordLimit);
    eq(flagged, p.channel === "meta", `${p.id} (limit ${p.canvasWordLimit})`);
  }
  eq(tooWordyFor("synergy", placement("meta_story_9x16").canvasWordLimit), false, "a short block is fine anywhere");
});

check("a product page stating no audience fields produces no grid", () => {
  const noAudience: ProductFacts = { ...FACTS, audience: undefined };
  const copy = clearUnusedFields(everyBlock(), noAudience, SQUARE, "creative", "audience");
  eq(copy.audienceGrid, {}, "nothing to show beats a grid of invented cells");
});

// --- Artboard geometry -------------------------------------------------------

check("the product never touches the canvas edge, on any layout", () => {
  for (const p of PLACEMENT_LIST) {
    const geo = geometryFor(p);
    ok(hasMargin(geo.product, MIN_MARGIN), `${p.id} product box: ${JSON.stringify(geo.product)}`);
  }
});

check("the copy column stays within the canvas on every layout", () => {
  for (const p of PLACEMENT_LIST) {
    const geo = geometryFor(p);
    ok(
      geo.copy.x >= 0 && geo.copy.y >= 0 && geo.copy.x + geo.copy.w <= 1.0001 && geo.copy.y + geo.copy.h <= 1.0001,
      `${p.id} copy box: ${JSON.stringify(geo.copy)}`
    );
  }
});

check("a Story clears Instagram's own UI safe zones", () => {
  // Regression: an earlier layout ran ink to y=1910 on a 1920 canvas, straight
  // through the zone Instagram overlays with the caption and reply bar.
  const geo = geometryFor(placement("meta_story_9x16"));
  ok(clearsStorySafeZone(geo.product), `product box intrudes on the safe zone: ${JSON.stringify(geo.product)}`);
  ok(clearsStorySafeZone(geo.copy), `copy box intrudes on the safe zone: ${JSON.stringify(geo.copy)}`);
});

// --- Pack text on a generated frame -----------------------------------------

check("a one-character corruption of a real ingredient name is caught", () => {
  // The case that motivated this check. The first creative-mode frame this
  // tool ever produced rendered "acetyi glucosamine" onto the label of a real
  // product that says acetyl, and the vision model, asked directly whether any
  // pack text looked misspelled, said no.
  const facts: ProductFacts = { ...FACTS, rawText: `${FACTS.rawText}
with matmarine + zinc + acetyl glucosamine` };
  const problems = findCorruptedPackText(["FACE SERUM", "with matmarine + zinc", "+ acetyi glucosamine"], facts);
  eq(problems.length, 1, "one corrupted word");
  eq(problems[0].rendered, "acetyi", "the word as rendered");
  eq(problems[0].probably, "acetyl", "what the product actually says");
});

check("the pack's real words are not flagged", () => {
  // False positives matter more than recall here: a check that rejects good
  // frames makes the mode unusable, and an unusable mode is not a control.
  eq(
    findCorruptedPackText(
      ["Salicylic Acid 2%", "FACE SERUM", "for all skin types", "30ml / 1 fl oz", "Minimalist"],
      FACTS
    ),
    [],
    "a correct label passes"
  );
});

check("a word the page never used is not a corruption of anything", () => {
  // Absence from the page is not evidence of a typo. Only a near-miss is.
  eq(findCorruptedPackText(["Ceramide Complex"], FACTS), [], "unrelated word, no near match");
});

check("short words are left alone", () => {
  // At four characters an edit distance of one is a different word, not a
  // typo, so "acid" against "acne" is not evidence of anything.
  eq(findCorruptedPackText(["acne"], FACTS), [], "too short to judge");
});

check("edit distance stops early rather than scoring the whole string", () => {
  eq(editDistance("acetyi", "acetyl", 1), 1, "one substitution");
  eq(editDistance("niacinamide", "niacinamide", 1), 0, "identical");
  ok(editDistance("niacinamide", "salicylic", 1) > 1, "unrelated words are past the bound");
});

// --- The photograph's own backdrop -------------------------------------------

check("four matching opaque corners read as one flat backdrop", () => {
  // The real niacinamide hero: RGB, no alpha, uniform #e5e9ea on every corner.
  const corner: [number, number, number, number] = [229, 233, 234, 255];
  ok(isFlat([corner, corner, corner, corner]), "a studio backdrop");
  ok(isFlat([corner, [231, 235, 236, 255], corner, [227, 231, 232, 255]]), "JPEG noise is tolerated");
});

check("a scene, a gradient or a cut-out is not adopted as a canvas", () => {
  const pale: [number, number, number, number] = [229, 233, 234, 255];
  ok(!isFlat([pale, [120, 90, 60, 255], pale, pale]), "corners that disagree are not one colour");
  ok(!isFlat([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "a cut-out image has no backdrop");
  ok(!isFlat([pale, pale, pale, [229, 233, 234, 10]]), "a transparent corner is not opaque");
});

check("a dark backdrop is refused, because the ink on top of it is near-black", () => {
  // A visible seam is a worse ad. Unreadable copy is a broken one, so the
  // brand canvas wins whenever adopting the photo's ground would cost legibility.
  ok(luminance(229, 233, 234) > 0.72, "the real studio backdrop is adopted");
  ok(luminance(24, 22, 20) < 0.72, "a near-black ground is refused");
});

// --- Placements and the channel split --------------------------------------

check("the footnote does not count against the canvas word budget", () => {
  // It is fine print carrying the disclaimer. Counting it would push a
  // compliant ad over the limit for being compliant.
  const copy: AdCopy = {
    ...copyWith([], ""),
    headline: "one two three",
    cta: "",
    footnote: "a b c d e f g h",
  };
  eq(canvasWordCount(copy), 3, "word count");
});

check("a creative-mode block counts against the canvas word budget", () => {
  // Regression, found by looking at a live run rather than by reasoning: the
  // count was assembled from a hand-written list of the four original fields,
  // so a mechanism block put roughly forty words on a Meta square whose limit
  // is fifteen and nothing was reported. Ink on the canvas is ink on the
  // canvas, whichever field it arrived in.
  const bare: AdCopy = { ...copyWith([], ""), headline: "one two three", cta: "" };
  const withBlock: AdCopy = {
    ...bare,
    benefitBreakdown: [{ verb: "REGULATES SEBUM", mechanism: "balances oil without stripping skin" }],
  };
  eq(canvasWordCount(bare), 3, "baseline");
  eq(canvasWordCount(withBlock), 10, "the mechanism block is counted too");
});

check("a placement only asks for the fields it renders", () => {
  const story = placement("meta_story_9x16");
  eq(fieldsFor(story).includes("body"), false, "a Story has no room for body copy");
  const pdp = placement("pdp_listing_11x16");
  eq(fieldsFor(pdp).includes("body"), true, "a listing image is where long copy belongs");
});

check("meta placements carry a caption, the listing image does not", () => {
  for (const p of PLACEMENT_LIST) {
    eq(p.hasCaption, p.channel === "meta", `${p.id} caption`);
  }
});

check("short formats get a tighter canvas budget than the studied one", () => {
  const story = placement("meta_story_9x16");
  const pdp = placement("pdp_listing_11x16");
  ok(story.canvasWordLimit < pdp.canvasWordLimit, "a Story is glanced at, a listing image is read");
  // The point of the split: substantiation takes words, so the short formats
  // are where evidence gets squeezed out.
  ok(story.canvasWordLimit <= 12, "story budget should be genuinely tight");
});

check("every placement declares an aspect an image model will accept", () => {
  const supported = new Set(["1:1", "4:5", "9:16", "3:4"]);
  for (const p of PLACEMENT_LIST) {
    ok(supported.has(p.imageAspect), `${p.id} asks for ${p.imageAspect}`);
    ok(p.width > 0 && p.height > 0, `${p.id} has real dimensions`);
    ok(Object.keys(p.fields).length > 0, `${p.id} renders at least one field`);
  }
});

// --- The deterministic layer, end to end -----------------------------------

async function main() {
await checkAsync("known-bad copy is blocked, and the gate refuses to render it", async () => {
  const bad = "Cures acne permanently. India's No.1 dermatologist recommended serum.";
  const result = await scoreAd(bad, { deterministicOnly: true });

  eq(result.verdict, "BLOCK", "verdict");
  ok(result.findings.length > 0, "should have findings");
  ok(
    result.findings.every((f) => /^(POLICY|TONE|LANG)-\d{3}$/.test(f.ruleId)),
    "every finding cites a rule id"
  );

  const d = decide(attempt({ score: result }));
  eq(d.render, false, "must not render");
  eq(d.export, "blocked", "must not export");
});

  await checkAsync("clean grounded copy passes the deterministic layer", async () => {
  const good = "Salicylic Acid 2% Face Serum\nReduces Acne, Blackheads & Excessive Oil\nShop Now";
  const result = await scoreAd(good, { deterministicOnly: true });
  eq(result.verdict, "PASS", `verdict, findings: ${JSON.stringify(result.findings.map((f) => f.ruleId))}`);
});

  report();
}

main();
