/**
 * The generator, headless.
 *
 * The browser surface is the product, but a pipeline you can only exercise
 * through a UI is a pipeline you cannot debug, diff, or run twenty times to see
 * how often it produces a BLOCK. This is the seam.
 *
 *   npm run generate -- <product-url>
 *   npm run generate -- <url> --placements meta_story_9x16,pdp_listing_11x16
 *   npm run generate -- <url> --angle "monsoon, oily skin" --background generated
 *   npm run generate -- <url> --out bg.jpg     write the first backdrop to a file
 */
import { writeFileSync } from "node:fs";
import { generateAd, adText, type Attempt } from "../lib/generator";
import { PLACEMENTS, type PlacementId } from "../lib/generator/placements";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no local env; generation will fail loudly on the missing key */
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.error("usage: npm run generate -- <product-url> [--placements a,b] [--angle ...]");
  console.error("                          [--audience ...] [--background generated|plain] [--hint ...] [--out f.jpg]");
  console.error(`\nplacements: ${Object.keys(PLACEMENTS).join(", ")}`);
  process.exit(1);
}

const requested = (flag("placements") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
for (const p of requested) {
  if (!(p in PLACEMENTS)) {
    console.error(`Unknown placement "${p}". Known: ${Object.keys(PLACEMENTS).join(", ")}`);
    process.exit(1);
  }
}

const VERDICT_MARK = { PASS: "PASS ", WARN: "WARN ", BLOCK: "BLOCK" };

function printAttempt(a: Attempt, chosen: boolean) {
  console.log(`\n    attempt ${a.index + 1}  ${VERDICT_MARK[a.score.verdict]}${chosen ? "  <- shown" : ""}`);
  for (const line of adText(a.copy).split("\n")) console.log(`      | ${line}`);

  for (const f of a.score.findings) {
    const where = f.target === "image" ? "image" : `"${f.span}"`;
    console.log(`      ${f.severity.padEnd(5)} ${f.ruleId} [${f.layer}/${f.target}] ${where}`);
    console.log(`            ${f.explanation}`);
  }
  for (const u of a.ungrounded) console.log(`      UNGROUNDED "${u.claim}" <- ${u.supportedBy}`);
  for (const o of a.overLength) console.log(`      LAYOUT ${o}`);
}

async function main() {
  const run = await generateAd(url, {
    angle: flag("angle"),
    audience: flag("audience"),
    placements: requested.length ? (requested as PlacementId[]) : undefined,
    background: flag("background") === "generated" ? "generated" : "plain",
    backgroundHint: flag("hint"),
  });

  console.log(`\n${run.facts.name}`);
  console.log(`  facts: ${run.factsSource}${run.factsSource === "snapshot" ? ` (captured ${run.fetchedAt})` : ""}`);
  if (run.fallbackReason) console.log(`  fell back because: ${run.fallbackReason}`);
  for (const w of run.factWarnings) console.log(`  fact warning: ${w}`);
  console.log(`  actives: ${run.facts.actives.map((a) => `${a.ingredient} ${a.concentration}`).join(", ") || "(none)"}`);

  const out = flag("out");
  let wrote = false;

  for (const p of run.placements) {
    console.log(`\n${p.placement.label}  ${p.placement.width}x${p.placement.height}  [${p.placement.channel}]`);

    if (p.background) {
      console.log(`  background: ${p.background.model} at ${p.background.aspect}`);
      for (const r of p.background.hint.rejected) console.log(`  hint rejected "${r.phrase}": ${r.why}`);
      if (out && !wrote) {
        writeFileSync(out, Buffer.from(p.background.data, "base64"));
        console.log(`  background written to ${out}`);
        wrote = true;
      }
    }
    if (p.backgroundError) console.log(`  background failed: ${p.backgroundError}`);

    p.attempts.forEach((a, i) => printAttempt(a, i === p.chosen));

    console.log(`\n    gate: render=${p.decision.render} export=${p.decision.export}`);
    for (const r of p.decision.reasons) console.log(`      - ${r}`);
  }

  const s = run.summary;
  console.log(`\nsummary: ${s.total} placement(s), ${s.free} clean, ${s.override} need an override, ${s.blocked} blocked\n`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
