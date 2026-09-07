import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Finding, ProductFacts } from "@/lib/types";
import { loadRulebook } from "@/lib/standard/loader";

/**
 * Stage 3b: the background.
 *
 * Invariant 5: the product photograph is never generated. The pack, the label
 * and the printed concentration are photographic, because a generated label is
 * a fabricated fact about a real product. Only the environment behind it may be
 * generated, and a generated environment is itself scored, because a backdrop
 * of dewy glowing skin is an efficacy claim made in pixels instead of words.
 *
 * Two layers, mirroring the text scorer:
 *
 *   layer 1  the prompt is deny-list checked before it is sent. Deterministic,
 *            and it is the only control that runs before the money is spent.
 *   layer 2  the returned image is scored against the policy rules.
 *
 * Layer 1 matters more than it looks. The marketer's brief flows into the
 * environment hint, so "dewy glass-skin vibes, before and after" would
 * otherwise become an image-generation instruction with nobody checking.
 */

export const BACKGROUND_MODEL = "gemini-3.1-flash-image";
export const BACKGROUND_SCORER_MODEL = "gemini-3.8-flash";

/**
 * Concepts that turn a backdrop into a claim. Skin and people because an
 * implied result is still a result; clinical signalling because a lab coat
 * borrows authority the product has not earned; fairness vocabulary because
 * POLICY-011 governs imagery explicitly.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bskins?\b|\bcomplexion|\bpores?\b|\bderm(is|al)\b/i, why: "depicting skin implies a result" },
  { pattern: /\bglow(ing|y)?\b|\bdewy\b|\bradian|\bluminous\b/i, why: "glow language is an efficacy claim" },
  { pattern: /\bbefore\b|\bafter\b|\btransform|\bresults?\b/i, why: "before and after framing is an efficacy claim" },
  { pattern: /\bclinic|\blab\b|\blaborator|\bdermatolog|\bdoctor|\bcoat\b/i, why: "clinical staging borrows unearned authority" },
  { pattern: /\bmodel\b|\bwoman\b|\bman\b|\bgirl\b|\bboy\b|\bperson\b|\bpeople\b|\bface\b|\bhands?\b|\bbody\b/i, why: "no people: a depicted user implies a depicted outcome" },
  { pattern: /\bacne\b|\bpimple|\bblemish|\bscar|\bwrinkle|\bspot|\bpigment/i, why: "depicting a condition claims to treat it" },
  { pattern: /\bfair(ness)?\b|\blighten|\bwhiten|\bbrighten/i, why: "POLICY-011 governs skin tone framing in imagery" },
  { pattern: /\bdroplets?\b|\bmoistur|\bhydrat|\bwater beads?\b/i, why: "moisture cues read as a hydration claim" },
];

export interface SanitisedHint {
  hint: string;
  /** Removed phrases, with the reason. Shown to the marketer, not swallowed. */
  rejected: { phrase: string; why: string }[];
}

/**
 * Layer 1. Runs on the marketer's environment hint before it is ever sent to
 * an image model. Rejects rather than rewrites: a hint that has to be
 * sanitised is a hint the marketer should see rejected, because it tells them
 * something about the standard they are working inside.
 */
export function sanitiseHint(raw: string): SanitisedHint {
  const rejected: { phrase: string; why: string }[] = [];
  let hint = raw;

  for (const { pattern, why } of FORBIDDEN) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    for (const m of raw.matchAll(global)) rejected.push({ phrase: m[0], why });
    hint = hint.replace(global, "");
  }

  return { hint: hint.replace(/\s+/g, " ").trim(), rejected };
}

export function buildBackgroundPrompt(facts: ProductFacts, hint = ""): string {
  const environment = hint ? `Mood the marketer asked for, applied only to light and material: ${hint}.` : "";

  return `A photographic studio backdrop for a skincare product advertisement. This
image is a BACKGROUND ONLY. The product will be composited on top of it later,
so the centre of the frame must stay simple and uncluttered.

Composition: square, 1:1. A seamless surface in warm off-white with a soft
plinth or ledge in the lower third for a bottle to sit on. Gentle diffused
daylight from the upper left, soft natural shadow. Generous negative space in
the upper half where a headline will be placed.

${environment}

Absolutely not in this image: no people, no skin, no faces or hands, no product,
no bottle, no packaging, no text, no lettering, no logos, no watermarks, no
water droplets, no laboratory or clinical staging, no before-and-after framing,
no charts or graphs.

Style reference: quiet, material, editorial. The brand is ${facts.name.split(" ")[0]}'s
science-led minimalism, not a spa advertisement.`;
}

