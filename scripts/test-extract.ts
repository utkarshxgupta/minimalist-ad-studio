/**
 * Extraction tests.
 *
 * Extraction is the one stage of the generator that is fully deterministic, so
 * it is the one stage that can be tested by assertion rather than by judgment.
 * That matters more here than it looks: `ProductFacts` is what every generated
 * claim is checked against, so a parser bug does not produce a wrong ad, it
 * produces a wrong ad that passes review.
 *
 * Run offline against committed fixtures. No network, no model, no API key.
 *
 * Written in the same tsx script style as `eval` and `redteam` rather than
 * pulling in a test framework, because this repo already has a convention for
 * "a check you can run" and a second one would be noise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check, eq, ok, report } from "./assert";
import { extractActives, extractFacts, type Section } from "../lib/generator/extract";
import { parseProductUrl, FetchError, type PageBundle } from "../lib/generator/fetch";

function loadFixture(handle: string): PageBundle {
  const dir = join(process.cwd(), "fixtures", "pages");
  return {
    url: `https://beminimalist.co/products/${handle}`,
    handle,
    html: readFileSync(join(dir, `${handle}.html`), "utf8"),
    product: JSON.parse(readFileSync(join(dir, `${handle}.product.json`), "utf8")),
    fetchedAt: "2026-09-07T00:00:00.000Z",
  };
}

function sections(...s: Partial<Section>[]): Section[] {
  return s.map((x) => ({ title: x.title ?? "", bullets: x.bullets ?? [], text: x.text ?? "" }));
}

// --- Whole-page extraction, against real committed pages ---------------------

check("niacinamide page: every field reads, no warnings", () => {
  const { facts, warnings } = extractFacts(loadFixture("niacinamide-10-with-matmarine"));
  eq(facts.name, "Niacinamide 10% Face Serum", "product name");
  eq(facts.actives, [{ ingredient: "Niacinamide", concentration: "10%" }], "actives");
  eq(facts.statedBenefits.length, 5, "benefit count");
  eq(facts.statedBenefits[0], "For reducing sebum & pores, and even skin tone", "first benefit");
  ok(facts.heroImageUrl?.startsWith("https://") ?? false, "hero image should be absolute https");
  ok(facts.rawText.includes("What Makes It Potent?"), "rawText should carry the benefit section");
  eq(warnings, [], "warnings");
});

check("trust badges are read from the pill carousel, not from rawText", () => {
  // Regression: this section rendered as a pill carousel, not prose, so it
  // was invisible to the toggle-tab reader for a full session before anyone
  // looked for it. Real facts a marketer would reasonably expect the tool to
  // surface: the brand states these on every product page.
  const { facts } = extractFacts(loadFixture("niacinamide-10-with-matmarine"));
  eq(
    facts.trustBadges,
    ["Fragrance Free", "Non-comedogenic", "Essential Oil Free", "pH: 5.5 - 6.5"],
    "trust badges"
  );
});

check("salicylic page: a different product shape reads the same way", () => {
  const { facts } = extractFacts(loadFixture("salicylic-acid-2"));
  eq(facts.name, "Salicylic Acid 2% Face Serum", "product name");
  eq(facts.actives[0], { ingredient: "Salicylic Acid", concentration: "2%" }, "first active");
  eq(facts.trustBadges[3], "pH: 3.2 - 4.0", "this product's own pH range, not another's");
});

check("page text stops at the product region", () => {
  const { facts } = extractFacts(loadFixture("niacinamide-10-with-matmarine"));
  // The storefront navigation lists six other products and a promotion. None of
  // it is a fact about the product being advertised.
  ok(!facts.rawText.includes("Build Your Own Bundle"), "promo banner leaked into rawText");
  ok(!facts.actives.some((a) => /vitamin b5|spf/i.test(a.ingredient)), "nav products leaked into actives");
});

// --- Active extraction, the traps ------------------------------------------

check("inverted phrasing is read", () => {
  eq(
    extractActives("", "", sections({ title: "x", bullets: ["Pure 10% Niacinamide is clinically proven"] })),
    [{ ingredient: "Niacinamide", concentration: "10%" }],
    "10% Niacinamide"
  );
});

check("a product form is not an ingredient", () => {
  // Regression: "Niacinamide 10% Face Serum" contains "10% Face", which the
  // inverted pattern happily read as a 10% active called Face.
  const actives = extractActives("Niacinamide 10% Face Serum", "", []);
  eq(actives, [{ ingredient: "Niacinamide", concentration: "10%" }], "actives from a title");
});

check("a promotion is not a formulation", () => {
  // Regression: the site header advertises "Save an additional up to 15% off".
  eq(extractActives("", "Save an additional up to 15% off", []), [], "discount context");
  eq(extractActives("", "", sections({ title: "x", bullets: ["Flat 20% off on bundles"] })), [], "bullet discount");
});

check("digits and joiners survive the tokeniser", () => {
  // Regression: a letters-only tokeniser dropped "Vitamin B5" and "Hyaluronic + PGA".
  eq(extractActives("Vitamin B5 10% Moisturizer", "", []), [{ ingredient: "Vitamin B5", concentration: "10%" }], "B5");
  eq(
    extractActives("Hyaluronic + PGA 2% Face Serum", "", []),
    [{ ingredient: "Hyaluronic + PGA", concentration: "2%" }],
    "joined ingredient"
  );
});

check("SPF is a strength claim even without a percent sign", () => {
  eq(extractActives("SPF 50 Sunscreen", "", []), [{ ingredient: "SPF", concentration: "50" }], "SPF");
});

check("an ingredient tab supplies the concentration its heading lacks", () => {
  eq(
    extractActives("", "", sections({ title: "Niacinamide", text: "This formula uses it in a high concentration of 10%" })),
    [{ ingredient: "Niacinamide", concentration: "10%" }],
    "heading plus body"
  );
});

check("a content section is not mined for ingredients", () => {
  eq(
    extractActives("", "", sections({ title: "Clinical Results", text: "89% of users reported smoother skin" })),
    [],
    "Clinical Results is a section, not an ingredient"
  );
});

// --- URL handling ----------------------------------------------------------

check("only the brand storefront is fetchable", () => {
  // A server-side fetcher pointed at a user-supplied URL is an SSRF primitive.
  for (const bad of [
    "https://example.com/products/x",
    "http://beminimalist.co/products/x",
    "https://169.254.169.254/products/x",
    "https://beminimalist.co.evil.com/products/x",
  ]) {
    let threw = false;
    try {
      parseProductUrl(bad);
    } catch (err) {
      threw = err instanceof FetchError;
    }
    ok(threw, `should have refused ${bad}`);
  }
});

check("a real product URL parses to its handle", () => {
  eq(parseProductUrl("https://beminimalist.co/products/salicylic-acid-2?variant=1").handle, "salicylic-acid-2", "handle");
  eq(parseProductUrl("https://www.beminimalist.co/products/retinol-0-3-q10").handle, "retinol-0-3-q10", "www handle");
});

check("a non-product page is refused", () => {
  let threw = false;
  try {
    parseProductUrl("https://beminimalist.co/collections/serums");
  } catch {
    threw = true;
  }
  ok(threw, "collections page should be refused");
});

report();
