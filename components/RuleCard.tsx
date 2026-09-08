import type { Rule } from "@/lib/types";
import { VerdictBadge } from "./Verdict";

const PROVENANCE_LABEL: Record<Rule["provenance"], string> = {
  corpus: "corpus — observed on beminimalist.co",
  regulation: "regulation — statute or code text",
  inference: "inference — ours, not sourced",
};

/**
 * One rule, in full: the same card whether it is reached by scrolling the
 * standard or by clicking a rule ID on a finding.
 *
 * Every field rendered here comes straight off the `Rule` object the scorer
 * and generator both read, so nothing on this card can say something the code
 * does not actually do. An `inference` rule is labelled as ours, not sourced,
 * because invariant 2 says a rule that launders a guess as law is the failure
 * this whole project exists to prevent, and that has to be visible on the
 * rule itself, not just knowable from reading the schema.
 */
export function RuleCard({ rule }: { rule: Rule }) {
  return (
    // scroll-mt-20 keeps the sticky-ish header from covering the card when a
    // finding's link lands here via #POLICY-003; :target in globals.css does
    // the actual highlighting, so nothing here needs to know if it was linked
    // to versus reached by scrolling.
    <div id={rule.id} className="scroll-mt-20 border border-line bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={rule.severity} size="sm" />
        <span className="font-mono text-xs font-medium">{rule.id}</span>
        <span className="text-sm font-medium">{rule.title}</span>
      </div>

      <p className="mt-2 text-sm text-muted">{rule.rationale}</p>

      {rule.guidance && (
        <p className="mt-1.5 text-sm">
          <span className="label">layer 2 guidance</span> {rule.guidance}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted">
        <span>{PROVENANCE_LABEL[rule.provenance]}</span>
        <span>{rule.matcher ? "layer 1: deterministic match" : "layer 2 only: model judgment"}</span>
        {rule.requires_facts && <span>requires ProductFacts</span>}
        {rule.provenance === "regulation" && (
          <span>source: {rule.source_confidence === "primary" ? "primary text" : "secondary"}</span>
        )}
      </div>

      <p className="mt-1.5 text-xs text-muted">{rule.source}</p>
    </div>
  );
}
