/**
 * Eval harness.
 *
 * Runs the scorer against the labelled set and reports where it disagrees with
 * a human label. The headline metric is false positives, not recall: a scorer
 * that blocks everything is abandoned in week two, and abandonment is the
 * failure mode that actually costs money.
 *
 * This never amends a rule. It reports. A human decides whether the rule is
 * wrong or the label is wrong, because sometimes the label is wrong.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EvalCase, type Verdict } from "../lib/types";
import { loadRulebook } from "../lib/standard/loader";
import { scoreAd } from "../lib/scorer";

const VERDICTS: Verdict[] = ["PASS", "WARN", "BLOCK"];
const deterministicOnly = process.argv.includes("--deterministic-only");

function loadCases() {
  const raw = readFileSync(join(process.cwd(), "eval", "dataset.jsonl"), "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((line, i) => {
      const parsed = EvalCase.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(`eval/dataset.jsonl line ${i + 1} invalid:\n${parsed.error}`);
      }
      return parsed.data;
    });
}

const rank = (v: Verdict) => VERDICTS.indexOf(v);

async function main() {
  const book = loadRulebook();
  const cases = loadCases();

  console.log(`\nRulebook ${book.version}`);
  console.log(`  active:     ${book.active.length}`);
  console.log(`  inert:      ${book.unverified.length} (verified:false, not applied)`);
  if (book.unverified.length) {
    console.log(`  blocked on: ${book.unverified.map((r) => r.id).join(", ")}`);
  }
  console.log(`Cases: ${cases.length}${deterministicOnly ? "  [layer 1 only]" : ""}\n`);

  const matrix = new Map<string, number>();
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];
  const missedRules: string[] = [];

  for (const c of cases) {
    const result = await scoreAd(c.text, { deterministicOnly });
    const key = `${c.expectedVerdict}>${result.verdict}`;
    matrix.set(key, (matrix.get(key) ?? 0) + 1);

    const got = rank(result.verdict);
    const want = rank(c.expectedVerdict);

    if (got > want) {
      const rules = [...new Set(result.findings.map((f) => f.ruleId))].join(", ");
      falsePositives.push(
        `  ${c.id} [${c.source}] expected ${c.expectedVerdict}, got ${result.verdict} via ${rules}\n` +
          `      "${c.text.slice(0, 80)}"\n` +
          `      label rationale: ${c.rationale}`
      );
    } else if (got < want) {
      falseNegatives.push(
        `  ${c.id} [${c.source}] expected ${c.expectedVerdict}, got ${result.verdict}\n` +
          `      "${c.text.slice(0, 80)}"`
      );
    }

    const fired = new Set(result.findings.map((f) => f.ruleId));
    for (const expected of c.expectedRules) {
      if (!fired.has(expected)) missedRules.push(`  ${c.id}: expected ${expected} to fire`);
    }
  }

  console.log("Confusion (expected > actual)");
  for (const want of VERDICTS) {
    const row = VERDICTS.map((got) => {
      const n = matrix.get(`${want}>${got}`) ?? 0;
      return `${got}:${String(n).padStart(2)}`;
    }).join("  ");
    console.log(`  ${want.padEnd(5)} | ${row}`);
  }

  const exact = cases.filter((c, i) => i >= 0).length - falsePositives.length - falseNegatives.length;
  console.log(`\nExact verdict match: ${exact}/${cases.length}`);

  console.log(`\nFALSE POSITIVES (${falsePositives.length}) <- the metric that matters`);
  console.log(falsePositives.length ? falsePositives.join("\n") : "  none");

  console.log(`\nFalse negatives (${falseNegatives.length})`);
  console.log(falseNegatives.length ? falseNegatives.join("\n") : "  none");

  console.log(`\nExpected rules that did not fire (${missedRules.length})`);
  console.log(missedRules.length ? missedRules.join("\n") : "  none");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
