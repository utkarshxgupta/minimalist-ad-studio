import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { Rule } from "@/lib/types";

export interface Rulebook {
  version: string;
  /** Rules that actually run. Unverified regulation/corpus rules are excluded. */
  active: Rule[];
  /** Loaded but inert, pending human verification against source text. */
  unverified: Rule[];
}

let cached: Rulebook | null = null;

export function loadRulebook(force = false): Rulebook {
  if (cached && !force) return cached;

  const raw = readFileSync(join(process.cwd(), "standard", "claims.rules.yaml"), "utf8");
  const doc = parse(raw) as { version: string; rules: unknown[] };

  const parsed = doc.rules.map((r, i) => {
    const result = Rule.safeParse(r);
    if (!result.success) {
      throw new Error(
        `standard/claims.rules.yaml: rule at index ${i} is invalid.\n` +
          JSON.stringify(result.error.issues, null, 2)
      );
    }
    return result.data;
  });

  const ids = new Set<string>();
  for (const r of parsed) {
    if (ids.has(r.id)) throw new Error(`Duplicate rule id: ${r.id}`);
    ids.add(r.id);
  }

  // A rule that claims external authority does not run until a human has read
  // the source. See standard/SOURCES.md for why this is enforced in code.
  cached = {
    version: doc.version,
    active: parsed.filter((r) => r.verified),
    unverified: parsed.filter((r) => !r.verified),
  };
  return cached;
}

export function rulesFor(dimension: Rule["dimension"], book = loadRulebook()): Rule[] {
  return book.active.filter((r) => r.dimension === dimension);
}

export interface RegistryEntry {
  id: string;
  product: string;
  /** Links the entry to a scraped product, so it can be checked. See C-006. */
  product_handle: string;
  claim: string;
  evidence: string;
  /** Exact page text backing the claim. Verified by npm run test:registry. */
  verbatim: string;
  source_type: string;
  note?: string;
}

let registryCache: { version: string; claims: RegistryEntry[] } | null = null;

/**
 * The substantiation registry. Loaded separately from the rulebook because it
 * is owned by a different function: rules are written by whoever sets the
 * standard, registry entries by whoever holds the studies.
 */
export function loadRegistry() {
  if (registryCache) return registryCache;
  const raw = readFileSync(join(process.cwd(), "standard", "claims-registry.yaml"), "utf8");
  const doc = parse(raw) as { version: string; claims: RegistryEntry[] };
  registryCache = { version: doc.version, claims: doc.claims ?? [] };
  return registryCache;
}

/** Rendered into the policy prompt so POLICY-012 has something to check against. */
export function registryDigest(): string {
  const reg = loadRegistry();
  return reg.claims
    .map((c) => `- ${c.id} | ${c.product} | ${c.claim} | evidence: ${c.evidence}`)
    .join("\n");
}

/**
 * The registry, filtered to one product. Used wherever a prompt is generating
 * copy for a specific product rather than surveying the whole brand: showing
 * every product's studies invites exactly the mistake C-006 was, a model (or a
 * hand) attaching one product's number to another's ad. Filtering the data the
 * prompt can see is a structural fix, the same move `requires_facts` already
 * makes for rules that need ProductFacts.
 */
export function registryDigestFor(productName: string): string {
  const reg = loadRegistry();
  const target = productName.trim().toLowerCase();
  const mine = reg.claims.filter((c) => c.product.trim().toLowerCase() === target);
  if (mine.length === 0) return "(no registered studies for this product)";
  return mine.map((c) => `- ${c.id} | ${c.claim} | evidence: ${c.evidence}`).join("\n");
}

export interface Disclosure {
  id: string;
  applies_to: string;
  text: string;
  provenance: string;
  source: string;
  source_confidence: string;
  verified: boolean;
  note?: string;
}

let disclosureCache: { version: string; disclosures: Disclosure[] } | null = null;

/**
 * Text that must appear on the creative, as opposed to rules about what the
 * copy may say. Loaded from standard/ rather than hardcoded, because a
 * disclaimer is a string the brand owns and its wording carries legal weight:
 * a footnote that misstates who ran the study is its own problem.
 */
export function loadDisclosures() {
  if (disclosureCache) return disclosureCache;
  const raw = readFileSync(join(process.cwd(), "standard", "disclosures.yaml"), "utf8");
  const doc = parse(raw) as { version: string; disclosures: Disclosure[] };
  disclosureCache = { version: doc.version, disclosures: doc.disclosures ?? [] };
  return disclosureCache;
}
