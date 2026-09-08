import * as cheerio from "cheerio";
import type { ProductFacts } from "@/lib/types";
import { absoluteImageUrl, type PageBundle } from "./fetch";

/**
 * Stage 2: turn a page into `ProductFacts`.
 *
 * No model runs here, deliberately. `ProductFacts` is the ground truth that
 * invariant 4 checks generated claims against. If a model extracted the facts,
 * a hallucinated fact would become a licensed claim: the grounding check would
 * look up "2% Salicylic Acid", find the invented entry, and certify the ad. The
 * check would still pass. It would just be checking against fiction.
 *
 * So extraction is DOM structure and regex, and when it cannot find something it
 * says so in `warnings` rather than filling the gap. An empty field a marketer
 * can see is safer than a plausible field nobody can trace.
 */

export interface ExtractionResult {
  facts: ProductFacts;
  /** Fields that could not be read. Surfaced in the UI, never silently defaulted. */
  warnings: string[];
}

/** A block of page content. The storefront renders each one as a toggle-tab. */
export interface Section {
  title: string;
  bullets: string[];
  text: string;
}

const MAX_RAW_TEXT = 6000;
const MAX_ACTIVES = 6;

/**
 * Words that sit immediately before a percentage but are not ingredients.
 * "Pure 10% Niacinamide" and "Save an additional up to 15% off" are the same
 * shape to a regex; only one of them is a formulation fact.
 */
const NOT_AN_INGREDIENT = new Set([
  "pure", "high", "up", "upto", "extra", "additional", "save", "get", "off", "flat",
  "with", "contains", "our", "this", "that", "formulated", "only", "new", "best",
  "uses", "in", "of", "at", "from", "now", "and", "plus", "the", "buy", "shop",
  "sale", "mrp", "gst", "price", "total", "base", "free", "over", "under", "select",
  // Product form and body part. "Niacinamide 10% Face Serum" contains the
  // string "10% Face", which the inverted pattern reads as a 10% active called
  // Face. No ingredient is named after the thing you put it on.
  "face", "body", "hair", "lip", "skin", "serum", "cleanser", "moisturizer",
  "moisturiser", "sunscreen", "shampoo", "lotion", "cream", "gel", "ointment",
  "toner", "mask", "clinical", "results",
]);

/** Generic product-form words to strip off the tail of a captured ingredient name. */
const FORM_WORDS =
  /\s+(?:face|body|hair|lip)?\s*(?:serum|cleanser|moisturizer|moisturiser|sunscreen|shampoo|lotion|cream|gel|oil|ointment|toner|mask)\b.*$/i;

export function extractFacts(bundle: PageBundle): ExtractionResult {
  const $ = cheerio.load(bundle.html);
  const warnings: string[] = [];

  const ld = productJsonLd($);

  const name = clean($("h1.product__title").first().text()) || bundle.product?.title || ld?.name || "";
  if (!name) warnings.push("Product name not found on the page.");

  const subtitle = clean($("span.product__subtitle").first().text());
  if (!subtitle) warnings.push("Product subtitle not found. Benefit copy will be thinner.");

  const sections = readSections($);

  const potent = sections.find((s) => /what makes it potent/i.test(s.title));
  const statedBenefits = [subtitle, ...(potent?.bullets ?? [])].filter(Boolean);
  if (statedBenefits.length === 0) {
    warnings.push(
      "No stated benefits found. Every generated claim must trace to one of these, so generation will be heavily constrained."
    );
  }

  const heroImageUrl =
    absoluteImageUrl(bundle.product?.featured_image ?? null) ??
    absoluteImageUrl(ld?.image ?? null) ??
    absoluteImageUrl($('meta[property="og:image"]').attr("content") ?? null);
  if (!heroImageUrl) {
    warnings.push("No product photograph found, and invariant 5 forbids generating one.");
  }

  const actives = extractActives(name, subtitle, sections);
  if (actives.length === 0) {
    warnings.push("No active and concentration could be read. Concentration claims will be blocked.");
  }

  const trustBadges = extractTrustBadges($);
  const ingredientNotes = extractIngredientNotes(sections);
  const audience = extractAudience(sections);

  return {
    facts: {
      url: bundle.url,
      name,
      actives,
      statedBenefits,
      trustBadges,
      ingredientNotes,
      audience,
      heroImageUrl,
      rawText: buildRawText(name, subtitle, sections),
    },
    warnings,
  };
}

/**
 * The per-ingredient tabs' own descriptive sentence: "A form of vitamin B3,
 * Niacinamide is a superstar ingredient that repairs skin, reduces occurrence
 * of acne, and fades blemishes." `extractActives` already reads these tabs to
 * pull a concentration number out and discards the sentence around it. This
 * reads the same tabs for the sentence instead, which is what an ingredient
 * synergy archetype needs and what the concentration regex was never built to
 * keep.
 */
