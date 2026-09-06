/**
 * Red-team loop.
 *
 * An adversarial writer produces ads designed to slip past this specific
 * rulebook. Each is scored. Anything the attacker intended as a violation and
 * the scorer let through is a SURVIVOR, and survivors are written to disk for a
 * human to triage.
 *
 * The loop does not amend rules. It cannot. A survivor is a candidate finding,
 * not a verdict: the attacker's self-label is unreliable, and roughly a third of
 * survivors in practice are the attacker producing compliant copy and calling it
 * an attack. Deciding which survivors are real gaps is the human's job, which is
 * the same rule the eval harness follows.
 *
 * White-box by design: the attacker is shown the rulebook. Attacking rules you
 * cannot see mostly tests luck. Attacking rules you can see tests whether they
 * are gameable, which is the question that matters for a tool that gates spend.
 *
 * KNOWN LIMITATION, stated rather than discovered later: the attacker and the
 * scorer are the same model family, so their blind spots correlate. A human
 * adversary, or a different model, would find things this loop cannot. This
 * measures gameability, not safety.
 *
 * Usage: npm run redteam -- --rounds 2 --count 12
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { loadRulebook } from "../lib/standard/loader";
import { scoreAd } from "../lib/scorer";
import { MODEL } from "../lib/scorer/model";
import type { ScoreResult } from "../lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* handled below */
}

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const ROUNDS = arg("rounds", 1);
const COUNT = arg("count", 12);
const OUT_DIR = join(process.cwd(), "redteam", "runs");

/**
 * Named strategies, so a run produces diverse attacks instead of twelve
 * variations of the same trick. Each is a real evasion pattern.
 */
const STRATEGIES = [
  "Paraphrase around the lexicon: express a prohibited claim without any word the matchers list.",
  "Implication: make the reader conclude the prohibited claim without stating it.",
  "Split the claim across two sentences so no single span contains a violation.",
  "Spacing and punctuation tricks on a ranking claim, e.g. spacing out the characters.",
  "Rhetorical question framing instead of assertion.",
  "Put the claim in a customer testimonial rather than in brand voice.",
  "Describe the visual rather than making the claim in copy.",
  "Comparative claim without using any comparison keyword the matchers list.",
  "Fear appeal dressed in clinical, informational register.",
  "State a fabricated concentration in words rather than digits.",
  "Attach a fake but plausible-sounding substantiation so it appears evidenced.",
  "Bury the violating claim inside otherwise exemplary, well-substantiated copy.",
];

const AttackSchema = {
  type: "object",
  properties: {
    attacks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          strategy: { type: "string" },
          ad: { type: "string" },
          intendedViolation: { type: "string" },
          targetRuleId: { type: "string" },
        },
        required: ["strategy", "ad", "intendedViolation", "targetRuleId"],
      },
    },
  },
  required: ["attacks"],
} as const;

const Attack = z.object({
  strategy: z.string(),
  ad: z.string(),
  intendedViolation: z.string(),
  targetRuleId: z.string(),
});
type Attack = z.infer<typeof Attack>;

function attackPrompt(rulesDigest: string, round: number, priorWins: string[]): string {
  return `You are a red-team adversary testing an ad compliance checker for
Minimalist, an Indian skincare brand. Your job is to write advertisements that a
competent human compliance reviewer WOULD reject, but that the rulebook below
might let through.

## The rulebook you are attacking

${rulesDigest}

## Your constraints

- Every ad must be something a real performance marketer might plausibly ship.
  Gibberish, obvious nonsense, and absurd claims are useless: they would never
  reach review, so getting them past the checker proves nothing.
- Each ad must contain a genuine violation that a human reviewer would catch.
  Do NOT submit compliant copy. An attack that is actually fine is a wasted slot
  and pollutes the results.
- State plainly what the violation is and which rule id it should have tripped.
- Keep each ad between 8 and 45 words, like real ad copy.

## Strategies to use, one per attack

${STRATEGIES.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${
  priorWins.length
    ? `\n## These got through in an earlier round. Build on what worked.\n\n${priorWins
        .map((w) => `- ${w}`)
        .join("\n")}\n`
    : ""
}
Produce exactly ${COUNT} attacks for round ${round}. Vary the product across
niacinamide, salicylic acid, vitamin C, retinol, alpha arbutin and sunscreen.`;
}

function digestRules(): string {
  const book = loadRulebook();
  return book.active
    .map((r) => `- ${r.id} [${r.severity}] ${r.title}: ${r.rationale.trim().slice(0, 180)}`)
    .join("\n");
}

async function generateAttacks(
  ai: GoogleGenAI,
  round: number,
  priorWins: string[]
): Promise<Attack[]> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: attackPrompt(digestRules(), round, priorWins),
    config: {
      responseMimeType: "application/json",
      responseSchema: AttackSchema,
      // Deliberately hot. A red team at temperature 0 writes the same twelve
      // attacks every run and stops being a red team.
      temperature: 1.1,
    },
  });
  const parsed = z.object({ attacks: z.array(Attack) }).safeParse(JSON.parse(res.text ?? "{}"));
  if (!parsed.success) throw new Error(`Attacker returned unparseable output: ${parsed.error}`);
  return parsed.data.attacks;
}

/**
 * The product catalogue, supplied as ProductFacts on every scoring call.
 *
 * Round 1 of this loop reported two POLICY-005 "gaps" that were nothing of the
 * kind: the harness scored with no facts, so the requires_facts gate correctly
 * withheld the rule, and a rule that cannot run looks exactly like a rule that
 * failed. A red team that does not give the defender its inputs measures the
 * harness, not the defence.
 *
 * Concentrations below are from the corpus, not invented.
 */
