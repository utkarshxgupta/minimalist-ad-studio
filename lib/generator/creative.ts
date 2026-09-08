import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Finding, ProductFacts } from "@/lib/types";
import type { Placement } from "./placements";
import { loadRulebook } from "@/lib/standard/loader";

/**
 * Creative mode: the whole creative, generated from the real product photo.
 *
 * Photographic mode composites the real packshot onto a flat canvas and lays
 * type over it in CSS. It is safe, reproducible, and it produces one shape of
 * ad forever. Creative mode is the other end: the real product photograph goes
 * to the image model as the product's exact appearance, and the model returns
 * a finished art-directed frame with the product sitting inside a scene, the
 * way the brand's own banners are built.
 *
 * An earlier version of this mode generated only a small decorative prop and
 * composited it beside the untouched photograph. That kept invariant 5 intact
 * by construction, and it did not do the job: the output was still a packshot
 * on a plain ground with a motif next to it, which is the monotony creative
 * mode exists to break. Replaced rather than kept alongside, because two
 * creative sub-modes would be a menu of one good option and one excuse.
 *
 * What this costs, stated plainly rather than buried:
 *
 * Invariant 5 says the product image is never generated, and in this mode the
 * rendered pack IS model output, redrawn from a real reference. That is a
 * deliberate, human-made exception, not a loophole, and it is paid for at the
 * gate: a creative-mode ad can never export freely. It always requires a
 * logged human override, because the one thing a model can do here that it
 * cannot do in photographic mode is quietly alter a label, a concentration,
 * or a claim printed on the pack. The prompt forbids re-lettering, the image
 * scorer is asked specifically whether any text in the frame looks fabricated,
 * and neither of those is trusted enough to skip a human. Photographic mode
 * remains the default for exactly this reason.
 *
 * Typography is never left to the image model. The frame is generated with
 * deliberate negative space and the headline, content block, CTA and
 * disclaimer are typeset over it in CSS, so every word on the finished ad is
 * still the copy the scorer read and the claim trace verified.
 */

export const SCENE_MODEL = "gemini-3.1-flash-image";
export const SCENE_SCORER_MODEL = "gemini-3.8-flash";

/**
 * Concepts that turn a scene into a claim. Skin and people because an implied
 * result is still a result; clinical signalling because a lab coat borrows
 * authority the product has not earned; fairness vocabulary because
 * POLICY-011 governs imagery explicitly.
 *
 * These bind harder now than they did when this mode only produced a prop. A
 * decorative motif that hinted at dewiness was a weak claim; a full scene of
 * the product on wet glass under a beauty light is an efficacy claim with a
 * budget behind it.
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

/**
 * Where the type goes, so the model leaves it room.
 *
 * The copy column is not decoration the image can be cropped around later. It
 * is where the headline, the content block and the disclaimer land, and a
 * scene that fills that area with visual incident produces an ad whose copy
 * sits on top of clutter. Derived from the same layout the artboard uses, so
 * the frame the model composes and the frame the type lands on cannot drift.
 */