export function extractIngredientNotes(sections: Section[]): ProductFacts["ingredientNotes"] {
  const out: { ingredient: string; note: string }[] = [];
  for (const s of sections) {
    if (isContentSection(s.title) || !s.text) continue;
    // A real ingredient tab title is short and carries no punctuation; this
    // excludes stray tabs (shipping, FAQ) that isContentSection's fixed list
    // does not name but that also are not ingredients.
    if (s.title.length > 40 || /[.!?]/.test(s.title)) continue;
    out.push({ ingredient: s.title, note: s.text });
  }
  return out;
}

/**
 * Labels as they appear in "Ideal For" and "How to Use", in the order this
 * function needs to scan them: each entry's value runs from just after its
 * own label to just before whichever label (from this list) comes next, or to
 * the end of the section if none does. The page concatenates every field into
 * one run of text with no delimiter but the next label, so the boundary has
 * to be computed from the label positions rather than split on a character.
 */
const AUDIENCE_LABELS: { key: keyof NonNullable<ProductFacts["audience"]>; label: RegExp }[] = [
  { key: "concerns", label: /concerns?:/i },
  { key: "ageSuitability", label: /suitable for:/i },
  { key: "pregnancySafe", label: /pregnancy\s*\/?\s*lactation:/i },
  { key: "timing", label: /when to use:/i },
];

function scanLabelledFields(
  text: string,
  labels: { key: keyof NonNullable<ProductFacts["audience"]>; label: RegExp }[],
  out: NonNullable<ProductFacts["audience"]>
) {
  const hits = labels
    .map(({ key, label }) => {
      const m = text.match(label);
      return m && m.index !== undefined ? { key, start: m.index, end: m.index + m[0].length } : null;
    })
    .filter((h): h is { key: keyof NonNullable<ProductFacts["audience"]>; start: number; end: number } => h !== null)
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < hits.length; i++) {
    const next = hits[i + 1];
    const value = clean(text.slice(hits[i].end, next ? next.start : undefined));
    if (value) out[hits[i].key] = value;
  }
}

/**
 * "Ideal For" and "How to Use" render as labelled key-value pairs, not free
 * prose ("Concerns: Acne Marks, Acne Prone & Oily Skin Suitable for: 16+ years
 * of age Pregnancy/Lactation: Safe"), so this reads the same way the trust
 * badges do: structured, not scraped by guessing at sentence boundaries.
 */
