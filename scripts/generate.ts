/**
 * The generator, headless.
 *
 * The browser surface is the product, but a pipeline you can only exercise
 * through a UI is a pipeline you cannot debug, diff, or run twenty times to see
 * how often it produces a BLOCK. This is the seam.
 *
 *   npm run generate -- <product-url>
 *   npm run generate -- <url> --angle "monsoon, oily skin" --background generated
 *   npm run generate -- <url> --out bg.jpg     write the backdrop to a file
 */
import { writeFileSync } from "node:fs";
import { generateAd, adText, type Attempt } from "../lib/generator";

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
  console.error("usage: npm run generate -- <product-url> [--angle ...] [--audience ...]");
  console.error("                          [--background generated|plain] [--hint ...] [--out file.jpg]");
  process.exit(1);
}

const VERDICT_MARK = { PASS: "PASS ", WARN: "WARN ", BLOCK: "BLOCK" };

function printAttempt(a: Attempt, chosen: boolean) {
  console.log(`\n  attempt ${a.index + 1}  ${VERDICT_MARK[a.score.verdict]}${chosen ? "  <- shown" : ""}`);
  for (const line of adText(a.copy).split("\n")) console.log(`    | ${line}`);

  for (const f of a.score.findings) {
    const where = f.target === "image" ? "image" : `"${f.span}"`;
    console.log(`    ${f.severity.padEnd(5)} ${f.ruleId} [${f.layer}/${f.target}] ${where}`);
    console.log(`          ${f.explanation}`);
  }
  for (const u of a.ungrounded) console.log(`    UNGROUNDED "${u.claim}" <- ${u.supportedBy}`);
  for (const o of a.overLength) console.log(`    LAYOUT ${o}`);
}

async function main() {
  const run = await generateAd(url, {
    angle: flag("angle"),
    audience: flag("audience"),
    background: flag("background") === "generated" ? "generated" : "plain",
    backgroundHint: flag("hint"),
  });

  console.log(`\n${run.facts.name}`);
  console.log(`  facts: ${run.factsSource}${run.factsSource === "snapshot" ? ` (captured ${run.fetchedAt})` : ""}`);
  if (run.fallbackReason) console.log(`  fell back because: ${run.fallbackReason}`);
  for (const w of run.factWarnings) console.log(`  fact warning: ${w}`);
  console.log(`  actives: ${run.facts.actives.map((a) => `${a.ingredient} ${a.concentration}`).join(", ") || "(none)"}`);

  if (run.background) {
    console.log(`  background: ${run.background.model}`);
    for (const r of run.background.hint.rejected) {
      console.log(`  hint rejected "${r.phrase}": ${r.why}`);
    }
    const out = flag("out");
    if (out) {
      writeFileSync(out, Buffer.from(run.background.data, "base64"));
      console.log(`  background written to ${out}`);
    }
  }
  if (run.backgroundError) console.log(`  background failed: ${run.backgroundError}`);

  run.attempts.forEach((a, i) => printAttempt(a, i === run.chosen));

  console.log(`\n  gate: render=${run.decision.render} export=${run.decision.export}`);
  for (const r of run.decision.reasons) console.log(`    - ${r}`);
  console.log("");
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
