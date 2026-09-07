/**
 * Substantiation registry consistency check.
 *
 * Every registry entry claims a product said something. This asserts the
 * product actually said it, by matching `verbatim` against that product's
 * scraped ProductFacts.
 *
 * WHY. The registry had the 97% oiliness study filed against Niacinamide for
 * four commits. It belongs to Salicylic Acid; the Niacinamide page carries no
 * consumer study at all. POLICY-012 exists to answer "is the cited study one of
 * ours", so a misfiled entry does not fail loudly, it certifies an ad making a
 * claim that product has never made. The check passes, against fiction.
 *
 * That is the same failure the registry was built to prevent, one level up:
 * POLICY-012 verifies ad copy against the registry, and nothing was verifying
 * the registry against reality. See docs/CORRECTIONS.md C-006.
 *
 * Offline. No network, no API key.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { check, eq, ok, report } from "./assert";
import { ProductFacts } from "../lib/types";
import { CATALOGUE } from "../lib/generator/catalogue";

interface Entry {
  id: string;
  product: string;
  product_handle: string;
  claim: string;
  evidence: string;
  verbatim: string;
  source_type: string;
  note?: string;
}

const registry = parse(
  readFileSync(join(process.cwd(), "standard", "claims-registry.yaml"), "utf8")
) as { version: string; claims: Entry[] };

function factsFor(handle: string) {
  const raw = readFileSync(join(process.cwd(), "fixtures", "products", `${handle}.json`), "utf8");
  return ProductFacts.parse(JSON.parse(raw).facts);
}

/** Page copy runs claims together without spaces, so compare on a squashed form. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

check("every entry carries the fields that make it checkable", () => {
  for (const c of registry.claims) {
    ok(Boolean(c.id && c.product && c.claim && c.evidence && c.source_type), `${c.id} is missing a core field`);
    ok(Boolean(c.product_handle), `${c.id} has no product_handle, so nothing can verify it`);
    ok(Boolean(c.verbatim), `${c.id} has no verbatim, so nothing can verify it`);
  }
});

check("no duplicate registry ids", () => {
  const ids = registry.claims.map((c) => c.id);
  eq(ids.length, new Set(ids).size, "duplicate SUB- id");
});

check("every product_handle is a product we actually scrape", () => {
  const known = new Set(CATALOGUE.map((p) => p.handle));
  for (const c of registry.claims) {
    ok(known.has(c.product_handle), `${c.id} points at unknown handle "${c.product_handle}"`);
  }
});

check("every claim is verbatim in the product page it is filed against", () => {
  const failures: string[] = [];

  for (const c of registry.claims) {
    const facts = factsFor(c.product_handle);
    if (!squash(facts.rawText).includes(squash(c.verbatim))) {
      failures.push(`${c.id} (${c.product_handle}): "${c.verbatim}" is not on that product's page`);
    }
  }

  ok(failures.length === 0, `${failures.length} misfiled entr(ies):\n      ${failures.join("\n      ")}`);
});

check("a claim is not filed against a product whose page lacks any study", () => {
  // Niacinamide and Retinol carry ingredient-mechanism copy but no subject
  // study. This is the specific shape of the C-006 bug, pinned so it cannot
  // come back by a different route.
  for (const handle of ["niacinamide-10-with-matmarine", "retinol-0-3-q10"]) {
    const filed = registry.claims.filter((c) => c.product_handle === handle);
    const facts = factsFor(handle);
    const hasStudy = /\d{1,3}%\s*subjects?/i.test(facts.rawText);

    ok(
      hasStudy || filed.length === 0,
      `${handle} has no subject study on its page but ${filed.length} registry entr(ies) claim otherwise: ${filed
        .map((c) => c.id)
        .join(", ")}`
    );
  }
});

check("the product name on the entry matches the handle it points at", () => {
  for (const c of registry.claims) {
    eq(c.product, factsFor(c.product_handle).name, `${c.id} product name disagrees with its handle`);
  }
});

report();
