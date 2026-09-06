import type { Finding, Rule } from "@/lib/types";
import { loadRulebook } from "@/lib/standard/loader";

/**
 * Layer 1. Lexicon and pattern matching over the ad text.
 *
 * Same input, same output, every time. This layer is what makes the tool a
 * standard rather than a second opinion: a reviewer can rerun it and get the
 * identical verdict, and can read the rule that produced it.
 */
export function scoreDeterministic(text: string, rules?: Rule[]): Finding[] {
  const active = rules ?? loadRulebook().active;
  const findings: Finding[] = [];

  for (const rule of active) {
    if (!rule.matcher) continue;

    const patterns: string[] =
      rule.matcher.type === "lexicon"
        ? (rule.matcher.terms ?? []).map((t) => `\\b${escapeRegex(t)}\\b`)
        : rule.matcher.pattern
          ? [rule.matcher.pattern]
          : [];

    for (const p of patterns) {
      const re = new RegExp(p, ensureGlobal(rule.matcher.flags));
      for (const m of text.matchAll(re)) {
        if (m.index === undefined) continue;
        findings.push({
          ruleId: rule.id,
          dimension: rule.dimension,
          severity: rule.severity,
          layer: "deterministic",
          span: m[0],
          start: m.index,
          end: m.index + m[0].length,
          explanation: rule.rationale.trim(),
          suggestedFix: `Remove or rewrite "${m[0]}". ${rule.title}.`,
        });
      }
    }
  }

  return dedupe(findings);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureGlobal(flags: string): string {
  return flags.includes("g") ? flags : flags + "g";
}

/** Same rule firing on the same span twice (overlapping lexicon terms) is one finding. */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.ruleId}:${f.start}:${f.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