export interface BackgroundResult {
  /** Base64 image data, ready for a data: URI. */
  data: string;
  mimeType: string;
  prompt: string;
  model: string;
  hint: SanitisedHint;
}

export class BackgroundError extends Error {}

export async function generateBackground(facts: ProductFacts, rawHint = ""): Promise<BackgroundResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new BackgroundError("GEMINI_API_KEY is not set, so no background can be generated.");
  }

  const hint = sanitiseHint(rawHint);
  const prompt = buildBackgroundPrompt(facts, hint.hint);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const res = await ai.models.generateContent({
    model: BACKGROUND_MODEL,
    contents: prompt,
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
  });

  for (const part of res.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "image/jpeg",
        prompt,
        model: BACKGROUND_MODEL,
        hint,
      };
    }
  }

  throw new BackgroundError("The image model returned no image.");
}

const ImageFinding = z.object({
  ruleId: z.string(),
  visual: z.string(),
  explanation: z.string(),
  suggestedFix: z.string(),
});
const ImageResponse = z.object({ findings: z.array(ImageFinding) });

const IMAGE_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ruleId: { type: "string" },
          visual: { type: "string" },
          explanation: { type: "string" },
          suggestedFix: { type: "string" },
        },
        required: ["ruleId", "visual", "explanation", "suggestedFix"],
      },
    },
  },
  required: ["findings"],
} as const;

/**
 * Layer 2 for imagery. Scored against the policy rules only: tone and language
 * are about words, and asking a model whether a photograph sounds like the
 * brand would produce confident noise.
 *
 * There is no span to verify here, which is a real weakening of the
 * anti-hallucination guarantee and is why image findings are tagged `image`
 * rather than mixed in silently. A reviewer should weight them differently.
 */
export async function scoreBackground(bg: BackgroundResult): Promise<Finding[]> {
  if (!process.env.GEMINI_API_KEY) return [];

  const book = loadRulebook();
  const rules = book.active.filter((r) => r.dimension === "policy" && r.guidance);
  const byId = new Map(rules.map((r) => [r.id, r]));

  const ruleBlock = rules
    .map((r) => `### ${r.id} ${r.title}\nWhy: ${r.rationale.trim()}\nHow to apply: ${r.guidance?.trim()}`)
    .join("\n\n");

  const prompt = `You are reviewing a GENERATED BACKGROUND for a skincare advertisement in
India, against a written standard. The product photograph is real and is not
your concern. Judge only what the generated environment implies.

A backdrop is not decoration. Dewy glowing skin behind a serum is an efficacy
claim. A clinical bench is a claim to authority. A depicted before and after is
a claim of result. That is what you are looking for.

## The rules

${ruleBlock}

## Output

Report only violations of the rules above, citing the rule id. Put a short
description of what in the image triggered the finding in "visual". If the
image is a plain backdrop that implies nothing about results, return an empty
findings array, which is the normal and expected outcome.

Do not flag an image for being attractive, well lit, or premium looking. That is
not a violation.`;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const res = await ai.models.generateContent({
    model: BACKGROUND_SCORER_MODEL,
    contents: [
      { inlineData: { data: bg.data, mimeType: bg.mimeType } },
      { text: prompt },
    ],
    config: { responseMimeType: "application/json", responseSchema: IMAGE_SCHEMA, temperature: 0 },
  });

  const parsed = ImageResponse.safeParse(JSON.parse(res.text ?? "{}"));
  if (!parsed.success) return [];

  const findings: Finding[] = [];
  for (const f of parsed.data.findings) {
    const rule = byId.get(f.ruleId);
    // Same control as the text scorer: a finding citing a rule that does not
    // exist is discarded. A model does not get to invent authority.
    if (!rule) continue;
    findings.push({
      ruleId: rule.id,
      dimension: rule.dimension,
      severity: rule.severity,
      layer: "model",
      target: "image",
      span: f.visual,
      explanation: f.explanation,
      suggestedFix: f.suggestedFix,
    });
  }
  return findings;
}
