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
import { verifyClaimTrace, adText } from "../lib/generator/copy";
import { sanitiseHint, buildBackgroundPrompt } from "../lib/generator/background";

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
    copy: { headline: "h", subhead: "s", body: "b", cta: "c", footnote: "", caption: "", claimTrace: [] },
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
  return { headline: "Clear skin, earned", subhead: "", body, cta: "Shop Now", footnote: "", caption: "", claimTrace: trace };
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

check("grounding is not defeated by punctuation or case", () => {
  const copy = copyWith([{ claim: "reduces acne", supportedBy: "reduces  acne, blackheads & excessive oil" }]);
  eq(verifyClaimTrace(FACTS, copy), [], "whitespace and case are normalised");
});

check("the scored text is exactly what the artboard shows", () => {
  const copy = copyWith([]);
  eq(adText(copy), "Clear skin, earned\nReduces Acne, Blackheads & Excessive Oil\nShop Now", "ad text");
});

// --- Background layer 1 ----------------------------------------------------

check("a hostile background hint is stripped before it reaches an image model", () => {
  const s = sanitiseHint("dewy glowing skin close up, before and after transformation, clinical lab");
  eq(s.hint.includes("skin"), false, "skin removed");
  eq(s.hint.includes("glowing"), false, "glow removed");
  ok(s.rejected.length >= 6, `expected several rejections, got ${s.rejected.length}`);
  ok(s.rejected.every((r) => r.why.length > 0), "every rejection says why");
});

check("an innocent hint survives", () => {
  const s = sanitiseHint("warm terracotta ledge, soft morning light");
  eq(s.rejected, [], "nothing to reject");
  eq(s.hint, "warm terracotta ledge, soft morning light", "hint intact");
});

check("the background prompt always forbids the product and people", () => {
  const p = buildBackgroundPrompt(FACTS, "");
  for (const forbidden of ["no people", "no skin", "no product", "no text"]) {
    ok(p.includes(forbidden), `prompt should say "${forbidden}"`);
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