export function extractAudience(sections: Section[]): ProductFacts["audience"] {
  const idealFor = sections.find((s) => /ideal for/i.test(s.title));
  const howToUse = sections.find((s) => /how to use/i.test(s.title));

  const out: NonNullable<ProductFacts["audience"]> = {};
  if (idealFor?.text) scanLabelledFields(idealFor.text, AUDIENCE_LABELS, out);
  if (howToUse?.text) {
    scanLabelledFields(howToUse.text, AUDIENCE_LABELS, out);
    // The instruction line itself ("Apply 2-3 drops after cleansing...") has
    // no label of its own; it is simply everything before "When to use:".
    const m = howToUse.text.match(/when to use:/i);
    const instruction = clean(m ? howToUse.text.slice(0, m.index) : howToUse.text);
    if (instruction) out.howToUse = instruction;
    // The page's own field value sometimes repeats its label ("When to use:
    // When to use: AM & PM"), because the bold label and the field text
    // both say it. Stripped rather than kept as noise in generated copy.
    if (out.timing) out.timing = out.timing.replace(/^when to use:\s*/i, "");
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Fragrance Free, Non-comedogenic, a pH range: rendered as a pill carousel on
 * the real page, not as prose. Verified across all eight corpus products with
 * a live fetch: the class is used only for this carousel on every one of
 * them, never reused for a size selector or an unrelated badge. Kept as a
 * flat allowlist-free extraction (whatever the page ships) rather than a
 * fixed vocabulary, because the badge set genuinely differs by product: the
 * sunscreen ships "White cast free" instead of "Essential Oil Free", the
 * retinol serum ships no pH badge at all.
 */
export function extractTrustBadges($: cheerio.CheerioAPI): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  $(".pill__label").each((_, el) => {
    const label = $(el).text().replace(/\s+/g, " ").trim();
    if (!label || seen.has(label.toLowerCase())) return;
    seen.add(label.toLowerCase());
    out.push(label);
  });

  return out;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Every content block on the page is a `toggle-tab` with a title node and a
 * content node: "What Makes It Potent?", "Ideal For", "How to Use", "Consumer
 * Studies", and one tab per ingredient. Reading all of them keeps the
 * per-ingredient concentrations and the substantiation notes, both of which the
 * claim rules need.
 */
function readSections($: cheerio.CheerioAPI): Section[] {
  const out: Section[] = [];

  $("toggle-tab").each((_, el) => {
    const tab = $(el);
    const title = clean(tab.find("[data-js-title]").first().text());
    const content = tab.find("[data-js-content]").first();
    if (!title || content.length === 0) return;

    const bullets = content
      .find("li")
      .map((__, li) => clean($(li).text()))
      .get()
      .filter(Boolean);

    out.push({ title, bullets, text: clean(content.text()) });
  });

  return out;
}

function buildRawText(name: string, subtitle: string, sections: Section[]): string {
  const parts = [name, subtitle].filter(Boolean);
  for (const s of sections) {
    const body = s.bullets.length ? s.bullets.map((b) => `- ${b}`).join("\n") : s.text;
    if (body) parts.push(`## ${s.title}\n${body}`);
  }
  return parts.join("\n\n").slice(0, MAX_RAW_TEXT);
}

/**
 * Three passes, most trustworthy first.
 *
 * 1. Per-ingredient tabs, where the heading names the ingredient and the body
 *    states the strength: "Niacinamide" / "a high concentration of 10%".
 * 2. "<Ingredient> <n>%" in the title, subtitle or benefit bullets.
 * 3. "<n>% <Ingredient>", the inverted phrasing the brand also uses.
 *
 * Scoped to the product region. The site navigation advertises six other
 * products and a "15% off" promotion, and a whole-page regex would record both
 * as facts about the product being scored.
 */
export function extractActives(
  name: string,
  subtitle: string,
  sections: Section[]
): ProductFacts["actives"] {
  const found = new Map<string, { ingredient: string; concentration: string }>();

  const record = (ingredient: string, concentration: string) => {
    const cleaned = cleanIngredient(ingredient);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (!found.has(key)) found.set(key, { ingredient: cleaned, concentration });
  };

  for (const s of sections) {
    if (isContentSection(s.title)) continue;
    const pct = s.text.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    if (pct && !isDiscountContext(s.text, pct.index ?? 0)) record(s.title, `${pct[1]}%`);
  }

  const copy = [name, subtitle, ...sections.flatMap((s) => s.bullets)].filter(Boolean);

  // Ingredient names carry digits and joiners: "Vitamin B5", "Hyaluronic + PGA",
  // "Coenzyme Q10". A letters-only tokeniser silently drops all three.
  const TOKEN = "[A-Z][A-Za-z0-9-]*(?:[\\s+&]+[A-Z][A-Za-z0-9-]*){0,2}";
  const PCT = "(\\d{1,2}(?:\\.\\d{1,2})?)\\s*%";
  const before = new RegExp(`(${TOKEN})\\s+${PCT}`, "g");
  const after = new RegExp(`${PCT}\\s+(${TOKEN})\\b`, "g");
  // SPF is a strength claim stated without a percent sign. Reading it as a fact
  // is what lets copy say "SPF 50" without the claim being ungrounded.
  const spf = /\bSPF\s*(\d{2,3})\b/g;

  for (const line of copy) {
    for (const m of line.matchAll(before)) {
      if (isDiscountContext(line, m.index ?? 0)) continue;
      record(m[1], `${m[2]}%`);
    }
    for (const m of line.matchAll(after)) {
      if (isDiscountContext(line, m.index ?? 0)) continue;
      record(m[2], `${m[1]}%`);
    }
    for (const m of line.matchAll(spf)) record("SPF", m[1]);
  }

  return [...found.values()].slice(0, MAX_ACTIVES);
}

function cleanIngredient(raw: string): string | null {
  const stripped = raw.replace(FORM_WORDS, "").replace(/[^A-Za-z0-9 +-]/g, " ").trim();
  if (!stripped) return null;

  const words = stripped.split(/\s+/).filter((w) => !NOT_AN_INGREDIENT.has(w.toLowerCase()));
  if (words.length === 0) return null;

  const name = words.join(" ");
  if (name.length < 3 || name.length > 40) return null;
  return name;
}

/** "15% off", "up to 20% discount". A promotion is not a formulation. */
function isDiscountContext(line: string, at: number): boolean {
  return /\b(?:off|discount|sale|save|cashback|extra)\b/i.test(line.slice(at, at + 40));
}

function isContentSection(title: string): boolean {
  return /what makes|ideal for|how to use|consumer studies|clinical result|all ingredients|shipping|return|faq|review/i.test(
    title
  );
}

interface ProductLd {
  name?: string;
  image?: string | null;
}

function productJsonLd($: cheerio.CheerioAPI): ProductLd | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).contents().text();
    if (!raw.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
      if (typeof node !== "object" || node === null) continue;
      const n = node as Record<string, unknown>;
      if (n["@type"] !== "Product") continue;
      const image = Array.isArray(n.image) ? n.image[0] : n.image;
      return {
        name: typeof n.name === "string" ? n.name : undefined,
        image: typeof image === "string" ? image : null,
      };
    }
  }
  return null;
}
