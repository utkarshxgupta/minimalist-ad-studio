/**
 * Refreshes the committed product snapshots.
 *
 * The generator fetches live. Snapshots exist so that a reviewer opening this
 * repo in a month, on a network the storefront rate-limits, still sees the
 * pipeline work. They are labelled as snapshots in the UI, with the date they
 * were taken, because a cached page presented as a live read is exactly the
 * kind of quiet dishonesty this project is arguing against.
 *
 *   npm run snapshot            refresh facts for every known product
 *   npm run snapshot -- --pages also rewrite the HTML parser fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchProductPage } from "../lib/generator/fetch";
import { extractFacts } from "../lib/generator/extract";
import { CATALOGUE, productUrl } from "../lib/generator/catalogue";

/** Products whose full HTML is committed so the parser can be tested offline. */
const PAGE_FIXTURES = ["niacinamide-10-with-matmarine", "salicylic-acid-2"];

const ROOT = process.cwd();
const FACTS_DIR = join(ROOT, "fixtures", "products");
const PAGES_DIR = join(ROOT, "fixtures", "pages");

/**
 * Strips stylesheets and behavioural scripts, keeps JSON-LD. The parser reads
 * DOM structure and JSON-LD only, so this removes about 90 percent of the bytes
 * without removing anything the parser looks at. Recorded here rather than in a
 * commit message so nobody later mistakes a fixture for a byte-exact capture.
 */
export function trimPage(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]+stylesheet[^>]*>/gi, "");
}

async function main() {
  const alsoPages = process.argv.includes("--pages");
  mkdirSync(FACTS_DIR, { recursive: true });
  if (alsoPages) mkdirSync(PAGES_DIR, { recursive: true });

  for (const { handle } of CATALOGUE) {
    const url = productUrl(handle);
    try {
      const bundle = await fetchProductPage(url);
      const { facts, warnings } = extractFacts(bundle);

      writeFileSync(
        join(FACTS_DIR, `${handle}.json`),
        JSON.stringify({ handle, fetchedAt: bundle.fetchedAt, warnings, facts }, null, 2) + "\n"
      );

      if (alsoPages && PAGE_FIXTURES.includes(handle)) {
        writeFileSync(join(PAGES_DIR, `${handle}.html`), trimPage(bundle.html));
        writeFileSync(
          join(PAGES_DIR, `${handle}.product.json`),
          JSON.stringify(bundle.product, null, 2) + "\n"
        );
      }

      const actives = facts.actives.map((a) => `${a.ingredient} ${a.concentration}`).join(", ");
      console.log(
        `${handle}\n  name: ${facts.name}\n  actives: ${actives || "(none)"}\n` +
          `  benefits: ${facts.statedBenefits.length}\n  warnings: ${warnings.length}`
      );
    } catch (err) {
      console.error(`${handle} FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
