import type { ProductFacts } from "@/lib/types";
import { extractFacts } from "./extract";
import { FetchError, fetchProductPage, parseProductUrl } from "./fetch";
import { loadSnapshot } from "./snapshots";

/**
 * Stages 1 and 2, joined: a URL in, `ProductFacts` out, with the provenance of
 * those facts attached.
 *
 * Live first. A committed snapshot is the fallback, never the default, and the
 * result says which path ran so the UI can label it. The failure this guards
 * against is not "the demo breaks", it is "the demo works and nobody can tell
 * it was reading a month-old cache".
 */

export type FactsSource = "live" | "snapshot";

export interface FactsResult {
  facts: ProductFacts;
  source: FactsSource;
  /** When these facts were read from the storefront. */
  fetchedAt: string;
  /** Fields extraction could not find. Always shown, on both paths. */
  warnings: string[];
  /** Present only on the snapshot path. Why live failed, in the reviewer's words. */
  fallbackReason?: string;
}

export async function getProductFacts(input: string): Promise<FactsResult> {
  // Deliberately outside the try. A disallowed host is a refusal, not a reason
  // to quietly serve somebody a snapshot of a product they did not ask for.
  const { handle } = parseProductUrl(input);

  try {
    // A reviewer on a plane, or a CI box with no egress, still gets a working
    // pipeline. Also the only way to exercise the fallback path on purpose.
    if (process.env.AD_STUDIO_OFFLINE === "1") {
      throw new FetchError("Offline mode is on (AD_STUDIO_OFFLINE=1).");
    }

    const bundle = await fetchProductPage(input);
    const { facts, warnings } = extractFacts(bundle);

    // A page that loads but yields no name means the storefront theme moved and
    // the selectors are stale. Treat it as a failure rather than handing the
    // generator an empty fact sheet to write copy against.
    if (!facts.name) throw new FetchError("Page loaded but no product name could be extracted.");

    return { facts, source: "live", fetchedAt: bundle.fetchedAt, warnings };
  } catch (err) {
    const snapshot = loadSnapshot(handle);
    const reason = err instanceof Error ? err.message : String(err);

    if (!snapshot) throw new FetchError(`${reason} No committed snapshot for "${handle}" either.`);

    return {
      facts: snapshot.facts,
      source: "snapshot",
      fetchedAt: snapshot.fetchedAt,
      warnings: snapshot.warnings,
      fallbackReason: reason,
    };
  }
}
