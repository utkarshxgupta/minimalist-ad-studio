import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Dimension, Finding, Rule } from "@/lib/types";
import type { Rulebook } from "@/lib/standard/loader";
import { buildPrompt, RESPONSE_SCHEMA } from "./prompt";

export const MODEL = "gemini-3.8-flash";

const DIMENSIONS: Dimension[] = ["policy", "tone", "language"];

const ModelFinding = z.object({
  ruleId: z.string(),
  span: z.string(),
  explanation: z.string(),
  suggestedFix: z.string(),
});
const ModelResponse = z.object({ findings: z.array(ModelFinding) });

export interface ModelScoreResult {
  findings: Finding[];
  model: string;
  /**
   * Dimensions whose call failed after a retry. Surfaced rather than swallowed:
   * an empty findings array from a crashed call is indistinguishable from a
   * clean ad, and silently reporting PASS on a failed check is the single most
   * dangerous thing this module could do.
   */
  dimensionsFailed: Dimension[];
}

export async function scoreModel(
  text: string,
  book: Rulebook,
  factsContext?: string
): Promise<ModelScoreResult> {
  if (!process.env.GEMINI_API_KEY) {
    return { findings: [], model: "skipped:no-api-key", dimensionsFailed: [] };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const byId = new Map(book.active.map((r) => [r.id, r]));

  // One call per dimension, in parallel. Separate calls because a single prompt
  // doing three jobs bleeds: tone concerns contaminate legal judgments, and you
  // cannot tune one dimension without disturbing the other two.
  const results = await Promise.all(
    DIMENSIONS.map((d) => scoreDimension(ai, d, book, text, factsContext, byId))
  );

  return {
    findings: results.flatMap((r) => r.findings),
    model: MODEL,
    dimensionsFailed: results.filter((r) => r.failed).map((r) => r.dimension),
  };
}

async function scoreDimension(
  ai: GoogleGenAI,
  dimension: Dimension,
  book: Rulebook,
  text: string,
  factsContext: string | undefined,
  byId: Map<string, Rule>
): Promise<{ dimension: Dimension; findings: Finding[]; failed: boolean }> {
  // Only rules with `guidance` are model-judged. A rule with a matcher alone is
  // layer 1's business and must not be double-reported.
  //
  // Rules needing ProductFacts are withheld when facts are absent. The eval
  // caught POLICY-005 blocking "Formulated with 2% Salicylic Acid" in a run
  // that supplied no facts at all: the prompt had told the model not to guess,
  // and it guessed. Structural exclusion, not instruction.
  const rules = book.active.filter(
    (r) =>
      r.dimension === dimension && r.guidance && (!r.requires_facts || Boolean(factsContext))
  );
  if (rules.length === 0) return { dimension, findings: [], failed: false };

  const prompt = buildPrompt(dimension, rules, text, factsContext);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
        },
      });

      const parsed = ModelResponse.safeParse(JSON.parse(res.text ?? "{}"));
      if (!parsed.success) continue;

      const findings: Finding[] = [];
      for (const f of parsed.data.findings) {
        const rule = byId.get(f.ruleId);
        // A finding citing a rule that does not exist is discarded. The model
        // does not get to invent authority any more than an advertiser does.
        if (!rule || rule.dimension !== dimension) continue;
        findings.push({
          ruleId: rule.id,
          dimension: rule.dimension,
          severity: rule.severity, // from the rulebook, never from the model
          layer: "model",
          span: f.span,
          explanation: f.explanation,
          suggestedFix: f.suggestedFix,
        });
      }
      return { dimension, findings, failed: false };
    } catch {
      if (attempt === 1) return { dimension, findings: [], failed: true };
    }
  }
  return { dimension, findings: [], failed: true };
}