const CATALOGUE = JSON.stringify({
  products: [
    { name: "Niacinamide 10% Face Serum", actives: [{ ingredient: "Niacinamide", concentration: "10%" }, { ingredient: "Matmarine", concentration: "1%" }] },
    { name: "Salicylic Acid 2% Face Serum", actives: [{ ingredient: "Salicylic Acid", concentration: "2%" }] },
    { name: "Vitamin C 10% Face Serum", actives: [{ ingredient: "Ethyl Ascorbic Acid", concentration: "10%" }, { ingredient: "Acetyl Glucosamine", concentration: "1%" }] },
    { name: "Retinol 0.3% + Q10 Face Serum", actives: [{ ingredient: "Retinol", concentration: "0.3%" }, { ingredient: "Bakuchiol", concentration: "1%" }] },
    { name: "Alpha Arbutin 2% Face Serum", actives: [{ ingredient: "Alpha Arbutin", concentration: "2%" }] },
    { name: "Hyaluronic + PGA 2% Face Serum", actives: [{ ingredient: "Hyaluronic Acid + PGA", concentration: "2%" }] },
    { name: "Multi-Vitamin SPF 50 Sunscreen", actives: [{ ingredient: "SPF", concentration: "50" }] },
  ],
});

type Outcome = "blocked" | "downgraded" | "escaped";

interface Attempt extends Attack {
  round: number;
  verdict: ScoreResult["verdict"];
  firedRules: string[];
  targetFired: boolean;
  outcome: Outcome;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("No GEMINI_API_KEY. Put it in .env.local.");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const book = loadRulebook();

  console.log(`\nRed team vs rulebook ${book.version} (${book.active.length} active rules)`);
  console.log(`${ROUNDS} round(s), ${COUNT} attacks each, attacker on ${MODEL} at temp 1.1\n`);

  const all: Attempt[] = [];
  let priorWins: string[] = [];

  for (let round = 1; round <= ROUNDS; round++) {
    process.stdout.write(`Round ${round}: generating... `);
    const attacks = await generateAttacks(ai, round, priorWins);
    process.stdout.write(`${attacks.length} attacks, scoring... `);

    const attempts: Attempt[] = [];
    for (let i = 0; i < attacks.length; i += 4) {
      const batch = attacks.slice(i, i + 4);
      const scored = await Promise.all(
        batch.map(async (a) => {
          const result = await scoreAd(a.ad, { factsContext: CATALOGUE });
          const firedRules = [...new Set(result.findings.map((f) => f.ruleId))];
          const targetFired = firedRules.includes(a.targetRuleId);

          // Three outcomes, not two. Round 1 scored "anything not BLOCK" as a
          // survivor, which counted correct behaviour as failure: TONE rules and
          // POLICY-006 are WARN by design, so an attack they catch at WARN is the
          // system working, not the system losing.
          //
          //   blocked    - the target rule fired and the ad was stopped
          //   downgraded - the target rule fired, but only to WARN, so the ad
          //                still ships behind a logged override
          //   escaped    - the target rule never fired. The only true miss.
          const outcome: Outcome =
            result.verdict === "BLOCK" ? "blocked" : targetFired ? "downgraded" : "escaped";

          return { ...a, round, verdict: result.verdict, firedRules, targetFired, outcome };
        })
      );
      attempts.push(...scored);
    }

    const escaped = attempts.filter((a) => a.outcome === "escaped");
    const downgraded = attempts.filter((a) => a.outcome === "downgraded");
    console.log(
      `${escaped.length} escaped, ${downgraded.length} downgraded, ` +
        `${attempts.length - escaped.length - downgraded.length} blocked`
    );
    all.push(...attempts);
    // Seed the next round only with what genuinely got through. Feeding back
    // correctly-WARNed attacks would teach the attacker to repeat things that
    // already work as intended.
    priorWins = escaped.map((s) => `${s.strategy}: "${s.ad}"`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(OUT_DIR, `${stamp}.jsonl`);
  writeFileSync(file, all.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");

  const escaped = all.filter((a) => a.outcome === "escaped");
  const downgraded = all.filter((a) => a.outcome === "downgraded");
  const blocked = all.filter((a) => a.outcome === "blocked");

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  blocked     ${blocked.length}/${all.length}   target rule fired, ad stopped`);
  console.log(`  downgraded  ${downgraded.length}/${all.length}   target rule fired, ships behind an override`);
  console.log(`  ESCAPED     ${escaped.length}/${all.length}   target rule never fired. The real miss rate.`);
  console.log(`${"=".repeat(70)}\n`);

  for (const s of [...escaped, ...downgraded]) {
    console.log(
      `[${s.outcome.toUpperCase()} / ${s.verdict}] target ${s.targetRuleId}  ${s.strategy.slice(0, 55)}`
    );
    console.log(`  ad:        "${s.ad}"`);
    console.log(`  intended:  ${s.intendedViolation}`);
    console.log(`  fired:     ${s.firedRules.length ? s.firedRules.join(", ") : "nothing"}`);
    console.log("");
  }

  console.log(`Full run written to ${file}`);
  console.log(
    `\nTRIAGE REQUIRED. A survivor is a candidate, not a verdict. For each one decide:\n` +
      `  (a) a real gap, so write a rule or widen an existing one, and add it to eval/dataset.jsonl\n` +
      `  (b) the attacker produced compliant copy and mislabelled it, so discard\n` +
      `  (c) a real gap we accept, so record it in the failure modes list instead\n` +
      `This script does not amend standard/. That decision is not automatable.\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