function negativeSpaceFor(p: Placement): string {
  // Tone, not just composition. The first version of this asked only for an
  // area that was "calm and close to empty", which a dark stone slab satisfies
  // perfectly, and near-black type is unreadable on one. The renderer's only
  // remaining defence was a heavy light scrim, which had to be strong enough
  // for the worst case and so washed out the scene on every frame including
  // the ones that did not need it. Asking for the value as well as the
  // emptiness is what lets that scrim come down.
  const tone = `That reserved area must also be LIGHT: a pale, near-white or soft light
neutral surface, evenly lit, low in contrast and free of hard shadows, dark
objects or busy texture. Advertising copy is typeset over it in near-black
afterwards and has to stay readable, so treat "pale and quiet" as a hard
requirement of the composition rather than a stylistic preference.

Keep the TOP-LEFT corner of the frame pale and clear as well, whatever else the
composition does. The brand wordmark sits there.`;

  switch (p.layout) {
    case "split":
      return `Compose the product in the RIGHT half of the frame. The LEFT half must stay
visually calm and close to empty: a plain surface or a soft field of colour,
nothing detailed, because the headline and the body copy are typeset there
afterwards.

${tone}`;
    case "tall":
      return `This is a vertical story frame. Compose the product in the LOWER-MIDDLE of
the frame. The TOP THIRD must stay calm and close to empty, because the
headline is typeset there afterwards, and keep the very bottom of the frame
quiet too since the platform overlays its own interface there.

${tone}`;
    case "stacked":
    default:
      return `Compose the product in the UPPER portion of the frame. The LOWER HALF must
stay visually calm and close to empty: a plain surface or a soft field of
colour, because the headline and body copy are typeset there afterwards.

${tone}`;
  }
}

/**
 * The scene prompt.
 *
 * Three jobs, in descending order of how badly a failure hurts: keep the real
 * product exactly as photographed, keep the frame free of anything that makes
 * a claim, and only then make it a good ad. The order matters because the
 * failure modes are asymmetric. A dull scene wastes a generation; a re-lettered
 * label is a fabricated fact about a real product on a real shelf.
 */
export function buildScenePrompt(facts: ProductFacts, p: Placement, hint = ""): string {
  const styleLine = hint
    ? `Art direction from the marketer, applied to surface, material, palette and light: ${hint}.`
    : `Art direction: quiet editorial still life. A considered surface, a shaft of
directional daylight, one or two restrained material props such as stone,
brushed metal, glass, paper or a single botanical element. Calm and premium,
not busy.`;

  return `You are given ONE reference image: a real photograph of a real skincare
product that is on sale today. Your job is to place THAT EXACT PRODUCT into a
finished, art-directed advertising frame.

## The product is not yours to redesign

Reproduce the product exactly as it appears in the reference image: the same
bottle shape, the same cap, the same proportions, the same label artwork, the
same colours. Treat the label as a photograph you are re-lighting, not as text
you are setting.

DO NOT invent, re-letter, re-spell, translate, embellish, or "improve" any text
on the packaging. DO NOT change or add a percentage, a concentration, an
ingredient name, or a claim on the label. If a detail of the label is unclear in
the reference, render it softly out of focus rather than guessing at it. A label
you have partly invented is a false statement about a real product, and it is
the single worst thing you can do in this task.

Keep the product unobstructed, fully inside the frame with comfortable margin,
and upright. Do not crop the pack.

Render the pack large enough in frame that its label type comes out crisp and
correct, or else stage it at a natural photographic depth of field so the small
print is convincingly soft. A small, sharp, misspelled label is the single most
common way this task fails, and a frame that fails that way is thrown away.

## The frame

Aspect ratio ${p.imageAspect}. This is a finished advertisement background, not
a product cut-out and not a catalogue shot.

${negativeSpaceFor(p)}

${styleLine}

Light the scene so it is coherent: one dominant light direction, one colour
temperature, real contact shadows where the product meets the surface. The
product must look photographed in that scene, not pasted onto it.

## Not in this image, at all

No text, no lettering, no words, no numbers, and no logos anywhere in the frame
other than what is already printed on the product itself. All advertising copy
is typeset over this image afterwards, so any text you draw will collide with it
and will be wrong.

No people, no skin, no faces, no hands, no body parts. No depiction of acne,
blemishes, scarring, pigmentation or wrinkles. No before-and-after framing. No
laboratory, clinic, lab coat, microscope or medical staging. No badge, seal,
award, certification mark or rosette. No charts, graphs or percentages. No
water droplets, dew, or wet-skin cues on or around the product.

## Why those are excluded

This ad is bound by an Indian cosmetics advertising standard. A depicted result
is a claim, an implied clinical endorsement is a claim, and a generated
certification mark is a fabricated credential. The scene may be beautiful. It
may not argue anything the product's own page does not support.`;
}

