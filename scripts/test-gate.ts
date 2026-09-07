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
import { verifyClaimTrace, verifyStatBadge, adText } from "../lib/generator/copy";
import { sanitiseHint, buildPropPrompt } from "../lib/generator/creative";
import { PLACEMENT_LIST, canvasWordCount, fieldsFor, placement } from "../lib/generator/placements";
import {
  geometryFor,
  hasMargin,
  clearsStorySafeZone,
  overlaps,
  propAccentFor,
  MIN_MARGIN,
} from "../lib/generator/artboard-geometry";

const FACTS: ProductFacts = {
  url: "https://beminimalist.co/products/salicylic-acid-2",
  name: "Salicylic Acid 2% Face Serum",
  actives: [{ ingredient: "Salicylic Acid", concentration: "2%" }],
  statedBenefits: ["Reduces Acne, Blackheads & Excessive Oil"],
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

check("a hostile prop hint is stripped before it reaches an image model", () => {
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

check("the prop prompt refuses to draw the product, repeatedly and explicitly", () => {
  const p = buildPropPrompt(FACTS, "");
  for (const forbidden of ["DO NOT depict", "no people", "no product", "bottle, tube, jar", "PURE WHITE"]) {
    ok(p.includes(forbidden), `prompt should say "${forbidden}"`);
  }
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

check("the creative-mode prop never sits behind the product, on any layout", () => {
  // Regression: the first version centred a large prop on the product box.
  // On the split (square) layout, where the product fills up to 82 percent
  // of the canvas, that put the prop's own graphic directly behind the
  // opaque product photo. It rendered as nothing, because a prop hidden
  // behind an opaque photo is invisible and only its blank white margin
  // showed elsewhere, which multiplies away to nothing too. Caught by
  // looking at an actual render, not by reasoning about the layout math.
  for (const p of PLACEMENT_LIST) {
    const product = geometryFor(p).product;
    const prop = propAccentFor(p);
    ok(!overlaps(product, prop), `${p.id}: prop ${JSON.stringify(prop)} overlaps product ${JSON.stringify(product)}`);
    ok(hasMargin(prop, MIN_MARGIN), `${p.id}: prop box itself should clear the canvas edge too`);
  }
});

// --- Placements and the channel split --------------------------------------

check("the footnote does not count against the canvas word budget", () => {
  // It is fine print carrying the disclaimer. Counting it would push a
  // compliant ad over the limit for being compliant.
  const words = canvasWordCount({ headline: "one two three", footnote: "a b c d e f g h" });
  eq(words, 3, "word count");
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
