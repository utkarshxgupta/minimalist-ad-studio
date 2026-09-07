import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Finding, ProductFacts } from "@/lib/types";
import { loadRulebook } from "@/lib/standard/loader";

/**
 * Creative mode: the prop graphic.
 *
 * The default (photographic) path generates nothing. It composites the real
 * product photo onto a flat brand canvas, which cannot produce a seam because
 * there is only one photograph in the frame. That fixed the previous defect:
 * a generated photoreal backdrop and the product photo never shared a light
 * source, and no amount of edge feathering hid that they were two different
 * scenes.
 *
 * Creative mode is the opt-in alternative for a marketer who wants more than
 * a packshot and a headline. Looking at the brand's own homepage banners
 * rather than guessing: they do not composite the product into a painted
 * environment either. They add a small prop or graphic motif next to real
 * product photography, on an otherwise plain canvas: a molecule motif woven
 * through a strand of hair, a scattering of glass droplets. This module
 * generates that kind of prop, not a scene.
 *
 * Invariant 5 still binds. The real product photo is handed to the image
 * model, but only as a scale-and-colour reference, and the prompt says so
 * explicitly and repeatedly: the model must never depict, redraw, or imply
 * the product container in its output. The real photograph is what gets
 * composited into the final creative either way, exactly as in photographic
 * mode. If the model ignores the instruction, layer 2 below is what catches
 * it, and generateCreativeProp discards the result outright if it appears to
 * contain product-shaped content the deny-list already flags.
 */

export const PROP_MODEL = "gemini-3.1-flash-image";
export const PROP_SCORER_MODEL = "gemini-3.8-flash";

/**
 * Concepts that turn a prop into a claim. Skin and people because an implied
 * result is still a result; clinical signalling because a lab coat borrows
 * authority the product has not earned; fairness vocabulary because
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
  { pattern: /\bbadge\b|\bseal\b|\bcertifi|\baward\b|\bstamp\b/i, why: "a generated badge or seal is a fabricated certification" },
];

export interface SanitisedHint {
  hint: string;
  /** Removed phrases, with the reason. Shown to the marketer, not swallowed. */
  rejected: { phrase: string; why: string }[];
}

/**
 * Layer 1. Runs on the marketer's style hint before it is ever sent to an
 * image model. Rejects rather than rewrites: a hint that has to be sanitised
 * is a hint the marketer should see rejected, because it tells them something
 * about the standard they are working inside.
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

const ALLOWED_IMAGE_HOSTS = new Set(["cdn.shopify.com", "beminimalist.co", "www.beminimalist.co"]);

/** Fetches the real product photo server-side so it can ride along as a reference image. */
export async function fetchReferencePhoto(url: string): Promise<{ data: string; mimeType: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) return null;

  const res = await fetch(parsed.toString(), {
    headers: { "user-agent": "MinimalistAdStudio/0.1 (internal prototype)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString("base64"), mimeType: res.headers.get("content-type") ?? "image/png" };
}

export function buildPropPrompt(facts: ProductFacts, hint = ""): string {
  const styleLine = hint
    ? `Style direction from the marketer, applied only to material, motif and colour: ${hint}.`
    : `Style: a small scattering of glass or liquid droplets, or a thin-line molecular motif, quiet and editorial.`;

  return `You are given ONE reference image: a real photograph of a skincare product.
It is provided ONLY so you can match its scale, colour palette and the general
direction of its lighting. This is a hard rule, not a preference:

DO NOT depict, redraw, duplicate, trace, silhouette, or otherwise reproduce the
product, its bottle, its cap, its label, or any text from the reference image.
Your output must not contain a bottle, tube, jar, or dropper of any kind. If you
are unsure whether something you are about to draw looks like a container,
leave it out.

Your job is to generate a single small DECORATIVE PROP GRAPHIC that will be
composited beside the real product photo, never in place of it. Real Minimalist
banners use exactly this relationship: a molecular motif woven through a strand
of hair beside the real bottle, a scatter of glass droplets beside the real
tube. Small, quiet, and material, not a full illustrated scene.

${styleLine}

Composition: the graphic only, centred, generous empty space around it, on a
FLAT PURE WHITE background (this is required so the graphic can be blended
onto the ad without a visible edge; do not add any gradient, shadow, floor, or
scene behind it).

Absolutely not in this image: no people, no skin, no faces or hands, no product
container of any kind, no text, no lettering, no logos, no watermarks, no badge
or seal or certification mark, no laboratory or clinical staging, no
before-and-after framing, no charts or graphs.`;
}

export interface PropResult {
  /** Base64 image data, ready for a data: URI. Rendered on white, meant for multiply blending. */
  data: string;
  mimeType: string;
  prompt: string;
  model: string;
  hint: SanitisedHint;
}

export class CreativeError extends Error {}

export async function generateCreativeProp(facts: ProductFacts, rawHint = ""): Promise<PropResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new CreativeError("GEMINI_API_KEY is not set, so no prop can be generated.");
  }
  if (!facts.heroImageUrl) {
    throw new CreativeError("No product photo to use as a reference.");
  }

  const reference = await fetchReferencePhoto(facts.heroImageUrl);
  if (!reference) {
    throw new CreativeError("Could not fetch the real product photo to use as a reference image.");
  }

  const hint = sanitiseHint(rawHint);
  const prompt = buildPropPrompt(facts, hint.hint);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const res = await ai.models.generateContent({
    model: PROP_MODEL,
    contents: [
      { inlineData: { data: reference.data, mimeType: reference.mimeType } },
      { text: prompt },
    ],
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
  });

  for (const part of res.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "image/png",
        prompt,
        model: PROP_MODEL,
        hint,
      };
    }
  }

  throw new CreativeError("The image model returned no image.");
}