export interface SceneResult {
  /**
   * How pale and how quiet the area under the copy actually came back, once
   * measured. Carried through so the artboard can size its legibility scrim to
   * the frame it actually got rather than to the worst frame it might get.
   */
  tone?: { copyLuminance: number; copyContrast: number };
  /** Base64 image data for a data: URI. A finished frame, rendered full-bleed. */
  data: string;
  mimeType: string;
  prompt: string;
  model: string;
  hint: SanitisedHint;
  /** Which placement this frame was composed for. Scenes are not shared across aspects. */
  placementId: string;
}

export class CreativeError extends Error {}

/**
 * One scene per placement, not one shared across the run.
 *
 * The prop this replaced was a small graphic that could be composited at any
 * aspect, so generating it once was right. A finished frame cannot be: a
 * composition built for a 1:1 square has its product in the right half and its
 * calm space on the left, and rescaling that into a 9:16 story crops the
 * product or the copy space or both. Which is the same reasoning the channel
 * split rests on, applied to the image instead of the words.
 */
export async function generateCreativeScene(
  facts: ProductFacts,
  p: Placement,
  rawHint = ""
): Promise<SceneResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new CreativeError("GEMINI_API_KEY is not set, so no creative can be generated.");
  }
  if (!facts.heroImageUrl) {
    throw new CreativeError("No product photo to build the creative from.");
  }

  const reference = await fetchReferencePhoto(facts.heroImageUrl);
  if (!reference) {
    throw new CreativeError("Could not fetch the real product photo to build the creative from.");
  }

  const hint = sanitiseHint(rawHint);
  const prompt = buildScenePrompt(facts, p, hint.hint);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const res = await ai.models.generateContent({
    model: SCENE_MODEL,
    contents: [
      { inlineData: { data: reference.data, mimeType: reference.mimeType } },
      { text: prompt },
    ],
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: p.imageAspect } },
  });

  for (const part of res.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? "image/png",
        prompt,
        model: SCENE_MODEL,
        hint,
        placementId: p.id,
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
const ImageResponse = z.object({
  findings: z.array(ImageFinding),
  fabricatedText: z.boolean().default(false),
  fabricatedTextDetail: z.string().default(""),
  /**
   * Every line of text legible on the product pack, transcribed exactly as
   * rendered. Transcription, not judgment: what the words mean is decided in
   * `pack-text.ts` against the product's own page, deterministically.
   */
  packText: z.array(z.string()).default([]),
});

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
    fabricatedText: {
      type: "boolean",
      description:
        "true if the frame contains any lettering, numbers or logo other than what is printed on the product pack itself, or if text on the pack looks garbled, misspelled or invented",
    },
    fabricatedTextDetail: {
      type: "string",
      description: "what the text says and where it is, or an empty string when fabricatedText is false",
    },
    packText: {
      type: "array",
      items: { type: "string" },
      description:
        "every line of text legible on the product packaging, transcribed exactly as rendered, character for character, including any misspelling",
    },
  },
  required: ["findings", "fabricatedText", "fabricatedTextDetail", "packText"],
} as const;

export interface SceneScore {
  findings: Finding[];
  /**
   * The frame carries lettering that is not the pack's own, or pack text that
   * looks invented. Either way the scene is discarded rather than shown with a
   * warning: a plausible-looking wrong concentration on a real product's label
   * is the worst output this tool can produce, and it is not something a
   * reviewer skimming a thumbnail will reliably catch.
   */
  fabricatedText: boolean;
  fabricatedTextDetail: string;
  /** The pack's text as rendered, for the deterministic check in `pack-text.ts`. */
  packText: string[];
}

