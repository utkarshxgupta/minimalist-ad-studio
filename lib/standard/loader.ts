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