const ImageFinding = z.object({
  ruleId: z.string(),
  visual: z.string(),
  explanation: z.string(),
  suggestedFix: z.string(),
});
const ImageResponse = z.object({ findings: z.array(ImageFinding), containsProduct: z.boolean().default(false) });

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
    containsProduct: {
      type: "boolean",
      description: "true if the image contains anything resembling a bottle, tube, jar or dropper",
    },
  },
  required: ["findings", "containsProduct"],
} as const;

export interface PropScore {
  findings: Finding[];
  /** True if the model drew something bottle-shaped despite being told not to. The prop is discarded when true. */
  containsProduct: boolean;
}

/**
 * Layer 2 for the prop. Two questions, not one: does it violate a policy
 * rule, the same check the generated backdrop used to get, and separately —
 * because this prop was generated FROM a photo of the product, which the
 * previous full-backdrop generator never was — did the model draw the
 * product anyway despite being told not to. That second question is checked
 * even though the prompt already forbids it, on the same principle as
 * everything else in this codebase: an instruction is not a control, a check
 * is.
 */
export async function scoreCreativeProp(prop: PropResult): Promise<PropScore> {
  if (!process.env.GEMINI_API_KEY) return { findings: [], containsProduct: false };

  const book = loadRulebook();
  const rules = book.active.filter((r) => r.dimension === "policy" && r.guidance);
  const byId = new Map(rules.map((r) => [r.id, r]));

  const ruleBlock = rules
    .map((r) => `### ${r.id} ${r.title}\nWhy: ${r.rationale.trim()}\nHow to apply: ${r.guidance?.trim()}`)
    .join("\n\n");

  const prompt = `You are reviewing a GENERATED DECORATIVE PROP GRAPHIC for a skincare
advertisement in India, against a written standard. It was generated from a
reference photo of the real product and is meant to be a small graphic motif,
never the product itself. Judge two things.

First, "containsProduct": does the image contain anything that resembles a
bottle, tube, jar, dropper, or packaging of any kind? The model generating this
image was told not to draw one. If it did anyway, that is reported here
regardless of anything else, because a generated product container is a
fabricated fact about a real product.

Second, the rules below. A prop is not decoration: a molecule motif implying a
clinical result, or a droplet implying hydration, is a claim made in pixels.

## The rules

${ruleBlock}

## Output

Report rule violations citing the rule id, with a short description of what in
the image triggered the finding in "visual". An empty findings array is the
normal and expected outcome for a plain graphic motif that implies nothing.

Do not flag an image for being attractive, well lit, or premium looking. That is
not a violation.`;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const res = await ai.models.generateContent({
    model: PROP_SCORER_MODEL,
    contents: [{ inlineData: { data: prop.data, mimeType: prop.mimeType } }, { text: prompt }],
    config: { responseMimeType: "application/json", responseSchema: IMAGE_SCHEMA, temperature: 0 },
  });

  const parsed = ImageResponse.safeParse(JSON.parse(res.text ?? "{}"));
  if (!parsed.success) return { findings: [], containsProduct: false };

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
  return { findings, containsProduct: parsed.data.containsProduct };
}