/**
 * Layer 2 for the generated frame. Two questions, not one.
 *
 * The rules question is the same one the prop got: a scene is not decoration,
 * and an implied result is still a result.
 *
 * The second question is the one this mode exists to answer. Because the pack
 * in this frame is model-rendered from a reference rather than photographed,
 * the specific new risk is text: a re-lettered label, a concentration that
 * drifted from 10% to 1O%, a logo the model felt the frame needed, an invented
 * award mark. The prompt forbids all of it at length, and the prompt is not a
 * control. This is.
 */
export async function scoreCreativeScene(scene: SceneResult): Promise<SceneScore> {
  if (!process.env.GEMINI_API_KEY) {
    return { findings: [], fabricatedText: false, fabricatedTextDetail: "", packText: [] };
  }

  const book = loadRulebook();
  const rules = book.active.filter((r) => r.dimension === "policy" && r.guidance);
  const byId = new Map(rules.map((r) => [r.id, r]));

  const ruleBlock = rules
    .map((r) => `### ${r.id} ${r.title}
Why: ${r.rationale.trim()}
How to apply: ${r.guidance?.trim()}`)
    .join("\n\n");

  const prompt = `You are reviewing a GENERATED ADVERTISING FRAME for a skincare product in
India, against a written standard. It was generated from a reference photograph
of the real product, and the product shown in it was drawn by an image model
rather than photographed. Judge two things.

First, "fabricatedText". Look carefully at every part of the frame, and
especially at the product's own label.

Report true if EITHER of these is the case:
  - the frame contains any lettering, word, number, logo, badge, seal or
    watermark that is not printed on the product pack itself. All advertising
    copy is typeset over this image later, so any text in the image is wrong.
  - the text on the pack looks invented, garbled, misspelled, mangled, or
    reads differently from the kind of text a real cosmetic label carries.
    Pay particular attention to any percentage or concentration.

Describe what you saw and where in "fabricatedTextDetail". If neither applies,
report false and leave the detail empty. Soft, out-of-focus label text that
cannot be read is NOT fabricated text; report that as false.

Then, separately and mechanically, fill "packText": transcribe every line of
text you can read on the product packaging, exactly as it is rendered,
character for character. Do NOT correct spelling, do NOT tidy it, and do NOT
substitute what you think the label ought to say. A misspelling you silently
correct here defeats the check this transcription exists for. Omit any line
you genuinely cannot read rather than guessing at it.

This check matters more than anything else here. A plausible but wrong
concentration rendered onto a real product's label is a false statement about a
product on sale today.

Second, the rules below. Judge the scene, not just the product: a wet-glass
surface implying hydration, a clinical staging implying medical endorsement, or
a lighting setup that stages a skin result is a claim made in pixels.

## The rules

${ruleBlock}

## Output

Report rule violations citing the rule id, with a short description of what in
the image triggered the finding in "visual". An empty findings array is a
normal outcome for a well-behaved still life.

Do not flag an image for being attractive, well lit, or premium looking. That is
not a violation. It is the brief.`;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const res = await ai.models.generateContent({
    model: SCENE_SCORER_MODEL,
    contents: [{ inlineData: { data: scene.data, mimeType: scene.mimeType } }, { text: prompt }],
    config: { responseMimeType: "application/json", responseSchema: IMAGE_SCHEMA, temperature: 0 },
  });

  const parsed = ImageResponse.safeParse(JSON.parse(res.text ?? "{}"));
  // A scorer that could not parse its own output has not cleared this frame.
  // Fail closed: the same policy the text scorer uses for a failed dimension.
  if (!parsed.success) {
    return {
      findings: [],
      fabricatedText: true,
      fabricatedTextDetail: "The image check did not return a readable result, so the frame is not cleared.",
      packText: [],
    };
  }

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
  return {
    findings,
    fabricatedText: parsed.data.fabricatedText,
    fabricatedTextDetail: parsed.data.fabricatedTextDetail,
    packText: parsed.data.packText,
  };
}
